// Blood-source lens at a confluence: every tributary keeps its own colours to its end, and the mixed blend begins in the vessel downstream (Mohammad, 20 Nov: the SMV's gut blood
// looked to run back up the splenic vein, the splenic vein's spleen blood down the SMV: each took the junction's blend over its last stretch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originFractions, ORIGIN_N } from '../src/scene/lenses/blood-model.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { presetState, presetIds } from './b4-presets.ts';

test('no vessel ends in its junction\'s blend: its blood at the end is its blood at the start, for Blood origin and First pass, in every preset', async () => {
  for (const id of await presetIds()) {
    const f = (await presetState(id)).frame;
    for (const pass of [false, true]) {
      const r = originFractions(f.Qf ?? f.Q, f.Pf ?? (f as { P: ArrayLike<number> }).P, pass);
      for (let k = 0; k < (EDGES as unknown[]).length; k++) {
        const own = Array.from(r.own.slice(k * ORIGIN_N, (k + 1) * ORIGIN_N)), end = Array.from(r.end.slice(k * ORIGIN_N, (k + 1) * ORIGIN_N));
        if (pass && (EDGES as { kind: string; zone?: string }[])[k]!.kind === 'liver') continue;   // (a sinusoid clears its gut blood along its length)
        assert.deepEqual(end, own, `${id} ${pass ? 'first pass' : 'origin'}: ${(EDGES as { id: string }[])[k]!.id}`);
      }
    }
  }
});

test('at the splenic-SMV confluence the portal trunk begins with the blend of both and each tributary ends pure', async () => {
  const f = (await presetState('cirr-comp')).frame, r = originFractions(f.Qf ?? f.Q, f.Pf ?? (f as { P: ArrayLike<number> }).P, false);
  const at = (id: string) => (EDGES as { id: string }[]).findIndex((e) => e.id === id);
  const share = (k: number, j: number) => r.own[k * ORIGIN_N + j]!;
  const smv = at('SMV_CONF'), sv = at('SV_CONF'), pv = at('PV_TRUNK_1');
  assert.ok(smv >= 0 && sv >= 0 && pv >= 0);
  for (const k of [smv, sv]) assert.deepEqual(Array.from(r.end.slice(k * ORIGIN_N, (k + 1) * ORIGIN_N)), Array.from(r.own.slice(k * ORIGIN_N, (k + 1) * ORIGIN_N)));
  const sum = (k: number) => Array.from({ length: ORIGIN_N }, (_, j) => share(k, j)).reduce((a, b) => a + b, 0);
  assert.ok(sum(pv) > 0);
});
