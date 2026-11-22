// A label controller on a real camera in node, free play, with the pressures ticking (plan 27 replay and its test).
import { SHOTS } from '../src/scene/camera/shots.ts';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { planLayout, BAR } from '../src/ui/layout/plan.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';
import { rectToBox } from '../src/scene/labels/geometry.ts';

export const SCREENS = {
  mac: { w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  'iphone-portrait': { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } },
} as const;
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => [...t].reduce((w, c) => w + size * (c === '.' || c === '1' ? 0.3 : c === ' ' ? 0.25 : 0.56), 0) + track * t.length;

/** Runs `seconds` of model time at 60 fps; every 100 ms the pressures drift by 0.1 (so every readout's width and words change). Returns the flips of each label. */
export function replay(screen: keyof typeof SCREENS, seconds: number): { flips: Map<string, number>; ghostFrames: Map<string, number> } {
  const vp = SCREENS[screen];
  const plan = planLayout(vp, [], 'words');
  const rig = new CameraRig(SHOTS.free, plan.free); rig.resize(vp.w, vp.h); rig.update(0);
  let t = 1000, n = 0;
  const deps: LabelDeps = {
    now: () => t, project: (p, o) => rig.project(p, o), cameraMoving: () => false,
    free: () => rectToBox(plan.free), view: () => ({ x0: vp.safe.left, y0: vp.safe.top + BAR, x1: vp.w - vp.safe.right, y1: vp.h - vp.safe.bottom }),
    vp: () => vp, reversed: () => false, words: () => null, blockers: () => [], measure,
    pressure: (id) => 12 + Math.sin(n / 3 + id.length * 1.7) * Number(process.env.AMP ?? 0.9) * 6, reading: () => null,
    cathere: () => 0, drawn: () => true, level: () => 'all', zoom: () => (process.env.ZOOM ? Number(process.env.ZOOM) : 1),
  };
  const ctl = new LabelController(deps);
  ctl.setState({ ...NO_STATE });
  const last = new Map<string, string>(), flips = new Map<string, number>(), ghostFrames = new Map<string, number>();
  for (let i = 0; i < seconds * 60; i++) {
    t += 16.67; if (i % 6 === 0) { n++; ctl.markDirty(); }
    ctl.tick(); if ((i === 100 || i === 500) && process.env.DBG) console.log(i, ctl.out.map((o) => o.id + ':' + o.word + ' ' + o.value + '@' + Math.round(o.x) + ',' + Math.round(o.y)).join(' | '));
    for (const o of ctl.out) {
      if (o.ghost) { ghostFrames.set(o.id.replace('~old', ''), (ghostFrames.get(o.id.replace('~old', '')) ?? 0) + 1); continue; }
      const k = `${o.form}|${Math.round(o.x / 4)}|${Math.round(o.y / 4)}`;
      if (last.has(o.id) && last.get(o.id) !== k) flips.set(o.id, (flips.get(o.id) ?? 0) + 1);
      last.set(o.id, k);
    }
  }
  return { flips, ghostFrames };
}
