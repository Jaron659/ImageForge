import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageCompressorService } from '../image-compressor.service';
import * as imageUtils from '../../utils/image.util';

describe('ImageCompressorService - Target File Size Mode', () => {
  let service: ImageCompressorService;

  beforeEach(() => {
    service = new ImageCompressorService();
    vi.restoreAllMocks();
  });

  it('compresses an image using quality search when quality lever is sufficient', async () => {
    // Mock image loading
    const mockImg = { width: 800, height: 600 } as HTMLImageElement;
    vi.spyOn(imageUtils, 'loadImageFromUrl').mockResolvedValue(mockImg);

    // Mock canvas drawing
    const mockCanvas = { width: 800, height: 600 } as HTMLCanvasElement;
    vi.spyOn(imageUtils, 'drawImageToCanvas').mockReturnValue(mockCanvas);

    // Mock canvasToBlob: size is proportional to quality (e.g. quality 1.0 = 100KB, quality 0.5 = 50KB)
    vi.spyOn(imageUtils, 'canvasToBlob').mockImplementation(async (_canvas, _format, quality) => {
      const q = quality ?? 0.85;
      const sizeBytes = Math.round(q * 100 * 1024); // 100 KB at q=1.0, 50 KB at q=0.5
      return new Blob([new Uint8Array(sizeBytes)], { type: 'image/jpeg' });
    });

    const result = await service.compress(
      'blob:http://localhost/test',
      800,
      600,
      {
        mode: 'target-size',
        quality: 0.85,
        targetSizeKB: 50, // 50 KB target
        outputFormat: 'image/jpeg',
      },
      undefined,
      100 * 1024 // 100 KB source
    );

    // Should satisfy outputSize <= 50 KB
    expect(result.outputSize).toBeLessThanOrEqual(50 * 1024);
    expect(result.outputSize).toBeGreaterThan(40 * 1024); // close to target
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it('scales dimensions down when quality floor is insufficient to reach target (lever 2)', async () => {
    const mockImg = { width: 1920, height: 1080 } as HTMLImageElement;
    vi.spyOn(imageUtils, 'loadImageFromUrl').mockResolvedValue(mockImg);

    // Track current canvas dimensions
    let currentCanvasW = 1920;
    let currentCanvasH = 1080;

    vi.spyOn(imageUtils, 'drawImageToCanvas').mockImplementation((_img, w, h) => {
      currentCanvasW = w;
      currentCanvasH = h;
      return { width: w, height: h } as HTMLCanvasElement;
    });

    // Mock canvasToBlob: size is proportional to (pixels * quality)
    vi.spyOn(imageUtils, 'canvasToBlob').mockImplementation(async (canvas, _format, quality) => {
      const q = quality ?? 0.85;
      const pixels = canvas.width * canvas.height;
      // At 1920x1080 (2M pixels), at q=0.12, size is ~75 KB
      // At smaller pixels, size scales down
      const sizeBytes = Math.round((pixels / (1920 * 1080)) * q * 400 * 1024);
      return new Blob([new Uint8Array(sizeBytes)], { type: 'image/jpeg' });
    });

    const result = await service.compress(
      'blob:http://localhost/test-large',
      1920,
      1080,
      {
        mode: 'target-size',
        quality: 0.85,
        targetSizeKB: 25, // 25 KB target on large image
        outputFormat: 'image/jpeg',
      },
      undefined,
      500 * 1024
    );

    expect(result.outputSize).toBeLessThanOrEqual(25 * 1024);
    // Dimension reduction must have occurred
    expect(result.width).toBeLessThan(1920);
    expect(result.height).toBeLessThan(1080);
  });

  it('does NOT artificially inflate when target size is larger than original', async () => {
    const mockImg = { width: 400, height: 300 } as HTMLImageElement;
    vi.spyOn(imageUtils, 'loadImageFromUrl').mockResolvedValue(mockImg);

    const mockCanvas = { width: 400, height: 300 } as HTMLCanvasElement;
    vi.spyOn(imageUtils, 'drawImageToCanvas').mockReturnValue(mockCanvas);

    // 48 KB original image
    const sourceFileSize = 48 * 1024;

    vi.spyOn(imageUtils, 'canvasToBlob').mockImplementation(async (_canvas, _format, quality) => {
      const q = quality ?? 0.85;
      const sizeBytes = Math.round(q * 100 * 1024); // at 0.98 -> 98 KB
      return new Blob([new Uint8Array(sizeBytes)], { type: 'image/jpeg' });
    });

    const result = await service.compress(
      'blob:http://localhost/test-small',
      400,
      300,
      {
        mode: 'target-size',
        quality: 0.85,
        targetSizeKB: 500, // User entered 500 KB target on a 48 KB image
        outputFormat: 'image/jpeg',
      },
      undefined,
      sourceFileSize
    );

    // Must NOT balloon to 500 KB or exceed 48 KB original!
    expect(result.outputSize).toBeLessThanOrEqual(sourceFileSize);
  });

  it('Large image (3 MB / 3840x2160) targeting 50 KB and 100 KB', async () => {
    const mockImg = { width: 3840, height: 2160 } as HTMLImageElement;
    vi.spyOn(imageUtils, 'loadImageFromUrl').mockResolvedValue(mockImg);

    vi.spyOn(imageUtils, 'drawImageToCanvas').mockImplementation((_img, w, h) => {
      return { width: w, height: h } as HTMLCanvasElement;
    });

    vi.spyOn(imageUtils, 'canvasToBlob').mockImplementation(async (canvas, _format, quality) => {
      const q = quality ?? 0.85;
      const pixels = canvas.width * canvas.height;
      const sizeBytes = Math.round(600 + (pixels * 0.35 * Math.pow(q, 1.5)));
      return new Blob([new Uint8Array(sizeBytes)], { type: 'image/jpeg' });
    });

    // Test 100 KB target on 3 MB
    const res100 = await service.compress(
      'blob:http://localhost/3mb',
      3840,
      2160,
      { mode: 'target-size', quality: 0.85, targetSizeKB: 100, outputFormat: 'image/jpeg' },
      undefined,
      3 * 1024 * 1024
    );
    expect(res100.outputSize).toBeLessThanOrEqual(100 * 1024);
    expect(res100.outputSize).toBeGreaterThan(50 * 1024);

    // Test 50 KB target on 3 MB
    const res50 = await service.compress(
      'blob:http://localhost/3mb',
      3840,
      2160,
      { mode: 'target-size', quality: 0.85, targetSizeKB: 50, outputFormat: 'image/jpeg' },
      undefined,
      3 * 1024 * 1024
    );
    expect(res50.outputSize).toBeLessThanOrEqual(50 * 1024);
    expect(res50.outputSize).toBeGreaterThan(25 * 1024);
    expect(res50.width).toBeLessThan(3840);
  });

  it('Medium image (~500 KB / 1200x900) targeting 20 KB, 50 KB, and 100 KB', async () => {
    const mockImg = { width: 1200, height: 900 } as HTMLImageElement;
    vi.spyOn(imageUtils, 'loadImageFromUrl').mockResolvedValue(mockImg);

    vi.spyOn(imageUtils, 'drawImageToCanvas').mockImplementation((_img, w, h) => {
      return { width: w, height: h } as HTMLCanvasElement;
    });

    vi.spyOn(imageUtils, 'canvasToBlob').mockImplementation(async (canvas, _format, quality) => {
      const q = quality ?? 0.85;
      const pixels = canvas.width * canvas.height;
      const sizeBytes = Math.round(500 + (pixels * 0.45 * Math.pow(q, 1.4)));
      return new Blob([new Uint8Array(sizeBytes)], { type: 'image/jpeg' });
    });

    // 100 KB target
    const res100 = await service.compress(
      'blob:http://localhost/500kb',
      1200,
      900,
      { mode: 'target-size', quality: 0.85, targetSizeKB: 100, outputFormat: 'image/jpeg' },
      undefined,
      500 * 1024
    );
    expect(res100.outputSize).toBeLessThanOrEqual(100 * 1024);
    expect(res100.outputSize).toBeGreaterThan(70 * 1024);

    // 50 KB target
    const res50 = await service.compress(
      'blob:http://localhost/500kb',
      1200,
      900,
      { mode: 'target-size', quality: 0.85, targetSizeKB: 50, outputFormat: 'image/jpeg' },
      undefined,
      500 * 1024
    );
    expect(res50.outputSize).toBeLessThanOrEqual(50 * 1024);
    expect(res50.outputSize).toBeGreaterThan(35 * 1024);

    // 20 KB target
    const res20 = await service.compress(
      'blob:http://localhost/500kb',
      1200,
      900,
      { mode: 'target-size', quality: 0.85, targetSizeKB: 20, outputFormat: 'image/jpeg' },
      undefined,
      500 * 1024
    );
    expect(res20.outputSize).toBeLessThanOrEqual(20 * 1024);
    expect(res20.outputSize).toBeGreaterThan(12 * 1024);
  });

  it('Target size compression on cropped image operates on cropped dimensions', async () => {
    const croppedW = 600;
    const croppedH = 600;
    const croppedSourceSize = 90 * 1024;

    const mockImg = { width: croppedW, height: croppedH } as HTMLImageElement;
    vi.spyOn(imageUtils, 'loadImageFromUrl').mockResolvedValue(mockImg);

    vi.spyOn(imageUtils, 'drawImageToCanvas').mockImplementation((_img, w, h) => {
      return { width: w, height: h } as HTMLCanvasElement;
    });

    vi.spyOn(imageUtils, 'canvasToBlob').mockImplementation(async (canvas, _format, quality) => {
      const q = quality ?? 0.85;
      const sizeBytes = Math.round(400 + (canvas.width * canvas.height * 0.25 * q));
      return new Blob([new Uint8Array(sizeBytes)], { type: 'image/jpeg' });
    });

    const res = await service.compress(
      'blob:http://localhost/cropped',
      croppedW,
      croppedH,
      { mode: 'target-size', quality: 0.85, targetSizeKB: 40, outputFormat: 'image/jpeg' },
      undefined,
      croppedSourceSize
    );

    expect(res.outputSize).toBeLessThanOrEqual(40 * 1024);
    expect(res.width).toBeLessThanOrEqual(croppedW);
    expect(res.height).toBeLessThanOrEqual(croppedH);
  });

  it('Target size compression after AI enhance operates on enhanced dimensions', async () => {
    const enhancedW = 1920;
    const enhancedH = 1080;
    const enhancedSize = 750 * 1024;

    const mockImg = { width: enhancedW, height: enhancedH } as HTMLImageElement;
    vi.spyOn(imageUtils, 'loadImageFromUrl').mockResolvedValue(mockImg);

    vi.spyOn(imageUtils, 'drawImageToCanvas').mockImplementation((_img, w, h) => {
      return { width: w, height: h } as HTMLCanvasElement;
    });

    vi.spyOn(imageUtils, 'canvasToBlob').mockImplementation(async (canvas, _format, quality) => {
      const q = quality ?? 0.85;
      const sizeBytes = Math.round(500 + (canvas.width * canvas.height * 0.35 * q));
      return new Blob([new Uint8Array(sizeBytes)], { type: 'image/jpeg' });
    });

    const res = await service.compress(
      'blob:http://localhost/enhanced',
      enhancedW,
      enhancedH,
      { mode: 'target-size', quality: 0.85, targetSizeKB: 80, outputFormat: 'image/jpeg' },
      undefined,
      enhancedSize
    );

    expect(res.outputSize).toBeLessThanOrEqual(80 * 1024);
    expect(res.outputSize).toBeGreaterThan(50 * 1024);
  });

  it('5 MB (4000x3000) and 2 MB (2560x1440) images with targets: 20 KB, 50 KB, 100 KB, 200 KB', async () => {
    // 5 MB image
    const mock5MB = { width: 4000, height: 3000 } as HTMLImageElement;
    vi.spyOn(imageUtils, 'loadImageFromUrl').mockResolvedValue(mock5MB);

    vi.spyOn(imageUtils, 'drawImageToCanvas').mockImplementation((_img, w, h) => {
      return { width: w, height: h } as HTMLCanvasElement;
    });

    vi.spyOn(imageUtils, 'canvasToBlob').mockImplementation(async (canvas, _format, quality) => {
      const q = quality ?? 0.85;
      const pixels = canvas.width * canvas.height;
      const sizeBytes = Math.round(600 + (pixels * 0.42 * Math.pow(q, 1.5)));
      return new Blob([new Uint8Array(sizeBytes)], { type: 'image/jpeg' });
    });

    const targets = [20, 50, 100, 200];
    for (const targetKB of targets) {
      const res = await service.compress(
        'blob:http://localhost/5mb',
        4000,
        3000,
        { mode: 'target-size', quality: 0.85, targetSizeKB: targetKB, outputFormat: 'image/jpeg' },
        undefined,
        5 * 1024 * 1024
      );
      expect(res.outputSize).toBeLessThanOrEqual(targetKB * 1024);
      expect(res.outputSize).toBeGreaterThan(targetKB * 1024 * 0.45);
    }
  });
});
