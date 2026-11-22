// A clot is part of its vein's drawing (Mohammad, 22 Nov: "HV IVC clots still all suck"; plan A and B; the clot's outline weight is the clot style plan's).
// A: where a vein opens into the cava the vein is cut per pixel along the cava's wall; the clot's vertices carry the same `nbr` and its fill and outline are cut by the same rule, so the clot ends on the vein's line and never shows inside the cava's lumen.
// B: the clot draws in its vein's slot (not as a device over everything): depth-tested at the tube's depth rule less a bias far under the 0.01 between the tiers, writing no depth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { ClotObject, clotBiasOf, clotGeometry, clotShapeOf } from '../src/scene/disease/clots.ts';
import { drawnHost } from '../src/scene/disease/host.ts';
import { NBR_STRIDE, neighbourAttr } from '../src/scene/vessels/neighbour.ts';
import { TUBE_DEPTH_SHARE, VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { cavaPieceOf } from '../src/scene/vessels/fades.ts';

const HV = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'];

test('A: the clot\'s fill and outline are cut along the cava\'s wall by the vein\'s own rule (same expression, a pixel wide, anti-aliased)', () => {
  const o = new ClotObject(clotGeometry({ centres: [new Vector3(0, 0, 0), new Vector3(1, 0, 0)], radii: [0.1, 0.1], alpha: [1, 1], lumen: [0.2, 0.2] }), createShared());
  // the vein: cavA = 1 - smoothstep(-0.5, 0.5, cd in device px), cd = nbr.y - |nbr.x|
  assert.match(VESSEL_FS, /float cdPx = cd \/ max\(vW \* 2\.0 \/ \(res\.y \* projY\), 1e-9\) \* dpr;/);
  assert.match(VESSEL_FS, /cavA = mix\(1\.0 - smoothstep\(-0\.5, 0\.5, cdPx\), 1\.0, circT\);/);
  for (const m of [o.toon, o.ink]) {
    assert.match(m.fragmentShader, /float cdPx = \(vNbr\.y - abs\(vNbr\.x\)\) \/ max\(vUpx, 1e-9\) \* dpr;/);
    assert.match(m.fragmentShader, /return 1\.0 - smoothstep\(-0\.5, 0\.5, cdPx\);/);
    assert.match(m.fragmentShader, /if \(cutK < 0\.004\) discard;/);
    assert.match(m.fragmentShader, /\* vLumA \* cutK/);
    assert.match(m.vertexShader, /vNbr = nbr\.xy;/);
  }
});

test('A: a clot in a vein that opens into the cava carries the cava\'s nbr on every vertex, scaled by the cava\'s live swell; no clot vertex of such a vein is drawn inside the cava\'s lumen', () => {
  for (const id of HV) for (const k of [0.36, 1, 1.6]) {
    const h = drawnHost(id)!, last = h.pieces[h.pieces.length - 1]!.id, sw = Object.assign(h.pieces.map(() => 1), { cava: k });
    const shape = clotShapeOf(h, sw, 1, id), g = clotGeometry(shape, { piece: last, swell: k }), nb = g.getAttribute('nbr').array;
    const pos = g.getAttribute('position').array, ref = neighbourAttr(last, pos)!;
    assert.ok(ref, `${id}: the cava is the vein's mate`);
    let inside = 0, outside = 0;
    for (let v = 0; v < g.getAttribute('position').count; v++) {
      assert.ok(Math.abs(nb[NBR_STRIDE * v]! - ref[NBR_STRIDE * v]!) < 1e-6 && Math.abs(nb[NBR_STRIDE * v + 1]! - ref[NBR_STRIDE * v + 1]! * k) < 1e-6, `${id} vertex ${v}`);
      if (ref[NBR_STRIDE * v + 1]! * k - Math.abs(ref[NBR_STRIDE * v]!) > 0) inside++; else outside++;
    }
    // the clot runs on past the wall (its vertices inside the lumen are cut) and is whole outside it
    assert.ok(inside > 0 && outside > 0, `${id} swell ${k}: ${inside} vertices inside the cava, ${outside} outside`);
  }
  const pt = drawnHost('PV_TRUNK')!, g = clotGeometry(clotShapeOf(pt, pt.pieces.map(() => 1), 1, 'PV_TRUNK'));
  assert.ok(g.getAttribute('nbr').array.every((x) => x === 0), 'a vein that does not open into the cava has nothing to cut against');
});

test('A: the clot is cut against the same cava piece as its vein, so the two cuts are one line (same inputs, same expression)', () => {
  for (const id of HV) {
    const last = drawnHost(id)!.pieces.at(-1)!.id;
    assert.equal(cavaPieceOf(last), cavaPieceOf(id));
    assert.ok(NETWORK_BY_ID.has(cavaPieceOf(last)));
  }
});

test('B: a clot is depth-tested, writes no depth, and sits in its vein\'s slot: after the vein\'s copy, under the devices; its bias is a few thousandths, far under the 0.01 between tiers', () => {
  const o = new ClotObject(clotGeometry({ centres: [new Vector3(0, 0, 0), new Vector3(1, 0, 0)], radii: [0.1, 0.1], alpha: [1, 1], lumen: [0.2, 0.2] }), createShared());
  for (const m of [o.toon, o.ink]) { assert.equal(m.depthTest, true); assert.equal(m.depthWrite, false); assert.equal(m.transparent, true); }
  o.placeAfter(0, 0.01);
  const ink = o.group.children.find((c) => c !== o.toonMesh)!;
  assert.equal(ink.renderOrder, 0.25); assert.ok(o.toonMesh.renderOrder > ink.renderOrder && o.toonMesh.renderOrder < 1);
  o.placeAfter(2);
  assert.equal(o.group.children.find((c) => c !== o.toonMesh)!.renderOrder, 2.25);
  for (const R of [0.004, 0.01, 0.027, 0.035]) { const b = clotBiasOf(R); assert.ok(b >= TUBE_DEPTH_SHARE * R && b < 0.0065, `${R}: ${b}`); }
  assert.match(o.toon.vertexShader, /gp\.z = clotDepth\(gp\);/);
  assert.match(o.ink.vertexShader, /c\.z = clotDepth\(c\);/);
  assert.match(o.toon.vertexShader, new RegExp(`mix\\(za, zs, ${TUBE_DEPTH_SHARE.toFixed(4)}\\)`));
});
