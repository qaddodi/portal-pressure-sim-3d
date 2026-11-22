// Every slide's camera move, in every deck, is ONE path: the zoom goes one way (never in and back out), and every point of the figure travels a straight line on the screen (x and y never reverse). Root cause of the
// zigzag (22 Nov): the camera's distance is the farther of `r` and what the two half extents need, each blended on its own, so when the fitting axis changes between two slides (one frames the height, the next the
// width) it dipped mid-move: a zoom in and back out while the picture panned. The rig now glides the distance itself (rig.ts distNow). Node only, no browser: the rig is pure numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { stopsOf, viewAt } from '../src/ui/deck/presenter-machine.ts';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { SHOTS, type Shot, type ShotName } from '../src/scene/camera/shots.ts';

const DEVICES = [
  { name: 'Mac', w: 1440, h: 900, room: { x: 420, y: 0, w: 1020, h: 900 }, tucked: { x: 760, y: 0, w: 680, h: 900 } },
  { name: 'iPhone', w: 390, h: 844, room: { x: 0, y: 60, w: 390, h: 520 }, tucked: { x: 0, y: 60, w: 390, h: 380 } },
  { name: 'iPad', w: 1024, h: 768, room: { x: 0, y: 0, w: 1024, h: 768 }, tucked: { x: 340, y: 0, w: 684, h: 768 } },
] as const;
type Sh = ShotName | Shot;
const solid = (s: Sh): Shot => (typeof s === 'string' ? SHOTS[s] : s);

/** The body shots a talk shows, in order (every stop and every beat of it). */
function shotsOf(deck: Parameters<typeof stopsOf>[0]): Sh[] {
  const stops = stopsOf(deck), out: Sh[] = [];
  for (let i = 0; i < stops.length; i++) {
    for (let b = 0; b < 12; b++) {
      const v = viewAt(stops, { stop: i, beat: b });
      if (!v.scene?.view || v.scene.view === 'body') out.push(v.shot);
      const s = stops[i]!;
      if (s.kind !== 'slide' || b >= (s.slide.beats?.length ?? 0) + 1) break;
    }
  }
  return out;
}
const distOf = (rig: CameraRig) => { const c = rig.camera.position, t = rig.pose.shot.target; return Math.hypot(c.x - t[0], c.y - t[1], c.z - t[2]); };

/** Runs the camera from the frame it stands on until it lands; returns what went wrong: a zoom that turned round, a point that turned round on the screen. */
function reversals(rig: CameraRig, pts: Vector3[], from: number, ms: number, hook?: (t: number) => void): string[] {
  const bad: string[] = [];
  const last = pts.map((p) => rig.project(p)), dir = pts.map(() => [0, 0]);
  let lastD = distOf(rig), zd = 0;
  for (let t = from + 16; t <= from + ms + 200; t += 16) {
    hook?.(t);
    rig.update(t);
    pts.forEach((p, i) => {
      const a = rig.project(p);
      [a.x - last[i]!.x, a.y - last[i]!.y].forEach((d, ax) => {
        if (Math.abs(d) < 0.3) return;   // (sub-pixel: the end of an ease)
        if (dir[i]![ax] && Math.sign(d) !== dir[i]![ax]) bad.push(`point ${i} ${ax ? 'y' : 'x'} turned round at ${t - from} ms`);
        dir[i]![ax] = Math.sign(d);
      });
      last[i] = a;
    });
    const d = distOf(rig);
    if (Math.abs(d - lastD) > 1e-6 * d) { const sg = Math.sign(d - lastD); if (zd && sg !== zd) bad.push(`zoom turned round at ${t - from} ms`); zd = sg; }
    lastD = d;
  }
  return bad;
}

const decks = await Promise.all((UI.decks as readonly { id: string }[]).map(async (d) => [d.id, (await loadBuiltin(d.id))!] as const));

test('every slide to slide camera move, in every deck, on a Mac, an iPad and an iPhone, is one path: the zoom goes one way and every point travels straight', () => {
  let moves = 0;
  for (const dv of DEVICES) for (const [id, deck] of decks) {
    const shots = shotsOf(deck);
    for (let i = 1; i < shots.length; i++) {
      const A = shots[i - 1]!, B = shots[i]!;
      if (A === B) continue;
      const rig = new CameraRig(A, dv.room); rig.resize(dv.w, dv.h); rig.goTo(A, dv.room, 0); rig.update(0);
      const ms = rig.slideMs(B); rig.goTo(B, dv.room, 0, ms);
      const sa = solid(A), sb = solid(B);
      const pts = [new Vector3(...sa.target), new Vector3(...sb.target), new Vector3(sa.target[0] + 0.5, sa.target[1] - 0.4, 0)];
      const bad = reversals(rig, pts, 0, ms);
      assert.deepEqual(bad, [], `${dv.name} ${id} shot ${i - 1} to ${i}`);
      moves++;
    }
  }
  assert.ok(moves > 1000, `the sweep covered the decks (${moves} moves)`);
});

test('a card opening or closing in the middle of a slide move (the room changes) never turns the zoom round', () => {
  for (const dv of DEVICES) for (const [id, deck] of decks) {
    const shots = shotsOf(deck);
    for (let i = 1; i < shots.length; i++) {
      const A = shots[i - 1]!, B = shots[i]!;
      if (A === B) continue;
      for (const [r0, r1] of [[dv.room, dv.tucked], [dv.tucked, dv.room]] as const) {
        const rig = new CameraRig(A, r0); rig.resize(dv.w, dv.h); rig.goTo(A, r0, 0); rig.update(0);
        const ms = rig.slideMs(B); rig.goTo(B, r0, 0, ms);
        const bad = reversals(rig, [], 0, ms, (t) => { if (t >= ms * 0.3 && t < ms * 0.3 + 16) rig.setRoom(r1, t); });
        assert.deepEqual(bad, [], `${dv.name} ${id} shot ${i - 1} to ${i}, room ${r0 === dv.room ? 'closing in' : 'opening out'}`);
      }
    }
  }
});

test('a slide changed in the middle of a move starts from the distance the camera is at: no step in the zoom at the change', () => {
  for (const dv of DEVICES) for (const [id, deck] of decks) {
    const shots = shotsOf(deck);
    for (let i = 2; i < shots.length; i++) {
      const [A, B, C] = [shots[i - 2]!, shots[i - 1]!, shots[i]!];
      if (A === B || B === C) continue;
      const rig = new CameraRig(A, dv.room); rig.resize(dv.w, dv.h); rig.goTo(A, dv.room, 0); rig.update(0);
      const ms = rig.slideMs(B); rig.goTo(B, dv.room, 0, ms);
      let t = 16, prev = distOf(rig);
      for (; t < ms * 0.4; t += 16) { rig.update(t); prev = distOf(rig); }
      const before = prev;
      rig.goTo(C, dv.room, t, rig.slideMs(C));
      rig.update(t); const first = distOf(rig);
      assert.ok(Math.max(first / before, before / first) < 1.15, `${dv.name} ${id} ${i}: the zoom stepped ${(first / before).toFixed(3)}x at the change`);
    }
  }
});
