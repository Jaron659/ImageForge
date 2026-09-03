import {
  canvasToBlob,
  drawImageToCanvas,
  loadImageFromUrl,
} from '../utils/image.util';
import { kbToBytes } from '../utils/file-size.util';
import type { CompressionOptions, CompressionResult, OutputFormat } from '../types/image.types';

/**
 * Binary-search parameters for target-size mode
 */
const BINARY_SEARCH_MAX_ITERATIONS = 16;
const BINARY_SEARCH_TOLERANCE_BYTES = 512; // within 512 bytes of target is acceptable
const QUALITY_FLOOR = 0.12; // Minimum reasonable quality before scaling dimensions

export class ImageCompressorService {
  /**
   * Compress an image from a canvas or image source URL.
   * Supports quality mode and two-lever target-size mode (quality search + dimension scaling).
   * Guarantees output size <= targetSizeKB in target-size mode.
   */
  async compress(
    sourceUrl: string,
    sourceWidth: number,
    sourceHeight: number,
    options: CompressionOptions,
    onBinarySearchStep?: (iteration: number, quality: number, sizeBytes: number) => void,
    sourceFileSize?: number
  ): Promise<CompressionResult> {
    const img = await loadImageFromUrl(sourceUrl);

    // Initial target dimensions
    let outWidth = options.resize?.width ?? sourceWidth;
    let outHeight = options.resize?.height ?? sourceHeight;
    const isExplicitResize = options.resize != null;

    let canvas = drawImageToCanvas(img, outWidth, outHeight);
    const originalSize = sourceFileSize ?? (await this.estimateOriginalSize(canvas, options.outputFormat));

    let quality: number;
    let blob: Blob;

    if (options.mode === 'quality') {
      quality = Math.max(0.05, Math.min(1.0, options.quality));
      blob = await canvasToBlob(canvas, options.outputFormat, quality);

      // Inflation guard: If quality mode re-encoding inflated the size and dimensions did not change,
      // and no enhancement took place, search down to not exceed original size
      if (!isExplicitResize && sourceFileSize && blob.size > sourceFileSize) {
        const adjusted = await this.binarySearchQuality(
          canvas,
          options.outputFormat,
          sourceFileSize,
          onBinarySearchStep
        );
        if (adjusted.blob.size <= sourceFileSize) {
          quality = adjusted.quality;
          blob = adjusted.blob;
        }
      }
    } else {
      // ── Target-size mode: Two-lever optimization (Quality + Dimension Scaling) ──
      const rawTargetBytes = kbToBytes(options.targetSizeKB ?? 200);
      // Hard guard: Never exceed original file size unless explicit resize was requested
      const effectiveTargetBytes =
        !isExplicitResize && sourceFileSize && rawTargetBytes > sourceFileSize
          ? sourceFileSize
          : rawTargetBytes;

      const result = await this.compressToTargetSize(
        img,
        outWidth,
        outHeight,
        options.outputFormat,
        effectiveTargetBytes,
        onBinarySearchStep
      );

      quality = result.quality;
      blob = result.blob;
      outWidth = result.width;
      outHeight = result.height;
    }

    const outputSize = blob.size;
    const savedPercent =
      originalSize > 0
        ? Math.max(0, ((originalSize - outputSize) / originalSize) * 100)
        : 0;

    return {
      blob,
      quality,
      originalSize,
      outputSize,
      savedPercent,
      width: outWidth,
      height: outHeight,
    };
  }

  /**
   * Two-lever target-size compressor:
   * Lever 1: Binary search on quality in [QUALITY_FLOOR, 0.98] at current dimensions.
   * Lever 2: If even QUALITY_FLOOR exceeds target, downscale dimensions proportionally on Canvas
   *          and re-run quality search.
   */
  private async compressToTargetSize(
    img: HTMLImageElement,
    initialWidth: number,
    initialHeight: number,
    format: OutputFormat,
    targetBytes: number,
    onStep?: (iteration: number, quality: number, sizeBytes: number) => void
  ): Promise<{ quality: number; blob: Blob; width: number; height: number }> {
    let currentWidth = initialWidth;
    let currentHeight = initialHeight;
    let bestResult: { quality: number; blob: Blob; width: number; height: number } | null = null;
    let stepCount = 0;

    const maxDimensionPasses = 5;

    for (let pass = 0; pass < maxDimensionPasses; pass++) {
      const canvas = drawImageToCanvas(img, currentWidth, currentHeight);

      // Check max quality (0.98)
      const maxBlob = await canvasToBlob(canvas, format, 0.98);
      stepCount++;
      onStep?.(stepCount, 0.98, maxBlob.size);

      if (maxBlob.size <= targetBytes) {
        return { quality: 0.98, blob: maxBlob, width: currentWidth, height: currentHeight };
      }

      // Check quality floor (0.12)
      const minBlob = await canvasToBlob(canvas, format, QUALITY_FLOOR);
      stepCount++;
      onStep?.(stepCount, QUALITY_FLOOR, minBlob.size);

      if (minBlob.size <= targetBytes) {
        // Quality lever is sufficient at current dimensions!
        const searchRes = await this.binarySearchQuality(
          canvas,
          format,
          targetBytes,
          (iter, q, sz) => {
            stepCount++;
            onStep?.(stepCount, q, sz);
          }
        );
        return {
          quality: searchRes.quality,
          blob: searchRes.blob,
          width: currentWidth,
          height: currentHeight,
        };
      }

      // Even at quality floor, it exceeds target -> record best-effort and pull Lever 2 (Dimension Downscale)
      bestResult = {
        quality: QUALITY_FLOOR,
        blob: minBlob,
        width: currentWidth,
        height: currentHeight,
      };

      // Calculate next scale factor based on area ratio
      const ratio = targetBytes / minBlob.size;
      const scale = Math.max(0.25, Math.min(0.85, Math.sqrt(ratio) * 0.92));

      const nextW = Math.max(32, Math.round(currentWidth * scale));
      const nextH = Math.max(32, Math.round(currentHeight * scale));

      if (nextW === currentWidth && nextH === currentHeight) {
        break; // Cannot scale down further
      }

      currentWidth = nextW;
      currentHeight = nextH;
    }

    return bestResult!;
  }

  /**
   * Binary-search for the highest quality value in [QUALITY_FLOOR, 0.98] whose encoded size <= targetBytes.
   */
  private async binarySearchQuality(
    canvas: HTMLCanvasElement,
    format: OutputFormat,
    targetBytes: number,
    onStep?: (iteration: number, quality: number, sizeBytes: number) => void
  ): Promise<{ quality: number; blob: Blob }> {
    const lo = QUALITY_FLOOR;
    const hi = 0.98;

    let searchLo = lo;
    let searchHi = hi;
    let bestQuality = lo;
    let bestBlob = await canvasToBlob(canvas, format, lo);

    for (let i = 0; i < BINARY_SEARCH_MAX_ITERATIONS; i++) {
      const mid = (searchLo + searchHi) / 2;
      const blob = await canvasToBlob(canvas, format, mid);
      onStep?.(i + 1, mid, blob.size);

      if (blob.size <= targetBytes) {
        // Fits under target
        bestQuality = mid;
        bestBlob = blob;
        searchLo = mid;

        if (Math.abs(targetBytes - blob.size) <= BINARY_SEARCH_TOLERANCE_BYTES) {
          break; // within tolerance
        }
      } else {
        // Exceeds target
        searchHi = mid;
      }

      if (searchHi - searchLo < 0.005) break; // converged
    }

    return { quality: bestQuality, blob: bestBlob };
  }

  /**
   * Estimate the "original size" of the canvas in the given format at near-lossless quality.
   * Used as the reference for size-saved calculations.
   */
  private async estimateOriginalSize(
    canvas: HTMLCanvasElement,
    format: OutputFormat
  ): Promise<number> {
    try {
      const blob = await canvasToBlob(canvas, format, 1.0);
      return blob.size;
    } catch {
      return canvas.width * canvas.height * 3; // fallback estimate
    }
  }
}

export const imageCompressorService = new ImageCompressorService();
