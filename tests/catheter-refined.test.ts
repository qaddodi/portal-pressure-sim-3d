// The IR catheters, redone (owner, 20 Nov 2026: "the catheters still look like shit": a thick chunky white tube with a heavy dark outline, off the vessel's centre line, over the green vein, a blunt lumpy tip).
// Root cause: the shaft, the corners' room and the balloon were laid for the veins' BUILT width, while the vessel shader draws every vein at the engine's LIVE diameter (a cirrhotic liver's hepatic veins are far narrower),
// and the tube was a fat 0.27 of the built radius with a dark hairline and a lathe tip stood on its end. Pinned here: thin shaft, inside the DRAWN lumen at built and at live widths, one-piece rounded tip, fine depth marks,
// a light ink, round tubes (no facets) on every device, and no kink.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { Vector3 } from 'three';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { widthSwell } from '../src/scene/vessels/live-width.ts';
import { ROUTE_KINDS } from '../src/scene/procedures/route.ts';
import { LUMEN_COMFORT, CATHETER_SLIM, drawnShare, route3d, routeVessels } from '../src/scene/procedures/route3d.ts';
import { SHAFT_MAX_SHARE, TIP_END_K, TIP_LEN_R, tipRadius, MARK_UNITS, MARK_HALF } from '../src/scene/devices/catheters/proc-catheter.ts';
import { CATH_EDGE, BALLOON_EDGE, resolveEdge } from '../src/scene/devices/edges.ts';
import { DEVICE_TOKENS } from '../src/scene/procedures/copied/device-tokens.copied.ts';
import { DEVICE_SIDES, WIRE_SIDES } from '../src/scene/devices/tube-rings.ts';
import { indexOf } from '../src/engine/vessel-data.ts';
import { UNITS_PER_SCENE as U } from '../src/scene/frame2d.ts';

setSmoothJoins(true);   // (the app's default)
const STRICT = ['hvpg', 'tips', 'tipscoil', 'ppgperc', 'ivcread'];
/** The engine's diameters with every vessel of the route at `k` of the width it was built at (mm per edge). */
function diameters(kind: string, k: number): Float32Array {
  const D = new Float32Array(1024).fill(5);
  for (const id of routeVessels(route3d(kind)!.route)) { const v = NETWORK_BY_ID.get(id)!; D[indexOf(v.lensId)] = v.baseD * k; }
  return D;
}
const swellOf = (id: string, D: ArrayLike<number>): number => { const v = NETWORK_BY_ID.get(id)!; return widthSwell(v.widthKind, v.baseD, D[indexOf(v.lensId)]); };

for (const k of [1, 0.45]) {
  test(`the shaft's axis stays in the middle of the DRAWN lumen of its vessels, corners included, at ${k === 1 ? 'built' : 'a narrowed (cirrhotic) live'} width`, () => {
    for (const kind of STRICT) {
      const r3 = route3d(kind)!, r = r3.route, vs = routeVessels(r), D = diameters(kind, k);
      r3.setLive(D);
      const p = new Vector3();
      let worst = 0, at = 0;
      for (let d = r.parts[1]!.d0 + 6; d <= r.free; d += 1.5) {
        r3.point(d, p);
        // the live drawn radius of the vessel the point is nearest: its drawn radius times its own live swell
        let share = Infinity;
        for (const id of vs) { const q = drawnShare(id, p.x, p.y, p.z); if (q) share = Math.min(share, q.dist / (q.radius * Math.min(swellOf(id, D), 1.6))); }
        if (share > worst) { worst = share; at = d; }
      }
      assert.ok(worst <= LUMEN_COMFORT + 0.12, `${kind} at ${k}: the axis is ${worst.toFixed(2)} of the drawn radius off a centreline at d=${at.toFixed(0)}`);
      r3.setLive(null);
    }
  });
}

test('the shaft is thin: at most SHAFT_MAX_SHARE of its live lumen, and a narrowed vein draws it thinner', () => {
  for (const kind of ROUTE_KINDS) {
    const r3 = route3d(kind)!, r = r3.route;
    assert.ok(r3.rc <= 0.2 * Math.min(...Array.from({ length: 40 }, (_, i) => r3.lumen(r.start + ((r.free - r.start) * i) / 39))) + 1e-9 || kind === 'brto' || kind === 'brtoC6' || kind === 'bato' || r3.rc <= 0.0045, `${kind}: rc ${r3.rc.toFixed(4)} is a thin shaft`);
    assert.ok(CATHETER_SLIM <= 0.65 && SHAFT_MAX_SHARE <= 0.2);
  }
  const r3 = route3d('hvpg')!, r = r3.route, d = r.free;
  const built = r3.lumen(d);
  r3.setLive(diameters('hvpg', 0.4));
  const narrow = r3.lumen(d);
  assert.ok(narrow < 0.75 * built, `the vein at the tip is drawn narrower (${narrow.toFixed(4)} vs ${built.toFixed(4)}) and the route's lumen follows it`);
  assert.ok(SHAFT_MAX_SHARE * narrow < r3.rc, 'so the shaft is drawn thinner there');
  r3.setLive(null);
  assert.ok(Math.abs(r3.lumen(d) - built) < 1e-9, 'and back at the built width it is as it was');
});

test('the tip is the shaft\'s own last rings: a smooth taper to a rounded point, continuous in width and slope', () => {
  const rc = 0.004, L = rc * TIP_LEN_R, rt = rc * TIP_END_K;
  assert.equal(tipRadius(L * 2, rc), rc);
  assert.equal(tipRadius(L, rc), rc);
  assert.ok(Math.abs(tipRadius(rt, rc) - rt) < 1e-12, 'the taper ends at the tip radius, where the hemisphere begins');
  assert.equal(tipRadius(0, rc), 0, 'closed in a point');
  let prev = rc, kinks = 0;
  const N = 400;
  for (let i = 0; i <= N; i++) {
    const s = L * (1 - i / N), r = tipRadius(s, rc);
    assert.ok(r <= prev + 1e-12, 'never widens toward the end');
    if (i > 0 && s > rt) { const slope = (prev - r) / (L / N); if (slope > 1.05 * 1.5 * (rc - rt) / (L - rt)) kinks++; }   // (a smoothstep's steepest slope is 1.5 times its mean; the hemisphere beyond is a circle)
    prev = r;
  }
  assert.equal(kinks, 0, 'no step in the taper');
  assert.ok(TIP_END_K > 0.3 && TIP_END_K < 0.6, 'a refined point, not a blunt end and not a needle');
});

test('the depth marks are fine rings (a hairline, a heavier one every fifth) like the scope\'s', () => {
  assert.ok(MARK_HALF <= 0.35 && MARK_UNITS >= 15);
  const src = readFileSync(new URL('../src/scene/devices/catheters/proc-catheter.ts', import.meta.url), 'utf8');
  assert.match(src, /shaft\.setStripes\(/);
  assert.ok(!/LatheGeometry/.test(src), 'the tip is no longer a lathe part stood on the shaft');
});

test('the catheter\'s ink is light and subtle in every look (never the dark polymer edge)', () => {
  const lum = (hex: string): number => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  for (const look of Object.keys(DEVICE_TOKENS) as (keyof typeof DEVICE_TOKENS)[]) {
    const t = DEVICE_TOKENS[look], e = resolveEdge(CATH_EDGE, { t, look, ink: '#000000' });
    assert.ok(lum(e.hex) > lum(t.polyEdge) + 0.2, `${look}: the shaft's edge ${e.hex} is lighter than the polymer edge ${t.polyEdge}`);
    assert.ok(lum(e.hex) >= 0.4, `${look}: ${e.hex} is not dark`);
    assert.ok(e.a <= 0.6, `${look}: drawn at ${e.a}, a soft line`);
    assert.ok(lum(resolveEdge(BALLOON_EDGE, { t, look, ink: '#000000' }).hex) >= 0.4, `${look}: the balloon's rim is not dark`);
  }
});

test('every device tube is round: no tube is built with fewer than WIRE_SIDES sides, and no body with fewer than DEVICE_SIDES (the scope fix, applied to every device)', () => {
  assert.ok(DEVICE_SIDES >= 24 && WIRE_SIDES >= 12);
  const files: string[] = [];
  const walk = (dir: string): void => { for (const f of readdirSync(dir)) { const p = `${dir}/${f}`; if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
  walk(new URL('../src/scene/devices', import.meta.url).pathname);
  const bad: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:allocTube|mergeTubes)\(\s*[^,()]+(?:\([^()]*\))?[^,()]*,\s*(\d+)\s*\)/g)) if (Number(m[1]) < WIRE_SIDES) bad.push(`${f}: ${m[0]}`);
    for (const m of src.matchAll(/\b(?:[A-Z_]*RADIAL|RADIAL)\s*=\s*(\d+)\b/g)) if (Number(m[1]) < WIRE_SIDES) bad.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
  const proc = readFileSync(new URL('../src/scene/devices/catheters/proc-catheter.ts', import.meta.url), 'utf8');
  assert.match(proc, /SHAFT_RADIAL = DEVICE_SIDES/);
  assert.match(proc, /BALLOON_RADIAL = DEVICE_SIDES/);
});

test('no kink: every route turns by less than a radian over two steps of its own width, and the HVPG\'s and the TIPS\'s way in by under half a radian', () => {
  const a = new Vector3(), b = new Vector3();
  for (const kind of ROUTE_KINDS) {
    const r3 = route3d(kind)!, r = r3.route, step = r3.rc * U * 1.2;
    let worst = 0;
    for (let d = step; d < r.free - step; d += step) { r3.dir(d - step, a); r3.dir(d + step, b); worst = Math.max(worst, Math.acos(Math.min(1, a.dot(b)))); }
    // (the BRTO of the spontaneous splenorenal shunt turns off the renal vein into the shunt at the junction itself: the shunt leaves its distal sibling 60 degrees off it at its renal mouth since 25 Nov, placed-network.ts SIBLINGS APART,
    //  because a skin cannot take two shunts closer, 55 and 50 failed the LRV_S and SVD skins; the turn there is the junction's own, 1.14 rad (1.05 before), so that one route is allowed 1.2)
    assert.ok(worst < (kind === 'hvpg' || kind === 'tips' ? 0.5 : kind === 'brtoC6' ? 1.2 : 1.1), `${kind}: sharpest turn ${worst.toFixed(2)} rad`);
  }
});

// The BRTO of C6 went out along the whole renal vein to the kidney and came straight back to C6's mouth (a turn of pi): the copied 2D spec has C6 join the renal vein beyond the gastrorenal shunt's
// mouth, and the placement brings it into the renal vein medially, on its piece at the cava. route-placed.ts brtoC6Placed goes out only as far as the mouth, wherever the placement puts it.
test('the BRTO of the splenorenal shunt leaves the renal vein at the shunt\'s own mouth: the route never runs past it and back', () => {
  const r3 = route3d('brtoC6')!, r = r3.route, shunt = r.parts.find((q) => q.name === 'shunt')!, before = r.parts[r.parts.indexOf(shunt) - 1]!;
  const raw = r.raw3!, at = (d: number): [number, number, number] => raw[Math.max(0, r.cum.findIndex((c) => c >= d))]!;
  const c6 = NETWORK_BY_ID.get('C6')!.pts, mouth = c6[c6.length - 1]!, end = at(before.d1);
  assert.ok(Math.hypot(end[0] - mouth[0], end[1] - mouth[1], end[2] - mouth[2]) < 3 * NETWORK_BY_ID.get('LRV_IVC')!.radius, `the renal leg (${before.id}) ends at C6's mouth`);
  // no stretch of the route doubles back on itself
  const a = new Vector3(), b = new Vector3();
  for (let d = 2; d < r.total - 2; d += 1) { r3.dir(d - 2, a); r3.dir(d + 2, b); assert.ok(a.dot(b) > -0.5, `doubles back at ${d.toFixed(0)}`); }
});

// ---- the stray hairline (owner, 20 Nov 2026: "wtf is that line from the balloon?") -------------------------------------------------------------------------------------------------------------------
// Root cause: the balloon's two glints were allocated 8-sided (the sides fix) and still written 6-sided, so each ring filled 7 of its 9 vertex slots and the rest stayed at the origin, the figure's centre: a thin black
// triangle from the balloon to the portal confluence. A tube's sides are now the tube's own (allocTube keeps them), so no caller can disagree, and no vertex of any catheter part may lie away from its route.
import { allocTube, makeRings, writeRings } from '../src/scene/devices/tube-rings.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { ProcCatheter, CATHETER_IDLE } from '../src/scene/devices/catheters/proc-catheter.ts';

test('a tube is written with the sides it was allocated with, whatever the caller passes: no ring leaves a vertex at the origin', () => {
  const rings = makeRings(5);
  rings.forEach((q, i) => { q.c.set(1 + i, 2, 3); q.t.set(1, 0, 0); q.r = 0.1; });
  const g = allocTube(5, 24);
  writeRings(g, rings, 6);
  const pa = g.getAttribute('position');
  for (let i = 0; i < pa.count; i++) assert.ok(Math.hypot(pa.getX(i) - (1 + Math.floor(i / 25)), pa.getY(i) - 2, pa.getZ(i) - 3) < 0.11, `vertex ${i} sits on its ring`);
});

for (const [kind, st] of [['hvpg', { u: 1, balloon: 1, column: 1, opacity: 1 }], ['hvpg', { u: 0.6, balloon: 0.5, column: 0.3, opacity: 1 }], ['tips', { u: 1, balloon: 0, column: 0, opacity: 1, needle: 0.9, wire: 0.95, flash: 0.4 }], ['brto', { u: 1, balloon: 1, column: 0.8, opacity: 1 }]] as const) {
  test(`${kind} (${JSON.stringify(st)}): no vertex of any drawn catheter part lies away from its route, at built and at a narrowed live width`, () => {
    for (const live of [false, true]) {
      const r3 = route3d(kind)!, c = new ProcCatheter(r3, createShared());
      if (live) c.setLive(diameters(kind, 0.45));
      c.set({ ...CATHETER_IDLE, ...st });
      const pts: Vector3[] = [];
      for (let d = 0; d <= r3.route.total; d += 2) pts.push(r3.point(d));
      const v = new Vector3(), bad: string[] = [];
      c.group.traverse((m) => {
        const mesh = m as unknown as { isMesh?: boolean; geometry: { getAttribute(n: string): { count: number } & Record<string, never> }; parent: { position: Vector3; quaternion: import('three').Quaternion; scale: Vector3 } };
        if (!mesh.isMesh) return;
        let shown = true;
        for (let p: { visible?: boolean; parent?: unknown } | null | undefined = m; p; p = p.parent as typeof p) if (p.visible === false) shown = false;
        if (!shown) return;
        const pa = mesh.geometry.getAttribute('position') as unknown as import('three').BufferAttribute, M = new (v.constructor as typeof Vector3)();
        void M;
        const mat = new (m.matrixWorld.constructor as typeof import('three').Matrix4)().compose(mesh.parent.position, mesh.parent.quaternion, mesh.parent.scale);
        let far = 0;
        for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(mat); let best = Infinity; for (const p of pts) best = Math.min(best, p.distanceTo(v)); if (best > 0.12) far++; }
        if (far) bad.push(`${far} of ${pa.count} vertices`);
      });
      assert.deepEqual(bad, [], `${kind}${live ? ' (narrowed)' : ''}: ${bad.join('; ')}`);
    }
  });
}
