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
