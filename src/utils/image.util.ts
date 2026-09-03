/**
 * Image processing utilities using Canvas API
 */

/**
 * Load an image file into an HTMLImageElement
 */
export function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
      // Don't revoke here — caller may still need the url
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image. The file may be corrupt or unsupported.'));
    };
    img.src = url;
  });
}

/**
 * Load an image from a data URL or object URL
 */
export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('Failed to load image from URL.'));
    img.src = url;
  });
}

/**
 * Draw an image onto a canvas at the given dimensions.
 * Returns the canvas element.
 */
export function drawImageToCanvas(
  img: HTMLImageElement | ImageBitmap,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not acquire 2D canvas context.');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

/**
 * Extract RGBA pixel data from a canvas
 */
export function getCanvasImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not acquire 2D canvas context.');
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Convert RGBA ImageData to a Float32Array in NCHW format [1, 3, H, W]
 * with values normalized to [0, 1].
 */
export function imageDataToNCHW(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  const tensor = new Float32Array(3 * pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const ri = i * 4;
    tensor[i] = data[ri] / 255; // R channel
    tensor[pixelCount + i] = data[ri + 1] / 255; // G channel
    tensor[2 * pixelCount + i] = data[ri + 2] / 255; // B channel
  }
  return tensor;
}

/**
 * Convert a Float32Array in NCHW format [1, 3, H, W] (values [0,1]) back to
 * an ImageData with RGBA layout (values [0,255]).
 */
export function nchwToImageData(
  tensor: Float32Array,
  width: number,
  height: number
): ImageData {
  const pixelCount = width * height;
  const data = new Uint8ClampedArray(pixelCount * 4);

  for (let i = 0; i < pixelCount; i++) {
    data[i * 4] = Math.min(255, Math.max(0, Math.round(tensor[i] * 255))); // R
    data[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(tensor[pixelCount + i] * 255))); // G
    data[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(tensor[2 * pixelCount + i] * 255))); // B
    data[i * 4 + 3] = 255; // A (fully opaque)
  }
  return new ImageData(data, width, height);
}

/**
 * Write an ImageData onto a new canvas and return the canvas
 */
export function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not acquire 2D canvas context.');
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Convert a canvas to a Blob with the given mime type and quality
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null. The image may be too large or the format is unsupported.'));
      },
      type,
      quality
    );
  });
}

/**
 * Convert a Blob to a data URL (base64)
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob as data URL.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Safely revoke an object URL
 */
export function safeRevokeObjectUrl(url: string | undefined | null): void {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore
    }
  }
}
