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
const BINARY_SEARCH_MAX_ITERATIONS = 20;
const BINARY_SEARCH_TOLERANCE_BYTES = 512; // within 512 bytes of target is acceptable

export class ImageCompressorService {
  /**
   * Compress an image from a canvas or image source URL.
   * Supports quality mode and binary-search target-size mode.
   * Guarantees output size never exceeds sourceSize unless resizing was requested.
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

    // Determine output dimensions
    const outWidth = options.resize?.width ?? sourceWidth;
    const outHeight = options.resize?.height ?? sourceHeight;
    const isDimensionChanged = outWidth !== sourceWidth || outHeight !== sourceHeight;

    const canvas = drawImageToCanvas(img, outWidth, outHeight);
    const originalSize = sourceFileSize ?? (await this.estimateOriginalSize(canvas, options.outputFormat));

    let quality: number;
    let blob: Blob;

    if (options.mode === 'quality') {
      quality = Math.max(0.01, Math.min(1.0, options.quality));
      blob = await canvasToBlob(canvas, options.outputFormat, quality);

      // Inflation guard: If re-encoding inflated the size and dimensions did not change,
      // search down to find a quality that does not exceed original size
      if (!isDimensionChanged && sourceFileSize && blob.size > sourceFileSize) {
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
      // Target-size mode: Target cannot exceed original size unless dimensions were enlarged
      const rawTargetBytes = kbToBytes(options.targetSizeKB ?? 200);
      const effectiveTargetBytes =
        !isDimensionChanged && sourceFileSize && rawTargetBytes > sourceFileSize
          ? sourceFileSize
          : rawTargetBytes;

      const result = await this.binarySearchQuality(
        canvas,
        options.outputFormat,
        effectiveTargetBytes,
        onBinarySearchStep
      );
      quality = result.quality;
      blob = result.blob;
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
   * Binary-search for the highest quality value whose encoded size <= targetBytes.
   * Reports each step via the optional callback.
   */
  private async binarySearchQuality(
    canvas: HTMLCanvasElement,
    format: OutputFormat,
    targetBytes: number,
    onStep?: (iteration: number, quality: number, sizeBytes: number) => void
  ): Promise<{ quality: number; blob: Blob }> {
    const lo = 0.05;
    const hi = 0.98;

    // Quick check 1: test max quality
    const maxBlob = await canvasToBlob(canvas, format, hi);
    if (maxBlob.size <= targetBytes) {
      onStep?.(0, hi, maxBlob.size);
      return { quality: hi, blob: maxBlob };
    }

    // Quick check 2: test min quality
    const minBlob = await canvasToBlob(canvas, format, lo);
    if (minBlob.size > targetBytes) {
      onStep?.(0, lo, minBlob.size);
      return { quality: lo, blob: minBlob };
    }

    // Binary search in [lo, hi]
    let searchLo = lo;
    let searchHi = hi;
    let bestQuality = lo;
    let bestBlob = minBlob;

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
