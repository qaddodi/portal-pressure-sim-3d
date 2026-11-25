// plans 34d, 34e: a Budd-Chiari clot (hepatic vein thrombosis) is OSTIAL: it runs (1 + 2 v) vein widths upstream of the cap's tip at the wall and out to the IVC's wall across the vein's whole width, and no pixel of it is inside the IVC. Run: node --test tests/hv-clot-ends.test.ts
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { drawnHost, cavaWallShare, cavaFarWallShare, radiusAtShare, type Host } from '../src/scene/disease/host.ts';
import { type ClotUniform, clotRange, clotPhases, clotShapeAt, clotDrawnShape, clotPiece, clotAtTwin, trunkCutTwin, ostialLength, CLOT_CAP_LEN, OSTIAL_MAX_SHARE } from '../src/scene/disease/clot-field.ts';
import { clotUniforms, clotAnchor, ostialEnds, pieceRanges } from '../src/scene/disease/clots.ts';
import { CAUDATE_VEIN_ID } from '../src/scene/vessels/caudate-veins.ts';
import { neighbourAttr } from '../src/scene/vessels/neighbour.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { shaderText, block } from './shader-text.ts';

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

test('plan 34d/34e: the distal end is 34d\'s (the cap\'s length short of the wall at the centre line, (1 + 2v) widths upstream), the proximal end is the far side of the wall\'s slant and the same at every v, the centroid is in the cava half', () => {
  let n = 0;
  for (const id of VEINS) {
    const h = hosts.get(id); if (!h) { console.log(`${id}: not drawn`); continue; }
    const wall = cavaWallShare(h); if (wall == null) { console.log(`${id}: does not open into the cava (keeps clotSpan)`); continue; }
    const far = cavaFarWallShare(h)!;
    let prevA = Infinity; const bs: number[] = [];
    for (const v of [0.3, 0.66, 1]) {
      const e: NonNullable<ReturnType<typeof ostialEnds>> = ostialEnds(h, v, 1)!;
      const cap: number = CLOT_CAP_LEN * radiusAtShare(h, e.b0) / h.length, lenD: number = (e.b0 - e.a) * h.length / e.D;
      console.log(`${id} v=${v}: a ${e.a.toFixed(3)} b0 ${e.b0.toFixed(3)} (34d) b ${e.b.toFixed(3)} wall ${wall.toFixed(3)} far ${far.toFixed(3)} (${((far - wall) * h.length / e.D).toFixed(2)} D past the wall at the centre line), a..b0 ${lenD.toFixed(2)} D (D ${e.D.toFixed(4)}), vein ${h.length.toFixed(3)}, centroid ${((e.a + e.b) / 2).toFixed(3)}`);
      assert.ok(Math.abs(wall - e.b0 - cap) <= 0.02 * cap, `${id} v=${v}: 34d's end b0 is the cap's length short of the wall`);
      assert.equal(e.b, Math.max(far, e.b0), `${id} v=${v}: b is the far side of the slant`);
      assert.ok(e.b >= wall - 1e-9, `${id} v=${v}: the body reaches the wall at the centre line`);
      // (the cava half of the vein that is DRAWN, 0 .. the wall: the placed veins run on to the cava's axis, and the placed caudate vein is short (0.10 scene units, 0.29 of it inside the cava's lumen), so half of its whole length put the line 1.6
      //  of its widths short of the ostium, and a 2.3-width clot that starts at the wall crossed it. The vein past the wall is inside the cava and is not drawn)
      assert.ok((e.a + e.b) / 2 > wall / 2, `${id} v=${v}: centroid ${(e.a + e.b) / 2} is in the cava half of the drawn vein (wall ${wall})`);
      const want = Math.min(ostialLength(v, e.D, h.length), e.b0 * h.length);
      assert.ok(e.a > 0 ? Math.abs((e.b0 - e.a) * h.length - want) <= 0.02 * want : (e.b0 - e.a) * h.length <= want + 1e-9, `${id} v=${v}: a..b0 equals L(v)`);
      if (v === 1) assert.ok(lenD <= 3.1, `${id}: ${lenD} D at v = 1`);
      assert.ok((e.b0 - e.a) * h.length <= OSTIAL_MAX_SHARE * h.length + 1e-9);
      assert.ok((e.a < prevA || e.a === 0) && e.a >= 0, `${id}: a falls as v rises`); prevA = e.a; bs.push(e.b);
      const us = clotUniforms(h, v, 1, id), last = us[us.length - 1]!, span: number = (e.b - e.a) * h.length;
      assert.ok(Math.abs(last.f0 + last.df * (1 - 1e-12) - (h.length - e.a * h.length) / span) < 1e-6, `${id} v=${v}: the last piece carries the share on past the vein's end`);
      n++;
    }
    assert.ok(bs.every((b) => b === bs[0]), `${id}: the proximal end stays put`);
  }
  assert.ok(n > 0);
});

// THE TWIN OF THE JOINT (plan 34e): the clot of a hepatic vein rasterised over the vein and the cava, in the shader's own functions (clotAtTwin; the cut is trunkCutTwin, the one-pixel edge of the tube's cavA and the skin's skinOutsideTrunk), at three pixel scales.
const SCALES = { phone: 250, ipad: 500, mac: 700 } as const;   // device px per scene unit
const UNITS = 300;   // figure units per scene unit (clotPiece's)
type Cut = 'trunk' | 'union';   // 'union': the clot is clipped to the union's lumen only (the skin before 34e: the cava is inside it)
function joint(id: string, v: number, scale: number, cut: Cut, ends: 'new' | 'b0') {
  const h = hosts.get(id)!, last = h.pieces[h.pieces.length - 1]!, e = ostialEnds(h, v, 1)!, { side } = clotPhases(id);
  const b = ends === 'new' ? e.b : e.b0, uni = clotPiece(e.a, b, h.length, 0, h.length, side * v, id, UNITS);
  const n = h.pts.length, tail = h.pts[n - 1]!, prev = h.pts[n - 2]!, tl = Math.hypot(tail.x - prev.x, tail.y - prev.y), tx = (tail.x - prev.x) / tl, ty = (tail.y - prev.y) / tl;
  /** the clot's cover at a point of the figure (scene units), and how far outside the cava's lumen it is in device px */
  const at = (x: number, y: number): { cover: number; out: number; cutK: number; s: number; lat: number; f: number; distIn: number } => {
    let best = Infinity, bs = 0, bl = 0, bR = 1;
    // (THE TUBE'S OWN FRAME: a pixel between two rings reads the share and the lateral interpolated between them, each ring square to the centre line's tangent at its vertex (the bisector of its two segments), as the tube's mesh carries u and the
    //  lateral. The nearest point of the polyline, as this twin read it before, jumps along the inside of every vertex (by 2 lat tan(turn / 2)): the placed right hepatic vein turns two degrees a vertex near its mouth, and at 0.7 of its lumen
    //  that jump moved a wall-anchored clot's free edge 0.7 px between samples a quarter pixel apart, a step no shader draws. Past the end the line is carried on straight, as the skin's arc is, and only past it: carried backwards it ran across
    //  the inside of the placed caudate vein's bend.)
    const tan = (k: number): { x: number; y: number } => {
      if (k >= n - 1) return { x: tx, y: ty };
      const a = h.pts[Math.max(k - 1, 0)]!, b = h.pts[k + 1]!, l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    };
    for (let k = 0; k < n; k++) {
      if (k === n - 1) { const ex = (x - tail.x) * tx + (y - tail.y) * ty; if (ex < 0) continue; const l = (x - tail.x) * -ty + (y - tail.y) * tx; if (Math.abs(l) < best) { best = Math.abs(l); bs = h.s[n - 1]! + ex; bl = l; bR = h.R[n - 1]!; } continue; }
      const p = h.pts[k]!, q = h.pts[k + 1]!, T0 = tan(k), T1 = tan(k + 1);
      const d0 = (x - p.x) * T0.x + (y - p.y) * T0.y, d1 = (x - q.x) * T1.x + (y - q.y) * T1.y;
      if (d1 > 0 || (d0 < 0 && k > 0)) continue;
      const t = Math.min(1, Math.max(0, d0 / (d0 - d1 || 1e-12)));
      const cx = p.x + (q.x - p.x) * t, cy = p.y + (q.y - p.y) * t, mx = T0.x + (T1.x - T0.x) * t, my = T0.y + (T1.y - T0.y) * t, ml = Math.hypot(mx, my) || 1;
      const l = ((x - cx) * -my + (y - cy) * mx) / ml;
      if (Math.abs(l) < best) { best = Math.abs(l); bs = h.s[k]! + (h.s[k + 1]! - h.s[k]!) * t; bl = l; bR = h.R[k]! + (h.R[k + 1]! - h.R[k]!) * t; }
    }
    const nb = neighbourAttr(last.id, [x, y, 0])!, out = (Math.abs(nb[0]!) - nb[1]!) * scale;
    const c = clotAtTwin(uni, bs / h.length, bl / bR, bR * UNITS, bR * scale);
    const cutK = cut === 'trunk' ? trunkCutTwin(out) : 1;
    return { cover: c.cover * cutK, out, cutK, s: bs, lat: bl / bR, f: uni.f0 + uni.df * (bs / h.length), distIn: c.distIn };
  };
  return { h, e, at, side, b, last, uni };
}
/** every pixel of the joint with a cover over 0.02: how many are inside the cava by more than half a pixel, the deepest (px), and the clot's area */
function raster(id: string, v: number, scale: number, cut: Cut, ends: 'new' | 'b0') {
  const j = joint(id, v, scale, cut, ends), { h, e } = j, st = 1 / scale;
  const p0 = h.pts[0]!, xs = h.pts.map((p) => p.x), ys = h.pts.map((p) => p.y), m = 0.08;
  let inside = 0, deepest = 0, area = 0;
  for (let y = Math.min(...ys) - m; y <= Math.max(...ys) + m; y += st) for (let x = Math.min(...xs) - m; x <= Math.max(...xs) + m; x += st) {
    // (only the clot's own neighbourhood: from the distal end to a little past the far wall)
    const q = j.at(x, y); if (q.s < (e.a - 0.05) * h.length || q.s > (e.b + 0.1) * h.length || Math.abs(q.lat) > 1.2) continue;
    if (q.cover > 0.02) { area++; if (q.out < -0.5) { inside++; deepest = Math.max(deepest, -q.out); } }
  }
  void p0;
  return { inside, deepest, area };
}

test('plan 34e gate 1: no pixel of the clot lies inside the IVC (cover > 0.02 under half a pixel inside its drawn wall: none), at phone, iPad and Mac scales, v = 0.3, 0.66 and 1, for the three hepatic veins and the caudate vein', () => {
  let rows = 0;
  for (const id of VEINS) {
    if (!hosts.get(id) || cavaWallShare(hosts.get(id)!) == null) continue;
    for (const [name, scale] of Object.entries(SCALES)) for (const v of [0.3, 0.66, 1]) {
      const r = raster(id, v, scale, 'trunk', 'new');
      assert.equal(r.inside, 0, `${id} ${name} v=${v}: ${r.inside} clot pixels inside the IVC, deepest ${r.deepest.toFixed(2)} px`);
      assert.ok(r.area > 5, `${id} ${name} v=${v}: the clot is drawn (${r.area} px)`); rows++;
    }
  }
  assert.ok(rows >= 9);
});

test('plan 34e gate 1b (liveness): without the cut (the union\'s lumen only) the clot stands inside the IVC, and plan 34d\'s own end b0 with the cut leaves a gap at the wall', () => {
  let worstNoCut = 0, gapSeen = 0;
  for (const id of VEINS) {
    if (!hosts.get(id) || cavaWallShare(hosts.get(id)!) == null) continue;
    for (const v of [0.3, 1]) {
      const r = raster(id, v, SCALES.mac, 'union', 'new'), r0 = raster(id, v, SCALES.mac, 'union', 'b0');
      const d = r.deepest / (2 * radiusAtShare(hosts.get(id)!, 1) * SCALES.mac);   // (in vein widths)
      console.log(`${id} v=${v} mac, no cut: ${r.inside} px inside the IVC, deepest ${r.deepest.toFixed(1)} px = ${d.toFixed(2)} D; with 34d's b0 and no cut: deepest ${r0.deepest.toFixed(1)} px = ${(r0.deepest / (2 * radiusAtShare(hosts.get(id)!, 1) * SCALES.mac)).toFixed(2)} D`);
      worstNoCut = Math.max(worstNoCut, r.inside); assert.ok(r.inside > 0, `${id} v=${v}: with the cut taken away the clot is inside the IVC (the gate sees it)`);
      gapSeen += gaps(id, v, SCALES.mac, 'trunk', 'b0');
    }
  }
  assert.ok(worstNoCut > 0 && gapSeen > 0, 'both halves of the fix are needed: the cut, and the far side of the slant');
});

/** along the ostium: for laterals across the clot\'s own width at its proximal end (0.8 of its half width at f = 1, as the shader draws it: clotDrawnShape), how many are NOT in the clot\'s body one device pixel before the wall of that lateral: past the body's end (f over 1, the rounded cap) or outside its edge (distIn <= 0).
 *  (Not "cover over 0.5": at a phone the clot's end is under a pixel wide, so its own anti-aliasing is under 0.5 across; the geometry is what has no gap.) */
function gaps(id: string, v: number, scale: number, cut: Cut, ends: 'new' | 'b0'): number {
  const j = joint(id, v, scale, cut, ends), { h, last } = j, R = radiusAtShare(h, 1), { h: hw, c } = clotDrawnShape(joint(id, v, scale, cut, ends).uni, 1, R * scale);
  const n = h.pts.length, tail = h.pts[n - 1]!, prev = h.pts[n - 2]!, tl = Math.hypot(tail.x - prev.x, tail.y - prev.y), tx = (tail.x - prev.x) / tl, ty = (tail.y - prev.y) / tl;
  const centre = (s: number): { x: number; y: number; hx: number; hy: number; r: number } => {
    if (s >= h.s[n - 1]!) return { x: tail.x + tx * (s - h.s[n - 1]!), y: tail.y + ty * (s - h.s[n - 1]!), hx: tx, hy: ty, r: h.R[n - 1]! };
    let k = 1; while (k < n - 1 && h.s[k]! < s) k++;
    const w = (s - h.s[k - 1]!) / (h.s[k]! - h.s[k - 1]! || 1), p = h.pts[k - 1]!, q = h.pts[k]!, dl = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: p.x + (q.x - p.x) * w, y: p.y + (q.y - p.y) * w, hx: (q.x - p.x) / dl, hy: (q.y - p.y) / dl, r: h.R[k - 1]! + (h.R[k]! - h.R[k - 1]!) * w };
  };
  let missed = 0;
  for (let i = 0; i <= 10; i++) {
    const lat = Math.max(-1, Math.min(1, c + hw * 0.8 * (i / 5 - 1)));   // (lumen units, left of the heading; the wall side of the clot is pushed a pixel past the lumen's edge under the ink, which is not a place of the lumen)
    // the wall at this lateral: the first arc length (from 0.5 of the vein) at which the line enters the IVC
    let sWall = h.length * 0.5;
    for (; sWall < h.s[n - 1]! + 2 * R; sWall += 0.0002) { const q = centre(sWall), nb = neighbourAttr(last.id, [q.x - q.hy * lat * q.r, q.y + q.hx * lat * q.r, 0])!; if (Math.abs(nb[0]!) - nb[1]! < 0) break; }
    const q = centre(sWall - 1 / scale), at = j.at(q.x - q.hy * lat * q.r, q.y + q.hx * lat * q.r);
    if (!(at.f <= 1 + 1e-9 && at.distIn > 0)) missed++;
  }
  return missed;
}

test('plan 34e gate 2: along the ostium the clot reaches the wall within one pixel at every lateral across its width (no gap), at every scale and v; the tube\'s and the skin\'s cuts are the same one-pixel edge', () => {
  for (const id of VEINS) {
    if (!hosts.get(id) || cavaWallShare(hosts.get(id)!) == null) continue;
    for (const [name, scale] of Object.entries(SCALES)) for (const v of [0.3, 0.66, 1]) {
      const m = gaps(id, v, scale, 'trunk', 'new');
      assert.equal(m, 0, `${id} ${name} v=${v}: ${m} of 11 laterals are short of the wall by more than a pixel`);
    }
  }
  assert.equal(trunkCutTwin(-0.5), 0); assert.equal(trunkCutTwin(0.5), 1); assert.equal(trunkCutTwin(0), 0.5);
});

test('plan 34e gate 4 (stable frame to frame): the clot\'s cover has no step anywhere around the IVC\'s wall (cap, body, the cut, the far corner), sampled every quarter pixel; the cut is analytic (no time, noise, derivative or depth test in it), so the same pixel is the same colour every frame', () => {
  for (const id of VEINS) {
    const h0 = hosts.get(id); if (!h0 || cavaWallShare(h0) == null) continue;
    for (const v of [0.3, 1]) {
      const scale = SCALES.mac, j = joint(id, v, scale, 'trunk', 'new'), { h } = j, q = 0.25 / scale;
      const n = h.pts.length, tail = h.pts[n - 1]!, W = radiusAtShare(h, 1) * 4;
      let worst = 0, cells = 0;
      const x0 = tail.x - W, y0 = tail.y - W, N = Math.ceil(2 * W / q);
      type P = { cover: number; out: number };
      const grid: P[][] = [];
      for (let iy = 0; iy <= N; iy++) { const row: P[] = []; for (let ix = 0; ix <= N; ix++) row.push(j.at(x0 + ix * q, y0 + iy * q)); grid.push(row); }
      const near = (a: P, b: P): boolean => Math.abs(a.out) <= 8 || Math.abs(b.out) <= 8;   // (within 8 px of the cava's wall: where the cut, the cap and the far corner are; the clot's own distal end is plan 26's, and unchanged)
      for (let iy = 0; iy <= N; iy++) for (let ix = 0; ix <= N; ix++) {
        const g = grid[iy]![ix]!;
        if (ix < N && near(g, grid[iy]![ix + 1]!)) worst = Math.max(worst, Math.abs(grid[iy]![ix + 1]!.cover - g.cover));
        if (iy < N && near(g, grid[iy + 1]![ix]!)) worst = Math.max(worst, Math.abs(grid[iy + 1]![ix]!.cover - g.cover));
        cells++;
      }
      console.log(`${id} v=${v} mac: ${cells} samples at a quarter pixel, largest step between neighbours ${worst.toFixed(3)} (a pop would be 1)`);
      assert.ok(worst <= 0.6, `${id} v=${v}: a step of ${worst} in the cover between samples a quarter pixel apart`);
    }
  }
  // (the cut is the same function in the tube (cavA) and the skin (skinOutsideTrunk): no time, no noise, no derivative, no depth in it)
  const cut = block(shaderText(SKIN_FS), 'float skinOutsideTrunk(');
  assert.ok(cut.length > 100 && !/fwidth|dFd|time|rand|fract\(|gl_FragDepth|texture/i.test(cut), 'the skin\'s cut reads only the pixel and the arms\' axes');
});

test('plan 34e gate 3: the portal trunk, the splenic confluence and the renal veins are unchanged (a mid vein\'s clot is clotSpan\'s and the cut is in the shaders\' hepatic-vein branches only)', () => {
  for (const id of ['PV_TRUNK', 'SV_CONF', 'LRV_IVC', 'RRV_IVC']) {
    const h = drawnHost(id); if (!h) continue;
    assert.equal(clotAnchor(id), 'mid');
    for (const v of [0.3, 0.66, 1]) {
      const { a, b } = clotRange(v, null), { side } = clotPhases(id), want: ClotUniform[] = pieceRanges(h).map(([s0, s1]) => clotPiece(a, b, h.length, s0, s1, side * v, id));
      assert.deepEqual(clotUniforms(h, v, 1, id), want, `${id} v=${v}`);
      assert.deepEqual(clotUniforms(h, v, 1.3, id, 0.8), want, `${id} v=${v}: the cava's and the vein's swell do not move it`);
    }
  }
  assert.match(shaderText(SKIN_FS), /armCopy\[i\]\.w < -1\.5 && ct\.x > 0\.0 \? skinOutsideTrunk\(gl_FragCoord\.xy\) : 1\.0/);
  assert.match(shaderText(SKIN_FS), /k \*= smoothstep\(-0\.5, 0\.5, \(abs\(lat\) - 1\.0\) \* rPx\);/);
  assert.match(shaderText(SKIN_FS), /if \(armData\[j\]\.x < 0\.0 \|\| armCopy\[j\]\.w < -0\.5 \|\| keepOf\(j\) < 0\.5\) continue;/);
  assert.match(shaderText(VESSEL_FS), /covC \*= cavA;/);
});

test('plan 34d: a mid vein keeps clotSpan; the clot covers the pieces of a vein with no step at a joint', () => {
  assert.deepEqual(clotRange(0.66, null), { a: 0.4 - 0.22 * 0.66, b: 0.6 + 0.22 * 0.66 });
  const h = drawnHost('LRV_IVC');
  if (h) { const us = clotUniforms(h, 1, 1, 'LRV_IVC'); assert.equal(us.length, pieceRanges(h).length); }
  const r = clotRange(1, 0.2, 0.5); assert.ok(r.b === 0.2 && r.a === 0);
});
