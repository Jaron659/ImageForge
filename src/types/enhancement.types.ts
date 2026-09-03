export type OutputResolution = '480p' | '720p' | '1080p';

export interface ResolutionSpec {
  label: OutputResolution;
  maxWidth: number;
  maxHeight: number;
}

export const RESOLUTION_SPECS: Record<OutputResolution, ResolutionSpec> = {
  '480p': { label: '480p', maxWidth: 854, maxHeight: 480 },
  '720p': { label: '720p', maxWidth: 1280, maxHeight: 720 },
  '1080p': { label: '1080p', maxWidth: 1920, maxHeight: 1080 },
};

export interface EnhancementOptions {
  targetResolution: OutputResolution;
  /** If true, compress the enhanced output */
  compress: boolean;
  compressionQuality?: number;
  outputFormat?: 'image/jpeg' | 'image/webp';
}

export type WorkerMessageType =
  | 'ENHANCE_REQUEST'
  | 'ENHANCE_PROGRESS'
  | 'ENHANCE_RESULT'
  | 'ENHANCE_ERROR'
  | 'CANCEL';

export interface WorkerEnhanceRequest {
  type: 'ENHANCE_REQUEST';
  id: string;
  /** Float32Array of shape [1, 3, h, w], values in [0, 1] */
  inputData: Float32Array;
  inputWidth: number;
  inputHeight: number;
  modelUrl: string;
}

export interface WorkerProgressEvent {
  type: 'ENHANCE_PROGRESS';
  id: string;
  progress: number; // 0-100
  stage: string;
}

export interface WorkerResultEvent {
  type: 'ENHANCE_RESULT';
  id: string;
  /** Float32Array of shape [1, 3, 4h, 4w], values in [0, 1] */
  outputData: Float32Array;
  outputWidth: number;
  outputHeight: number;
}

export interface WorkerErrorEvent {
  type: 'ENHANCE_ERROR';
  id?: string;
  error: string;
  name?: string;
  stack?: string;
}

export interface WorkerCancelEvent {
  type: 'CANCEL';
  id: string;
}

export type WorkerIncomingMessage =
  | WorkerEnhanceRequest
  | WorkerCancelEvent;

export type WorkerOutgoingMessage =
  | WorkerProgressEvent
  | WorkerResultEvent
  | WorkerErrorEvent;
