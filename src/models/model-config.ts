/**
 * Model Configuration for ImageForge AI Enhancer
 *
 * Model: realesr-general-x4v3.onnx
 * Architecture: SRVGGNetCompact (Real-ESRGAN variant)
 * Source weights: realesr-general-x4v3.pth
 * Official project: https://github.com/xinntao/Real-ESRGAN
 * Download: https://huggingface.co/jonathanst29/tinier-upscale-models
 * License: BSD-3-Clause (inherited from upstream Real-ESRGAN weights) — free for commercial use
 * Size: ~4.6 MB (1.2M parameters) — optimized for client-side inference
 *
 * I/O Contract:
 *   Input:  float32 tensor [1, 3, H, W]  — RGB, normalized to [0.0, 1.0], NCHW layout
 *   Output: float32 tensor [1, 3, 4H, 4W] — RGB, values in [0.0, 1.0], NCHW layout (fixed 4x upscale)
 *
 * ONNX format: fp32, opset 17, dynamic H/W axes
 *
 * Post-processing note:
 *   The model always outputs exactly 4x the input resolution.
 *   A Canvas-based downscale step (post-processing only) is applied AFTER inference
 *   to fit the result within the user's chosen output resolution (480p / 720p / 1080p)
 *   while preserving aspect ratio. This downscale is cosmetic resizing only — the AI
 *   enhancement step is always performed at full 4x before any downscale.
 */

export const MODEL_CONFIG = {
  /** Filename of the ONNX model — place at public/models/<MODEL_FILENAME> */
  MODEL_FILENAME: 'realesr-general-x4v3.onnx',

  /** Path relative to the public root */
  MODEL_PATH: '/models/realesr-general-x4v3.onnx',

  /** Fixed upscale factor produced by the model */
  UPSCALE_FACTOR: 4,

  /** ONNX opset version */
  OPSET_VERSION: 17,

  /** Input tensor format */
  INPUT_FORMAT: 'float32 [1, 3, H, W] — RGB normalized to [0, 1], NCHW',

  /** Output tensor format */
  OUTPUT_FORMAT: 'float32 [1, 3, 4H, 4W] — RGB in [0, 1], NCHW',

  /** Architecture */
  ARCHITECTURE: 'SRVGGNetCompact (Real-ESRGAN)',

  /** License */
  LICENSE: 'BSD-3-Clause',

  /** Source */
  SOURCE: 'https://huggingface.co/jonathanst29/tinier-upscale-models',

  /** Approximate model size in bytes */
  APPROX_SIZE_BYTES: 4_600_000,

  /**
   * Maximum safe input pixels for WASM backend to avoid OOM.
   * At 4x upscale, output = 16x input pixels. Warn above this threshold.
   */
  MAX_SAFE_INPUT_MEGAPIXELS_WASM: 2,

  /**
   * Maximum safe input pixels for WebGPU backend.
   */
  MAX_SAFE_INPUT_MEGAPIXELS_WEBGPU: 8,

  /** Preferred execution providers in priority order */
  EXECUTION_PROVIDERS: ['webgpu', 'wasm'] as const,
} as const;

export type ModelConfig = typeof MODEL_CONFIG;
