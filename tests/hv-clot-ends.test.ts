// plan 34d: a Budd-Chiari clot (hepatic vein thrombosis) is OSTIAL: its cap's tip touches the IVC's drawn wall, never enters the IVC, and it runs (1 + 2 v) vein widths upstream. Run: node --test tests/hv-clot-ends.test.ts
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { drawnHost, cavaWallShare, radiusAtShare, type Host } from '../src/scene/disease/host.ts';
import { clotRange, clotPhases, clotShapeAt, ostialLength, CLOT_CAP_LEN, OSTIAL_MAX_SHARE } from '../src/scene/disease/clot-field.ts';
import { clotUniforms, clotAnchor, ostialEnds, pieceRanges } from '../src/scene/disease/clots.ts';
import { CAUDATE_VEIN_ID } from '../src/scene/vessels/caudate-veins.ts';
import { neighbourAttr, NBR_STRIDE } from '../src/scene/vessels/neighbour.ts';

const VEINS = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC', CAUDATE_VEIN_ID];
const hosts = new Map<string, Host | null>();
before(() => { for (const id of VEINS) hosts.set(id, drawnHost(id)); });

/** the vein's centreline at a share of its arc (scene units) */
function at(h: Host, share: number): { x: number; y: number; tx: number; ty: number } {
  const d = Math.min(1, Math.max(0, share)) * h.length;
  let k = 1; while (k < h.s.length - 1 && h.s[k]! < d) k++;
  const a = h.s[k - 1]!, w = Math.min(1, Math.max(0, (d - a) / (h.s[k]! - a || 1))), p0 = h.pts[k - 1]!, p1 = h.pts[k]!;
  const tl = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  return { x: p0.x + (p1.x - p0.x) * w, y: p0.y + (p1.y - p0.y) * w, tx: (p1.x - p0.x) / tl, ty: (p1.y - p0.y) / tl };
}

test('plan 34d: the anchor is a table: the hepatic veins and the caudate vein are ostium, every other vein is mid', () => {
  for (const id of VEINS) assert.equal(clotAnchor(id), 'ostium');
  for (const id of ['PV_TRUNK', 'SV_CONF', 'LRV_IVC', 'RRV_IVC']) assert.equal(clotAnchor(id), 'mid');
});

test('plan 34d: the cap tip touches the IVC wall, b is the same at every v, a falls, the length is (1 + 2v) widths, the centroid is in the cava half', () => {
  let n = 0;
  for (const id of VEINS) {
    const h = hosts.get(id); if (!h) { console.log(`${id}: not drawn`); continue; }
    const wall = cavaWallShare(h); if (wall == null) { console.log(`${id}: does not open into the cava (keeps clotSpan)`); continue; }
    let prevA = Infinity; const bs: number[] = [];
    for (const v of [0.3, 0.66, 1]) {
      const e: NonNullable<ReturnType<typeof ostialEnds>> = ostialEnds(h, v, 1)!;
      const cap: number = CLOT_CAP_LEN * radiusAtShare(h, e.b) / h.length, lenD: number = (e.b - e.a) * h.length / e.D;
      const tip: number = (wall - e.b - cap) * h.length / e.D;
      console.log(`${id} v=${v}: a ${e.a.toFixed(3)} b ${e.b.toFixed(3)} wall ${wall.toFixed(3)} length ${((e.b - e.a) * h.length).toFixed(3)} units = ${lenD.toFixed(2)} D (D ${e.D.toFixed(4)}), vein ${h.length.toFixed(3)}, cap tip to wall ${tip.toFixed(3)} D, centroid ${((e.a + e.b) / 2).toFixed(3)}`);
      assert.ok(Math.abs(tip) <= 0.25 && tip >= -1e-3, `${id} v=${v}: the cap tip is within 0.25 D of the wall, never past it (${tip})`);
      assert.ok((e.a + e.b) / 2 > 0.5, `${id} v=${v}: centroid ${(e.a + e.b) / 2} is in the cava half`);
      const want = ostialLength(v, e.D, h.length);
      assert.ok(e.a > 0 ? Math.abs((e.b - e.a) * h.length - want) <= 0.02 * want : (e.b - e.a) * h.length <= want + 1e-9, `${id} v=${v}: length equals L(v)`);
      if (v === 1) assert.ok(lenD <= 3.1, `${id}: ${lenD} D at v = 1`);
      assert.ok((e.b - e.a) * h.length <= OSTIAL_MAX_SHARE * h.length + 1e-9);
      assert.ok(e.a < prevA && e.a >= 0, `${id}: a falls as v rises`); prevA = e.a; bs.push(e.b);
      const us = clotUniforms(h, v, 1, id), last = us[us.length - 1]!;
      assert.ok(last.f0 + last.df >= 1 - 1e-9, `${id} v=${v}: the clot is over by the vein's end`);
      n++;
    }
    assert.ok(bs.every((b) => b === bs[0]), `${id}: the proximal end stays put`);
  }
  assert.ok(n > 0);
});

test('plan 34d: the cap\'s outline (64 points) is measured against the IVC: the tip is on the wall, the oblique corners are reported (the shader\'s cava cut clips them)', () => {
  for (const id of VEINS) {
    const h = hosts.get(id); if (!h || cavaWallShare(h) == null) continue;
    const last = h.pieces[h.pieces.length - 1]!, { side } = clotPhases(id);
    for (const v of [0.3, 0.66, 1]) {
      const e = ostialEnds(h, v, 1)!, R = radiusAtShare(h, e.b), cap = CLOT_CAP_LEN * R / h.length, { h: hw, c } = clotShapeAt(v, 1, id), pts: number[] = [];
      for (let i = 0; i < 64; i++) {
        const t = (i / 64) * Math.PI, along = cap * Math.sin(t), lat = (c + hw * Math.cos(t)) * R * 1;   // (a half ellipse on the cap: the proximal end of the clot, lumen units times the radius)
        const p = at(h, e.b + along * (1 + 0)); void side;
        pts.push(p.x - p.ty * lat, p.y + p.tx * lat, 0);
      }
      const nb = neighbourAttr(last.id, pts)!; let worst = Infinity;
      for (let i = 0; i < 64; i++) worst = Math.min(worst, Math.abs(nb[i * NBR_STRIDE]!) - nb[i * NBR_STRIDE + 1]!);
      console.log(`${id} v=${v}: cap outline's nearest approach to the IVC lumen ${(worst / (2 * R)).toFixed(3)} D (negative: inside)`);
      const tp = at(h, e.b + cap), tn = neighbourAttr(last.id, [tp.x, tp.y, 0])!;   // (the centre line's tip of the cap)
      assert.ok(Math.abs(tn[0]!) - tn[1]! >= -0.02 * 2 * R, `${id} v=${v}: the cap's centre tip is not inside the IVC (${(Math.abs(tn[0]!) - tn[1]!) / (2 * R)} D)`);
    }
  }
});

test('plan 34d: a mid vein keeps clotSpan; the clot covers the pieces of a vein with no step at a joint', () => {
  assert.deepEqual(clotRange(0.66, null), { a: 0.4 - 0.22 * 0.66, b: 0.6 + 0.22 * 0.66 });
  const h = drawnHost('LRV_IVC');
  if (h) { const us = clotUniforms(h, 1, 1, 'LRV_IVC'); assert.equal(us.length, pieceRanges(h).length); }
  const r = clotRange(1, 0.2, 0.5); assert.ok(r.b === 0.2 && r.a === 0);
});
