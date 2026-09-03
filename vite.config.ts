import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer (used by ONNX WASM backend)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    // Per-path headers for the dev server — long-lived caching for the model file
    // so repeat visits / hot-reloads don't re-download the 4.6 MB ONNX file
    middlewareMode: false,
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        // Keep onnxruntime-web in its own chunk for better caching
        manualChunks(id) {
          if (id.includes('onnxruntime-web')) return 'onnx';
          if (id.includes('jszip')) return 'jszip';
        },
      },
    },
  },
  // Serve the model file with long-lived cache headers
  // NOTE: For production deployment add these headers at your CDN/server:
  //   /models/*.onnx → Cache-Control: public, max-age=31536000, immutable
  //   /assets/*.wasm  → Cache-Control: public, max-age=31536000, immutable
});
