import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` so the built site works at any address: the repo's Pages URL, a preview folder, or a local server.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 700 },
  server: { host: true },
});
