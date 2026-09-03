import type { SupportedFormat, ValidationResult } from '../types/image.types';
import { computeAspectRatio } from '../utils/format.util';

const SUPPORTED_FORMATS: SupportedFormat[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

/** 50 MB hard limit — warn about large files before this */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** 16 MP warn threshold — user is warned before processing very large images */
export const LARGE_IMAGE_MP_THRESHOLD = 16;

export class ImageValidatorService {
  /**
   * Validate a File for format, content, and dimensions.
   * Returns a ValidationResult with metadata or a specific error message.
   */
  async validate(file: File): Promise<ValidationResult> {
    // 1. Empty file check
    if (file.size === 0) {
      return {
        valid: false,
        error: 'The file is empty (0 bytes). Please select a valid image file.',
      };
    }

    // 2. File size limit
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 50 MB.`,
      };
    }

    // 3. MIME type check
    if (!SUPPORTED_FORMATS.includes(file.type as SupportedFormat)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        return {
          valid: false,
          error: `Unsupported format: "${file.type || ext}". Please upload a JPG, PNG, or WebP image.`,
        };
      }
    }

    // 4. Attempt to decode — catches corrupt files
    let img: HTMLImageElement;
    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(file);
      img = await this.loadImage(objectUrl);
    } catch {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      return {
        valid: false,
        error:
          'The file could not be decoded. It may be corrupt, truncated, or not a valid image. Please try a different file.',
      };
    }

    // 5. Dimension check
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      URL.revokeObjectURL(objectUrl!);
      return {
        valid: false,
        error: 'The image has zero dimensions and cannot be processed.',
      };
    }

    const metadata = {
      name: file.name,
      type: file.type as SupportedFormat,
      size: file.size,
      width: img.naturalWidth,
      height: img.naturalHeight,
      aspectRatio: computeAspectRatio(img.naturalWidth, img.naturalHeight),
    };

    URL.revokeObjectURL(objectUrl!);

    return { valid: true, metadata };
  }

  /**
   * Check if an image is very large (may cause performance issues)
   */
  isVeryLarge(width: number, height: number): boolean {
    return (width * height) / 1_000_000 > LARGE_IMAGE_MP_THRESHOLD;
  }

  /**
   * Validate multiple files — returns results in the same order
   */
  async validateBatch(files: File[]): Promise<ValidationResult[]> {
    return Promise.all(files.map((f) => this.validate(f)));
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode failed'));
      img.src = url;
    });
  }
}

export const imageValidatorService = new ImageValidatorService();
