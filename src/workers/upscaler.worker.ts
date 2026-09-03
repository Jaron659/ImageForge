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
// Point the runtime to the served /ort-wasm/ directory where binaries are located
try {
  const origin = typeof self !== 'undefined' && self.location ? self.location.origin : '';
  ort.env.wasm.wasmPaths = origin ? `${origin}/ort-wasm/` : '/ort-wasm/';

  // If SharedArrayBuffer is not available, fall back to 1 thread to prevent initWasm() failure
  if (typeof SharedArrayBuffer === 'undefined') {
    console.warn('[UpscalerWorker] SharedArrayBuffer is not available; setting numThreads to 1.');
    ort.env.wasm.numThreads = 1;
  }

  // Since we are already running inside a dedicated Web Worker, disable proxying
  ort.env.wasm.proxy = false;
} catch (configErr) {
  console.error('[UpscalerWorker] Error configuring ONNX environment:', configErr);
}

// ─── Session cache ──────────────────────────────────────────────────────────
let cachedSession: ort.InferenceSession | null = null;
let sessionModelUrl: string | null = null;
let sessionLoadPromise: Promise<ort.InferenceSession> | null = null;
let activeJobId: string | null = null;
let cancelled = false;

// ─── Message helpers ─────────────────────────────────────────────────────────
function postProgress(id: string, progress: number, stage: string): void {
  try {
    const msg: WorkerOutgoingMessage = { type: 'ENHANCE_PROGRESS', id, progress, stage };
    self.postMessage(msg);
  } catch (err) {
    console.error('[UpscalerWorker] Failed to post progress message:', err);
  }
}

function postResult(id: string, outputData: Float32Array, outputWidth: number, outputHeight: number): void {
  try {
    const msg: WorkerOutgoingMessage = { type: 'ENHANCE_RESULT', id, outputData, outputWidth, outputHeight };
    // Transfer the buffer to avoid copying large tensors back to main thread
    self.postMessage(msg, [outputData.buffer]);
  } catch (err) {
    console.error('[UpscalerWorker] Failed to post result message:', err);
    postError(id, err, 'Failed to transfer inference result to main thread.');
  }
}

function postError(
  id: string | null | undefined,
  error: unknown,
  fallbackMessage = 'An unknown worker error occurred'
): void {
  let errorMsg: string;
  let errorName: string | undefined;
  let errorStack: string | undefined;

  if (error instanceof Error) {
    errorMsg = error.message || fallbackMessage;
    errorName = error.name;
    errorStack = error.stack;
  } else if (typeof error === 'string') {
    errorMsg = error;
  } else if (error && typeof error === 'object') {
    const errObj = error as Record<string, unknown>;
    errorMsg = (errObj.message as string) || (errObj.reason as string) || JSON.stringify(error);
    errorName = (errObj.name as string) || undefined;
    errorStack = (errObj.stack as string) || undefined;
  } else {
    errorMsg = fallbackMessage;
  }

  console.error('[UpscalerWorker Error]', {
    jobId: id || activeJobId,
    errorMsg,
    errorName,
    errorStack,
    rawError: error,
  });

  try {
    const msg: WorkerOutgoingMessage = {
      type: 'ENHANCE_ERROR',
      id: id || activeJobId || '',
      error: errorMsg,
      name: errorName,
      stack: errorStack,
    };
    self.postMessage(msg);
  } catch (postErr) {
    console.error('[UpscalerWorker] Failed to post error message to main thread:', postErr);
  }
}

// ─── Global Worker Error Handlers ────────────────────────────────────────────
self.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  console.error('[UpscalerWorker unhandledrejection]', event.reason);
  postError(
    activeJobId,
    event.reason,
    `Unhandled promise rejection in worker: ${event.reason?.message || event.reason || 'Unknown reason'}`
  );
});

self.addEventListener('error', (event: ErrorEvent) => {
  console.error('[UpscalerWorker error]', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  });
  postError(
    activeJobId,
    event.error || event.message,
    `Worker script error: ${event.message || 'Unknown error'}`
  );
});

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
    try {
      const providers = await selectExecutionProviders();
      postProgress(activeJobId ?? '', 5, `Loading AI model (${providers[0]} backend)...`);

      // Fetch model buffer explicitly for transparent network error diagnosis
      const fullUrl =
        modelUrl.startsWith('http') || typeof self === 'undefined' || !self.location
          ? modelUrl
          : new URL(modelUrl, self.location.origin).href;

      postProgress(activeJobId ?? '', 7, `Fetching model binary from ${modelUrl}...`);
      let modelBuffer: ArrayBuffer;
      try {
        const resp = await fetch(fullUrl);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} (${resp.statusText}) when downloading ${fullUrl}`);
        }
        modelBuffer = await resp.arrayBuffer();
      } catch (fetchErr) {
        throw new Error(
          `Failed to fetch ONNX model from "${fullUrl}": ${(fetchErr as Error).message}. ` +
          `Check that the file exists at public/models/realesr-general-x4v3.onnx.`
        );
      }

      try {
        const session = await ort.InferenceSession.create(modelBuffer, {
          executionProviders: providers,
          graphOptimizationLevel: 'all',
        });
        cachedSession = session;
        sessionModelUrl = modelUrl;
        sessionLoadPromise = null;
        return session;
      } catch (primaryErr) {
        console.warn('[UpscalerWorker] Primary backend failed, attempting WASM fallback:', primaryErr);

        // If WebGPU failed, fallback to WASM
        if (providers.includes('webgpu')) {
          try {
            postProgress(activeJobId ?? '', 10, 'WebGPU unavailable, falling back to CPU (WASM)...');
            const wasmSession = await ort.InferenceSession.create(modelBuffer, {
              executionProviders: ['wasm'],
              graphOptimizationLevel: 'all',
            });
            cachedSession = wasmSession;
            sessionModelUrl = modelUrl;
            sessionLoadPromise = null;
            return wasmSession;
          } catch (wasmErr) {
            sessionLoadPromise = null;
            cachedSession = null;
            throw new Error(
              `Failed to load AI model via WASM fallback: ${(wasmErr as Error).message || wasmErr}`
            );
          }
        }

        sessionLoadPromise = null;
        cachedSession = null;
        throw new Error(
          `Failed to create ONNX inference session: ${(primaryErr as Error).message || primaryErr}`
        );
      }
    } catch (err) {
      sessionLoadPromise = null;
      cachedSession = null;
      throw err;
    }
  })();

  return sessionLoadPromise;
}

// ─── Execution provider selection ───────────────────────────────────────────
async function selectExecutionProviders(): Promise<string[]> {
  // Try WebGPU first if supported
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
      postError(id, err, 'Model initialization failed');
      return;
    }

    if (cancelled) {
      postError(id, 'Cancelled during model loading.');
      return;
    }

    postProgress(id, 30, 'Running super-resolution inference...');

    // Validate inputs
    if (!inputData || inputWidth <= 0 || inputHeight <= 0) {
      postError(id, `Invalid input dimensions or data: width=${inputWidth}, height=${inputHeight}`);
      return;
    }

    // Build input tensor — shape [1, 3, H, W]
    let inputTensor: ort.Tensor;
    try {
      inputTensor = new ort.Tensor('float32', inputData, [1, 3, inputHeight, inputWidth]);
    } catch (tensorErr) {
      postError(id, tensorErr, 'Failed to create input ONNX tensor');
      return;
    }

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
      cachedSession = null;
      const errMsg = (err as Error).message || String(err);
      if (errMsg.toLowerCase().includes('out of memory') || errMsg.toLowerCase().includes('oom')) {
        postError(
          id,
          'Out of memory during AI inference. Try a smaller input image or switch to WASM backend.'
        );
      } else {
        postError(id, err, `Inference failed: ${errMsg}`);
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
      postError(id, `Model produced unexpected output type (${outputTensor?.type}). Expected float32 tensor.`);
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
    postError(id, err, `Unexpected worker error: ${(err as Error).message || err}`);
  } finally {
    activeJobId = null;
  }
}

// ─── Message handler ─────────────────────────────────────────────────────────
self.addEventListener('message', async (evt: MessageEvent<WorkerIncomingMessage>) => {
  try {
    const msg = evt.data;
    if (!msg) return;

    switch (msg.type) {
      case 'ENHANCE_REQUEST':
        await runEnhancement(msg);
        break;

      case 'CANCEL':
        if (activeJobId === msg.id) {
          cancelled = true;
        }
        break;
    }
  } catch (err) {
    postError(activeJobId, err, 'Unexpected error handling worker message');
  }
});
