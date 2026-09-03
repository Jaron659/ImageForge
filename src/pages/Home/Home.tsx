import React, { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import Header from '../../components/Header';
import ImageUploader from '../../components/ImageUploader';
import ImagePreview from '../../components/ImagePreview';
import CompressorPanel from '../../components/CompressorPanel';
import EnhancerPanel from '../../components/EnhancerPanel';
import OutputSettings, { type Pipeline } from '../../components/OutputSettings';
import ProgressIndicator from '../../components/ProgressIndicator';
import BeforeAfterSlider from '../../components/BeforeAfterSlider';
import ResultCard from '../../components/ResultCard';
import DownloadButton from '../../components/DownloadButton';

import type { BatchImageItem, CompressionOptions, ImageMetadata, ProcessedImage } from '../../types/image.types';
import type { EnhancementOptions } from '../../types/enhancement.types';
import { imageValidatorService, LARGE_IMAGE_MP_THRESHOLD } from '../../services/image-validator.service';
import { imageCompressorService } from '../../services/image-compressor.service';
import { upscalerService } from '../../services/upscaler.service';
import { fitWithinResolution } from '../../utils/resolution.util';
import { formatFileSize, bytesToKB } from '../../utils/file-size.util';
import { buildOutputFilename, mimeToExtension } from '../../utils/format.util';
import { blobToDataUrl, safeRevokeObjectUrl } from '../../utils/image.util';
import { MODEL_CONFIG } from '../../models/model-config';

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface BinarySearchStep {
  iteration: number;
  quality: number;
  sizeBytes: number;
}

// ─── Default options ──────────────────────────────────────────────────────────
const DEFAULT_COMPRESSION: CompressionOptions = {
  mode: 'quality',
  quality: 0.85,
  outputFormat: 'image/webp',
};

const DEFAULT_ENHANCEMENT: EnhancementOptions = {
  targetResolution: '1080p',
  compress: true,
  compressionQuality: 0.85,
  outputFormat: 'image/webp',
};

// ─── Home Component ───────────────────────────────────────────────────────────
const Home: React.FC = () => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [batch, setBatch] = useState<BatchImageItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline>('enhance-then-compress');
  const [compressionOptions, setCompressionOptions] = useState<CompressionOptions>(DEFAULT_COMPRESSION);
  const [enhancementOptions, setEnhancementOptions] = useState<EnhancementOptions>(DEFAULT_ENHANCEMENT);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [binarySearchSteps, setBinarySearchSteps] = useState<BinarySearchStep[]>([]);
  const [overallBatchProgress, setOverallBatchProgress] = useState(0);
  const [batchStats, setBatchStats] = useState<{ totalBefore: number; totalAfter: number } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      batch.forEach((item) => {
        safeRevokeObjectUrl(item.metadata?.objectUrl);
        safeRevokeObjectUrl(item.result?.objectUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Active item helpers ────────────────────────────────────────────────────
  const activeItem = batch.find((b) => b.id === activeId) ?? batch[0] ?? null;

  // ── File selection ─────────────────────────────────────────────────────────
  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      setError(null);
      setWarning(null);
      setShowComparison(false);
      setBinarySearchSteps([]);
      setBatchStats(null);

      const newItems: BatchImageItem[] = [];

      for (const file of files) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const validation = await imageValidatorService.validate(file);

        if (!validation.valid || !validation.metadata) {
          newItems.push({
            id,
            file,
            status: 'error',
            error: validation.error ?? 'Unknown validation error.',
          });
          continue;
        }

        const objectUrl = URL.createObjectURL(file);
        const dataUrl = await blobToDataUrl(file);

        const metadata: ImageMetadata = {
          ...validation.metadata,
          dataUrl,
          objectUrl,
        };

        // Warn about very large images
        if (imageValidatorService.isVeryLarge(metadata.width, metadata.height)) {
          setWarning(
            `"${file.name}" is ${(metadata.width * metadata.height / 1e6).toFixed(1)} MP — larger than ${LARGE_IMAGE_MP_THRESHOLD} MP. ` +
            `AI enhancement may be slow or run out of memory, especially on mobile. Consider downscaling first.`
          );
        }

        newItems.push({ id, file, metadata, status: 'idle' });
      }

      setBatch((prev) => {
        const updated = [...prev, ...newItems];
        if (updated.length > 0 && !activeId) {
          setActiveId(updated[0].id);
        }
        return updated;
      });

      if (newItems.length > 0 && !activeId) {
        setActiveId(newItems[0].id);
      }
    },
    [activeId]
  );

  // ── Remove item ────────────────────────────────────────────────────────────
  const handleRemove = useCallback((id: string) => {
    setBatch((prev) => {
      const item = prev.find((b) => b.id === id);
      if (item) {
        safeRevokeObjectUrl(item.metadata?.objectUrl);
        safeRevokeObjectUrl(item.result?.objectUrl);
      }
      const next = prev.filter((b) => b.id !== id);
      return next;
    });
    setActiveId((prev) => (prev === id ? null : prev));
    setShowComparison(false);
  }, []);

  // ── Cancel ────────────────────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    upscalerService.cancel();
  }, []);

  // ── Process a single item ─────────────────────────────────────────────────
  const processSingleItem = useCallback(
    async (
      item: BatchImageItem,
      signal: AbortSignal,
      onProgress: (p: number, stage: string) => void
    ): Promise<ProcessedImage> => {
      const meta = item.metadata!;

      if (pipeline === 'compress-only' || pipeline === 'enhance-then-compress') {
        if (pipeline === 'compress-only') {
          // ── Compress-only path ──────────────────────────────────────────
          const steps: BinarySearchStep[] = [];
          const result = await imageCompressorService.compress(
            meta.objectUrl,
            meta.width,
            meta.height,
            compressionOptions,
            compressionOptions.mode === 'target-size'
              ? (iteration, quality, sizeBytes) => {
                  steps.push({ iteration, quality, sizeBytes });
                  setBinarySearchSteps([...steps]);
                  onProgress(
                    20 + Math.min(70, iteration * 5),
                    `Binary search step ${iteration} — quality ${Math.round(quality * 100)}%`
                  );
                }
              : undefined
          );

          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');

          const blob = result.blob;
          const dataUrl = await blobToDataUrl(blob);
          const objectUrl = URL.createObjectURL(blob);

          return {
            blob,
            width: result.width,
            height: result.height,
            size: blob.size,
            dataUrl,
            objectUrl,
            format: compressionOptions.outputFormat,
          };
        }
      }

      if (pipeline === 'enhance-only' || pipeline === 'enhance-then-compress') {
        // ── Enhance path ────────────────────────────────────────────────
        const { width: outW, height: outH } = fitWithinResolution(
          meta.width * MODEL_CONFIG.UPSCALE_FACTOR,
          meta.height * MODEL_CONFIG.UPSCALE_FACTOR,
          enhancementOptions.targetResolution
        );

        const fmt = enhancementOptions.outputFormat ?? 'image/webp';
        const quality = enhancementOptions.compressionQuality ?? 0.85;

        const enhResult = await upscalerService.enhance(
          meta.objectUrl,
          { width: meta.width, height: meta.height },
          outW,
          outH,
          fmt,
          pipeline === 'enhance-then-compress' && enhancementOptions.compress ? quality : 0.95,
          onProgress,
          signal
        );

        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');

        let finalBlob = enhResult.blob;
        let finalW = outW;
        let finalH = outH;

        // ── Compress after enhance ──────────────────────────────────────
        if (pipeline === 'enhance-then-compress' && enhancementOptions.compress) {
          const enhDataUrl = await blobToDataUrl(finalBlob);
          const enhObjUrl = URL.createObjectURL(finalBlob);

          const steps: BinarySearchStep[] = [];
          const compResult = await imageCompressorService.compress(
            enhObjUrl,
            finalW,
            finalH,
            {
              ...compressionOptions,
              outputFormat: fmt,
              quality: quality,
            },
            compressionOptions.mode === 'target-size'
              ? (iteration, q, sizeBytes) => {
                  steps.push({ iteration, quality: q, sizeBytes });
                  setBinarySearchSteps([...steps]);
                }
              : undefined
          );

          URL.revokeObjectURL(enhObjUrl);

          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');

          finalBlob = compResult.blob;
          finalW = compResult.width;
          finalH = compResult.height;
          void enhDataUrl;
        }

        const dataUrl = await blobToDataUrl(finalBlob);
        const objectUrl = URL.createObjectURL(finalBlob);

        return {
          blob: finalBlob,
          width: finalW,
          height: finalH,
          size: finalBlob.size,
          dataUrl,
          objectUrl,
          format: fmt,
        };
      }

      throw new Error('Unknown pipeline configuration.');
    },
    [pipeline, compressionOptions, enhancementOptions]
  );

  // ── Process all items ──────────────────────────────────────────────────────
  const handleProcess = useCallback(async () => {
    const validItems = batch.filter(
      (b) => b.status !== 'error' && b.metadata
    );
    if (validItems.length === 0) {
      setError('No valid images to process. Please upload at least one valid image.');
      return;
    }

    // Check model file exists for enhancement pipelines
    if (pipeline !== 'compress-only') {
      try {
        const resp = await fetch(MODEL_CONFIG.MODEL_PATH, { method: 'HEAD' });
        if (!resp.ok) {
          setError(
            `AI model file not found at "${MODEL_CONFIG.MODEL_PATH}". ` +
            `Download "realesr-general-x4v3.onnx" from ${MODEL_CONFIG.SOURCE} ` +
            `and place it at public/models/realesr-general-x4v3.onnx, then restart the dev server.`
          );
          return;
        }
      } catch {
        setError(
          `Cannot reach "${MODEL_CONFIG.MODEL_PATH}". Make sure the dev server is running and the model file exists.`
        );
        return;
      }
    }

    setError(null);
    setWarning(null);
    setIsProcessing(true);
    setProgress(0);
    setProgressStage('Starting...');
    setShowComparison(false);
    setBinarySearchSteps([]);
    setBatchStats(null);

    const abort = new AbortController();
    abortRef.current = abort;

    // Mark all as processing
    setBatch((prev) =>
      prev.map((b) =>
        validItems.find((v) => v.id === b.id)
          ? { ...b, status: 'enhancing' as const, result: undefined, error: undefined }
          : b
      )
    );

    let totalBefore = 0;
    let totalAfter = 0;
    let firstResultId: string | null = null;

    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];

      if (abort.signal.aborted) break;

      const baseProgress = (i / validItems.length) * 100;
      const perItemScale = 1 / validItems.length;

      setProgressStage(`Processing image ${i + 1} of ${validItems.length}...`);

      try {
        const result = await processSingleItem(
          item,
          abort.signal,
          (p, stage) => {
            setProgress(baseProgress + p * perItemScale);
            setProgressStage(stage);
            setBatch((prev) =>
              prev.map((b) => (b.id === item.id ? { ...b, progress: p } : b))
            );
          }
        );

        totalBefore += item.metadata!.size;
        totalAfter += result.size;

        if (!firstResultId) firstResultId = item.id;

        setBatch((prev) =>
          prev.map((b) =>
            b.id === item.id ? { ...b, status: 'done', result, progress: 100 } : b
          )
        );

        setOverallBatchProgress(((i + 1) / validItems.length) * 100);
      } catch (e) {
        const errMsg = (e as Error).message;
        const isCancelled = errMsg.includes('Cancel') || (e instanceof DOMException && e.name === 'AbortError');

        setBatch((prev) =>
          prev.map((b) =>
            b.id === item.id
              ? {
                  ...b,
                  status: isCancelled ? 'cancelled' : 'error',
                  error: isCancelled
                    ? 'Processing was cancelled.'
                    : errMsg,
                }
              : b
          )
        );

        if (isCancelled) break;
      }
    }

    if (totalBefore > 0) {
      setBatchStats({ totalBefore, totalAfter });
    }

    // Select first successful result
    if (firstResultId) {
      setActiveId(firstResultId);
      setShowComparison(true);
    }

    setIsProcessing(false);
    setProgress(100);
    setProgressStage('Complete');
    abortRef.current = null;
  }, [batch, pipeline, processSingleItem]);

  // ── Single download ────────────────────────────────────────────────────────
  const handleSingleDownload = useCallback(async () => {
    const item = batch.find((b) => b.id === activeId);
    if (!item?.result) throw new Error('No processed image available to download.');

    const meta = item.metadata!;
    const ext = mimeToExtension(item.result.format);
    const suffix = pipeline === 'compress-only' ? 'compressed' : pipeline === 'enhance-only' ? 'enhanced' : 'enhanced-compressed';
    const filename = buildOutputFilename(meta.name, suffix, ext);

    const url = URL.createObjectURL(item.result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeId, batch, pipeline]);

  // ── Batch ZIP download ─────────────────────────────────────────────────────
  const handleBatchDownload = useCallback(async () => {
    const doneItems = batch.filter((b) => b.status === 'done' && b.result);
    if (doneItems.length === 0) throw new Error('No processed images available to download.');

    const zip = new JSZip();

    for (const item of doneItems) {
      const meta = item.metadata!;
      const ext = mimeToExtension(item.result!.format);
      const suffix = pipeline === 'compress-only' ? 'compressed' : pipeline === 'enhance-only' ? 'enhanced' : 'enhanced-compressed';
      const filename = buildOutputFilename(meta.name, suffix, ext);
      zip.file(filename, item.result!.blob);
    }

    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `imageforge-batch-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [batch, pipeline]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const hasBatch = batch.length > 0;
  const doneItems = batch.filter((b) => b.status === 'done' && b.result);
  const hasResult = doneItems.length > 0;
  const activeResult = activeItem?.result ?? null;
  const activeMeta = activeItem?.metadata ?? null;

  const processingType: 'compressed' | 'enhanced' | 'enhanced+compressed' =
    pipeline === 'compress-only' ? 'compressed' :
    pipeline === 'enhance-only' ? 'enhanced' :
    'enhanced+compressed';

  return (
    <div className="app-layout">
      <Header batchCount={batch.length} />

      <main className="main">
        {/* Privacy notice */}
        <div className="privacy-notice">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M7 0L1 3V7c0 3.5 2.5 6.5 6 7 3.5-.5 6-3.5 6-7V3L7 0z"/>
          </svg>
          All processing happens entirely in your browser. Your images are never uploaded to any server.
        </div>

        {/* ── Upload area ── */}
        {!hasBatch && (
          <section className="section section--upload">
            <ImageUploader onFilesSelected={handleFilesSelected} disabled={isProcessing} />
          </section>
        )}

        {/* ── Main workspace ── */}
        {hasBatch && (
          <div className="workspace">
            {/* Left: batch list + upload more */}
            <aside className="sidebar">
              <div className="sidebar__header">
                <h3 className="sidebar__title">Images ({batch.length})</h3>
                <ImageUploader
                  onFilesSelected={handleFilesSelected}
                  disabled={isProcessing}
                  multiple
                />
              </div>
              <div className="sidebar__list">
                {batch.map((item) => (
                  <div
                    key={item.id}
                    className={`sidebar__item${activeId === item.id ? ' sidebar__item--active' : ''} sidebar__item--${item.status}`}
                    onClick={() => { setActiveId(item.id); setShowComparison(item.status === 'done'); }}
                  >
                    {item.metadata ? (
                      <ImagePreview
                        metadata={item.metadata}
                        onRemove={isProcessing ? undefined : () => handleRemove(item.id)}
                        outputSize={item.result?.size}
                        outputWidth={item.result?.width}
                        outputHeight={item.result?.height}
                        isProcessing={item.status === 'enhancing' || item.status === 'compressing'}
                      />
                    ) : (
                      <div className="sidebar__error">
                        <span className="error-icon">⚠</span>
                        <span>{item.file.name}</span>
                        <p className="sidebar__error-msg">{item.error}</p>
                      </div>
                    )}
                    {item.status === 'done' && (
                      <div className="sidebar__status sidebar__status--done">✓ Done</div>
                    )}
                    {item.status === 'error' && (
                      <div className="sidebar__status sidebar__status--error">✗ Error</div>
                    )}
                    {item.status === 'cancelled' && (
                      <div className="sidebar__status sidebar__status--cancelled">Cancelled</div>
                    )}
                    {(item.status === 'enhancing' || item.status === 'compressing') && item.progress !== undefined && (
                      <div className="sidebar__item-progress">
                        <div className="sidebar__item-progress-fill" style={{ width: `${item.progress}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </aside>

            {/* Center: active image + result */}
            <div className="workspace__center">
              {/* Errors and warnings */}
              {error && (
                <div className="alert alert--error" role="alert">
                  <strong>Error: </strong>{error}
                  <button className="alert__close" onClick={() => setError(null)}>×</button>
                </div>
              )}
              {warning && (
                <div className="alert alert--warn" role="alert">
                  <strong>Warning: </strong>{warning}
                  <button className="alert__close" onClick={() => setWarning(null)}>×</button>
                </div>
              )}

              {/* Processing indicator */}
              {isProcessing && (
                <ProgressIndicator
                  progress={progress}
                  stage={progressStage}
                  onCancel={handleCancel}
                  label={batch.length > 1 ? `Processing batch (${doneItems.length + 1}/${batch.length})` : 'Processing'}
                />
              )}

              {/* Before/After comparison */}
              {showComparison && activeResult && activeMeta && (
                <section className="comparison-section">
                  <div className="comparison-section__header">
                    <h2 className="comparison-section__title">Comparison</h2>
                    <div className="comparison-section__meta">
                      <span>{formatFileSize(activeMeta.size)} → {formatFileSize(activeResult.size)}</span>
                      <span>{activeMeta.width}×{activeMeta.height} → {activeResult.width}×{activeResult.height}</span>
                    </div>
                  </div>
                  <BeforeAfterSlider
                    beforeUrl={activeMeta.objectUrl}
                    afterUrl={activeResult.objectUrl}
                    beforeLabel={`Original · ${formatFileSize(activeMeta.size)}`}
                    afterLabel={`AI-Upscaled · ${formatFileSize(activeResult.size)}`}
                  />
                </section>
              )}

              {/* Result card(s) */}
              {activeResult && activeMeta && (
                <ResultCard
                  original={activeMeta}
                  result={activeResult}
                  processingType={processingType}
                  onDownload={handleSingleDownload}
                  onViewComparison={() => setShowComparison((s) => !s)}
                />
              )}

              {/* Error for active item */}
              {activeItem?.error && !isProcessing && (
                <div className="alert alert--error">
                  <strong>Processing failed: </strong>{activeItem.error}
                </div>
              )}

              {/* Batch stats */}
              {batchStats && doneItems.length > 1 && (
                <div className="batch-stats">
                  <h3 className="batch-stats__title">Batch Summary</h3>
                  <div className="batch-stats__row">
                    <span>Total before: <strong>{formatFileSize(batchStats.totalBefore)}</strong></span>
                    <span>→</span>
                    <span>Total after: <strong>{formatFileSize(batchStats.totalAfter)}</strong></span>
                    <span className="savings-badge">
                      –{((1 - batchStats.totalAfter / batchStats.totalBefore) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <DownloadButton
                    onDownload={handleBatchDownload}
                    label={`Download All (${doneItems.length}) as ZIP`}
                    variant="secondary"
                    id="batch-download-btn"
                  />
                </div>
              )}

              {/* Empty state when image selected but not yet processed */}
              {activeMeta && !activeResult && !isProcessing && !activeItem?.error && (
                <div className="preview-placeholder">
                  <img
                    src={activeMeta.objectUrl}
                    alt="Selected image preview"
                    className="preview-placeholder__img"
                  />
                  <div className="preview-placeholder__info">
                    <span>{activeMeta.name}</span>
                    <span>{formatFileSize(activeMeta.size)}</span>
                    <span>{activeMeta.width} × {activeMeta.height}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Right: settings panel */}
            <aside className="settings-panel">
              <OutputSettings
                pipeline={pipeline}
                onPipelineChange={setPipeline}
                compressionOptions={compressionOptions}
                onCompressionChange={setCompressionOptions}
                enhancementOptions={enhancementOptions}
                onEnhancementChange={setEnhancementOptions}
              />

              {(pipeline === 'compress-only' || pipeline === 'enhance-then-compress') && (
                <CompressorPanel
                  options={compressionOptions}
                  onChange={setCompressionOptions}
                  binarySearchSteps={binarySearchSteps}
                  originalSize={activeMeta?.size}
                />
              )}

              {(pipeline === 'enhance-only' || pipeline === 'enhance-then-compress') && (
                <EnhancerPanel
                  options={enhancementOptions}
                  onChange={setEnhancementOptions}
                  inputWidth={activeMeta?.width}
                  inputHeight={activeMeta?.height}
                />
              )}

              <div className="process-actions">
                <button
                  id="process-btn"
                  className="btn btn--primary btn--full btn--lg"
                  onClick={handleProcess}
                  disabled={isProcessing || batch.filter((b) => b.metadata).length === 0}
                >
                  {isProcessing ? (
                    <>
                      <span className="spinner spinner--sm" />
                      Processing...
                    </>
                  ) : (
                    <>
                      {pipeline === 'compress-only' && 'Compress'}
                      {pipeline === 'enhance-only' && 'AI Enhance'}
                      {pipeline === 'enhance-then-compress' && 'Enhance + Compress'}
                      {batch.length > 1 ? ` (${batch.filter((b) => b.metadata).length} images)` : ''}
                    </>
                  )}
                </button>

                {hasResult && !isProcessing && (
                  <DownloadButton
                    onDownload={handleSingleDownload}
                    label="Download Result"
                    variant="secondary"
                    id="download-result-btn"
                  />
                )}

                {hasResult && doneItems.length > 1 && !isProcessing && (
                  <DownloadButton
                    onDownload={handleBatchDownload}
                    label={`Download All as ZIP`}
                    variant="secondary"
                    id="download-zip-btn"
                  />
                )}

                <button
                  className="btn btn--ghost btn--full"
                  onClick={() => {
                    batch.forEach((b) => {
                      safeRevokeObjectUrl(b.metadata?.objectUrl);
                      safeRevokeObjectUrl(b.result?.objectUrl);
                    });
                    setBatch([]);
                    setActiveId(null);
                    setShowComparison(false);
                    setError(null);
                    setWarning(null);
                    setBinarySearchSteps([]);
                    setBatchStats(null);
                  }}
                  id="clear-all-btn"
                >
                  Clear All
                </button>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};

export default Home;

// Unused imports suppression — bytesToKB is used by compressor service internally
void bytesToKB;
