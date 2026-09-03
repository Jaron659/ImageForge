/**
 * Format utilities for display
 */

/**
 * Format a number as a percentage with one decimal place
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a quality value (0-1) as a percentage string
 */
export function formatQuality(quality: number): string {
  return `${Math.round(quality * 100)}%`;
}

/**
 * Format dimensions as "WxH"
 */
export function formatDimensions(width: number, height: number): string {
  return `${width} × ${height}`;
}

/**
 * Format aspect ratio from width and height
 */
export function computeAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height);
  return `${width / d}:${height / d}`;
}

/**
 * Format megapixels
 */
export function formatMegapixels(width: number, height: number): string {
  const mp = (width * height) / 1_000_000;
  return `${mp.toFixed(1)} MP`;
}

/**
 * Generate a sanitized output filename
 */
export function buildOutputFilename(
  originalName: string,
  suffix: string,
  extension: string
): string {
  const base = originalName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  return `${base}-${suffix}.${extension}`;
}

/**
 * Get file extension for a MIME type
 */
export function mimeToExtension(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    case 'image/png': return 'png';
    default: return 'bin';
  }
}
