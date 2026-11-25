// A label controller on a real camera in node, with a hand on the picture (plan 27b replay and its tests): Healthy free play, the portal vein picked, the readings ticking,
// the orbit dragged as a hand does it. Records every crossing, every A→B→A within moveMs and the frames that show both pictures strongly.
import { SHOTS } from '../src/scene/camera/shots.ts';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { planLayout, BAR } from '../src/ui/layout/plan.ts';
import { LabelController, NO_STATE, GHOST, type LabelDeps } from '../src/scene/labels/controller.ts';
import { figureCourses } from '../src/scene/labels/stations.ts';
import { onLine } from '../src/scene/labels/solver.ts';
import { rectToBox } from '../src/scene/labels/geometry.ts';
import { FADE } from '../src/scene/labels/alpha.ts';

export const SCREENS = {
  mac: { w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  'iphone-portrait': { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } },
} as const;
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => [...t].reduce((w, c) => w + size * (c === '.' || c === '1' ? 0.3 : c === ' ' ? 0.25 : 0.56), 0) + track * t.length;

/** The camera's yaw (rad) and pitch (rad) at ms. */
export type Hand = (ms: number) => { yaw: number; pitch: number };
export const HANDS: Record<string, { hand: Hand; ms: number }> = {
  'orbit 0.3 rad in 0.6 s, then still': { ms: 5000, hand: (t) => ({ yaw: 0.3 * Math.min(1, t / 600), pitch: 0.1 * Math.sin(Math.min(1, t / 600) * Math.PI) }) },
  'orbit back': { ms: 5000, hand: (t) => ({ yaw: -0.3 * Math.min(1, t / 600), pitch: -0.1 * Math.sin(Math.min(1, t / 600) * Math.PI) }) },
  'slow drag 0.05 rad/s for 3 s': { ms: 6000, hand: (t) => ({ yaw: 0.05 * Math.min(3, t / 1000), pitch: 0 }) },
  // a flick: the speed decays as the gesture's momentum does (flick.ts decay 0.9955 per ms)
  'flick with momentum': { ms: 6000, hand: (t) => ({ yaw: Math.min(0.4, (0.0016 / 0.0045) * (1 - Math.pow(0.9955, t))), pitch: 0 }) },
};

export interface Report {
  crossings: { id: string; at: number; moving: boolean; from: string; to: string; /** the words changed, the spot did not (a reading's number) */ words: boolean; /** why the standing spot was no longer legal ('' when it still was) */ why: string }[];
  flipBacks: { id: string; at: number }[];
  bothFrames: Map<string, number>;
  /** frames in which the camera's own turn was still changing */
  movingFrames: number;
}

/** Why the box a label stood in (the ghost's) is not a legal spot now: off the view, or within the solver's air of another label's new box. */
function illegal(g: { x: number; y: number; w: number; h: number }, lines: readonly (readonly [number, number, number, number])[], others: readonly { id: string; x: number; y: number; w: number; h: number }[], vp: { w: number; h: number }): string {
  if (g.x < 8 || g.y < 8 + BAR || g.x + g.w > vp.w - 8 || g.y + g.h > vp.h - 8) return 'off the view';
  for (const o of others) if (g.x < o.x + o.w + 4 && g.x + g.w + 4 > o.x && g.y < o.y + o.h + 4 && g.y + g.h + 4 > o.y) return `overlaps ${o.id}`;
  const box = { x0: g.x, y0: g.y, x1: g.x + g.w, y1: g.y + g.h };
  for (const l of lines) if (onLine(l, box, 0)) return 'a vessel line under it';
  return '';
}

export function replay(screen: keyof typeof SCREENS, hand: Hand, ms: number): Report {
  const vp = SCREENS[screen];
  const plan = planLayout(vp, [], 'words');
  const rig = new CameraRig(SHOTS.free, plan.free); rig.resize(vp.w, vp.h); rig.freeGate = () => true; rig.update(0);
  let t = 1000, n = 0, turning = false;
  const deps: LabelDeps = {
    now: () => t, project: (p, o) => rig.project(p, o), cameraMoving: () => rig.isMoving,
    free: () => rectToBox(plan.free), view: () => ({ x0: vp.safe.left, y0: vp.safe.top + BAR, x1: vp.w - vp.safe.right, y1: vp.h - vp.safe.bottom }),
    vp: () => vp, reversed: () => false, words: () => null, blockers: () => [], measure,
    pressure: (id) => 12 + Math.sin(n / 3 + id.length * 1.7) * 2, reading: () => null,
    cathere: () => 0, drawn: () => true, level: () => 'all', zoom: () => 1, hand: () => rig.handView,
  };
  const linesNow = () => {
    const out: [number, number, number, number][] = [];
    for (const c of figureCourses()) { let prev: { x: number; y: number } | null = null; for (const q of c.pts) { const a = rig.project(q, { x: 0, y: 0 }); if (prev) out.push([prev.x, prev.y, a.x, a.y]); prev = a; } }
    return out;
  };
  const ctl = new LabelController(deps);
  ctl.setState({ ...NO_STATE, picked: 'PV_TRUNK_1' });
  const rep: Report = { crossings: [], flipBacks: [], bothFrames: new Map(), movingFrames: 0 };
  const stand = new Map<string, string>(), crossLog = new Map<string, { at: number; from: string }[]>(), ghosted = new Set<string>();
  const t0 = t;
  for (let i = 0; i < (ms + 1500) / 16.67; i++) {
    t += 16.67;
    const h = hand(Math.min(ms, t - t0 - 600));
    const a = rig.orbitAngle, p = rig.pitchAngle;
    if (t - t0 > 600) { rig.setOrbit(h.yaw); rig.setOrbitPitch(h.pitch); }
    // (the picture turns when the rig's angle changes: the hand's own yaw is not it past 70% of the limit, where the rig eases it into the soft stop, so a flick of 0.36 rad left the hand's yaw
    //  and the rig's apart for good and counted the picture as turning long after it had stopped)
    turning = Math.abs(rig.orbitAngle - a) > 1e-6 || Math.abs(rig.pitchAngle - p) > 1e-6;
    rig.update(t);
    if (turning) rep.movingFrames++;
    if (i % 6 === 0) { n++; ctl.markDirty(); }
    ctl.tick();
    const mainA = new Map<string, number>();
    for (const o of ctl.out) {
      const id = o.id.replace(GHOST, '');
      if (!o.ghost) {
        mainA.set(id, o.alpha * o.mix);
        const k = `${o.form}|${Math.round((o.x - 0) / 3)}|${Math.round(o.y / 3)}`;
        // a placement change measured against its dot: ride the camera, so compare to the box offset, not the screen
        stand.set(id, k);
      }
    }
    for (const o of ctl.out) if (o.ghost) {
      const id = o.id.replace(GHOST, '');
      if (o.alpha * o.mix > 0.3 && (mainA.get(id) ?? 0) > 0.3) rep.bothFrames.set(id, (rep.bothFrames.get(id) ?? 0) + 1);
      if (!ghosted.has(id)) {
        ghosted.add(id);
        const main = ctl.out.find((m) => m.id === id)!;
        const key = (d: { form: number; x: number; y: number }) => `${d.form}@${Math.round(d.x)},${Math.round(d.y)}`;
        const at = t - t0;
        rep.crossings.push({ id, at, moving: turning, from: key(o), to: key(main), words: Math.abs(o.x - main.x) <= 3 && Math.abs(o.y - main.y) <= 3 && o.form === main.form, why: illegal(o, linesNow(), ctl.out.filter((m) => !m.ghost && m.id !== id && m.alpha > 0), vp) });
        const moveWords = Math.abs(o.x - main.x) <= 3 && Math.abs(o.y - main.y) <= 3 && o.form === main.form;
        const log = crossLog.get(id) ?? []; log.push({ at, from: key(o) });
        const prev = log[log.length - 2];
        if (prev && !moveWords && at - prev.at <= FADE.moveMs * 2 && prev.from === key(main)) rep.flipBacks.push({ id, at });
        crossLog.set(id, log);
      }
    } 
    for (const id of [...ghosted]) if (!ctl.out.some((o) => o.ghost && o.id === id + GHOST)) ghosted.delete(id);
  }
  return rep;
}
