// A talk takes the top bar and the dock away by fading them; their frosted faces lost their blur on the first frame of it (the same cause as the Search sheet's blur arriving late).
// Root cause: a backdrop blur sees nothing past an ancestor with opacity < 1 (a backdrop root), and the fade was `opacity` on .topbar and .vdock, which hold every one of those faces.
// Now the wholes never fade; each glass face and each glass-free part beside one fades on its own (shell/deck-fade.ts), so the blur falls away with its face.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { FROSTED, FADERS } from '../src/ui/shell/deck-fade.ts';

const css = readFileSync('src/ui/shell/chrome-3d.css', 'utf8');
const glass = readFileSync('src/ui/glass.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('no rule fades the top bar or the dock as a whole', () => {
  for (const line of css.split('\n')) {
    if (!/opacity: 0/.test(line) || line.startsWith('/*')) continue;
    const sel = line.slice(0, line.indexOf('{'));
    assert.doesNotMatch(sel.replace(/:has\([^)]*(\([^)]*\))*[^)]*\)/g, ''), /(^|,)\s*\.sh-root[^,]*:is\(\.topbar, \.vdock[^)]*\)(\[data-hidden="true"\])?\s*(,|$)/, `the whole bar or dock is faded: ${sel}`);
  }
  assert.match(css, /\.sh-root > \.app \.zoom-pill\[data-hidden="true"\], \.sh-root\[data-mode="deck"\] > \.app :is\(\.zoom-pill, \.stage-credit\) \{ opacity: 0; \}/, 'the zoom pill is glass itself and may fade whole');
});
test('the parts that fade are the ones the CSS names, and the frosted faces are the glass list\'s', () => {
  assert.ok(css.includes(`:has(${FROSTED}) > :not(:has(${FROSTED}))`));
  for (const f of ['.tb-face', '.vd-face', '.vp-face', '.topbar .float-pill:not(.has-face):not(.tb-id)', '.topbar #viewSeg']) { assert.ok(FROSTED.includes(f), f); assert.ok(glass.includes(f), `${f} is not frosted in glass.css`); }
  assert.match(FADERS, /^:is\(\.topbar, \.vdock\):has\(/);
  const shell = readFileSync('src/ui/shell/Shell.tsx', 'utf8');
  assert.match(shell, /useLayoutEffect\(\(\) => \{ if \(wasMode\.current === mode\) return;[^}]*fadeChrome\(appRef\.current, away\)/);
});

// The same cause in the other two places 2D fades a whole that holds a frosted face: the phone's view pill (.nb-views, holding .vp-face) and the top bar's figure row (.stage-bar.top, holding .tb-face).
test('the phone view pill and the focus row keep their wholes opaque; their parts fade on 2D\'s timings', () => {
  const twoD = readFileSync('src/ui/styles/app-10-thumb-dock.css', 'utf8'), cards = readFileSync('src/ui/styles/app-08-cards.css', 'utf8');
  assert.match(twoD, /\.nb-views \{ opacity: 0; pointer-events: none; translate: 0 var\(--bar-sink, 0px\); transition: none; \}/, '2D still fades the whole pill; this holds the override to it');
  assert.match(cards, /\.app\.figure-focus \.topbar\.two-rows \.stage-bar\.top \{ opacity: 0; visibility: hidden;/);
  assert.match(css, /\.sheet-layer > \.menu, [^{]*\.vdock:not\(\.mini\) > \.nb-views \{ opacity: 1; \}/);
  assert.match(css, /\.app\.thumb \.vdock:not\(\.mini\) > \.nb-views > \* \{ transition: opacity var\(--d-small\) var\(--ease-arrive\) \.3s/);
  assert.match(css, /\.nb-views > \*, [^{]*\.nb-views > \* \{ opacity: 0; transition: none; \}/);
  assert.match(css, /:root \.app\.figure-focus \.topbar\.two-rows \.stage-bar\.top \{ opacity: 1; \}/);
  assert.match(css, /\.stage-bar\.top :has\([^{]*\{ opacity: 0; transition: opacity var\(--d-flip\) var\(--ease-in\)/);
});

// The app-wide scan (from code): every wrapper that holds a frosted face and was found fading, transitioning opacity or promoted with `will-change: opacity` (a backdrop root) is listed here with
// the rule that now keeps it opaque. The key (.lb-key, glass) sat in .lb-key-wrap (will-change: opacity: never blurred) in .lb-key-layer (faded as a whole).
test('the figure key\'s wrap and layer are not backdrop roots: the key fades itself', () => {
  const labels = readFileSync('src/scene/labels/labels.css', 'utf8'), deck = readFileSync('src/ui/deck-ui.css', 'utf8');
  assert.match(labels, /\.lb-key-wrap \{ position: absolute;[^}]*will-change: transform; \}/);
  assert.doesNotMatch(labels, /\.lb-key-wrap[^{]*\{[^}]*will-change:[^;]*opacity/);
  assert.match(labels, /\.lb-key-layer \{ z-index: calc\(var\(--z-cards, 10\) \+ 1\); \}/);
  assert.doesNotMatch(labels, /\.lb-key-layer \{[^}]*(transition|opacity)/);
  assert.match(labels, /body:has\(\.deck-ui \.pz-jump\[data-open="true"\]\) \.lb-key-layer \.lb-key \{ opacity: 0; \}/);
  assert.match(deck, /body\[data-card-zoom\] \.lb-layer:not\(\.lb-key-layer\) \{ opacity: 0;/);
  assert.match(deck, /body\[data-card-zoom\] \.lb-key-layer \.lb-key \{ opacity: 0; \}/);
});
test('no stylesheet of ours promotes or fades, as a whole, a class that holds a frosted face', () => {
  const HOLDERS = ['lb-key-wrap', 'lb-key-layer', 'pal-back', 'modal-back', 'nb-views', 'topbar', 'vdock', 'dk-bar'];
  const files = ['src/scene/labels/labels.css', 'src/ui/deck-ui.css', 'src/ui/shell/chrome-3d.css', 'src/ui/shell/shell.css', 'src/ui/glass.css'];
  for (const f of files) {
    // (where there is no frost the pill is one solid piece and may fade whole: a browser with no backdrop blur; html[data-noglass] is exempted below)
    const t = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@supports not \(\([^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    for (const m of t.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const subject = m[1]!.split(',').map((s) => s.trim().split(/[\s>+~]+/).pop()!);
      const fades = /will-change:[^;]*opacity|transition:[^;]*opacity|animation:[^;]*(fade|crossfade)/.test(m[2]!) && !/animation: none/.test(m[2]!);
      if (!fades) continue;
      for (const s of subject) for (const h of HOLDERS) assert.ok(!new RegExp(`^(\\.${h}|\\.sh-root)?(\\.[\\w-]+)*\\.${h}(\\[[^\\]]*\\]|\\.[\\w-]+|:[\\w-]+(\\([^)]*\\))?)*$`).test(s) || /:has\(|\.lb-key$|html\[data-noglass\]/.test(m[1]!) , `${f}: ${m[1]!.trim()} fades a holder of glass`);
    }
  }
});

// The dock's own paint: a whole that no longer fades keeps whatever it draws itself. .vdock draws the pill's shadow and hairline (box-shadow), which stayed as an empty rounded outline in a talk.
test('every holder that stays opaque in a talk has no paint of its own left: the dock\'s shadow goes with the parts', () => {
  assert.match(css, /\.sh-root\[data-mode="deck"\] > \.app \.vdock \{ box-shadow: none; \}/);
  assert.match(css, /\.sh-root > \.app \.vdock \{ transition: box-shadow var\(--d-surface\) var\(--ease-arrive\); \}/);
  // the holders the talk fade keeps opaque, and what each paints itself in 2D (app-07-floating.css): the bar paints nothing; the dock paints a shadow, handled above; the pills that hold a face have none
  const f = readFileSync('src/ui/styles/app-07-floating.css', 'utf8');
  assert.match(f, /\.vdock \{[^}]*box-shadow: var\(--shadow-pill\)/);
  assert.match(f, /\.topbar \.tb-id \{[^}]*background: transparent; box-shadow: none;/);
  assert.match(f, /\.topbar \.sb-right\.has-face \{[^}]*background: transparent; box-shadow: none;/);
  assert.doesNotMatch(f, /^\.topbar \{[^}]*(box-shadow|background)/m);
});
