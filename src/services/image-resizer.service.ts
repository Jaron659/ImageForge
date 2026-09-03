import { drawImageToCanvas, loadImageFromUrl, canvasToBlob } from '../utils/image.util';
import type { OutputFormat } from '../types/image.types';

export interface ResizeOptions {
  targetWidth: number;
  targetHeight: number;
  outputFormat: OutputFormat;
  quality: number;
}

export class ImageResizerService {
  /**
   * Resize an image (from a URL) to target dimensions and return a Blob.
   * Uses Canvas drawImage — this is ONLY for cosmetic resizing of already-enhanced images,
   * never as a substitute for AI upscaling.
   */
  async resize(sourceUrl: string, options: ResizeOptions): Promise<Blob> {
    const img = await loadImageFromUrl(sourceUrl);
    const canvas = drawImageToCanvas(img, options.targetWidth, options.targetHeight);
    return canvasToBlob(canvas, options.outputFormat, options.quality);
  }

  /**
   * Resize a canvas (already rendered) to new dimensions.
   * Returns a new canvas — caller is responsible for cleanup.
   */
  resizeCanvas(
    sourceCanvas: HTMLCanvasElement,
    targetWidth: number,
    targetHeight: number
  ): HTMLCanvasElement {
    const dst = document.createElement('canvas');
    dst.width = targetWidth;
    dst.height = targetHeight;
    const ctx = dst.getContext('2d');
    if (!ctx) throw new Error('Could not acquire 2D canvas context for resize.');
    ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
    return dst;
  }

  /**
   * Resize raw ImageData by rendering to a canvas then scaling.
   * Used for post-processing the AI output to the user's target resolution.
   */
  resizeImageData(
    imageData: ImageData,
    targetWidth: number,
    targetHeight: number
  ): HTMLCanvasElement {
    // Render the full-resolution AI output to a source canvas
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = imageData.width;
    srcCanvas.height = imageData.height;
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) throw new Error('Could not acquire source canvas context.');
    srcCtx.putImageData(imageData, 0, 0);

    // Scale down (post-processing only) to the target resolution
    return this.resizeCanvas(srcCanvas, targetWidth, targetHeight);
  }
}

export const imageResizerService = new ImageResizerService();
