/**
 * File size formatting utilities
 */

/**
 * Format bytes to a human-readable string (B, KB, MB, GB)
 */
export function formatFileSize(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return 'Unknown';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${parseFloat(value.toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format bytes as KB with one decimal place
 */
export function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Format bytes as MB with two decimal places
 */
export function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Calculate percentage saved between original and compressed size
 */
export function calcSavedPercent(original: number, compressed: number): number {
  if (original === 0) return 0;
  return Math.max(0, ((original - compressed) / original) * 100);
}

/**
 * Convert KB to bytes
 */
export function kbToBytes(kb: number): number {
  return Math.round(kb * 1024);
}

/**
 * Convert bytes to KB
 */
export function bytesToKB(bytes: number): number {
  return bytes / 1024;
}
