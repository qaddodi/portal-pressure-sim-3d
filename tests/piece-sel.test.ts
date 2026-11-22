// A tap on a PIECE of a split vein selects the vein (plan 17, Mohammad 22 Nov: "the mural cast disappears inside the blood vessel"). The engine reads thrombus, stenosis and stent under the
// vein's own key (`partOf`), so a card that wrote the piece's key did nothing to the patient and drew the clot on that piece alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JUNCTION_PIECES, partOf } from '../src/engine/hales/portal/topology.js';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { cardFor, normalizeSel, type Verb } from '../src/ui/action/cards.ts';
import { migratePieceKeys } from '../src/ui/action/piece-keys.ts';
import { clotPhases } from '../src/scene/disease/clot-field.ts';
import { clotUniforms, pieceRanges } from '../src/scene/disease/clots.ts';
import { drawnHost, swellsOf } from '../src/scene/disease/host.ts';
import { presetState } from './b4-presets.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const pieces = Object.entries(JUNCTION_PIECES as Record<string, string[]>);
const sliderOf = (id: string, key: string): Extract<Verb, { type: 'slider' }> => {
  const sel = normalizeSel({ type: 'edge', id })!;
  const card = cardFor(sel) as J;
  return (card.verbs as Verb[]).find((v) => v.type === 'slider' && (v as J).key === key) as J;
};

test('every piece of every split vein selects the vein, and its sliders and stent write the vein\'s key', () => {
  let walked = 0;
  for (const [host, ids] of pieces) {
    for (const id of ids) {
      assert.equal(partOf(id), host);
      const sel = normalizeSel({ type: 'edge', id }) as J;
      assert.equal(sel.id, host, `${id} selects ${host}`);
      for (const [key, set] of [['thrombus', 0.66], ['stenosis', 0.5]] as const) {
        const s = sliderOf(id, key);
        if (!s) continue;   // (a vein whose card has no such slider)
        const p: J = { thrombus: {}, stenosis: {} };
        s.set(p, set);
        assert.deepEqual(Object.keys(p[key]), [host], `${id}: ${key} is written under ${host}`);
        assert.equal(s.get(p), set);
        walked++;
      }
    }
  }
  assert.ok(walked >= 18, `walked ${walked}`);
});

test('"Stent open" on a piece deletes the vein\'s key', () => {
  const sel = normalizeSel({ type: 'edge', id: 'PV_TRUNK_1' })!;
  const card = cardFor(sel) as J;
  const stent = (card.verbs as J[]).find((v) => v.id === 'stent');
  if (!stent) return;   // (shown only where the card has one)
  let out: J = null;
  stent.run({ update: (fn: J) => { out = fn({ thrombus: { PV_TRUNK: 0.66 }, stenosis: { PV_TRUNK: 0.4 } }); } });
  assert.deepEqual(out, { thrombus: {}, stenosis: {} });
});

test('migration: params saved with a piece key load under the vein (the larger value when both are there)', () => {
  assert.deepEqual(migratePieceKeys({ thrombus: { PV_TRUNK_1: 0.66 } }), { thrombus: { PV_TRUNK: 0.66 } });
  assert.deepEqual(migratePieceKeys({ stenosis: { PV_TRUNK_1: 0.3, PV_TRUNK: 0.5, A_HEP: 0.2 } }).stenosis, { PV_TRUNK: 0.5, A_HEP: 0.2 });
  const same = { thrombus: { PV_TRUNK: 0.66 }, stenosis: {} };
  assert.equal(migratePieceKeys(same), same);
});

test('a 0.66 thrombus from a tap on the lower portal vein narrows both pieces 12.0 → 8.1 mm, and its clot runs the whole vein across both pieces with no step', async () => {
  const st = await presetState('healthy');
  const p: J = structuredClone(st.params);
  sliderOf('PV_TRUNK_1', 'thrombus').set(p, 0.66);
  assert.equal(p.thrombus.PV_TRUNK, 0.66);
  assert.equal(p.thrombus.PV_TRUNK_1, undefined);
  const out: J[] = [];
  const core = createCore((m: never) => out.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id: 'healthy', reqId: 1 });
  await core.handle({ type: 'setParams', params: p, settle: true });
  core.dispose();
  const frame = out.filter((m) => m.type === 'frame').pop() as J;
  const { EDGES } = await import('../src/engine/hales/portal/topology.js');
  const D = (id: string) => frame.D[(EDGES as J[]).findIndex((e) => e.id === id)];
  assert.ok(Math.abs(D('PV_TRUNK') - 8.1) < 0.05, `PV_TRUNK ${D('PV_TRUNK')}`);
  assert.ok(Math.abs(D('PV_TRUNK_1') - 8.1) < 0.05, `PV_TRUNK_1 ${D('PV_TRUNK_1')}`);
  const h = drawnHost('PV_TRUNK')!, sw = swellsOf(h, frame.D), us = clotUniforms(h, 0.66, sw.cava ?? 1, 'PV_TRUNK');
  assert.equal(us.length, h.pieces.length, 'every piece of the vein carries the clot');
  // the clot's span across all the pieces is 2D's clotSpan(0.66) of the whole vein: share f runs 0 at 0.2548 and 1 at 0.7452 of the vein (plan 26)
  const rs = pieceRanges(h);
  assert.ok(Math.abs(us[0]!.f0 * ((0.7452 - 0.2548) * h.length) + 0.2548 * h.length - rs[0]![0]) < 1e-6);
  for (let k = 1; k < us.length; k++) assert.ok(Math.abs((us[k - 1]!.f0 + us[k - 1]!.df) - us[k]!.f0) < 1e-9, `no gap or step at the joint of pieces ${k - 1} and ${k}`);
});
