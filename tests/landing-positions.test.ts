// WHERE each collateral, shunt, stent, strand and the caput fan opens and closes on its host (owner, 21 Nov 2026: "does this also check WHERE shunts and collaterals open and close? especially for shunts").
// For every end the 2D app's own anchor (its course's end point, and the whole vein it lies on, found in 2D's own courses) is read from the copied 2D data (paths.copied.ts EDGE_PATH_2D, data.copied.ts CIRCUIT_D, the
// custom shunts' stations NODE_CIRCUIT through the copied router) and the 3D end is measured against it: the HOST (the whole vein, its pieces chained), the place along the host as a share u (measured between the
// host's own first and last 2D points, so a carried-on start does not move it), the SIDE of the host (the sign of the cross product of the host's heading and the offset, in the figure's plane: the normal is z),
// and the distance from the axis in host radii. Tolerances: u 0.03, across 1 host radius (or the end's own radius where that is the wider against a thin host), same side (where both stand off the axis), and the 3D end stands within SEWN_TOL_R radii of the host axis in 3D (depth included),
// so it never floats off it. The table is printed. A departure from 2D that the owner asked for is named in DELIBERATE, with its reason, and is checked to still be what it says. Node only; PPS_2D_REPO pins the copy to 2D.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { JUNCTION_PIECES } from '../src/engine/hales/portal/topology.js';
import { NETWORK, NETWORK_BY_ID, jointPath2D, type NetVessel } from '../src/scene/vessels/network.ts';
import { isPermanent } from '../src/scene/vessels/skin/inventory.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SEWN_TOL_R } from '../src/scene/vessels/shunt-ends.ts';
import { EDGE_PATH_2D, NODE_POS_2D } from '../src/scene/vessels/paths.copied.ts';
import { FEEDERS_2D } from '../src/scene/vessels/coil.copied.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';
import { CIRCUIT_D, CIRCUIT_TREES, CUSTOM_EDGES, NODE_CIRCUIT, ROUTER_STATIONS, VB_CIRC } from '../src/scene/circuit/data.copied.ts';
import { COURSES, mapCourse } from '../src/scene/circuit/course.ts';
import { courseOf } from '../src/scene/circuit/paths.ts';
import { sceneToMap } from '../src/scene/circuit/map.ts';
import { circuitWidthMap } from '../src/scene/circuit/width.ts';
import { createRouter } from '../src/scene/circuit/router.copied.js';

const TOL_U = 0.03, TOL_R = 1;
type P3 = readonly [number, number, number];
type P2 = readonly [number, number];

// ---- the measure: host, share along it, side, distance from the axis in radii ----
interface Land { d: number; dxy: number; arc: number; side: number; at: P2 }
/** The nearest place on a polyline (in the figure's plane, with depth when `z` is on): the arc length to it from the polyline's start, the side (sign of heading x offset: + is the heading's left, the viewer's, with y up). */
function nearest(p: readonly number[], poly: readonly (readonly number[])[], z: boolean): Land {
  let best: Land = { d: Infinity, dxy: Infinity, arc: 0, side: 0, at: [0, 0] }, run = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!, b = poly[i]!, ab = [b[0]! - a[0]!, b[1]! - a[1]!, z ? (b[2] ?? 0) - (a[2] ?? 0) : 0], ap = [p[0]! - a[0]!, p[1]! - a[1]!, z ? (p[2] ?? 0) - (a[2] ?? 0) : 0];
    const l2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2, t = l2 > 0 ? Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / l2)) : 0;
    const q = [a[0]! + t * (b[0]! - a[0]!), a[1]! + t * (b[1]! - a[1]!), (a[2] ?? 0) + t * ((b[2] ?? 0) - (a[2] ?? 0))];
    const d = Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, z ? (p[2] ?? 0) - q[2]! : 0), seg = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
    if (d < best.d - 1e-12) best = { d, dxy: Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!), arc: run + t * seg, side: Math.sign((b[0]! - a[0]!) * (p[1]! - a[1]!) - (b[1]! - a[1]!) * (p[0]! - a[0]!)), at: [q[0]!, q[1]!] };
    run += seg;
  }
  return best;
}
const lengthXY = (poly: readonly (readonly number[])[]): number => { let l = 0; for (let i = 1; i < poly.length; i++) l += Math.hypot(poly[i]![0]! - poly[i - 1]![0]!, poly[i]![1]! - poly[i - 1]![1]!); return l; };
const chain = (parts: readonly (readonly (readonly number[])[])[]): number[][] => {
  const out: number[][] = [];
  for (const p of parts) for (const q of p) { const l = out[out.length - 1]; if (l && Math.hypot(l[0]! - q[0]!, l[1]! - q[1]!) < 1e-9) continue; out.push([...q]); }
  return out;
};

/** A whole host in both worlds: its pieces chained, in the figure's units (scene units for the body, map units for the map), and its radius. */
interface Host { id: string; pts2: number[][]; pts3: number[][]; r: number }
interface Landing { host: string; u: number; side: number; dR: number; dR3: number; lim: number; acc: number }

/** The landing of a point on a host: the 2D end against the 2D host, the 3D end against the 3D host. u is read on the 3D host between the places its own 2D first and last points project to. */
function landings(p2: readonly number[], p3: readonly number[], hosts: readonly Host[], reach: number, guestR = 0): { two: Landing[]; three: Landing[] } {
  const two: Landing[] = [], three: Landing[] = [];
  for (const h of hosts) {
    // (an end is on its host while its tube touches the host's: within SEWN_TOL_R of the host's radii, or within the two radii together where the guest is the wider tube against a thin host)
    const lim = Math.max(reach, 1 + guestR / h.r), a = nearest(p2, h.pts2, false), L2 = lengthXY(h.pts2);
    if (a.d <= lim * h.r) two.push({ host: h.id, u: a.arc / L2, side: a.side, dR: a.d / h.r, dR3: a.d / h.r, lim, acc: Math.max(TOL_R, guestR / h.r) });
    const b = nearest(p3, h.pts3, true), s0 = nearest(h.pts2[0]!, h.pts3, false).arc, s1 = nearest(h.pts2[h.pts2.length - 1]!, h.pts3, false).arc;
    if (b.d <= lim * h.r) three.push({ host: h.id, u: (b.arc - s0) / Math.max(1e-9, s1 - s0), side: b.side, dR: b.dxy / h.r, dR3: b.d / h.r, lim, acc: Math.max(TOL_R, guestR / h.r) });
  }
  return { two, three };
}

// ---- the Anatomy's hosts: every permanent vessel's whole vein ----
function anatomyHosts(): Host[] {
  const whole = new Map<string, NetVessel[]>();
  for (const v of NETWORK) if (isPermanent(v)) (whole.get(v.host) ?? whole.set(v.host, []).get(v.host)!).push(v);
  const out: Host[] = [];
  for (const [id, parts] of whole) {
    const order = (JUNCTION_PIECES as Record<string, string[] | undefined>)[id];
    if (order) parts.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    out.push({ id, r: Math.max(...parts.map((p) => p.radius)), pts2: chain(parts.map((p) => EDGE_PATH_2D[p.id]!.map(([x, y]) => [x3(x), y3(y), 0]))), pts3: chain(parts.map((p) => coursesOf(p, REST)[0]!.pts as number[][])) });
  }
  return out;
}

/** The ends the owner asked to depart from 2D, with the reason (checked: the 3D end really is where the reason says, and a host landing named here is the one it lands on). `free` is an end that is on no host in 2D. */
const DELIBERATE: Readonly<Record<string, { reason: string; lands?: string }>> = {
  'C3:0': { reason: 'the paraumbilical vein leaves the left portal vein forward off its wall, 30 units in (starts.ts leaveVein), where 2D starts it on the vein end', lands: 'PVH_L' },
  'C4:1': { reason: 'the rectal varices run on down the rectum (starts.ts END_ON, owner 20 Nov: "rectal varices should reach more"); a free end in 2D and in 3D' },
  'C9:1': { reason: 'the ascending lumbar vein runs on up to the azygos node (starts.ts END_ON, owner 20 Nov), where 2D ends it on the azygos trunk strand that 3D does not draw', lands: 'AZY_SVC' },
};

const rows: string[] = [];
const fmt = (l: Landing | undefined): string => (l ? `${l.host.padEnd(9)} u${l.u.toFixed(3)} ${l.side > 0 ? '+' : l.side < 0 ? '-' : '0'} ${l.dR.toFixed(2)}R` : 'free'.padEnd(9));
const sideOf = (l: Landing): number => (l.dR > 0.15 ? l.side : 0);

/** Compares one end: every host the 2D end lies within reach of must be one the 3D end lies within reach of, at the same u, on the same side and the same distance across; the 3D end lies on no other. */
function compare(label: string, two: Landing[], three: Landing[], failures: string[], exception?: { reason: string; lands?: string }): void {
  const best = (l: Landing[]) => l.slice().sort((a, b) => a.dR - b.dR)[0];
  rows.push(`${label.padEnd(14)} 2D ${fmt(best(two))} | 3D ${fmt(best(three))}${exception ? '  [named: ' + exception.reason.slice(0, 40) + '...]' : ''}`);
  if (exception) {
    if (exception.lands) assert.ok(three.some((l) => l.host === exception.lands && l.dR3 <= l.lim), `${label}: the named end no longer lands on ${exception.lands}: ${fmt(best(three))}`);
    else assert.equal(three.length, 0, `${label}: the named end was free and lands on ${fmt(best(three))}`);
    return;
  }
  // (at a node several pieces of a vein meet on one point, and the smoothing of a run-on moves a piece's own end a few units: the end must be on the closest of them, any one of those that tie)
  const near = Math.min(...two.map((l) => l.dR)), required = two.filter((l) => l.dR <= near + 0.05);
  const issues = (a: Landing, b: Landing): string[] => {
    const o: string[] = [];
    if (Math.abs(a.u - b.u) > TOL_U) o.push(`${label}: on ${a.host} 2D u ${a.u.toFixed(3)}, 3D u ${b.u.toFixed(3)}`);
    if (Math.abs(a.dR - b.dR) > b.acc) o.push(`${label}: on ${a.host} 2D ${a.dR.toFixed(2)}R off the axis, 3D ${b.dR.toFixed(2)}R`);
    if (sideOf(a) && sideOf(b) && sideOf(a) !== sideOf(b)) o.push(`${label}: on ${a.host} 2D side ${a.side}, 3D side ${b.side}`);
    if (b.dR3 > b.lim) o.push(`${label}: on ${a.host} the 3D end floats ${b.dR3.toFixed(2)}R off the axis (depth included)`);
    return o;
  };
  if (required.length) {
    const found = required.map((a) => ({ a, b: three.find((l) => l.host === a.host) })).filter((x): x is { a: Landing; b: Landing } => !!x.b);
    if (!found.length) failures.push(`${label}: 2D lands on ${required.map(fmt).join(' / ')}; in 3D the end is not on it (${fmt(best(three))}, 3D distance incl. depth ${best(three)?.dR3.toFixed(2) ?? '-'}R)`);
    else { const all = found.map((x) => issues(x.a, x.b)); if (all.every((l) => l.length)) failures.push(...all.reduce((m, l) => (l.length < m.length ? l : m))); }
  } else if (three.some((l) => l.dR <= 0.5)) failures.push(`${label}: 2D's end is free, 3D's lies on ${fmt(best(three))}`);
  for (const b of three) if (b.dR <= 0.5 && two.length && !two.some((l) => l.host === b.host)) failures.push(`${label}: the 3D end lies on ${fmt(b)}, which 2D's does not`);
}

test('the copied 2D anchors are 2D\'s own (run with PPS_2D_REPO set to a 2D checkout at the pin)', { skip: !process.env.PPS_2D_REPO || !existsSync(`${process.env.PPS_2D_REPO}/src/ui/anatomy.js`) }, async () => {
  const two = await import(pathToFileURL(`${process.env.PPS_2D_REPO}/src/ui/anatomy.js`).href);
  const num = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  for (const [id, d] of Object.entries(two.EDGE_PATH as Record<string, string>)) {
    const n = num(d), mine = EDGE_PATH_2D[id];
    if (!mine) continue;
    assert.ok(Math.hypot(mine[0]![0] - n[0]!, mine[0]![1] - n[1]!) < 0.6 && Math.hypot(mine[mine.length - 1]![0] - n[n.length - 2]!, mine[mine.length - 1]![1] - n[n.length - 1]!) < 0.6, `${id}: the copied course's ends are not 2D's EDGE_PATH ends`);
  }
  for (const [id, [a]] of Object.entries(two.NODE_POS as Record<string, [number[], number[]]>)) assert.deepEqual([...(NODE_POS_2D[id] ?? [])], a, `${id}: NODE_POS`);
  for (const [id, d] of Object.entries(two.CIRCUIT_PATH as Record<string, string>)) if (CIRCUIT_D[id]) assert.equal(CIRCUIT_D[id], d, `${id}: CIRCUIT_PATH`);
  for (const [id, [, c]] of Object.entries(two.NODE_POS as Record<string, [number[], number[]]>)) assert.deepEqual([...(NODE_CIRCUIT[id] ?? [])], c, `${id}: NODE_POS circuit`);
});

test('Anatomy: every collateral, shunt and stent end opens and closes where 2D puts it, on the same host, share, side and distance across', () => {
  setSmoothJoins(true);
  const hosts = anatomyHosts(), failures: string[] = [];
  let checked = 0;
  // at rest and fully open (the collaterals coiled as far as they go, the strands spread, the varices beaded and banded): the ends hold where they are, the coil tapers to nothing at them
  for (const [name, state] of [['rest', REST], ['open', { ...REST, wig: 5, spr: 1, rec: 1, bead: 0.35, bands: 4 }]] as const) for (const v of NETWORK) {
    if (isPermanent(v) || v.feeder) continue;
    if (name === 'open') rows.push('-- open --');
    const raw = EDGE_PATH_2D[v.id], courses = coursesOf(v, state), main = courses[0]!.pts as P3[];
    assert.ok(raw && main, `${v.id}: no course`);
    for (const end of [0, 1] as const) {
      const r = raw[end ? raw.length - 1 : 0]!, p2 = [x3(r[0]), y3(r[1]), 0], p3 = main[end ? main.length - 1 : 0]!;
      const { two, three } = landings(p2, p3, hosts, SEWN_TOL_R, v.radius);
      compare(`${v.id}:${end}`, two, three, failures, DELIBERATE[`${v.id}:${end}`]);
      checked++;
      // the strands (a braided collateral's channels) leave and rejoin the trunk: their ends are the trunk's end, so they open and close where it does
      for (let k = 1; k < courses.length; k++) {
        const s = courses[k]!.pts as P3[], q = s[end ? s.length - 1 : 0]!;
        if (Math.hypot(q[0] - p3[0], q[1] - p3[1]) > 0.004 || Math.abs(q[2] - p3[2]) > 0.03) failures.push(`${v.id} strand ${k} end ${end} is ${(Math.hypot(q[0] - p3[0], q[1] - p3[1]) * 300).toFixed(1)} units from the trunk's end`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 80, `${checked} ends checked`);
  console.log(rows.join('\n'));
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('Anatomy: the caput fan and the liver branches\' tributaries end on their host where 2D puts them', () => {
  setSmoothJoins(true);
  const failures: string[] = [], lines: string[] = [];
  let checked = 0;
  for (const v of NETWORK) {
    if (!v.feeder) continue;
    const host = NETWORK_BY_ID.get(v.feeder.host);
    if (!host) { failures.push(`${v.id}: its host ${v.feeder.host} is not in the network`); continue; }
    const plan = v.plan as { kind: 'feeder'; list: readonly { pts: readonly (readonly [number, number])[] }[] };
    const host2 = jointPath2D(host.id).map(([x, y]) => [x3(x), y3(y), 0]), host3 = coursesOf(host, REST)[0]!.pts as number[][], r = host.radius;
    const cs = coursesOf(v, REST);
    assert.equal(cs.length, plan.list.length, `${v.id}: a course for each tributary`);
    let on2 = 0, on3 = 0, off = 0;
    plan.list.forEach((f, i) => {
      for (const end of [0, 1] as const) {
        const a = f.pts[end ? f.pts.length - 1 : 0]!, p2 = [x3(a[0]), y3(a[1]), 0], b = cs[i]!.pts[end ? cs[i]!.pts.length - 1 : 0]!;
        // (host radius against the tributary end: the fan ends within the host's own width in 2D)
        const n2 = nearest(p2, host2, false), n3 = nearest(b as number[], host3, true);
        checked++;
        if (n2.d <= SEWN_TOL_R * r) {
          on2++;
          if (n3.d <= SEWN_TOL_R * r) on3++;
          else { off++; if (off <= 3) failures.push(`${v.id} tributary ${i} end ${end}: 2D ${(n2.d / r).toFixed(2)}R from ${host.id}'s axis, 3D ${(n3.d / r).toFixed(2)}R (xy ${(n3.dxy / r).toFixed(2)}R)`); }
        }
      }
    });
    lines.push(`${v.id.padEnd(16)} host ${host.id.padEnd(9)} ends on the host in 2D ${on2}, in 3D ${on3}`);
    if (off > 3) failures.push(`${v.id}: ${off} tributary ends in all stand off ${host.id}`);
  }
  assert.ok(checked > 0 && FEEDERS_2D.C3);
  console.log(lines.join('\n'));
  assert.deepEqual(failures, [], failures.join('\n'));
});

// ---- the Circuit's map ----
const mapR = (v: NetVessel): number => 0.5 * circuitWidthMap(v.widthKind, v.baseD, 1, v.circFine ?? 1);

function mapHosts(): Host[] {
  const whole = new Map<string, NetVessel[]>();
  for (const v of NETWORK) if (isPermanent(v) && CIRCUIT_D[v.id]) (whole.get(v.host) ?? whole.set(v.host, []).get(v.host)!).push(v);
  const out: Host[] = [];
  for (const [id, parts] of whole) {
    const order = (JUNCTION_PIECES as Record<string, string[] | undefined>)[id];
    if (order) parts.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const raw = chain(parts.map((p) => courseOf(CIRCUIT_D[p.id]!))), mine = chain(parts.map((p) => mapCourse(p.id)!));
    out.push({ id, r: Math.max(...parts.map(mapR)), pts2: raw, pts3: mine });
  }
  return out;
}

test('Circuit: every collateral, shunt and stent end on the map lands where 2D\'s circuit puts it (host, share, side, distance across)', () => {
  rows.length = 0;
  const hosts = mapHosts(), failures: string[] = [];
  let checked = 0;
  for (const v of NETWORK) {
    if (isPermanent(v) || v.feeder || !CIRCUIT_D[v.id]) continue;
    const raw = courseOf(CIRCUIT_D[v.id]!), c = COURSES.get(v.id);
    assert.ok(c, `${v.id}: no map course`);
    const dense = c!.C;   // the morph's own map samples: where the tube's ends stand at the map
    for (const end of [0, 1] as const) {
      const r = raw[end ? raw.length - 1 : 0]!, q = dense[end ? dense.length - 1 : 0]!, m = sceneToMap(q.x, q.y);
      const { two, three } = landings([r[0], r[1]], [m[0], m[1], 0], hosts, SEWN_TOL_R);
      compare(`map ${v.id}:${end}`, two, three, failures);
      checked++;
    }
  }
  assert.ok(checked >= 30, `${checked} map ends checked`);
  console.log(rows.join('\n'));
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('Circuit: every custom shunt the router makes opens and closes at its two stations, on the host that lies there', () => {
  rows.length = 0;
  const hosts = mapHosts(), failures: string[] = [];
  const lines: [number, number][][] = Object.values(CIRCUIT_D).map((d) => courseOf(d));
  for (const list of Object.values(CIRCUIT_TREES)) for (const b of list) lines.push(courseOf(b.d));
  let checked = 0;
  for (const [id, from, to] of CUSTOM_EDGES) {
    const a = NODE_CIRCUIT[from], b = NODE_CIRCUIT[to];
    assert.ok(a && b, `${id}: stations ${from}, ${to}`);
    const router = createRouter({ lines, stations: ROUTER_STATIONS.map((p) => [p[0], p[1]]), bounds: [VB_CIRC[0], 100, VB_CIRC[0] + VB_CIRC[2], VB_CIRC[1] + VB_CIRC[3] + 10] });
    const pts = router.route([a[0], a[1]], [b[0], b[1]]) as [number, number][] | null;
    if (!pts) { failures.push(`${id}: the router finds no course`); continue; }
    const mine = [pts[0]!, pts[pts.length - 1]!], want = [a, b];
    for (const end of [0, 1] as const) {
      if (Math.hypot(mine[end]![0] - want[end]![0], mine[end]![1] - want[end]![1]) > 0.5) failures.push(`${id} end ${end}: the routed course ends ${mine[end]} not at station ${want[end]}`);
      // 2D's own anchor is the station itself (stage-geo.js routeCustomShunts: NODE_POS[e.from][1])
      const { two, three } = landings([want[end]![0], want[end]![1]], [mine[end]![0], mine[end]![1], 0], hosts, SEWN_TOL_R);
      compare(`map ${id}:${end}`, two, three, failures);
      checked++;
    }
  }
  assert.ok(checked >= 40, `${checked} custom ends checked`);
  console.log(rows.join('\n'));
  assert.deepEqual(failures, [], failures.join('\n'));
});
