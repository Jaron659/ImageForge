import type {
  WorkerIncomingMessage,
  WorkerOutgoingMessage,
  WorkerEnhanceRequest,
} from '../types/enhancement.types';
import type { ImageMetadata } from '../types/image.types';
import { MODEL_CONFIG } from '../models/model-config';

export interface UpscalerResult {
  blob: Blob;
  outputWidth: number;
  outputHeight: number;
}

/**
 * UpscalerService manages the Web Worker lifecycle for ONNX inference.
 * It sends requests to the worker and translates events into Promises
 * with progress callbacks and cancellation support.
 */
export class UpscalerService {
  private worker: Worker | null = null;
  private currentJobId: string | null = null;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../workers/upscaler.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onerror = (evt: ErrorEvent) => {
        console.error('[UpscalerService Worker onerror]', {
          message: evt.message,
          filename: evt.filename,
          lineno: evt.lineno,
          colno: evt.colno,
          error: evt.error,
        });
      };

      this.worker.onmessageerror = (evt: MessageEvent) => {
        console.error('[UpscalerService Worker onmessageerror]', evt);
      };
    }
    return this.worker;
  }

  /**
   * Enhance an image using the ONNX super-resolution model.
   * The model runs in a Web Worker. Progress events are delivered via onProgress.
   * Returns a Blob of the enhanced image at the specified output size.
   *
   * @param imageUrl      Object/Data URL of the source image
   * @param metadata      Original image metadata (dimensions)
   * @param outputWidth   Final output width (after AI upscale + post-process downscale)
   * @param outputHeight  Final output height
   * @param outputFormat  Output format ('image/jpeg' | 'image/webp')
   * @param outputQuality Output compression quality (0-1)
   * @param onProgress    Callback for progress updates (0-100, stage label)
   * @param signal        AbortSignal for cancellation
   */
  async enhance(
    imageUrl: string,
    metadata: Pick<ImageMetadata, 'width' | 'height'>,
    outputWidth: number,
    outputHeight: number,
    outputFormat: 'image/jpeg' | 'image/webp',
    outputQuality: number,
    onProgress: (progress: number, stage: string) => void,
    signal: AbortSignal
  ): Promise<UpscalerResult> {
    if (signal.aborted) throw new DOMException('Cancelled before start', 'AbortError');

    onProgress(5, 'Preparing image data...');

    // Pre-process: decode image → Canvas → Float32Array NCHW
    const inputData = await this.preprocessImage(imageUrl, metadata.width, metadata.height);

    if (signal.aborted) throw new DOMException('Cancelled after preprocessing', 'AbortError');

    onProgress(15, 'Sending to AI worker...');

    // Run inference in the worker
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.currentJobId = jobId;

    const outputData = await this.runWorkerInference(
      jobId,
      inputData,
      metadata.width,
      metadata.height,
      (progress, stage) => onProgress(15 + Math.round(progress * 0.75), stage),
      signal
    );

    if (signal.aborted) throw new DOMException('Cancelled after inference', 'AbortError');

    onProgress(92, 'Post-processing output...');

    // Post-process: NCHW Float32 → ImageData → Canvas → resize to target → Blob
    const rawWidth = metadata.width * MODEL_CONFIG.UPSCALE_FACTOR;
    const rawHeight = metadata.height * MODEL_CONFIG.UPSCALE_FACTOR;

    const blob = await this.postprocessOutput(
      outputData,
      rawWidth,
      rawHeight,
      outputWidth,
      outputHeight,
      outputFormat,
      outputQuality
    );

    onProgress(100, 'Done');

    return { blob, outputWidth, outputHeight };
  }

  /**
   * Cancel the current in-progress job.
   */
  cancel(): void {
    if (this.currentJobId && this.worker) {
      const msg: WorkerIncomingMessage = { type: 'CANCEL', id: this.currentJobId };
      this.worker.postMessage(msg);
    }
  }

  /**
   * Terminate and clean up the worker.
   */
  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.currentJobId = null;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async preprocessImage(
    imageUrl: string,
    width: number,
    height: number
  ): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Could not acquire canvas context for preprocessing.');
          ctx.drawImage(img, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);

          // Convert RGBA → Float32 NCHW [1, 3, H, W] normalized to [0, 1]
          const pixelCount = width * height;
          const tensor = new Float32Array(3 * pixelCount);
          for (let i = 0; i < pixelCount; i++) {
            tensor[i] = imageData.data[i * 4] / 255;
            tensor[pixelCount + i] = imageData.data[i * 4 + 1] / 255;
            tensor[2 * pixelCount + i] = imageData.data[i * 4 + 2] / 255;
          }
          resolve(tensor);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image for preprocessing.'));
      img.src = imageUrl;
    });
  }

  private runWorkerInference(
    jobId: string,
    inputData: Float32Array,
    inputWidth: number,
    inputHeight: number,
    onProgress: (progress: number, stage: string) => void,
    signal: AbortSignal
  ): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      const worker = this.ensureWorker();

      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.removeEventListener('messageerror', onMessageError);
      };

      const onAbort = () => {
        cleanup();
        this.cancel();
        reject(new DOMException('AI enhancement was cancelled.', 'AbortError'));
      };

      signal.addEventListener('abort', onAbort, { once: true });

      const onMessage = (evt: MessageEvent<WorkerOutgoingMessage>) => {
        const msg = evt.data;
        if (!msg) return;
        if (msg.id && msg.id !== jobId) return;

        switch (msg.type) {
          case 'ENHANCE_PROGRESS':
            onProgress(msg.progress, msg.stage);
            break;
          case 'ENHANCE_RESULT':
            signal.removeEventListener('abort', onAbort);
            cleanup();
            resolve(msg.outputData);
            break;
          case 'ENHANCE_ERROR': {
            signal.removeEventListener('abort', onAbort);
            cleanup();
            const err = new Error(msg.error || 'Unknown AI worker error occurred.');
            if (msg.name) err.name = msg.name;
            if (msg.stack) err.stack = msg.stack;
            reject(err);
            break;
          }
        }
      };

      const onError = (evt: ErrorEvent) => {
        signal.removeEventListener('abort', onAbort);
        cleanup();
        console.error('[UpscalerService runWorkerInference error event]', {
          message: evt.message,
          filename: evt.filename,
          lineno: evt.lineno,
          colno: evt.colno,
          error: evt.error,
        });
        const realMessage =
          evt.message?.trim() ||
          evt.error?.message?.trim() ||
          (typeof evt.error === 'string' ? evt.error : '');
        const errorMessage = realMessage
          ? `Worker error: ${realMessage}`
          : 'Worker error occurred (details unavailable). This may indicate the ONNX model file is missing or corrupt. Check that public/models/realesr-general-x4v3.onnx exists.';
        reject(new Error(errorMessage));
      };

      const onMessageError = (evt: MessageEvent) => {
        signal.removeEventListener('abort', onAbort);
        cleanup();
        console.error('[UpscalerService runWorkerInference messageerror event]', evt);
        reject(new Error('Worker message communication failed.'));
      };

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onMessageError);

      const request: WorkerEnhanceRequest = {
        type: 'ENHANCE_REQUEST',
        id: jobId,
        inputData,
        inputWidth,
        inputHeight,
        modelUrl: MODEL_CONFIG.MODEL_PATH,
      };

      // Transfer the Float32Array buffer to avoid copying — worker owns it now
      worker.postMessage(request, [inputData.buffer]);
    });
  }

  private async postprocessOutput(
    outputData: Float32Array,
    rawWidth: number,
    rawHeight: number,
    targetWidth: number,
    targetHeight: number,
    format: string,
    quality: number
  ): Promise<Blob> {
    // Convert NCHW Float32 → RGBA Uint8ClampedArray
    const pixelCount = rawWidth * rawHeight;
    const rgba = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      rgba[i * 4] = Math.min(255, Math.max(0, Math.round(outputData[i] * 255)));
      rgba[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(outputData[pixelCount + i] * 255)));
      rgba[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(outputData[2 * pixelCount + i] * 255)));
      rgba[i * 4 + 3] = 255;
    }

    // Paint full 4x resolution to source canvas
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = rawWidth;
    srcCanvas.height = rawHeight;
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) throw new Error('Could not acquire source canvas context for post-processing.');
    srcCtx.putImageData(new ImageData(rgba, rawWidth, rawHeight), 0, 0);

    // Post-processing downscale to target resolution (cosmetic only; AI was done above)
    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = targetWidth;
    dstCanvas.height = targetHeight;
    const dstCtx = dstCanvas.getContext('2d');
    if (!dstCtx) throw new Error('Could not acquire destination canvas context.');
    dstCtx.drawImage(srcCanvas, 0, 0, targetWidth, targetHeight);

    return new Promise<Blob>((resolve, reject) => {
      dstCanvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to encode enhanced image to blob.'));
        },
        format,
        quality
      );
    });
  }
}

export const upscalerService = new UpscalerService();
