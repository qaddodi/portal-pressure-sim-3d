// Shared by tests/camera-every-slide*.test.ts.
// Every slide change, in every deck, is ONE camera move from the pose the camera stands in straight to the pose it lands on: frame by frame, the eye only ever gets closer to where it lands
// (no detour) and it never jumps (no snap). Driven through the calls the talk makes (scene-link.ts: showShot, showCircuit, and frameRoom's refit as the cards settle), on the real scene.
// Root cause of Circulation 4 to 5 (Mohammad, 25 Nov: "zooms out into the liver or something glitches for a bit THEN zooms into the lobule"): in a dive the rig read the camera's distance off the
// blended pose, the farther of its r, its extents and the points the body slide keeps in frame. Those points, judged from an aim already on its way to the lobule, pulled the camera back out for
// the first half of the dive; at the half the kept points became the lobule's (none) and the distance fell 30x in one frame. Ten dives in seven decks did it. A dive now glides its distance as
// every other move does (rig.ts distNow), and a refit in flight carries only the landing distance over the rest of the move (rig.ts zoomLate).
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, type PerspectiveCamera } from 'three';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { cathPlace, stopsOf, viewAt, type View } from '../src/ui/deck/presenter-machine.ts';
import { closeUpOf, tipCloseShot } from '../src/ui/deck/cath-shot.ts';
import { poseAt, targetT } from '../src/ui/deck/cath-clock.ts';
import { hvpgChase } from '../src/scene/camera/chase.ts';
import type { CathState } from '../src/decks/schema.ts';
import type { Room } from '../src/scene/camera/room.ts';

type Scene = {
  resize(w: number, h: number): void; update(now: number): boolean; microStep(): boolean; dispose(): void; buildMicroIdle(u?: boolean): void;
  diveHeld: boolean; rig: { isMoving: boolean; camera: PerspectiveCamera; pose: { shot: { target: number[] } } };
};
const { sceneApi, cel } = await import('../src/scene/api.ts');
export { sceneApi };
export const s = cel as unknown as Scene;
after(() => s.dispose());

export const DEVICES = [
  // (the room the slide's cards leave, another slide's (its cards are other sizes), and the first once its data card's height has landed a beat late)
  { name: 'Mac', w: 1440, h: 900, rooms: [{ x: 420, y: 60, w: 1000, h: 780 }, { x: 480, y: 60, w: 940, h: 780 }], late: 120 },
  { name: 'iPhone', w: 390, h: 844, rooms: [{ x: 0, y: 60, w: 390, h: 520 }, { x: 0, y: 60, w: 390, h: 470 }], late: 60 },
] as const;
const viewOf = (v: View): string => v.scene?.view ?? 'body';
/** The framing a slide asks for, as scene-link.ts sync() works it out: the catheter's tip close-up on a body slide that has the catheter at its tip, else the slide's own. */
export function wantOf(v: View, cath: CathState | null): View['shot'] {
  const close = viewOf(v) === 'body' && !v.slide?.visual ? closeUpOf(cath) : null;
  return (close ? tipCloseShot(close) : null) ?? v.shot;
}
/** What scene-link.ts sync() asks of the scene for a slide: the chase camera on while a body slide has the HVPG catheter out (its pose where the catheter stands), then the framing. */
export function show(v: View, room: Room, cath: CathState | null = null): void {
  const c = v.scene?.circuit, chase = viewOf(v) === 'body' && !v.slide?.visual && cath !== null;
  sceneApi.setChase(chase ? hvpgChase(poseAt(targetT(cath)).advance) : null);
  if (v.scene?.view === 'circuit') sceneApi.showCircuit(room, { box: c?.box ?? null, kMax: c?.kMax ?? null, resistors: [], caudate: !!c?.caudate });
  else { const want = wantOf(v, cath); sceneApi.showShot(viewOf(v) as 'body', want, room, want === v.shot); }
}
let t = 1000;  // (page time, ms: one clock for the file's frames)
export const frame = () => { t += 16; s.update(t); };
export const eye = () => s.rig.camera.position.clone();
const look = () => s.rig.camera.getWorldDirection(new Vector3());
const upOf = () => new Vector3(0, 1, 0).applyQuaternion(s.rig.camera.quaternion);
const aimDist = () => { const a = s.rig.pose.shot.target; return s.rig.camera.position.distanceTo(new Vector3(a[0], a[1], a[2])); };
export const busy = () => s.rig.isMoving || s.diveHeld;

/** Flies the move that was just asked for to its landing, frame by frame; `at` changes the room on given frames (a card settling). What went wrong, or nothing. */
export function fly(at: Map<number, Room> = new Map()): string[] {
  const eyes: Vector3[] = [eye()], zoom: number[] = [aimDist()], looks: Vector3[] = [look()], ups: Vector3[] = [upOf()];
  let from = 0;
  for (let k = 1; k < 400 && (busy() || k < 4); k++) {
    const r = at.get(k);
    if (r) { sceneApi.setRoom(r, undefined, false, true); from = k - 1; }   // (frameRoom: a talk's room change always refits)
    frame(); eyes.push(eye()); zoom.push(aimDist()); looks.push(look()); ups.push(upOf());
  }
  if (busy()) return ['never landed'];
  const end = eyes[eyes.length - 1]!, bad: string[] = [];
  // (the eye only closes on where it lands. A card that settles in flight can move the landing behind the eye (a smaller room lands farther out than the camera already is): then
  //  the eye may turn round once, smoothly, and from there only closes; never a second turn, a zig and a zag)
  for (let k = from + 1, last = eyes[from]!.distanceTo(end), turns = 0, out = false; k < eyes.length; k++) {
    const d = eyes[k]!.distanceTo(end), up = d > last * 1.002 + 1e-7;
    if (up && !out) turns++;
    if (up && (from === 0 || turns > 1)) { bad.push(`detour at frame ${k}: ${last.toExponential(3)} -> ${d.toExponential(3)} from the landing`); break; }
    if (d < last) out = false; else if (up) out = true;
    last = d;
  }
  // (the camera only turns toward the way it lands: the angle between where it looks and where it will look, and between its up and its landing up (a roll or a tilt), only shrink.
  //  A camera that swings to another angle and back, or rolls and unrolls, reads as a tilt even when the eye's path is straight: HVPG 4 to 5, 25 Nov)
  for (const [name, v] of [['look', looks], ['up', ups]] as const) {
    const endV = v[v.length - 1]!;
    for (let k = from + 1, last = v[from]!.angleTo(endV); k < v.length; k++) {
      const a = v[k]!.angleTo(endV);
      if (a > last + 2e-4) { bad.push(`${name === 'look' ? 'turned away' : 'rolled or tilted away'} at frame ${k}: ${((last * 180) / Math.PI).toFixed(2)} -> ${((a * 180) / Math.PI).toFixed(2)} degrees from the landing`); break; }
      last = a;
    }
  }
  // (no snap: no frame moves the zoom or the eye much more than the frame before did. A step must stand out against the move's own pace (a quarter of its largest step), so the
  //  quintic's start from rest, whose second frame is seven times its first, is no snap; the kept points' fall, 30x in one frame, and a zoom set off at full speed are)
  const zs = zoom.map((z, k) => (k ? Math.abs(Math.log(z / zoom[k - 1]!)) : 0)), es = eyes.map((e, k) => (k ? e.distanceTo(eyes[k - 1]!) : 0));
  const zMax = Math.max(...zs), eMax = Math.max(...es);
  for (let k = 2; k < eyes.length; k++) {
    if (zs[k]! > 4 * zs[k - 1]! + 0.25 * zMax + 1e-9) { bad.push(`zoom snap at frame ${k}: ${(zs[k]! * 100).toFixed(2)} % in a frame after ${(zs[k - 1]! * 100).toFixed(2)} %`); break; }
    if (es[k]! > 4 * es[k - 1]! + 0.25 * eMax + 1e-9) { bad.push(`eye snap at frame ${k}: ${es[k]!.toExponential(3)} after ${es[k - 1]!.toExponential(3)}`); break; }
  }
  return bad;
}

export const decks = await Promise.all((UI.decks as readonly { id: string }[]).map(async (d) => [d.id, (await loadBuiltin(d.id))!] as const));
/** Every framing a talk walks through, in order: each slide and each of its beats. */
export function walk(deck: Parameters<typeof stopsOf>[0]): { at: string; v: View; cath: CathState | null }[] {
  const stops = stopsOf(deck), out: { at: string; v: View; cath: CathState | null }[] = [];
  stops.forEach((st, i) => {
    if (st.kind === 'slide') for (let b = 0; b < st.beats; b++) out.push({ at: `${i}.${b}`, v: viewAt(stops, { stop: i, beat: b }), cath: cathPlace(stops, { stop: i, beat: b }) });
  });
  return out;
}


/** Flies every slide to slide move of every deck (each distinct one once) on a device; what went wrong, or nothing. */
export function everyMove(D: (typeof DEVICES)[number]): string[] {
  s.resize(D.w, D.h);
  while (!s.microStep()) { /* primed: no dive waits */ }
  const fails: string[] = [], seen = new Set<string>();
  let moves = 0, i = 0;
  // (where the camera stands: a move that starts where the last one landed needs no settling first, which halves the frames)
  let here: { view: string; shot: View['shot']; chase: boolean; room: Room } | null = null;
  for (const [id, deck] of decks) {
    const seq = walk(deck);
    for (let j = 1; j < seq.length; j++) {
      const a = seq[j - 1]!, b = seq[j]!;
      // (a move is what the camera is asked for: the view, the framing (a catheter's close-up or the slide's own) and whether the chase camera is on)
      const wa = wantOf(a.v, a.cath), wb = wantOf(b.v, b.cath), ca = a.cath !== null && viewOf(a.v) === 'body', cb = b.cath !== null && viewOf(b.v) === 'body';
      const key = JSON.stringify([viewOf(a.v), wa, ca, viewOf(b.v), wb, cb]);
      if (seen.has(key) || (wa === wb && viewOf(a.v) === viewOf(b.v) && ca === cb)) continue;
      seen.add(key);
      // (half the moves change room as they set off, as two slides' cards do, and have the data card's height land a beat late, early or near the landing)
      const settle = i++ % 2 === 1, at = here && here.view === viewOf(a.v) && here.shot === wa && here.chase === ca ? here.room : null;
      const r0: Room = at ?? D.rooms[settle ? 1 : 0], r1: Room = r0.w === D.rooms[0].w && r0.h === D.rooms[0].h ? D.rooms[1] : D.rooms[0];
      if (!at) { show(a.v, r0, a.cath); for (let k = 0; k < 400 && (busy() || k < 4); k++) frame(); }
      show(b.v, r1, b.cath);
      const lateRoom = { ...r1, h: r1.h - D.late }, late = settle ? new Map([[[6, 30, 70][i % 3]!, lateRoom]]) : undefined;
      const bad = fly(late);
      here = { view: viewOf(b.v), shot: wb, chase: cb, room: late ? lateRoom : r1 };
      moves++;
      if (bad.length) fails.push(`${id} ${a.at} -> ${b.at} (${viewOf(a.v)} -> ${viewOf(b.v)}${late ? ', a card settled in flight' : ''}): ${bad.join('; ')}`);
    }
  }
  assert.ok(moves > 150, `the walk found the talks' moves (${moves})`);
  return fails;
}
