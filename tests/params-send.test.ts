// Plan 32: a parameter change the page sends reaches the page's own copy (the figure draws from `patient.params`), and the worker gets the whole merged set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendParams, mergedParams } from '../src/engine/params-send.ts';
import { patient, setParams } from '../src/engine/store.ts';
import { bodyTargets } from '../src/scene/disease/targets.ts';
import { defaultParams } from '../src/engine/hales/portal/scenario.js';
import { loadBuiltin } from '../src/decks/registry.ts';
import { copiedOf } from '../src/decks/hp/deck.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { endOf, endSiteOf, geomOf, kindOf } from '../src/engine/hales/portal/stent-geom.js';
import { isClampable } from '../src/scene/disease/clamps.ts';
import { TRACT_STENT_MM } from '../src/scene/procedures/tract.ts';
import { UI } from '../src/ui/strings.generated.ts';

type P = Record<string, unknown>;
const frame = { P: new Float64Array(64), metrics: {} } as never;
const targets = () => bodyTargets(frame, patient.params as never, null);
/** The three places the figure reads `patient.params` (plan 32b): the body's targets, each stent's drawn size and shape (layer.ts syncStents: tips.d, then stent-geom's waist and end narrowing), and each narrowing's goal (disease/clamps.ts set). */
const stentsRead = () => {
  const p = patient.params as P, mm = Number((p.tips as P | undefined)?.d), shown = mm > 0 ? mm : TRACT_STENT_MM;
  return { mm: shown, stents: (EDGES as { id: string; shunt?: string }[]).filter((e) => e.shunt).map((e) => { const kind = kindOf(e) as string; return [e.id, geomOf(p as never, e.id, kind), endOf(p as never, e.id), endSiteOf(p as never, e.id)]; }) };
};
const clampGoals = () => Object.fromEntries(Object.entries(((patient.params as P).stenosis ?? {}) as Record<string, number>).filter(([id]) => isClampable(id)).map(([id, v]) => [id, Math.min(0.95, Math.max(0, v ?? 0))]));
const figureRead = () => JSON.stringify({ body: targets(), ...stentsRead(), clamps: clampGoals() });
/** The sliders that change nothing the figure draws from `params`: physiology that reaches the picture through the engine's frame (vessel widths, flow, the Doppler), and the Lobule view's fibrosis. A new slider that changes nothing fails until it is named here. */
const FRAME_ONLY = ['fibrosis.L.pre', 'fibrosis.R.pre', 'gestation', 'nsbbGain', 'respDepth', 'splanchnicTone', 'tr'];

test('sendParams writes the page copy first: cirrhosis 0 reaches bodyTargets on the next feed, and the rest of the patient is kept', () => {
  setParams({ ...(defaultParams() as P), cirrhosis: 0.8, splenicRx: 2 });
  const v = patient.paramsVersion;
  sendParams({ cirrhosis: 0 }, { settle: false });
  assert.equal((patient.params as P).cirrhosis, 0);
  assert.equal(targets().cirrhosis, 0);
  assert.equal(targets().splenicRx, 2, 'a patch changes only what it names');
  assert.ok(patient.paramsVersion > v);
  sendParams({ cirrhosis: 1 });
  assert.equal(targets().cirrhosis, 1);
});

test('a nested patch merges (tips.d), `replace` puts a whole set in place', () => {
  setParams({ ...(defaultParams() as P), cirrhosis: 0.5 });
  const m = mergedParams({ thrombus: { PV: 0.5 } }) as P;
  assert.equal((m.thrombus as P).PV, 0.5);
  assert.equal(m.cirrhosis, 0.5);
  sendParams({ ...(defaultParams() as P), cirrhosis: 0.1 }, { replace: true });
  assert.equal((patient.params as P).cirrhosis, 0.1);
});

test('every slide with a what-if slider: its min and max change the page copy; every figure reader (body targets, stents, narrowings) is compared, and the frame-only paths are pinned', () => {
  const quiet: string[] = [];
  return (async () => {
    for (const d of UI.decks) {
      const deck = await loadBuiltin(d.id), c = copiedOf(d.id);
      if (!deck || !c) continue;
      c.slides.forEach((s, i) => {
        const w = (s as { whatIf?: { param?: unknown; min?: number; max?: number } }).whatIf;
        if (!w || w.param == null) return;
        const paths = ([] as unknown[]).concat(w.param).map(String);
        const at = (x: number) => { setParams(defaultParams()); const patch: P = {}; for (const p of paths) { const k = p.split('.'); let o = patch; k.forEach((q, j) => { if (j === k.length - 1) o[q] = x; else o = (o[q] = (o[q] as P) ?? {}) as P; }); } sendParams(patch); return JSON.stringify(patient.params); };
        assert.notEqual(at(Number(w.min)), at(Number(w.max)), `${d.id} slide ${i + 1}: the slider's ends leave the page copy the same`);
        const t = (x: number) => { at(x); return figureRead(); };
        if (t(Number(w.min)) === t(Number(w.max))) quiet.push(`${d.id}/${deck.slides[i]?.id}: ${paths.join(',')}`);
      });
    }
    console.log(`what-if paths that move numbers only (none of the figure's three readers reads them; the engine's frame still reshapes spleen, ascites, varices and the vessels' widths): ${quiet.join('; ') || 'none'}`);
    const paths = [...new Set(quiet.flatMap((q) => q.split(': ')[1]!.split(',')))].sort();
    assert.deepEqual(paths, [...FRAME_ONLY].sort(), 'a slider that changes nothing on screen must be named in FRAME_ONLY (and one that now draws something taken out)');
  })();
});
