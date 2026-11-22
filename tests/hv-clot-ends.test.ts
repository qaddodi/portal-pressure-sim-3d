import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawnHost, cavaWallShare, fadeStartShare, radiusAtShare } from '../src/scene/disease/host.ts';
import { clotRange, CLOT_CAP_LEN } from '../src/scene/disease/clot-field.ts';
import { clotUniforms, pieceRanges } from '../src/scene/disease/clots.ts';
import { opensIntoCava } from '../src/scene/vessels/fades.ts';
import { IVC_JOIN_LEN } from '../src/scene/vessels/fades.ts';
import { len3 } from '../src/scene/frame2d.ts';

const IDS = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'LRV_IVC', 'RRV_IVC'];
test('plan 34: a cava-opening vein\'s clot (with its cap) ends before the fade into the cava, at every v', () => {
  let n = 0;
  for (const id of IDS) {
    const h = drawnHost(id); if (!h || !opensIntoCava(h.pieces[h.pieces.length - 1]!.id)) continue;
    const fs = fadeStartShare(h)!, wall = cavaWallShare(h)!;
    assert.ok(fs != null && fs < wall, `${id} fade starts before the wall`);
    assert.ok((wall - fs) * h.length >= len3(IVC_JOIN_LEN) - 1e-9, `${id}: at least ${IVC_JOIN_LEN} units from the wall`);
    for (const v of [1, 0.66, 0.3]) {
      const cap: number = CLOT_CAP_LEN * radiusAtShare(h, fs) / h.length, { b } = clotRange(v, fs - cap, cap);
      assert.ok(b + cap <= fs + 1e-9, `${id} v=${v}: b ${b} + cap ${cap} <= fade start ${fs} (wall ${wall})`);
      // no piece's clot function reaches past b: the uniform's share f along the last piece is > 1 from there on
      const us = clotUniforms(h, v, 1, id), rs = pieceRanges(h), last = us.length - 1;
      const f = us[last]!.f0 + us[last]!.df * 1;
      assert.ok(f >= 1 - 1e-9, `${id} v=${v}: the clot is over by the vein's end`);
      assert.ok(rs[last]![1] / h.length >= b);
      n++;
    }
  }
  assert.ok(n > 0, 'some vein checked');
});
test('plan 34: a vein with no cava end keeps clotSpan, and a short one never gets b past a', () => {
  assert.deepEqual(clotRange(0.66, null), { a: 0.4 - 0.22 * 0.66, b: 0.6 + 0.22 * 0.66 });
  const r = clotRange(1, 0.2, 0.05); assert.ok(r.b > r.a && r.b <= 0.2 + 1e-12);
  const s = clotRange(1, 0.03, 0.05); assert.ok(s.b >= s.a);
});
