// The dock (play bar and key readouts) is the 2D timeline's markup and its effective sizes, not a look-alike: the class names, the structure and the numbers of
// styles/app-07-floating.css, app-08-cards.css and app-09-tests.css (the later file wins). With PPS_2D_REPO set, each number is also found in the 2D CSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(root, 'src/ui/shell/dock.css'), 'utf8');
const tsx = readFileSync(join(root, 'src/ui/shell/PlayBar.tsx'), 'utf8');
const two = process.env.PPS_2D_REPO;

// [what, a line of dock.css that holds it, a line of the 2D CSS that holds it]
const NUMBERS: [string, RegExp, RegExp][] = [
  ['the timeline row is 60 px high', /\.stage-bar\.bottom \{ grid-area: tl; height: 60px; padding: 0 8px 0 12px;/, /\.vdock \.stage-bar\.bottom \{ grid-area: tl; height: 60px; background: transparent; padding: 0 8px 0 12px;/],
  ['the readouts are clamp(440px, 38vw, 580px) wide from 1100 px', /clamp\(440px, 38vw, 580px\)/, /clamp\(440px, 38vw, 580px\)/],
  ['the split is 40 px high with 3 px inside it and 2 px between speed and play', /\.tl-split \{ display: flex; align-items: stretch; height: 40px; padding: 3px; gap: 2px;/, /\.tl-split \{ --split-r: var\(--r-card\); --inset: 3px; height: 40px; padding: var\(--inset\); gap: 2px;/],
  ['speed is 44 px wide', /width: 44px; min-width: 44px/, /width: 44px; min-width: 44px; padding: 0 1px 0 0; font-size: 12px/],
  ['play is 46 px wide', /\.ib\.play \{ width: 46px;/, /\.timeline \.tl-split \.ib\.play, \.vdock \.tl-split \.ib\.play \{ width: 46px;/],
  ['jump, History and Compare are 36 px quiet icon buttons', /width: 36px; height: 36px; min-width: 0; padding: 0; gap: 0;/, /\.vdock :is\(\.tl-ff, \.tl-hist, \.tl-pin\) \{ position: relative; flex: none; width: 36px; height: 36px; min-width: 0; padding: 0; gap: 0;/],
  ['the clock is 14 px, 600, at least 3.4em, right aligned', /\.tl-time \{ flex: none; min-width: 3\.4em; font: 600 14px/, /\.vdock \.tl-time \{ flex: none; min-width: 3\.4em; font-size: var\(--fs-14\); font-weight: 600; color: var\(--text-2\); text-align: right; \}/],
  ['the History count is a 16 px badge at the corner', /\.tl-hc:not\(:empty\) \{ position: absolute; top: 0; right: -2px; min-width: 16px; height: 16px; padding: 0 4px;/, /\.vdock \.tl-hc:not\(:empty\) \{ position: absolute; top: 0; right: -2px; min-width: 16px; height: 16px; padding: 0 4px;/],
  ['a phone: the timeline row is 52 px and the readouts stand above it', /height: 52px; padding: 0 6px;/, /\.vdock \.stage-bar\.bottom \{ height: 52px; padding: 0 6px; \}/],
];

test('the dock keeps the 2D numbers', () => {
  for (const [what, mine] of NUMBERS) assert.match(css, mine, `dock.css lost: ${what}`);
});

test('the dock keeps the 2D numbers in the 2D CSS too (needs PPS_2D_REPO)', { skip: !two || !existsSync(join(two ?? '', 'styles')) }, () => {
  const all = ['app-07-floating.css', 'app-08-cards.css', 'app-09-tests.css'].map((f) => readFileSync(join(two!, 'styles', f), 'utf8')).join('\n');
  for (const [what, , theirs] of NUMBERS) assert.match(all, theirs, `the 2D CSS no longer says: ${what}; dock.css must follow it`);
});

test('the play bar has the 2D timeline\'s structure and class names', () => {
  for (const c of ['vdock', 'stage-bar bottom', 'timeline', 'tl-left', 'tl-split', 'tl-speed', 'ib play', 'tl-restart', 'tl-time', 'tl-t-long', 'tl-t-short', 'tl-jumps', 'tl-ff', 'tl-hist', 'tl-hl', 'tl-hc', 'tl-pin', 'readouts', 'metric inert primary'])
    assert.ok(tsx.includes(c), `PlayBar.tsx has no .${c} (2D timeline.js / dock.js)`);
  // the order of the row: split and restart, the clock, jump ahead, History, Compare (2D timeline.js root.replaceChildren)
  const at = (s: string) => tsx.indexOf(s);
  assert.ok(at('className="tl-left"') < at('className="tl-time"') && at('className="tl-time"') < at('className="tl-jumps"') && at('className="tl-jumps"') < at('className="tl-hist"') && at('className="tl-hist"') < at('className="tl-pin"'));
  // the strip comes after the row in the markup (the grid puts it right, or above on a phone)
  assert.ok(at('className="stage-bar bottom"') < at('className="readouts"'));
});

test('Restart is in the page and hidden, as in 2D; History shows on every size', () => {
  assert.match(css, /\.vdock \.tl-restart \{ display: none; \}/);
  assert.doesNotMatch(css, /\.tl-hist \{[^}]*display: none/);
});
