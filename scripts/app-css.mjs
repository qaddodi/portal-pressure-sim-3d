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
