// One lens table for every view (lenses/in-view.ts; owner, 26 Nov: "unify the lenses so all the other lenses are also available in the sinusoid view ... we could reverse it").
// Pins: every lens of the menu is offered in every view that defines it; a view never draws, names or keys a lens other than the one it shows; the Sinusoid paints each lens from the
// sinusoid's own numbers; the experiment flag puts the Sinusoid back to Pressure only. Node only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { UI } from '../src/ui/strings.generated.ts';
import { LENS_IDS as SCENE_LENSES, type LensId, MPS_TO_LPM, flowPos, oxygenPos, samplerFor } from '../src/scene/lenses/model.ts';
import { FALLBACK_LENS, LENSES_EVERYWHERE, LENS_IN_VIEW, LENS_VIEWS, lensIn, lensNoteIn, lensOffered, lensPickable, lensesFor, shownLens } from '../src/scene/lenses/in-view.ts';
import { legendFor } from '../src/scene/lenses/legend.ts';
import { LENS_SHARED, LENS_TOKENS } from '../src/scene/lenses/tokens.copied.ts';
import { hexToRgb01, type Rgb } from '../src/scene/lenses/oklab.ts';
import { type CellColours, cellSource, sinusoidCellSources, sinusoidLumen } from '../src/scene/sinusoid/lens.ts';
import { inkAt, laneColours } from '../src/scene/lobule/ink.ts';
import type { LobuleModel } from '../src/scene/lobule/model.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';

const MENU = UI.lenses.map((l) => l.id as LensId);
const ALL: LensId[] = [...SCENE_LENSES, 'neutral'];
const lane = (a: number[], b: number[]): [number[], number[]] => [a, b];
const model = (o: Partial<LobuleModel> = {}): LobuleModel => ({
  zone: { pre: 1, sin: 1, post: 1 }, Qs: { pre: 18, sin: 9, post: 18 }, Q0: { pre: 18, sin: 12, post: 18 }, oxy: [0.85, 0.78, 0.7], P1: 20, P2: 14, P3: 6, P4: 4,
  flow: 1, portal: 1, art: 1, rev: { pre: false, sin: false, post: false },
  lymph: 0.9, lymph0: 0.9, lyProt: 0.87, sigma: 0.15, iap: 5, alb: 4, s: 0, cong: 0, fibSin: 0.6, fibPre: 0, fibPost: 0, congU: 0, shuntU: 0, septU: 0, act: 0,
  lanes: {
    origin: { pre: lane([0.5, 0.1, 0.2, 0.2], [0.5, 0.1, 0.2, 0.2]), sin: lane([0.4, 0.1, 0.2, 0.3], [0.4, 0.1, 0.2, 0.3]), post: lane([0.4, 0.1, 0.2, 0.3], [0.4, 0.1, 0.2, 0.3]) },
    pass: { pre: lane([0.8, 0, 0, 0.2], [0.8, 0, 0, 0.2]), sin: lane([0.8, 0, 0, 0.2], [0, 0.8, 0, 0.2]), post: lane([0, 0.8, 0, 0.2], [0, 0.8, 0, 0.2]) },
  },
  ...o,
} as LobuleModel);
const ctx = (o: object = {}) => ({ lens: 'pressure' as LensId, look: 'light' as const, model: model(), ref: new Float32Array(200).fill(5), fibSin: 0.6, ...o });
const near = (a: readonly number[], b: readonly number[], e = 1e-6) => a.every((v, i) => Math.abs(v - b[i]!) < e);
const rgb = (): Rgb => [0, 0, 0];

test('the table covers every lens the scene knows, in every view, and every view defines the fallback', () => {
  for (const l of ALL) for (const v of LENS_VIEWS) assert.ok(v in LENS_IN_VIEW[l]!, `${l} has a cell for ${v}`);
  for (const v of LENS_VIEWS) assert.ok(lensOffered(v, FALLBACK_LENS), `${v} shows ${FALLBACK_LENS}`);
  for (const l of ALL) for (const v of LENS_VIEWS) { const s = lensIn(v, l); assert.ok(s === null || (s.length > 0 && s.length <= 60), `${l} in ${v}: plain words, one line`); }
});

test('with the experiment on, every lens of the menu is offered in every view, the Sinusoid too, and its button is a picker there', () => {
  assert.equal(LENSES_EVERYWHERE, true, 'the experiment ships on (26 Nov); turning it off is this one constant');
  for (const v of LENS_VIEWS) {
    assert.deepEqual(lensesFor(v, MENU), MENU, `${v} offers the whole menu, in its order`);
    assert.ok(lensPickable(v, MENU), v);
    for (const l of MENU) assert.equal(shownLens(v, l), l, `${v} draws ${l} as itself`);
  }
});

test('with the experiment off, the Sinusoid is Pressure only (its button a locked key, as before) and no other view changes', () => {
  assert.deepEqual(lensesFor('sinusoid', MENU, false), ['pressure']);
  assert.equal(lensPickable('sinusoid', MENU, false), false);
  for (const l of MENU) assert.equal(shownLens('sinusoid', l, false), 'pressure', `off: ${l} shows as Pressure in the Sinusoid`);
  for (const v of ['circuit', 'anatomic', 'lobule'] as const) assert.deepEqual(lensesFor(v, MENU, false), lensesFor(v, MENU, true), `${v} is untouched by the flag`);
});

test('a lens with no meaning in a view falls back to Pressure there, and the key names what is drawn, never the lens asked for', () => {
  assert.equal(shownLens('lobule', 'system'), 'pressure', 'the lobule has no vein systems: it drew pressure under a System key');
  assert.equal(shownLens('sinusoid', 'system'), 'pressure', 'the sinusoid is where the two systems meet');
  assert.equal(shownLens('sinusoid', 'neutral'), 'pressure', 'the 2D sinusoid has no uncoloured lumen');
  assert.equal(shownLens('anatomic', 'system'), 'system');
  for (const v of LENS_VIEWS) for (const l of ALL) {
    const shown = shownLens(v, l);
    assert.ok(lensOffered(v, shown), `${v}: ${l} shows as ${shown}, which it draws`);
    assert.equal(legendFor(shown, 'light').lens, shown, `${v}: the key is the drawn lens's key`);
  }
});

test('the Sinusoid paints each lens from the sinusoid\'s own numbers, on the same ramps as the key', () => {
  const c = ctx(), out = rgb(), tok = LENS_TOKENS.light;
  assert.ok(near(sinusoidLumen(c, 'pressure', out), samplerFor('light', 'pressure').at(14)), 'Pressure: P2, as the 2D sinusoid (not rounded)');
  assert.ok(near(sinusoidLumen(c, 'oxygen', out), samplerFor('light', 'oxygen').at(oxygenPos(0.78))), 'Oxygen: the sinusoid node\'s saturation');
  assert.ok(near(sinusoidLumen(c, 'flow', out), samplerFor('light', 'flow').at(flowPos(9 * MPS_TO_LPM))), 'Flow: the sinusoidal bed\'s flow');
  assert.ok(near(sinusoidLumen(c, 'drop', out), samplerFor('light', 'drop').at(8 / 12)), 'Pressure drop: across the sinusoids, P2 - P3');
  assert.ok(near(sinusoidLumen(c, 'direction', out), hexToRgb01(tok.flowNormal)), 'Direction: forward');
  const rev = ctx({ model: model({ rev: { pre: false, sin: true, post: false } }) });
  assert.ok(near(sinusoidLumen(rev, 'direction', out), hexToRgb01(tok.flowReversed)), 'Direction: reversed');
  for (const l of ['delta', 'heat', 'since', 'velocity'] as const) {
    assert.ok(near(sinusoidLumen(c, l, out), inkAt({ ...c, lens: l, fibSin: 0 }, 'sin', 1, rgb())), `${l}: the lobule's own rule at the sinusoid node`);
  }
  assert.ok(near(sinusoidLumen(c, 'origin', out), hexToRgb01(LENS_SHARED.neutral)), 'the stream lenses grey the lumen, as the lobule\'s');
  // (the lens keeps its own colour here: the lobule's capillarization drain is a lobule-scale cue)
  assert.ok(!near(sinusoidLumen(c, 'oxygen', rgb()), inkAt({ ...c, lens: 'oxygen' }, 'sin', 1, rgb()), 1e-3));
  for (const l of ['system', 'neutral'] as const) assert.ok(near(sinusoidLumen(c, l, out), samplerFor('light', 'pressure').at(14)), `${l} falls back to Pressure`);
});

test('Blood origin and First pass colour the red cells by source, in the shares halfway along the sinusoid, in the key\'s colours', () => {
  const c = ctx();
  assert.equal(sinusoidCellSources(c, 'pressure'), null, 'every other lens leaves the cells red');
  const o = sinusoidCellSources(c, 'origin')!;
  assert.deepEqual(o.cols, laneColours('origin'));
  assert.ok(near(o.cum, [0.4, 0.5, 0.7, 1, 1]), 'origin: the sinusoid\'s shares, the systemic rest last');
  const p = sinusoidCellSources(c, 'firstpass')!;
  assert.ok(near(p.cum, [0.4, 0.8, 0.8, 1, 1]), 'first pass: halfway through being cleared, raw 0.4 and clear 0.4');
  const keyDots = new Set(legendFor('origin', 'light').dots!.map((d) => d.colour));
  assert.equal(keyDots.size, 5, 'the key has a dot for each source');
  // the cells' shares, drawn: a thousand fixed draws land near the shares
  const n = [0, 0, 0, 0, 0];
  for (let i = 0; i < 1000; i++) n[cellSource((i + 0.5) / 1000, o.cum)]!++;
  assert.deepEqual(n, [400, 100, 200, 300, 0]);
});

test('the Sinusoid view eases its lumen to a new lens (never a swap) and colours its cells only under the stream lenses', () => {
  const v = new SinusoidView(createShared(), { look: 'light' });
  v.setVisible(true); v.setInk(ctx({ lens: 'pressure' }));
  for (let t = 0; t <= 200; t += 16) v.update(t);
  const pal = () => (v.colours(false) as { cLumen: number[] }).cLumen.slice();
  const p = pal();
  assert.ok(near(p, samplerFor('light', 'pressure').at(14), 1e-4), 'pressure lumen');
  v.setInk(ctx(), 'oxygen');
  v.update(216);
  const mid = (() => { v.update(216 + 210); return pal(); })();
  const goal = sinusoidLumen(ctx(), 'oxygen', rgb());
  assert.ok(!near(mid, p, 1e-3) && !near(mid, goal, 1e-3), 'halfway through the lens change the lumen is between the two');
  for (let t = 450; t <= 1000; t += 16) v.update(t);
  assert.ok(near(pal(), goal, 1e-4), 'it lands on the lens\'s colour');
  assert.equal(v.cellColours, null, 'the cells stay red under Oxygen');
  v.setInk(ctx(), 'origin');
  for (let t = 1016; t <= 1800; t += 16) v.update(t);
  const cc = v.cellColours as CellColours | null;
  assert.equal(cc?.mix, 1, 'under Blood origin the cells wear their sources'); assert.ok(cc?.to && !cc.from);
  assert.equal(v.lensShown, 'origin');
});

test('the menu, the key, the button\'s name, the L key and the lock all read the one table', () => {
  const top = readFileSync(new URL('../src/ui/shell/TopBar.tsx', import.meta.url), 'utf8');
  assert.match(top, /lensesFor\(view, LENS_IDS\)\.map/, 'the menu lists the view\'s lenses');
  assert.match(top, /lensNoteIn\(view, id\) \?\? l\.note/, 'each row says what the lens colours in this view');
  assert.match(top, /const lens = shownLens\(view, useLens/, 'the button names the drawn lens');
  const key = readFileSync(new URL('../src/ui/shell/LensKey.tsx', import.meta.url), 'utf8');
  assert.match(key, /const lens = shownLens\(view, useLens/, 'the key is the drawn lens\'s');
  const keys = readFileSync(new URL('../src/ui/keys/useKeys.ts', import.meta.url), 'utf8');
  assert.match(keys, /lensesFor\(useShell\.getState\(\)\.view, LENS_IDS\)/, 'L cycles the view\'s lenses');
  const shell = readFileSync(new URL('../src/ui/shell/Shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /lensPickable\(useShell\(\(s\) => s\.view\), LENS_IDS\) \? '' : ' lens-fixed'/);
  const css = readFileSync(new URL('../src/ui/styles/app-03-layouts.css', import.meta.url), 'utf8');
  assert.match(css, /#app\.lens-fixed #btnLayers \{ pointer-events: none/);
  assert.doesNotMatch(css, /#app\.sin-focus #btnLayers/, 'the lock is the table\'s, not the view\'s name');
  assert.equal(lensNoteIn('anatomic', 'flow'), null, 'the body keeps the menu\'s own words');
  assert.ok(lensNoteIn('sinusoid', 'origin')?.includes('red cell'));
});
