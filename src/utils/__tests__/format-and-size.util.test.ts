import { describe, it, expect } from 'vitest';
import { formatFileSize, bytesToKB, kbToBytes, calcSavedPercent, formatKB, formatMB } from '../file-size.util';
import { computeAspectRatio, mimeToExtension, buildOutputFilename, formatPercent, formatQuality, formatDimensions, formatMegapixels } from '../format.util';

describe('file-size.util', () => {
  it('formats byte sizes cleanly', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatFileSize(5.5 * 1024 * 1024)).toBe('5.5 MB');
  });

  it('converts between bytes and KB', () => {
    expect(bytesToKB(2048)).toBe(2);
    expect(kbToBytes(50)).toBe(50 * 1024);
  });

  it('formats KB and MB helpers', () => {
    expect(formatKB(2048)).toBe('2.0 KB');
    expect(formatMB(1024 * 1024 * 3)).toBe('3.00 MB');
  });

  it('calculates saved percentage', () => {
    expect(calcSavedPercent(1000, 400)).toBe(60);
    expect(calcSavedPercent(500, 500)).toBe(0);
    expect(calcSavedPercent(100, 200)).toBe(0);
  });
});

describe('format.util', () => {
  it('computes aspect ratio string correctly', () => {
    expect(computeAspectRatio(1920, 1080)).toBe('16:9');
    expect(computeAspectRatio(1280, 720)).toBe('16:9');
    expect(computeAspectRatio(800, 600)).toBe('4:3');
    expect(computeAspectRatio(1000, 1000)).toBe('1:1');
    expect(computeAspectRatio(1080, 1920)).toBe('9:16');
  });

  it('formats percentage, quality, dimensions and megapixels', () => {
    expect(formatPercent(45.678)).toBe('45.7%');
    expect(formatQuality(0.85)).toBe('85%');
    expect(formatDimensions(1920, 1080)).toBe('1920 × 1080');
    expect(formatMegapixels(4000, 3000)).toBe('12.0 MP');
  });

  it('maps MIME types to file extensions', () => {
    expect(mimeToExtension('image/jpeg')).toBe('jpg');
    expect(mimeToExtension('image/png')).toBe('png');
    expect(mimeToExtension('image/webp')).toBe('webp');
  });

  it('builds sanitized output filenames properly', () => {
    expect(buildOutputFilename('photo.png', 'compressed', 'webp')).toBe('photo-compressed.webp');
    expect(buildOutputFilename('my.holiday.photo.jpg', 'enhanced', 'jpg')).toBe('my-holiday-photo-enhanced.jpg');
    expect(buildOutputFilename('My Special Photo! 2026.png', 'enhanced-compressed', 'webp')).toBe('my-special-photo--2026-enhanced-compressed.webp');
  });
});
