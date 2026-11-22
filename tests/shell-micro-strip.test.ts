// The dock's strip and the hint in the Lobule and Sinusoid views, derived from the real sources the app mounts (the components are .tsx, which node cannot import, so this reads
// them and the stylesheets they depend on): the Mac play-test (20 Nov) showed no readouts in the Sinusoid because 2D's CSS hides the lobule group unless the strip carries `lob`,
// and the hint note sat under the view pill because the toast stood at a fixed 84 px from the foot instead of above the dock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutVars, layoutClass } from '../src/ui/shell/room.ts';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const bar = read('src/ui/shell/PlayBar.tsx'), css = read('src/ui/css2d/app-08-cards.css'), shell = read('src/ui/shell/shell.css'), sh = read('src/ui/shell/Shell.tsx');

test('2D\'s stylesheet hides the lobule group unless the strip has `lob`; the lobule strip carries it, and carries the group the CSS names', () => {
  assert.match(css, /\.readouts:not\(\.lob\) \.ro-group\[data-group="lobule"\] \{ display: none; \}/);
  const strip = bar.slice(bar.indexOf('function LobuleReadouts'), bar.indexOf('/** The dock\'s readout strip'));
  assert.match(strip, /className="readouts lob"/);
  assert.match(strip, /data-group="lobule"/);
  assert.match(strip, /className="metric|<Tile /, 'tiles are drawn');
});

test('the strip swaps to the lobule flows in the Lobule view and in the Sinusoid view, and back elsewhere', () => {
  const ro = bar.slice(bar.indexOf('export function Readouts'));
  assert.match(ro, /view === 'lobule' \|\| view === 'sinusoid'\) return <LobuleReadouts \/>/);
  assert.match(ro, /data-group="pressure"/, 'HVPG and PPG in the other views');
  assert.match(bar, /useShell\(\(s\) => s\.view\)/, 'read from the shell store, as the view pills set it');
});

test('the tile reads as 2D\'s: "%" with " of healthy" in .u-x', () => {
  assert.match(bar, /'unit pct'/);
  assert.match(bar, /className="u-x"/);
});

test('the hint stands above the dock and the view pill: the toast reads --bot-occ, which the shell publishes on the root (the toast is outside .app)', () => {
  assert.match(shell, /\.sh-toast \{[^}]*bottom: calc\(var\(--safe-b, 0px\) \+ var\(--bot-occ, 0px\) \+ var\(--sheet-gap\)\)/);
  assert.match(sh, /root\.style\.setProperty\('--bot-occ'/);
  for (const [w, h] of [[1024, 768], [800, 600], [1440, 900]]) {
    const v = layoutVars({ w, h, safe: { top: 0, right: 0, bottom: 0, left: 0 } } as never, layoutClass(false));
    assert.ok(parseFloat(v['--bot-occ']!) > 84, `the foot is taller than the old fixed 84 px at ${w}x${h} (${v['--bot-occ']})`);
  }
});

test('the hint is 2D\'s note: a dot, glass card, the page ink (never the page\'s own ink on itself)', () => {
  const t = shell.slice(shell.indexOf('.sh-toast {'), shell.indexOf('.sh-toast-act'));
  assert.match(t, /background: var\(--glass\); color: var\(--text\)/);
  assert.match(t, /\.sh-toast::before \{[^}]*border-radius: 50%; background: var\(--accent\)/);
  assert.doesNotMatch(t, /background: var\(--text\); color: var\(--surface\)/);
});
