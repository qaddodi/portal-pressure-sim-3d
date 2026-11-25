// A name never stands on vessels (owner, 25 Nov). On the phone with every drawn vessel known the near ring still took a spot over the lines at 8 a line, whatever their number: "Right hepatic vein"
// stood over 113 line pieces of the hepatic vein knot, strokes ran through "SMV", "Lower IVC" and the hepatic artery. Now a name nobody asked for (`offVessels`) has no spot with a line under it; one
// with no clear spot gives way (it fades out as names do), and a lower ranked name gives way for it first when that lets it in. The real controller and solver, no DOM, no three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { LabelController, NO_STATE, REST_PX, type LabelDeps } from '../src/scene/labels/controller.ts';
import { solve, onLine, type Item, type Line } from '../src/scene/labels/solver.ts';
import { offsetOf } from '../src/scene/labels/geometry.ts';
import { roomWith } from '../src/ui/tests/place.ts';
import { freeRoom, layoutClass } from '../src/ui/shell/room.ts';
import { NEEDS_C3_IDS } from '../src/scene/vessels/network.ts';
import { replay, HANDS } from './helpers-label-replay.ts';

const atRest = (v: { id: string; kind: string }) => v.kind !== 'collateral' && v.kind !== 'shunt' && !(NEEDS_C3_IDS as ReadonlySet<string>).has(v.id);
const SCREENS = [
  ['phone 375', { w: 375, h: 812, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, true],
  ['phone 393', { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } }, true],
  ['ipad', { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } }, true],
  ['mac', { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, false],
] as const;
// (the test's type, and a wider one: the names a figure gives way grow with the words' width)
const TYPES = [['type', 0.56], ['wide type', 0.66]] as const;
// The names each screen may leave out at most, in each type (25 Nov: the 375 px phone leaves out "IVC" in the test's type; both phones leave out "Right sinusoids" in the wide type, which is
// 173 px wide with no short form and has no clear spot anywhere along its vessel there)
const MOST_LEFT_OUT: Record<string, readonly [number, number]> = { 'phone 375': [1, 1], 'phone 393': [0, 1], ipad: [0, 0], mac: [0, 0] };

function anatomy(vp: (typeof SCREENS)[number][1], thumb: boolean, k: number) {
  const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * k + track * t.length;
  const room = roomWith(freeRoom(vp, layoutClass(thumb)), null);
  const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0);
  let t = 1000;
  const deps = { now: () => t, project: (p: Vector3, o: { x: number; y: number }) => rig.project(p, o), cameraMoving: () => rig.isMoving, free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null, blockers: () => [], measure, pressure: () => 5, reading: () => null, cathere: () => 0, level: () => 'all', drawn: atRest } as unknown as LabelDeps;
  const ctl = new LabelController(deps); ctl.setState({ ...NO_STATE, organNames: true });
  for (let i = 0; i < 120; i++) { t += 16; ctl.tick(); }
  return ctl;
}

test('on a phone, an iPad and a Mac, in two widths of type, no name nobody asked for stands on a drawn vessel, and only a few give way', () => {
  const counts: string[] = [];
  for (const [name, vp, thumb] of SCREENS) for (const [ti, [tname, k]] of TYPES.entries()) {
    const ctl = anatomy(vp, thumb, k), input = ctl.solvedFrom!, lines = input.lines ?? [];
    const res = solve(input);
    const byId = new Map(input.items.map((i) => [i.id, i]));
    for (const p of res.placed) {
      const it = byId.get(p.id)!;
      if (!it.offVessels || it.region) continue;
      const box = { x0: it.ax + p.dx, y0: it.ay + p.dy, x1: it.ax + p.dx + p.w, y1: it.ay + p.dy + p.h };
      assert.ok(!lines.some((l) => onLine(l, box, 0)), `${name}, ${tname}: ${p.id} stands on a vessel`);
    }
    const out = res.dropped.filter((id) => byId.get(id)!.offVessels);
    counts.push(`${name} ${tname}: ${out.join(',') || 'none'}`);
    assert.ok(out.length <= MOST_LEFT_OUT[name]![ti]!, `${name}, ${tname}: ${out.join(', ')} gave way`);
    // what the controller shows is that solve
    assert.deepEqual([...ctl.dropped].sort(), [...res.dropped].sort());
  }
  console.info(counts.join('\n'));
});

test('a name that gives way is the lowest ranked that could: no lower ranked name that stands would have let it in by giving way itself', () => {
  for (const [name, vp, thumb] of SCREENS) for (const [tname, k] of TYPES) {
    const input = anatomy(vp, thumb, k).solvedFrom!;
    const base = solve(input);
    for (const d of base.dropped) {
      const di = input.items.find((i) => i.id === d)!;
      for (const p of base.placed) {
        const pi = input.items.find((i) => i.id === p.id)!;
        const above = (!!pi.must && !di.must) || (!!pi.must === !!di.must && (pi.pri > di.pri || (pi.pri === di.pri && pi.id < di.id)));
        if (above) continue;
        const r = solve({ ...input, items: input.items.filter((i) => i.id !== p.id) });
        const lets = r.placed.some((x) => x.id === d) && base.placed.every((x) => x.id === p.id || r.placed.some((y) => y.id === x.id));
        assert.ok(!lets, `${name}, ${tname}: ${p.id} (rank ${pi.pri}) stands where its giving way would have let ${d} (rank ${di.pri}) in`);
      }
    }
  }
});

// ── the solver's rules, on a made-up figure ──
// Horizontal vessel lines every 10 px over a 400 px square, with a hole east of the dot at (200, 200): the only clear place for a name there.
const HOLE = { x0: 205, x1: 290 };
const field = (): Line[] => {
  const out: Line[] = [];
  for (let y = 0; y <= 400; y += 10) { if (y >= 180 && y <= 220) { out.push([0, y, HOLE.x0, y], [HOLE.x1, y, 400, y]); } else out.push([0, y, 400, y]); }
  return out;
};
const VIEW = { x0: 0, y0: 0, x1: 400, y1: 400 };
const name = (id: string, ax: number, ay: number, pri: number, extra: Partial<Item> = {}): Item => ({ id, ax, ay, au: 0.5, forms: [{ text: id, w: 60, h: 16 }], pri, ...extra });

test('a name nobody asked for never takes a spot with a vessel line under it, near or far: with no clear spot it gives way; a name asked for still stands', () => {
  const full: Line[] = []; for (let y = 0; y <= 400; y += 10) full.push([0, y, 400, y]);
  const off = solve({ items: [name('A', 200, 200, 5, { offVessels: true })], view: VIEW, blockers: [], lines: full });
  assert.deepEqual(off.placed, []); assert.deepEqual(off.dropped, ['A']);
  const asked = solve({ items: [name('A', 200, 200, 5, { must: true })], view: VIEW, blockers: [], lines: full });
  assert.equal(asked.placed.length, 1, 'a name a slide names keeps its place');
  const holed = solve({ items: [name('A', 200, 200, 5, { offVessels: true })], view: VIEW, blockers: [], lines: field() });
  assert.equal(holed.placed.length, 1, 'it takes the clear place');
  const p = holed.placed[0]!, box = { x0: 200 + p.dx, y0: 200 + p.dy, x1: 200 + p.dx + p.w, y1: 200 + p.dy + p.h };
  assert.ok(!field().some((l) => onLine(l, box, 0)));
});

test('a lower ranked name whose dot holds the only clear place of a higher one gives way for it; a higher ranked one does not', () => {
  // B's dot stands in the hole; B itself may stand on the lines (asked for by nobody, but not kept off them), so it is placed, and its dot kept A out
  const run = (bPri: number) => solve({ items: [name('A', 200, 200, 5, { offVessels: true }), name('B', 240, 200, bPri)], view: VIEW, blockers: [], lines: field(), stay: 60 });
  const low = run(1);
  assert.deepEqual(low.placed.map((p) => p.id), ['A'], 'the lower ranked name gives way');
  assert.deepEqual(low.dropped, ['B']);
  const high = run(9);
  assert.deepEqual(high.placed.map((p) => p.id), ['B']);
  assert.deepEqual(high.dropped, ['A'], 'a higher ranked one keeps its place');
  // (while the picture moves nobody is pushed off: the yield waits for the rest solve)
  const moving = solve({ items: [name('A', 200, 200, 5, { offVessels: true }), name('B', 240, 200, 1)], view: VIEW, blockers: [], lines: field(), stay: Infinity });
  assert.deepEqual(moving.dropped, ['A']);
});

test('an organ\'s anchor is no dot: a station\'s name may stand over the middle of an organ', () => {
  const r = solve({ items: [name('A', 200, 200, 5, { offVessels: true }), name('organ:x', 240, 200, 2, { region: true })], view: VIEW, blockers: [], lines: field() });
  assert.ok(r.placed.some((p) => p.id === 'A'), `${JSON.stringify(r)}`);
});

test('while the picture moves a name keeps a spot it stands at by the last resort for as long as that is legal; at rest it takes the better one (Mac slow drag: the portal confluence hopped between two legal spots)', () => {
  // a vertical vessel 30 px west of the dot: a spot 58 px west hangs from a leader across it (legal only as a must label's last resort); the east is clear
  const lines: Line[] = [[170, 0, 170, 400]];
  const f = { text: 'C', w: 60, h: 16 }, [dx, dy] = offsetOf('W', f.w, f.h, 58);
  const was = { form: 0, dx, dy };
  const it = (): Item => ({ id: 'C', ax: 200, ay: 200, au: 0.5, forms: [f], pri: 10, must: true, was });
  const moving = solve({ items: [it()], view: VIEW, blockers: [], lines, leaderLineCost: 30, stay: Infinity });
  assert.deepEqual([moving.placed[0]!.dx, moving.placed[0]!.dy], [dx, dy], 'kept while turning');
  const still = solve({ items: [it()], view: VIEW, blockers: [], lines, leaderLineCost: 30, stay: 60 });
  assert.ok(still.placed[0]!.dx > 0, 'at rest it goes east, clear of the vessel and its leader');
});

test('a label\'s standing spot is judged where it stands, not at the search spot a few px off it', () => {
  // the search's east spot is at gap 12; the label stands 5 px further out, where a line grazes the search spot's box but not its own
  const f = { text: 'D', w: 60, h: 16 }, [dx, dy] = offsetOf('E', f.w, f.h, 12);
  const was = { form: 0, dx: dx + 5, dy };
  const lines: Line[] = [[200 + dx + 2, 0, 200 + dx + 2, 400]];
  const r = solve({ items: [{ id: 'D', ax: 200, ay: 200, au: 0.5, forms: [f], pri: 5, offVessels: true, was }], view: VIEW, blockers: [], lines, stay: Infinity });
  assert.equal(r.placed.length, 1);
  assert.deepEqual([r.placed[0]!.dx, r.placed[0]!.dy], [was.dx, was.dy]);
});

test('the picture is at rest only when its dots have stopped: a flick\'s slow tail is still moving, and the replay counts the turn by the rig\'s angle, which stops', () => {
  assert.ok(REST_PX <= 1e-5);
  const r = replay('mac', HANDS['flick with momentum']!.hand, HANDS['flick with momentum']!.ms);
  const frames = Math.ceil((HANDS['flick with momentum']!.ms + 1500) / 16.67);
  assert.ok(r.movingFrames > 0 && r.movingFrames < frames - 60, `the replay counted ${r.movingFrames} of ${frames} frames as turning`);
});
