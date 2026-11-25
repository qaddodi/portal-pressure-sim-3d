// The app's stylesheets, loaded beside the page's first paint instead of in front of it (24 Nov 2026, "the splash takes long").
// A <link rel="stylesheet"> in the head holds the first paint until it has arrived and been parsed: the six sheets the app's code carries are about 780 kB (140 kB gzipped), so the loading cover (index.html: its own inline
// style, which needs none of them) was not drawn until all of them were in. Here each link starts as `media="print"` (fetched at once, at high priority, applied to nothing), and a small inline script turns it on when it has
// loaded. The app does not draw until every one is on: `window.ppsStyles` resolves then, and src/boot/styles.ts (appStylesReady) is what main.tsx and the plain pages in src/entry.ts wait for before they put anything in #root.
// A lazy chunk's own stylesheet is added by the bundler's preload helper, which waits for it before the chunk runs, so no view ever shows before its CSS.

/** The inline script that turns the sheets on and publishes `window.ppsStyles` (a promise, resolved when every `link[data-app-css]` has loaded or failed; a page with none resolves at once). ES5. */
export const APP_CSS_SCRIPT = "(function(){var w=window,L=[].slice.call(document.querySelectorAll('link[data-app-css]')),n=L.length,go;w.ppsStyles=new Promise(function(r){go=r});if(!n)go();" +
  "L.forEach(function(l){var d=false;function on(){if(d)return;d=true;l.media='all';if(--n===0)go()}if(l.sheet)on();else{l.addEventListener('load',on);l.addEventListener('error',on)}})})();";

/** The tags for `files` (built file names, as the bundle lists them): the not-yet-applied links, then the script. */
export function appCssTags(files) {
  const links = files.map((f) => `<link rel="stylesheet" crossorigin href="./${f}" media="print" fetchpriority="high" data-app-css>`);
  return links.length ? [...links, `<script>${APP_CSS_SCRIPT}</script>`] : [];
}

/** The base sheets (src/ui/styles/index.css, begun as the 2D app's): every other sheet of the app is written to win a tie against them, so they must load first. */
export const BASE_SHEET = /\/src\/ui\/styles\/index\.css(\?|$)/;

/**
 * The order of the page's chunks and stylesheets. `chunks` maps a built file name to `{ imports, css, modules }` (its static imports, the stylesheets it carries, the source ids it holds).
 * Scripts keep the walk order (the app's chunk, then what it imports). Stylesheets do not: the bundler puts the base sheets into a chunk the app's chunk imports
 * (a second entry, the lazy deck view, also imports them), and the walk lists the importer's own sheets (css3d-over-2d.css, humanized.css, glass.css, the action card's) first.
 * So the base sheets loaded after them and won every tie the 3D sheets were written to win (25 Nov 2026: "High velocit" on an iPhone, the Doppler strip's wrap rule lost to the
 * base nowrap). The chunk that holds the base sheets goes first, as main.tsx imports them before every sheet of the app's own; the rest keep their order.
 */
export function appCssOrder(chunks, root) {
  const js = new Set(), css = new Set(), base = new Set();
  const walk = (name) => {
    if (js.has(name)) return;
    const c = chunks[name]; if (!c) return;
    js.add(name);
    for (const f of c.css) { css.add(f); if (c.modules.some((m) => BASE_SHEET.test(m.split('\\').join('/')))) base.add(f); }
    for (const i of c.imports) walk(i);
  };
  walk(root);
  return { js: [...js], css: [...base, ...[...css].filter((f) => !base.has(f))], base: [...base] };
}
