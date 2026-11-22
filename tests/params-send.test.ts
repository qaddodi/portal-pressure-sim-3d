// Plan 32: a parameter change the page sends reaches the page's own copy (the figure draws from `patient.params`), and the worker gets the whole merged set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendParams, mergedParams } from '../src/engine/params-send.ts';
import { patient, setParams } from '../src/engine/store.ts';
import { bodyTargets } from '../src/scene/disease/targets.ts';
import { defaultParams } from '../src/engine/hales/portal/scenario.js';
import { loadBuiltin } from '../src/decks/registry.ts';
import { copiedOf } from '../src/decks/hp/deck.ts';
import { UI } from '../src/ui/strings.generated.ts';

type P = Record<string, unknown>;
const frame = { P: new Float64Array(64), metrics: {} } as never;
const targets = () => bodyTargets(frame, patient.params as never, null);

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

test('every slide with a what-if slider: its min and max change the page copy; the paths that change no figure target are listed', () => {
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
        const t = (x: number) => { at(x); return JSON.stringify(targets()); };
        if (t(Number(w.min)) === t(Number(w.max))) quiet.push(`${d.id}/${deck.slides[i]?.id}: ${paths.join(',')}`);
      });
    }
    console.log(`what-if paths that move numbers only (no body target reads them; the engine's frame still reshapes spleen, ascites and varices): ${quiet.join('; ') || 'none'}`);
  })();
});
