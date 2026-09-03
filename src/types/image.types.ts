export type SupportedFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export type OutputFormat = 'image/jpeg' | 'image/webp';

export type ProcessingStatus =
  | 'idle'
  | 'validating'
  | 'compressing'
  | 'enhancing'
  | 'done'
  | 'error'
  | 'cancelled';

export interface ImageMetadata {
  name: string;
  type: SupportedFormat;
  size: number; // bytes
  width: number;
  height: number;
  aspectRatio: string; // e.g. "16:9"
  dataUrl: string;
  objectUrl: string;
}

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  size: number; // bytes
  dataUrl: string;
  objectUrl: string;
  format: OutputFormat;
}

export interface BatchImageItem {
  id: string;
  file: File;
  metadata?: ImageMetadata;
  status: ProcessingStatus;
  result?: ProcessedImage;
  error?: string;
  progress?: number;
}

export interface CompressionOptions {
  mode: 'quality' | 'target-size';
  quality: number; // 0-1
  targetSizeKB?: number;
  outputFormat: OutputFormat;
  resize?: {
    width: number;
    height: number;
  };
}

export interface CompressionResult {
  blob: Blob;
  quality: number;
  originalSize: number;
  outputSize: number;
  savedPercent: number;
  width: number;
  height: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  metadata?: Omit<ImageMetadata, 'dataUrl' | 'objectUrl'>;
}
