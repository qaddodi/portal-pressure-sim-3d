// Plan 42, part C. The 2D app's stylesheets key on `hidden`: `.x:not([hidden])` means "this one is showing". The 3D app never sets `hidden` (src/ui/fade.tsx: an element that comes and goes stays in the page and
// fades, `data-fade="off"`), so every one of those selectors was true for every element: every scaled tile lost its change line, the Doppler's off stat tiles took room, the top bar's legend was cut at
// phone widths whether or not the Sinusoid tab was there. The base sheets (src/ui/styles) began as the 2D app's and still say `:not([hidden])`, so the meaning is restored where the CSS is built: `:not([hidden])` also
// excludes a faded-off element. Positive `[hidden]` rules need nothing (fade.css gives a faded-off element its own display: none, after it has faded).
export const NOT_HIDDEN = ':not([hidden])';
export const NOT_FADED = ':not([data-fade="off"])';

/** The selector text with every `:not([hidden])` followed by `:not([data-fade="off"])` (idempotent). */
export function fadeAwareSelector(sel) {
  return sel.split(NOT_HIDDEN + NOT_FADED).join(NOT_HIDDEN).split(NOT_HIDDEN).join(NOT_HIDDEN + NOT_FADED);
}

/** The same over a whole stylesheet's text (for the test that reads source files); only inside selectors, which is every place `:not([hidden])` is written. */
export const fadeAwareCss = (css) => fadeAwareSelector(css);

/** A PostCSS plugin (no import of postcss needed: a plain object plugin). */
export function fadeHidden() {
  return {
    postcssPlugin: 'fade-hidden',
    Rule(rule) {
      if (rule.selector.includes(NOT_HIDDEN)) { const s = fadeAwareSelector(rule.selector); if (s !== rule.selector) rule.selector = s; }
    },
  };
}
fadeHidden.postcss = true;
