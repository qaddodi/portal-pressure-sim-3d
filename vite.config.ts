import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Which library chunk a module goes in (undefined: the bundler decides, as for all of the app's own code). */
export function vendorChunk(id: string): string | undefined {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(id.split('\\').join('/'));
  if (!m) return undefined;
  if (m[1] === 'three') return 'three';
  if (m[1] === 'react' || m[1] === 'react-dom' || m[1] === 'scheduler') return 'react';
  return undefined;
}

// `base: './'` so the built site works at any address: the repo's Pages URL, a preview folder, or a local server.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 700,
    // The libraries are chunks of their own: their file names (content hashes) stay the same from one deploy to the next, so a returning visitor's browser and
    // the offline worker fetch only the app's own code again, and the boot entry is the app, not three.js with the app inside it.
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
  server: { host: true },
});
