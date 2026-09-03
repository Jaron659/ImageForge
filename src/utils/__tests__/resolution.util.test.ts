import { describe, it, expect } from 'vitest';
import { fitWithinResolution, scaleToFit, scaleToFill, needsUpscale, getMegapixels } from '../resolution.util';

describe('resolution.util', () => {
  describe('scaleToFit', () => {
    it('does not upscale when dimensions are within max bounds', () => {
      const result = scaleToFit(800, 600, 1920, 1080);
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it('downscales landscape image preserving aspect ratio', () => {
      const result = scaleToFit(3840, 2160, 1920, 1080);
      expect(result).toEqual({ width: 1920, height: 1080 });
    });

    it('downscales portrait image preserving aspect ratio', () => {
      // 1000 x 2000 image in 1920x1080 box: max height is 1080 -> scale = 1080/2000 = 0.54 -> width = 540
      const result = scaleToFit(1000, 2000, 1920, 1080);
      expect(result).toEqual({ width: 540, height: 1080 });
    });

    it('downscales square image preserving aspect ratio', () => {
      const result = scaleToFit(2000, 2000, 1920, 1080);
      expect(result).toEqual({ width: 1080, height: 1080 });
    });
  });

  describe('fitWithinResolution', () => {
    it('fits 4x upscaled 400x300 image within 720p', () => {
      // 400x300 * 4 = 1600x1200. 720p max is 1280x720. Scale = min(1280/1600=0.8, 720/1200=0.6) = 0.6.
      // outW = 1600 * 0.6 = 960, outH = 1200 * 0.6 = 720 (4:3 ratio preserved)
      const result = fitWithinResolution(1600, 1200, '720p');
      expect(result).toEqual({ width: 960, height: 720 });
    });

    it('leaves dimensions unchanged if already fits 1080p target', () => {
      const result = fitWithinResolution(1280, 720, '1080p');
      expect(result).toEqual({ width: 1280, height: 720 });
    });
  });

  describe('scaleToFill', () => {
    it('scales proportionally to fill target', () => {
      const result = scaleToFill(100, 50, 400, 400);
      expect(result).toEqual({ width: 400, height: 200 });
    });
  });

  describe('needsUpscale', () => {
    it('returns true when below target dimensions', () => {
      expect(needsUpscale(500, 400, '1080p')).toBe(true);
    });

    it('returns false when at or above target dimensions', () => {
      expect(needsUpscale(1920, 1080, '1080p')).toBe(false);
      expect(needsUpscale(2560, 1440, '1080p')).toBe(false);
    });
  });

  describe('getMegapixels', () => {
    it('calculates megapixels accurately', () => {
      expect(getMegapixels(4000, 3000)).toBe(12);
      expect(getMegapixels(1920, 1080)).toBeCloseTo(2.0736, 3);
    });
  });
});
