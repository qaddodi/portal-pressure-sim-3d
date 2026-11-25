// The deployed page must load the base sheets (src/ui/styles/index.css) before every sheet written to win a tie against them (css3d-over-2d.css, humanized.css, glass.css, the action card's, the legend's).
// The bundler had put the base sheets into a chunk the app's chunk imports, and the page listed the importer's own sheets first, so the base sheets won every tie ("High velocit" on an iPhone, 25 Nov 2026).
// This builds the shape of that bundle and asks appCssOrder, the function the build's page tags come from, for the order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appCssOrder } from '../scripts/app-css.mjs';

const deploy = {
  'index.js': { imports: ['react.js', 'CardBoundary.js'], css: ['main.css'], modules: ['/r/src/main.tsx', '/r/src/ui/css3d-over-2d.css', '/r/src/ui/action/action.css'] },
  'react.js': { imports: [], css: [], modules: ['/r/node_modules/react/index.js'] },
  'CardBoundary.js': { imports: [], css: ['CardBoundary.css'], modules: ['/r/src/ui/shell/CardBoundary.tsx', '/r/src/ui/styles/index.css?used'] },
  'Lazy.js': { imports: [], css: ['Lazy.css'], modules: ['/r/src/ui/compare/CompareUi.tsx'] },
};

test('the chunk that holds the base sheets is listed before the app\'s own sheets', () => {
  const { css } = appCssOrder(deploy, 'index.js');
  assert.deepEqual(css, ['CardBoundary.css', 'main.css']);
  assert.ok(css.indexOf('CardBoundary.css') < css.indexOf('main.css'));
});

test('scripts keep the walk order and a chunk the app does not import is not listed', () => {
  const { js, css } = appCssOrder(deploy, 'index.js');
  assert.deepEqual(js, ['index.js', 'react.js', 'CardBoundary.js']);
  assert.ok(!css.includes('Lazy.css'));
});

test('the order holds when the base sheets are in the app\'s own chunk, on Windows paths, and when a chunk is imported twice', () => {
  const own = { 'index.js': { imports: ['a.js', 'b.js'], css: ['main.css'], modules: ['C:\\r\\src\\ui\\styles\\index.css'] }, 'a.js': { imports: ['b.js'], css: ['a.css'], modules: [] }, 'b.js': { imports: [], css: ['b.css'], modules: [] } };
  assert.deepEqual(appCssOrder(own, 'index.js').css, ['main.css', 'a.css', 'b.css']);
});

test('with no chunk holding the base sheets the walk order stays and the build is told', () => {
  const none = { 'index.js': { imports: ['a.js'], css: ['main.css'], modules: [] }, 'a.js': { imports: [], css: ['a.css'], modules: [] } };
  const out = appCssOrder(none, 'index.js');
  assert.deepEqual(out.css, ['main.css', 'a.css']);
  assert.deepEqual(out.base, []);
});

// The build's own plugin (vite.config.ts app-preload), given a bundle shaped like the 25 Nov deploy: the app's chunk carries its own sheet (css3d-over-2d, humanized, glass, the action card's) and the page-wide
// global.css (a pure-CSS chunk the bundler folds into its importer, listed after it); the base sheets ride in CardBoundary's chunk; the shell's sheet rides in a chunk the app imports later.
test('the built page links the base sheets first, then the app\'s, the page-wide and the shell\'s sheets in their old order', async () => {
  const { default: config } = await import('../vite.config.ts');
  const plugin = (config.plugins as { name?: string; transformIndexHtml?: { handler: (h: string, c: unknown) => string } }[]).flat().find((p) => p?.name === 'app-preload');
  assert.ok(plugin?.transformIndexHtml, 'the app-preload plugin is in the build');
  const chunk = (fileName: string, imports: string[], css: string[], modules: string[], facadeModuleId: string | null = null) =>
    ({ type: 'chunk', fileName, imports, facadeModuleId, modules: Object.fromEntries(modules.map((m) => [m, {}])), viteMetadata: { importedCss: new Set(css) } });
  const bundle = {
    'main.js': chunk('main.js', ['CardBoundary.js', 'react.js', 'OverTimePane.js'], ['main.css', 'global.css'], ['/r/src/main.tsx', '/r/src/ui/css3d-over-2d.css', '/r/src/ui/glass.css'], '/r/src/main.tsx'),
    'CardBoundary.js': chunk('CardBoundary.js', ['react.js'], ['CardBoundary.css'], ['/r/src/ui/cards/CardBoundary.tsx', '/r/src/ui/styles/index.css']),
    'react.js': chunk('react.js', [], [], ['/r/node_modules/react/index.js']),
    'OverTimePane.js': chunk('OverTimePane.js', ['react.js'], ['OverTimePane.css'], ['/r/src/ui/shell/shell.css']),
  };
  const html = plugin.transformIndexHtml.handler('<head></head>', { bundle });
  const sheets = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sheets, ['CardBoundary.css', 'main.css', 'global.css', 'OverTimePane.css']);
});
