/**
 * upscaler.worker.ts
 *
 * Web Worker for ONNX Runtime Super-Resolution inference.
 * Runs entirely off the main thread to avoid UI blocking.
 *
 * Execution provider strategy:
 *   1. Try WebGPU (hardware-accelerated, fastest)
 *   2. Fall back to WASM (CPU, universally supported)
 *   Failure of WebGPU is silent — WASM fallback is automatic.
 *
 * Session caching:
 *   The ONNX InferenceSession is created once and reused across images.
 *   Loading the model (~4.6 MB) is done on the first request.
 */

import * as ort from 'onnxruntime-web';
import type {
  WorkerIncomingMessage,
  WorkerOutgoingMessage,
  WorkerEnhanceRequest,
} from '../types/enhancement.types';
import { MODEL_CONFIG } from '../models/model-config';

// ─── Configure ONNX Runtime WASM paths ──────────────────────────────────────
// Vite copies the onnxruntime-web wasm files to the public output directory.
// Point the runtime to find them.
ort.env.wasm.wasmPaths = '/';

// ─── Session cache ──────────────────────────────────────────────────────────
let cachedSession: ort.InferenceSession | null = null;
let sessionModelUrl: string | null = null;
let sessionLoadPromise: Promise<ort.InferenceSession> | null = null;
let activeJobId: string | null = null;
let cancelled = false;

// ─── Load (or reuse) the ONNX session ───────────────────────────────────────
async function getSession(modelUrl: string): Promise<ort.InferenceSession> {
  // Reuse if we already have a session for this model URL
  if (cachedSession && sessionModelUrl === modelUrl) {
    return cachedSession;
  }

  // If already loading, wait for it
  if (sessionLoadPromise) {
    return sessionLoadPromise;
  }

  sessionLoadPromise = (async () => {
    const providers = await selectExecutionProviders();

    postProgress(activeJobId ?? '', 5, `Loading AI model (${providers[0]} backend)...`);

    try {
      const session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: providers,
        graphOptimizationLevel: 'all',
      });
      cachedSession = session;
      sessionModelUrl = modelUrl;
      sessionLoadPromise = null;
      return session;
    } catch (err) {
      sessionLoadPromise = null;
      throw new Error(
        `Failed to load AI model from "${modelUrl}". ` +
        `Ensure the file public/models/realesr-general-x4v3.onnx exists and is valid. ` +
        `Original error: ${(err as Error).message}`
      );
    }
  })();

  return sessionLoadPromise;
}

// ─── Execution provider selection ───────────────────────────────────────────
async function selectExecutionProviders(): Promise<string[]> {
  // Try WebGPU first
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = await (navigator as any).gpu?.requestAdapter();
      if (adapter) {
        return ['webgpu', 'wasm'];
      }
    } catch {
      // WebGPU not available — fall through to WASM
    }
  }
  return ['wasm'];
}

// ─── Message helpers ─────────────────────────────────────────────────────────
function postProgress(id: string, progress: number, stage: string): void {
  const msg: WorkerOutgoingMessage = { type: 'ENHANCE_PROGRESS', id, progress, stage };
  self.postMessage(msg);
}

function postResult(id: string, outputData: Float32Array, outputWidth: number, outputHeight: number): void {
  const msg: WorkerOutgoingMessage = { type: 'ENHANCE_RESULT', id, outputData, outputWidth, outputHeight };
  // Transfer the buffer to avoid copying large tensors back to main thread
  self.postMessage(msg, [outputData.buffer]);
}

function postError(id: string, error: string): void {
  const msg: WorkerOutgoingMessage = { type: 'ENHANCE_ERROR', id, error };
  self.postMessage(msg);
}

// ─── Inference ───────────────────────────────────────────────────────────────
async function runEnhancement(request: WorkerEnhanceRequest): Promise<void> {
  const { id, inputData, inputWidth, inputHeight, modelUrl } = request;
  activeJobId = id;
  cancelled = false;

  try {
    postProgress(id, 2, 'Initializing...');

    // Load or reuse session
    let session: ort.InferenceSession;
    try {
      session = await getSession(modelUrl);
    } catch (err) {
      postError(id, (err as Error).message);
      return;
    }

    if (cancelled) {
      postError(id, 'Cancelled during model loading.');
      return;
    }

    postProgress(id, 30, 'Running super-resolution inference...');

    // Build input tensor — shape [1, 3, H, W]
    const inputTensor = new ort.Tensor('float32', inputData, [1, 3, inputHeight, inputWidth]);

    // Get input name from the session
    const inputNames = session.inputNames;
    const outputNames = session.outputNames;

    if (inputNames.length === 0 || outputNames.length === 0) {
      postError(id, 'Model has no inputs or outputs. The ONNX file may be corrupt.');
      return;
    }

    // Run inference
    const feeds: Record<string, ort.Tensor> = {};
    feeds[inputNames[0]] = inputTensor;

    let results: ort.InferenceSession.OnnxValueMapType;
    try {
      postProgress(id, 40, 'AI inference running — this may take a moment...');
      results = await session.run(feeds);
    } catch (err) {
      const errMsg = (err as Error).message;
      // Check for OOM
      if (errMsg.toLowerCase().includes('out of memory') || errMsg.toLowerCase().includes('oom')) {
        postError(
          id,
          'Out of memory during AI inference. Try a smaller input image or switch to WASM backend.'
        );
      } else {
        postError(id, `Inference failed: ${errMsg}`);
      }
      return;
    }

    if (cancelled) {
      postError(id, 'Cancelled during inference.');
      return;
    }

    postProgress(id, 90, 'Processing output tensor...');

    const outputTensor = results[outputNames[0]] as ort.Tensor;
    if (!outputTensor || outputTensor.type !== 'float32') {
      postError(id, 'Model produced unexpected output type. Expected float32 tensor.');
      return;
    }

    const outputData = outputTensor.data as Float32Array;
    const outputWidth = inputWidth * MODEL_CONFIG.UPSCALE_FACTOR;
    const outputHeight = inputHeight * MODEL_CONFIG.UPSCALE_FACTOR;

    // Validate output shape
    const expectedElements = 3 * outputWidth * outputHeight;
    if (outputData.length !== expectedElements) {
      postError(
        id,
        `Model output shape mismatch: expected ${expectedElements} elements for ${outputWidth}×${outputHeight}, got ${outputData.length}.`
      );
      return;
    }

    postProgress(id, 95, 'Transferring result...');

    // Copy to avoid detaching the tensor's buffer
    const outputCopy = new Float32Array(outputData);
    postResult(id, outputCopy, outputWidth, outputHeight);
  } catch (err) {
    postError(id, `Unexpected worker error: ${(err as Error).message}`);
  } finally {
    activeJobId = null;
  }
}

// ─── Message handler ─────────────────────────────────────────────────────────
self.addEventListener('message', (evt: MessageEvent<WorkerIncomingMessage>) => {
  const msg = evt.data;

  switch (msg.type) {
    case 'ENHANCE_REQUEST':
      runEnhancement(msg);
      break;

    case 'CANCEL':
      if (activeJobId === msg.id) {
        cancelled = true;
      }
      break;
  }
});
