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
});
