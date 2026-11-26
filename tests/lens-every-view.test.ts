// Every lens of the menu, walked across every view, on a real patient (owner, 26 Nov: "some of the lenses aren't working in lobule, like origin lens, first pass, etc. check which ones
// aren't working and fix"). Root causes pinned here: the 3D lobule coloured its vessels by inkAt alone, so Blood origin and First pass drew a plain grey (the lanes, inkLanes, were never
// drawn after the flat lobule went, 20 Nov); and it redrew its colours by a hand-kept list of inputs that missed the flows, the reversals, P4 and the reference, so Flow, Velocity, Direction,
// Drop and Change could stay on an old patient's colours. Now one rule colours every vertex (inkAcross) and the colours themselves decide a redraw (inkSignature). Node only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { frameFor } from './b3-frames.ts';
import { UI } from '../src/ui/strings.generated.ts';
import { type LensId, computeLens } from '../src/scene/lenses/model.ts';
import { LENS_VIEWS, lensesFor, shownLens } from '../src/scene/lenses/in-view.ts';
import { legendFor } from '../src/scene/lenses/legend.ts';
import { hexToRgb01, type Rgb } from '../src/scene/lenses/oklab.ts';
import { type InkContext, type Seg, inkAcross, inkAt, inkSignature, laneColours } from '../src/scene/lobule/ink.ts';
import { lobuleModel, type LobuleModel } from '../src/scene/lobule/model.ts';
import { sinusoidCellSources, sinusoidLumen } from '../src/scene/sinusoid/lens.ts';

const MENU = UI.lenses.map((l) => l.id as LensId);
const STREAMS = new Set<LensId>(['origin', 'firstpass']);
const h = await frameFor('healthy');
const c = await frameFor('cirr-decomp');
const real = (f: typeof h): LobuleModel => lobuleModel({ P: f.frame.Pf ?? f.frame.P, Q: f.frame.Qf ?? f.frame.Q, metrics: f.frame.metrics } as never, h.healthy as never);
const ctxOf = (m: LobuleModel, lens: LensId, o: Partial<InkContext> = {}): InkContext => ({ lens: shownLens('lobule', lens), look: 'light', model: m, ref: Float32Array.from(h.healthy.P), fibSin: 0, ...o });
const key = (x: Rgb) => x.map((v) => Math.round(v * 255)).join(',');
const ACROSS = Array.from({ length: 41 }, (_, i) => -1 + i / 20);
const SEGS: Seg[] = ['in', 'sin', 'cv'];

test('every menu lens is offered in every view', () => {
  for (const v of LENS_VIEWS) assert.deepEqual(lensesFor(v, MENU), MENU, v);
});

test('Anatomy and Circuit: every menu lens colours the veins of a real patient', () => {
  for (const lens of MENU) {
    const d = computeLens(lens, c.frame as never, 'light', { healthy: h.healthy, ref: Float32Array.from(h.healthy.P) });
    assert.notEqual(d.mode, 0, `${lens} colours the vessels`);
  }
});

test('Lobule: every menu lens colours the vessels; the stream lenses lay their sources side by side across each vessel, in the key\'s colours', () => {
  const m = real(h);
  for (const lens of MENU) {
    const ctx = ctxOf(m, lens);
    for (const seg of SEGS) {
      const across = new Set(ACROSS.map((a) => key(inkAcross(ctx, seg, 0.5, a, [0, 0, 0]))));
      if (STREAMS.has(lens)) {
        const allowed = new Set(laneColours(lens as 'origin').map(key));
        for (const k of across) assert.ok(allowed.has(k), `${lens} ${seg}: ${k} is a source's colour`);
        // (Blood origin: every bed carries several sources; First pass: the sinusoids, halfway through clearing, carry raw and clear side by side, the inlet only raw)
        if (lens === 'origin' || seg === 'sin') assert.ok(across.size >= 2, `${lens} ${seg}: more than one stream across the vessel (was one grey)`);
        const grey = key(inkAt(ctx, seg, 0.5, [0, 0, 0]));
        assert.ok(!across.has(grey) || allowed.has(grey), `${lens} ${seg}: not the plain grey`);
      } else {
        assert.equal(across.size, 1, `${lens} ${seg}: one colour across`);
        assert.equal([...across][0], key(inkAt(ctx, seg, 0.5, [0, 0, 0])), `${lens} ${seg}: inkAt's colour`);
      }
    }
  }
  // the key under each stream lens has a dot for each colour the vessels show
  for (const lens of ['origin', 'firstpass'] as const) {
    const dots = new Set(legendFor(lens, 'light').dots!.map((d) => key(hexToRgb01(d.colour))));
    assert.ok(dots.size >= 4, lens);
  }
});

test('Lobule: whatever a lens reads changes, its colours are redrawn (the signature is the colours), and nothing it does not read redraws them', () => {
  const m = real(h);
  const differs = (lens: LensId, a: Partial<LobuleModel>, o: Partial<InkContext> = {}) => inkSignature(ctxOf(m, lens)) !== inkSignature(ctxOf({ ...m, ...a } as LobuleModel, lens, o));
  assert.ok(differs('flow', { Qs: { ...m.Qs, sin: m.Qs.sin * 3 } }), 'Flow follows the flows');
  assert.ok(differs('velocity', { Qs: { ...m.Qs, sin: m.Qs.sin * 3 } }), 'Velocity follows the flows');
  assert.ok(differs('direction', { rev: { ...m.rev, sin: !m.rev.sin } }), 'Direction follows a reversal');
  assert.ok(differs('drop', { P4: m.P4 - 6 }), 'Drop follows the hepatic vein\'s pressure');
  assert.ok(differs('delta', {}, { ref: Float32Array.from(h.healthy.P, (p) => p - 4) }), 'Change follows the reference\'s values');
  const cm = real(c);
  assert.ok(differs('origin', { lanes: cm.lanes }), 'Blood origin follows the shares');
  assert.ok(!differs('pressure', { Qs: { ...m.Qs, sin: m.Qs.sin * 3 } }), 'Pressure does not redraw for a flow');
});

test('Sinusoid: every menu lens paints the lumen or, for the streams, the red cells', () => {
  for (const f of [h, c]) {
    const m = real(f);
    for (const lens of MENU) {
      const ctx = ctxOf(m, 'pressure');
      const lum = sinusoidLumen(ctx, lens, [0, 0, 0]), cells = sinusoidCellSources(ctx, lens);
      assert.ok(lum.every((v) => Number.isFinite(v) && v >= 0 && v <= 1), lens);
      if (STREAMS.has(lens)) assert.ok(cells && cells.cum.at(-1) === 1, `${lens}: the cells carry the sources`);
      else assert.equal(cells, null, `${lens}: the cells keep their red`);
    }
  }
});

test('the 3D lobule colours every vertex by the one rule and redraws by the colours, not a hand-kept key', () => {
  const src = readFileSync(new URL('../src/scene/micro3d/lobule3d.ts', import.meta.url), 'utf8');
  assert.match(src, /const key = inkSignature\(ctx\), keyChanged = key !== this\.inkKey;/);
  assert.match(src, /inkAcross\(ctx, seg, j \/ N, across, out/);
  assert.match(src, /getAttribute\('fcourse'\)/, 'the streams are laid by each vertex\'s place across');
  assert.doesNotMatch(src, /m\.P1\.toFixed\(1\)/, 'the hand-kept key is gone');
});
