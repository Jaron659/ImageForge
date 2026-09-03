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
   */
  async compress(
    sourceUrl: string,
    sourceWidth: number,
    sourceHeight: number,
    options: CompressionOptions,
    onBinarySearchStep?: (iteration: number, quality: number, sizeBytes: number) => void
  ): Promise<CompressionResult> {
    const img = await loadImageFromUrl(sourceUrl);

    // Determine output dimensions
    const outWidth = options.resize?.width ?? sourceWidth;
    const outHeight = options.resize?.height ?? sourceHeight;

    const canvas = drawImageToCanvas(img, outWidth, outHeight);
    const originalSize = await this.estimateOriginalSize(canvas, options.outputFormat);

    let quality: number;
    let blob: Blob;

    if (options.mode === 'quality') {
      quality = Math.max(0.01, Math.min(1.0, options.quality));
      blob = await canvasToBlob(canvas, options.outputFormat, quality);
    } else {
      // Target-size mode: binary search for highest quality ≤ target size
      const targetBytes = kbToBytes(options.targetSizeKB ?? 200);
      const result = await this.binarySearchQuality(
        canvas,
        options.outputFormat,
        targetBytes,
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
   * Binary-search for the highest quality value whose encoded size ≤ targetBytes.
   * Reports each step via the optional callback.
   */
  private async binarySearchQuality(
    canvas: HTMLCanvasElement,
    format: OutputFormat,
    targetBytes: number,
    onStep?: (iteration: number, quality: number, sizeBytes: number) => void
  ): Promise<{ quality: number; blob: Blob }> {
    const lo = 0.01;
    const hi = 1.0;

    // Quick check 1: even at maximum quality, we're within target — no search needed
    const maxBlob = await canvasToBlob(canvas, format, hi);
    if (maxBlob.size <= targetBytes) {
      onStep?.(0, hi, maxBlob.size);
      return { quality: hi, blob: maxBlob };
    }

    // Quick check 2: even at minimum quality, we still exceed target — best-effort
    const minBlob = await canvasToBlob(canvas, format, lo);
    if (minBlob.size > targetBytes) {
      onStep?.(0, lo, minBlob.size);
      return { quality: lo, blob: minBlob };
    }

    // Binary search in (lo, hi) — guaranteed: minBlob fits not, maxBlob fits not → solution exists
    let searchLo = lo;
    let searchHi = hi;
    let bestQuality = lo;
    let bestBlob = minBlob;

    for (let i = 0; i < BINARY_SEARCH_MAX_ITERATIONS; i++) {
      const mid = (searchLo + searchHi) / 2;
      const blob = await canvasToBlob(canvas, format, mid);
      onStep?.(i + 1, mid, blob.size);

      if (blob.size <= targetBytes) {
        // This quality fits — record it and try to go higher
        bestQuality = mid;
        bestBlob = blob;
        searchLo = mid;

        if (Math.abs(targetBytes - blob.size) <= BINARY_SEARCH_TOLERANCE_BYTES) {
          break; // within tolerance — done
        }
      } else {
        // Too large — go lower
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
