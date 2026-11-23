import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { glslFiles } from './scripts/gl-scan.mjs';
import { withCsp } from './scripts/csp.mjs';
import { fadeHidden } from './scripts/fade-hidden.mjs';

/** The built page's Content-Security-Policy (scripts/csp.mjs). Build only: the dev server's own inline scripts would be refused. */
function csp(): Plugin {
  return { name: 'csp', apply: 'build', transformIndexHtml: { order: 'post', handler: (html) => withCsp(html) } };
}

/** The page's entry (src/entry.ts) fetches the app (src/main.tsx) by a dynamic import, so the page's own tags do not name it. This adds them: a modulepreload for the app's chunk and every chunk it statically imports, and
 *  a stylesheet link for the CSS they carry, so the browser (and the offline worker's install list, scripts/pwa.mjs, which reads the page's tags) fetches them at once, beside the entry, instead of after it. */
function appPreload(): Plugin {
  return {
    name: 'app-preload', apply: 'build',
    transformIndexHtml: { order: 'post', handler: (html, ctx) => {
      const bundle = ctx.bundle; if (!bundle) return html;
      const app = Object.values(bundle).find((o) => o.type === 'chunk' && o.facadeModuleId?.replace(/\\/g, '/').endsWith('/src/main.tsx'));
      if (!app || app.type !== 'chunk') throw new Error('app-preload: the app chunk (src/main.tsx) is not in the build');
      const js = new Set<string>(), css = new Set<string>();
      const walk = (name: string) => {
        if (js.has(name)) return;
        const c = bundle[name]; if (!c || c.type !== 'chunk') return;
        js.add(name);
        for (const f of c.viteMetadata?.importedCss ?? []) css.add(f);
        for (const i of c.imports) walk(i);
      };
      walk(app.fileName);
      const tags = [...js].map((f) => `<link rel="modulepreload" crossorigin href="./${f}">`).concat([...css].map((f) => `<link rel="stylesheet" crossorigin href="./${f}">`)).join('\n    ');
      return html.replace('</head>', `    ${tags}\n  </head>`);
    } },
  };
}

/** `virtual:gl-modules`: a lazy import of every source file that holds GLSL, found by the same scan the GLSL compile test uses, for the ?gl page (src/debug/gl-check-run.ts), so a new shader is checked on the device with nothing to register. */
function glModules(): Plugin {
  const id = 'virtual:gl-modules';
  return {
    name: 'gl-modules',
    resolveId: (s) => (s === id ? '\0' + id : undefined),
    load: (i) => (i === '\0' + id ? `export const GL_MODULES = {\n${glslFiles().map((f) => `  ${JSON.stringify(f)}: () => import(${JSON.stringify('/src/' + f)}),`).join('\n')}\n};` : undefined),
  };
}

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
  plugins: [react(), glModules(), appPreload(), csp()],
  // the 2D stylesheets' `:not([hidden])` also means "not faded off" here (scripts/fade-hidden.mjs; Plan 42)
  css: { postcss: { plugins: [fadeHidden()] } },
  worker: { format: 'es' },
  build: {
    target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 700,
    // The libraries are chunks of their own: their file names (content hashes) stay the same from one deploy to the next, so a returning visitor's browser and
    // the offline worker fetch only the app's own code again, and the boot entry is the app, not three.js with the app inside it.
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
  server: { host: true },
});
