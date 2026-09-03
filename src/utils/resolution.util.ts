import type { OutputResolution, ResolutionSpec } from '../types/enhancement.types';
import { RESOLUTION_SPECS } from '../types/enhancement.types';

/**
 * Compute output dimensions that fit within the target resolution
 * while preserving the original aspect ratio. Never upscales for this purpose.
 */
export function fitWithinResolution(
  srcWidth: number,
  srcHeight: number,
  target: OutputResolution
): { width: number; height: number } {
  const spec: ResolutionSpec = RESOLUTION_SPECS[target];
  return scaleToFit(srcWidth, srcHeight, spec.maxWidth, spec.maxHeight);
}

/**
 * Scale (width, height) to fit within (maxW, maxH), preserving aspect ratio.
 * Never upscales beyond the original size.
 */
export function scaleToFit(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (srcWidth <= maxWidth && srcHeight <= maxHeight) {
    return { width: srcWidth, height: srcHeight };
  }
  const scale = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
  return {
    width: Math.round(srcWidth * scale),
    height: Math.round(srcHeight * scale),
  };
}

/**
 * Scale (width, height) to exactly fill maxWidth × maxHeight, preserving aspect ratio.
 * This may upscale.
 */
export function scaleToFill(
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number
): { width: number; height: number } {
  const scale = Math.min(targetWidth / srcWidth, targetHeight / srcHeight);
  return {
    width: Math.round(srcWidth * scale),
    height: Math.round(srcHeight * scale),
  };
}

/**
 * Check if an image needs upscaling to meet the target resolution
 */
export function needsUpscale(
  srcWidth: number,
  srcHeight: number,
  target: OutputResolution
): boolean {
  const spec = RESOLUTION_SPECS[target];
  return srcWidth < spec.maxWidth || srcHeight < spec.maxHeight;
}

/**
 * Get the total megapixels for width × height
 */
export function getMegapixels(width: number, height: number): number {
  return (width * height) / 1_000_000;
}
