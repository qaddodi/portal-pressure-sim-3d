import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FieldMotion, OverlayMotion, type ScopeIn } from '../src/ui/tests/endo/motion.ts';
import { scopeFrame } from '../src/ui/tests/endo/frame.ts';
import { bleedShapes } from '../src/ui/tests/endo/bleed.ts';
import { useScope } from '../src/ui/tests/endo/scope-state.ts';
import { ENDO_WORDS } from '../src/ui/tests/copied/endo-words.copied.js';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { BUILT_PANES } from '../src/ui/tests/panes.ts';

const base: ScopeIn = { d: 6, ratio: 0.8, bands: 0, snap: false };
function run(m: FieldMotion, inp: ScopeIn, ms: number) { let t = 1000, busy = true; for (; t < 1000 + ms; t += 50) busy = m.step(inp, t); return busy; }

test('the Endoscopy tab is built and its words are the 2D copy', () => {
  assert.ok(BUILT_PANES.includes('endoscopy'));
  assert.equal(ENDO_WORDS.tiles.grade, 'Grade');
  assert.ok(ENDO_WORDS.views.length === 2);
  const copy = readFileSync(new URL('../scripts/copy-b11-endo.mjs', import.meta.url), 'utf8');
  assert.match(copy, /--check/);
});

test('banding deflates the banded columns and cinches their knuckles, then holds the size it had', () => {
  const m = new FieldMotion();
  run(m, base, 3000);
  assert.ok(m.state.grow > 0, 'a varix of 6 mm shows');
  assert.equal(m.state.kn.every((x) => x === 0), true);
  const grown = m.state.grow;
  run(m, { ...base, bands: 2, d: 3 }, 4000);
  assert.ok(m.state.def[0]! > 0.99 && m.state.def[1]! > 0.99, 'two columns deflated');
  assert.equal(m.state.def[3], 0);
  assert.ok(m.state.kn[0]! > 0.99 && m.state.kn[4]! > 0.99, 'two bands cinched');
  assert.ok(m.state.grow >= grown * 0.99, 'the peak size is held while banded');
  m.reset();
  run(m, base, 50);
  assert.equal(m.state.kn.every((x) => x === 0), true);
});

test('the scope frame is whole: the clips balance, and bands, red marks and the bleed add to it', () => {
  const pal = paletteOf('light');
  const m = new FieldMotion();
  run(m, base, 3000);
  const plain = scopeFrame({ field: m.state, over: { balloon: 0, jet: 0, pool: 0, seconds: 1, tearGrow: m.state.g } }, 300, pal);
  const depth = (f: typeof plain) => { let d = 0; for (const s of f.shapes) { if (s.k === 'clip') d++; if (s.k === 'unclip') d--; assert.ok(d >= 0); } return d; };
  assert.equal(depth(plain), 0);
  assert.equal(plain.w, 300);
  const b = new FieldMotion();
  run(b, { ...base, bands: 4 }, 4000);
  const banded = scopeFrame({ field: b.state, over: { balloon: 0, jet: 0, pool: 0, seconds: 1, tearGrow: b.state.g } }, 300, pal);
  assert.equal(depth(banded), 0);
  const rings = (f: typeof plain) => f.shapes.filter((s) => s.k === 'circle' && 'pen' in s && s.pen).length;
  assert.ok(rings(banded) >= rings(plain) + 4, 'a band ring is drawn on each of four knuckles');
  const bleed = scopeFrame({ field: m.state, over: { balloon: 0, jet: 1, pool: 0.5, rate: 80, hr: 100, seconds: 1, tearGrow: m.state.g } }, 300, pal);
  assert.equal(depth(bleed), 0);
  assert.ok(bleed.shapes.length > plain.shapes.length, 'the bleed is drawn');
});

test('no bleed is drawn when it has eased out; the overlays ease in and land at once under Reduce Motion', () => {
  assert.equal(bleedShapes({ cx: 100, cy: 100, R: 96, jx: 100, jy: 100, t: 1, a: 0, rate: 50, fill: 0, hr: 80 }).length, 0);
  const o = new OverlayMotion();
  o.step(1000, { balloon: true, shut: false, bleedNow: false, total: 0, still: true });
  assert.equal(o.bal, 1);
  const e = new OverlayMotion();
  e.step(1000, { balloon: true, shut: false, bleedNow: false, total: 0, still: false });
  e.step(1050, { balloon: true, shut: false, bleedNow: false, total: 0, still: false });
  assert.ok(e.bal > 0 && e.bal < 1);
});

test('the scope store tells the scene devices what the tab is doing', () => {
  const s = useScope.getState();
  s.setActive(true); s.setBands(3); s.band(); s.setEus('run', 2);
  const n = useScope.getState();
  assert.deepEqual([n.active, n.bands, n.bandTick, n.eus, n.step], [true, 3, 1, 'run', 2]);
  s.setActive(false); s.setEus('idle');
  assert.equal(useScope.getState().eus, 'idle');
  assert.equal(useScope.getState().step, -1);
});
