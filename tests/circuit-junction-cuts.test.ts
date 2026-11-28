// The Circuit's map cuts each vein at the engine's junction table and lands every collateral, shunt and tributary there (Brief C of docs/real-junctions, 27 Nov 2026).
// The root cause it pins: where a vessel meets another was written twice, once in the engine's JUNCTIONS and once, piece by piece, in the copied 2D courses, so a new row had no map course.
// The general rule: the map is a pure function of the table (junction-cuts.ts cutMap), so (1) every host's whole map course is what the copy draws, only cut; (2) every row has its junction
// on the host, every piece of every host has a course, in the table's order; (3) every joiner's end lies at its junction (within a host's width on the morph's own samples); (4) a junction the 2D
// drawing placed keeps its place (nothing moves when the pin does); (5) a row added to the table, on a whole vein or on a divided one, still builds and its pieces have a course.
// Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { JUNCTIONS, JUNCTION_PIECES } from '../src/engine/hales/portal/topology.js';
import { CIRCUIT_D, JUNCTION_CIRCUIT } from '../src/scene/circuit/data.copied.ts';
import { CIRCUIT_COURSE_D, MAP_JUNCTIONS, SAME, cornersOf, cutMap, reEnd, rowOf } from '../src/scene/circuit/junction-cuts.ts';
import { route } from '../src/scene/circuit/router.copied.js';
import { COURSES } from '../src/scene/circuit/course.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { courseOf, cumulative } from '../src/scene/circuit/paths.ts';
import { sceneToMap } from '../src/scene/circuit/map.ts';
import { circuitWidthMap } from '../src/scene/circuit/width.ts';

type P = readonly [number, number];
const dist = (a: P, b: P): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const rows = (JUNCTIONS as readonly (readonly unknown[])[]).map(rowOf);
const pieces = JUNCTION_PIECES as Record<string, string[]>;
function offLine(p: P, line: readonly P[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!, dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, u = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
    best = Math.min(best, Math.hypot(a[0] + dx * u - p[0], a[1] + dy * u - p[1]));
  }
  return best;
}
/** The pieces of a host that have a course, chained end to end. */
function chain(d: Readonly<Record<string, string>>, ids: readonly string[]): P[] {
  const out: P[] = [];
  for (const id of ids) {
    if (!d[id]) continue;
    const c = courseOf(d[id]!);
    out.push(...(out.length ? c.slice(1) : c));
  }
  return out;
}
const lineLen = (l: readonly P[]): number => cumulative(l).total;

test('every host\'s whole map course is the copy\'s, only cut: the pieces chain end to end, in the table\'s order', () => {
  assert.ok(Object.keys(pieces).length >= 9, 'the table divides at least the nine veins it did');
  for (const [host, ids] of Object.entries(pieces)) {
    for (const id of ids) assert.ok(CIRCUIT_COURSE_D[id], `${host}: piece ${id} has a map course`);
    for (let i = 1; i < ids.length; i++) {
      const a = courseOf(CIRCUIT_COURSE_D[ids[i - 1]!]!), b = courseOf(CIRCUIT_COURSE_D[ids[i]!]!);
      assert.ok(dist(a[a.length - 1]!, b[0]!) < 1e-3, `${host}: ${ids[i - 1]} ends where ${ids[i]} starts`);
      assert.ok(lineLen(a) > 1 && lineLen(b) > 1, `${host}: no piece is empty`);
    }
    // (the copy's own pieces of this host, joined, are the same line the cuts make: nothing of the vein moves, only where it is cut)
    const was = chain(CIRCUIT_D, ids), now = chain(CIRCUIT_COURSE_D, ids);
    assert.ok(Math.abs(lineLen(was) - lineLen(now)) < 0.01, `${host}: the whole course keeps its length (${lineLen(was)} vs ${lineLen(now)})`);
    for (const p of was) assert.ok(offLine(p, now) < 0.01, `${host}: a point of the copy's course (${p}) is off the cut one`);
    for (const p of now) assert.ok(offLine(p, was) < 0.01, `${host}: a point of the cut course (${p}) is off the copy's`);
  }
});

test('every row of the table has its junction on its host, in the table\'s order, and the 2D drawing\'s own place stands where there is one', () => {
  for (const r of rows) {
    const j = MAP_JUNCTIONS.get(r.node);
    assert.ok(j, `${r.node}: a junction on the map`);
    const whole = chain(CIRCUIT_COURSE_D, pieces[r.host]!);
    assert.ok(offLine(j!.at, whole) < 0.01, `${r.node}: its map point is on ${r.host}`);
    assert.ok(j!.share > 0 && j!.share < 1, `${r.node}: part-way along ${r.host}`);
    const own = JUNCTION_CIRCUIT[r.node];
    if (own) assert.ok(j!.own && dist(j!.at, own) < 0.01, `${r.node}: 2D's own place kept (${own})`);
    else assert.ok(!j!.own && Math.abs(j!.share - r.at) < 1e-6, `${r.node}: no 2D place, so the table's share ${r.at}`);
  }
  for (const [host, ids] of Object.entries(pieces)) {
    const shares = rows.filter((r) => r.host === host).sort((a, b) => a.at - b.at).map((r) => MAP_JUNCTIONS.get(r.node)!.share);
    assert.equal(shares.length, ids.length - 1, `${host}: a cut for each junction`);
    assert.deepEqual(shares.slice().sort((a, b) => a - b), shares, `${host}: cuts rise along the vein`);
  }
});

test('every collateral, shunt and tributary end on the map lies at its junction, along its host, within one host width', () => {
  let checked = 0, onMorph = 0;
  for (const r of rows) {
    const j = MAP_JUNCTIONS.get(r.node)!;
    const host = NETWORK_BY_ID.get(pieces[r.host]![0]!)!;
    const width = circuitWidthMap(host.widthKind, host.baseD, 1, host.circFine ?? 1);
    for (const [edge, end] of r.joiners) {
      const own = courseOf(CIRCUIT_COURSE_D[edge]!), e = end === 'to' ? own[own.length - 1]! : own[0]!;
      assert.ok(dist(e, j.at) <= SAME, `${edge}:${end}: the lane's own end is ${dist(e, j.at).toFixed(2)} units from ${r.node}`);
      // (the morph's samples: where the tube's end stands on the map, in map units; a lane the figure does not draw as a vessel has none)
      const c = COURSES.get(edge);
      if (c) {
        const q = end === 'to' ? c.C[c.C.length - 1]! : c.C[0]!, m = sceneToMap(q.x, q.y);
        assert.ok(dist([m[0], m[1]], j.at) <= width, `${edge}:${end}: the tube's end is ${dist([m[0], m[1]], j.at).toFixed(1)} units from ${r.node} (one host width is ${width.toFixed(1)})`);
        assert.ok(offLine([m[0], m[1]], chain(CIRCUIT_COURSE_D, pieces[r.host]!)) <= width, `${edge}:${end}: the tube's end lies along ${r.host}`);
        onMorph++;
      }
      checked++;
    }
  }
  assert.ok(checked >= 11 && onMorph >= 8, `${checked} joiner ends checked, ${onMorph} on the morph's samples`);
});

test('a junction the 2D drawing placed does not move its lanes: only the ends the table moves are carried', () => {
  // (a lane with a joiner end at a junction the 2D drawing never had is carried at that end, so its course is not the copy's: the check is of the lanes whose every junction the drawing placed)
  const carried = new Set(rows.filter((r) => !MAP_JUNCTIONS.get(r.node)!.own).flatMap((r) => r.joiners.map(([e]) => e)));
  for (const r of rows) {
    const j = MAP_JUNCTIONS.get(r.node)!;
    for (const [edge] of r.joiners) {
      if (!j.own || !CIRCUIT_D[edge] || carried.has(edge)) continue;
      const was = courseOf(CIRCUIT_D[edge]!), now = courseOf(CIRCUIT_COURSE_D[edge]!);
      assert.ok(was.every((p) => offLine(p, now) < 0.01) && now.every((p) => offLine(p, was) < 0.01), `${edge}: unmoved at ${r.node}`);
    }
  }
});

test('a row added to the table, on a whole vein or on a divided one, still builds and its pieces have a course', () => {
  // a whole vein gains its first junction
  const plain = cutMap({
    rows: [...JUNCTIONS, ['X_NEW', 'IVCS_RA', 0.5, 'extra', [['C9', 'to']]]], pieces: { ...JUNCTION_PIECES, IVCS_RA: ['IVCS_RA', 'IVCS_RA_1'] }, d: CIRCUIT_D, own: JUNCTION_CIRCUIT,
  });
  const a = courseOf(plain.d.IVCS_RA!), b = courseOf(plain.d.IVCS_RA_1!), copy = courseOf(CIRCUIT_D.IVCS_RA!);
  assert.ok(a.length >= 2 && b.length >= 2 && dist(a[a.length - 1]!, b[0]!) < 1e-3, 'both pieces have a course and meet');
  assert.ok(Math.abs(lineLen(a) + lineLen(b) - lineLen(copy)) < 0.01, 'the vein keeps its length');
  assert.ok(Math.abs(lineLen(a) / (lineLen(a) + lineLen(b)) - 0.5) < 1e-3, 'cut at the table\'s share');
  const j = plain.junctions.get('X_NEW')!, c9 = courseOf(plain.d.C9!);
  assert.ok(!j.own && dist(c9[c9.length - 1]!, j.at) <= SAME, 'the joiner ends at the new junction');
  // a divided vein gains another cut, before its others
  const ids = ['PVH_R', 'PVH_R_1', 'PVH_R_2', 'PVH_R_3'];
  const more = cutMap({ rows: [...JUNCTIONS, ['X_TWO', 'PVH_R', 0.05, 'extra', [['C3', 'from']]]], pieces: { ...JUNCTION_PIECES, PVH_R: ids }, d: CIRCUIT_D, own: JUNCTION_CIRCUIT });
  for (const id of ids) assert.ok(more.d[id] && courseOf(more.d[id]!).length >= 2, `${id} has a course`);
  const c3 = courseOf(more.d.C3!);
  assert.ok(dist(c3[0]!, more.junctions.get('X_TWO')!.at) <= SAME, 'the new joiner starts at its junction');
  // a vein with no map course is refused loudly, and so is a table whose pieces do not match its rows
  assert.throws(() => cutMap({ rows: [['X', 'NO_SUCH', 0.5, '', []]], pieces: { NO_SUCH: ['NO_SUCH', 'NO_SUCH_1'] }, d: {}, own: {} }), /no circuit course for NO_SUCH/);
  assert.throws(() => cutMap({ rows: [['X', 'IVCS_RA', 0.5, '', []]], pieces: { IVCS_RA: ['IVCS_RA'] }, d: CIRCUIT_D, own: {} }), /rows but pieces/);
});

test('re-ending a lane keeps its other corners, lands on the point, and never runs a lane over another', () => {
  // the 2D router's text is its corners and one reach: reading it back and writing it again changes nothing
  for (const id of ['TIPS', 'DIPS', 'C3', 'REX', 'S_PC', 'S_MC', 'C6', 'S_DSR', 'C7', 'EPI_SVC', 'AP_L', 'LGV_CONF']) {
    const { pts, r } = cornersOf(CIRCUIT_D[id]!), a = courseOf(route(pts, r)), b = courseOf(CIRCUIT_D[id]!);
    assert.ok(a.every((p) => offLine(p, b) < 0.01) && b.every((p) => offLine(p, a) < 0.01), `${id}: corners and reach rewrite the lane exactly`);
  }
  const lane: [number, number][] = [[200, 261], [200, 510], [930, 510], [960, 540]];
  const slid = reEnd(lane.slice().reverse(), [167, 261], 16, []);
  assert.deepEqual(slid[slid.length - 1], [167, 261]);
  assert.deepEqual(slid[0], [960, 540], 'the far end stays');
  // another lane stands 3 units from the slide's run: the ramp is taken instead, so the two never run on top of each other
  const other: [number, number][] = [[170, 300], [170, 554]];
  const ramp = reEnd(lane.slice().reverse(), [167, 261], 16, [other]);
  const flat = courseOf(route(ramp, 16));
  const sample = flat.filter((p) => p[1] > 310 && p[1] < 540);
  assert.ok(sample.every((p) => Math.abs(p[0] - 170) > 5), 'the re-ended lane keeps clear of the lane beside it');
});

test('nothing but the map\'s own module reads the copied courses: a lane\'s course comes from the table-cut one', () => {
  const bad: string[] = [];
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir)) {
      const p = `${dir}/${f}`;
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|js|mjs)$/.test(f) || f === 'data.copied.ts' || f === 'junction-cuts.ts') continue;
      if (/\bCIRCUIT_D\b/.test(readFileSync(p, 'utf8'))) bad.push(p);
    }
  };
  walk('src');
  assert.deepEqual(bad, [], `these read the copy's courses (CIRCUIT_D) instead of CIRCUIT_COURSE_D: ${bad.join(', ')}`);
});
