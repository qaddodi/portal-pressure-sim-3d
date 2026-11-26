import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { glslFiles } from './scripts/gl-scan.mjs';
import { withCsp } from './scripts/csp.mjs';
import { fadeHidden } from './scripts/fade-hidden.mjs';
import { appCssTags, appCssOrder } from './scripts/app-css.mjs';
import { withCredit } from './scripts/credit.mjs';

/** The built page's Content-Security-Policy (scripts/csp.mjs). Build only: the dev server's own inline scripts would be refused. */
function csp(): Plugin {
  return { name: 'csp', apply: 'build', transformIndexHtml: { order: 'post', handler: (html) => withCsp(html) } };
}

/** The page's copyright line from its one source (scripts/credit.mjs): in the dev server and the build alike. */
function credit(): Plugin {
  return { name: 'credit', transformIndexHtml: { order: 'pre', handler: (html) => withCredit(html) } };
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
      // (the order of the stylesheets matters: scripts/app-css.mjs appCssOrder)
      const chunks: Record<string, { imports: string[]; css: string[]; modules: string[] }> = {};
      for (const [name, c] of Object.entries(bundle)) {
        if (c.type === 'chunk') chunks[name] = { imports: c.imports, css: [...(c.viteMetadata?.importedCss ?? [])], modules: Object.keys(c.modules) };
      }
      const { js, css, base } = appCssOrder(chunks, app.fileName);
      if (!base.length) console.warn('app-preload: no chunk holds src/ui/styles/index.css, so the stylesheets keep the walk order (the base sheets may load after the 3D ones)');
      // (the stylesheets are not render-blocking: scripts/app-css.mjs. The cover's own style is inline in index.html, so the first paint does not wait for them; the app waits for them, src/boot/styles.ts)
      const tags = js.map((f) => `<link rel="modulepreload" crossorigin href="./${f}">`).concat(appCssTags([...css])).join('\n    ');
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
    load: (i) => (i === '\0' + id ? `export const GL_MODULES = {\n${glslFiles().map((f: string) => `  ${JSON.stringify(f)}: () => import(${JSON.stringify('/src/' + f)}),`).join('\n')}\n};` : undefined),
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
  plugins: [react(), credit(), glModules(), appPreload(), csp()],
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
