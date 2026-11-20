// The Lobule's lymph ductules (Mohammad, 20 Nov 2026: "the lymph ductules regressed", a flat grey plate stood out beside each inlet, "they don't join"). Root cause: each space of Disse that leaves a lymphatic
// channel (`ly` level 0, geometry.ts) runs from the channel to its sinusoid, and was drawn whole as the flat pale sleeve, so the stretch between the channel and the sinusoid's start stood out as a grey slab
// with a square end. 2D draws that stretch as a thin lymph-coloured tube joined to the channel; the sleeve belongs only under the sinusoid. The stretch is now a tube of the terminal lymphatics' part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BufferAttribute } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { DISC_R } from '../src/scene/lobule/widths.ts';
import { Lobule3D, disseDuctules, lymphIntoPools } from '../src/scene/micro3d/lobule3d.ts';

const flat = new LobuleView(createShared()), net = flat.net;
const R = 3;

test('every level-0 Disse space has a ductule from its channel to the sinusoid, and its sleeve starts where the sinusoid does', () => {
  const ly0 = net.courses.filter((c) => c.kind === 'ly' && c.lvl === 0), d = disseDuctules(net.courses.filter((c) => c.kind === 'ly'), net.courses);
  assert.ok(ly0.length >= 12);
  assert.equal(d.length, ly0.length);
  for (const x of d) {
    const sib = net.courses.find((c) => c.id === x.src.sib)!, a = x.src.pts[x.from]!, b = sib.pts[0]!;
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.02, 'the sleeve begins at the sinusoid\'s own start');
    assert.equal(x.conn.kind, 'lt');
    assert.deepEqual(x.conn.pts[0], x.src.pts[0], 'the ductule starts on the channel');
    assert.deepEqual(x.conn.pts[x.conn.pts.length - 1], x.src.pts[x.from]);
  }
});

test('no flat Disse sleeve stands out beside a sinusoid or an inlet: every vertex of it lies within the sleeve\'s width of some sinusoid or inlet', () => {
  const l3 = new Lobule3D(flat, createShared());
  l3.buildForTest('light');
  const part = l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/disse')!;
  assert.ok(part, 'the Disse part');
  const under = net.courses.filter((c) => c.kind[0] === 's' || c.kind === 'an' || c.kind === 'in');
  const pos = (part.geometry.getAttribute('position') as BufferAttribute).array;
  const near = (x: number, y: number) => { let best = Infinity; for (const c of under) for (let i = 0; i + 1 < c.pts.length; i++) { const a = c.pts[i]!, b = c.pts[i + 1]!, bx = b[0] - a[0], by = b[1] - a[1], bb = bx * bx + by * by, t = bb ? Math.min(1, Math.max(0, ((x - a[0]) * bx + (y - a[1]) * by) / bb)) : 0; best = Math.min(best, Math.hypot(x - a[0] - t * bx, y - a[1] - t * by)); } return best; };
  let worst = 0;
  for (let v = 0; v < pos.length; v += 3) worst = Math.max(worst, near(pos[v]! / R, -pos[v + 1]! / R));
  assert.ok(worst < 0.02, `a sleeve vertex stands ${worst.toFixed(4)} lobule radii from every sinusoid and inlet`);
});

test('every terminal lymphatic runs on into the middle of the lymphatic pool it meets (it stopped on the pool\'s rim, a butt joint against the pool\'s wall)', () => {
  const lt = net.courses.filter((c) => c.kind === 'lt'), lv = net.courses.filter((c) => c.kind === 'lv'), out = lymphIntoPools(lt, lv);
  assert.equal(out.length, lt.length);
  for (const c of out) {
    const e = c.pts[c.pts.length - 1]!, d = Math.min(...lv.map((v) => { const m = v.pts[Math.floor(v.pts.length / 2)]!; return Math.hypot(m[0] - e[0], m[1] - e[1]); }));
    assert.ok(d < DISC_R.lv * 0.1, `ends ${(d / DISC_R.lv).toFixed(2)} pool radii from a pool's middle`);
    assert.equal(c.pts.length, c.rho.length);
  }
});
