// The general rule for every reading card on the figure (the catheter's FHVP and WHVP, the HVPG stack, the EUS-PPG's PV, HV and their calculation): a card is PINNED to the point it names. On every frame it is
// drawn, it stands where its point is now (plus the fixed offset it was placed at), or it is easing out; it is never a picture of a screen the camera has left.
// Mohammad, 25 Nov: "9 to 10 the EUS-PPG calculation with leaders and labels is stuck while we zoom. Same for early HVPG." Root cause: the cards' wants (`CathShow.want`) were only replaced by a solve, and a solve
// waits for the picture to rest, which a camera glide (the zoom into the lobule, a slide's shot) never gives. When the source of the cards ended (the slide moved on, the run ended) the point they named went
// (`cur.tip` null), `away()` read 0 for a point that is not there, the old wants were still wanted, and after the 240 ms fade-out they faded back in at their last SCREEN place, frozen while the anatomy moved.
// Fixed twice, at the root: the controller drops the wants the frame their source is gone (`CathShow.clear`), and a card whose point has no place on the screen is never drawn (`CathShow.anchored`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { LabelController, NO_STATE, type LabelDeps, type LabelState } from '../src/scene/labels/controller.ts';
import type { ProcCards } from '../src/scene/labels/store.ts';

const SCREENS = { phone: { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } }, mac: { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } } } as const;
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;

/** A figure with a camera that can zoom smoothly about the screen's middle (the dive's zoom in, a slide's shot) and a pair of points the cards name. */
function world(screen: keyof typeof SCREENS, state: (on: boolean) => Partial<LabelState>) {
  const vp = SCREENS[screen], room = { x: 0, y: 0, w: vp.w, h: vp.h };
  const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0);
  let t = 1000, zoom = 1, present = true, moving = false;
  const tip = new Vector3(0.02, 0.02, 0), ahead = new Vector3(0.1, 0.12, 0), cx = vp.w / 2, cy = vp.h / 2;
  const project = (p: Vector3, o: { x: number; y: number }) => { rig.project(p, o); o.x = cx + (o.x - cx) * zoom; o.y = cy + (o.y - cy) * zoom; return o; };
  const d = {
    now: () => t, project, cameraMoving: () => moving,
    free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null,
    blockers: () => [], measure, pressure: () => 5, reading: () => 5.2, level: () => 'all', anatomy: () => true,
    cathere: (a: Vector3, b: Vector3) => { if (!present) return 0; a.copy(tip); b.copy(ahead); return 2; },
  } as unknown as LabelDeps;
  const proc: ProcCards = {
    kinds: ['s'], sig: 'eus', kickers: { f: 'HV', w: 'PV', h: 'EUS-PPG' }, tones: { f: 'free', w: 'pv' }, mid: true, text: { f: '5.4', w: '20.3', h: '14.9', hv: 14.9 },
    points: (a, b) => { a.copy(tip); b.copy(ahead); return true; },
  };
  const ctl = new LabelController(d);
  const step = (ms: number, each?: () => void) => { for (let i = 0; i < ms / 16; i++) { t += 16; each?.(); ctl.tick(); } };
  return {
    ctl, step, tipPx: () => project(tip, { x: 0, y: 0 }),
    set: (on: boolean) => ctl.setState({ ...NO_STATE, ...state(on) }),
    zoomBy: (frames: number, per = 0.03) => { moving = true; for (let i = 0; i < frames; i++) { zoom += per; step(16); } },
    still: () => { moving = false; },
    proc, gone: () => { present = false; },
  };
}

const DRAWN = 0.02;
const visible = (w: ReturnType<typeof world>): boolean => w.ctl.cath.pills.some((p) => p.alpha > DRAWN) || (!!w.ctl.cath.sum && w.ctl.cath.sum.alpha > DRAWN);

for (const screen of ['phone', 'mac'] as const) {
  test(`${screen}: the HVPG's cards leave with their catheter state while the camera zooms, and stay gone (never back at their last screen place)`, () => {
    const w = world(screen, (on) => ({ cath: on ? 'wedge' : null }));
    w.set(true); w.step(2500);
    assert.equal(w.ctl.cath.pills.length, 2, 'standing');
    w.set(false); w.gone();
    let late = 0;
    w.zoomBy(90);
    for (let i = 0; i < 90; i++) { w.zoomBy(1); if (i > 25 && visible(w)) late++; }
    assert.equal(late, 0, 'no card is drawn once its fade-out has run');
  });

  test(`${screen}: the EUS-PPG's calculation (the stack with its leaders) leaves with its run while the camera zooms, and stays gone`, () => {
    const w = world(screen, () => ({}));
    w.ctl.setState({ ...NO_STATE, proc: w.proc });
    w.step(3000);
    assert.ok(w.ctl.cath.sum && w.ctl.cath.sum.alpha === 1, 'standing');
    w.ctl.setState({ ...NO_STATE, proc: null }); w.gone();
    let late = 0;
    for (let i = 0; i < 180; i++) { w.zoomBy(1); if (i > 25 && visible(w)) late++; }
    assert.equal(late, 0, 'the stack is not drawn after its fade-out');
  });

  test(`${screen}: a card that is drawn stands at its point's own place, whatever the zoom does to the picture`, () => {
    const w = world(screen, () => ({ cath: 'wedge' }));
    w.set(true); w.step(2500);
    const first = w.ctl.cath.pills.find((p) => p.id === 'f')!, off = { x: first.x - w.tipPx().x, y: first.y - w.tipPx().y };
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      w.zoomBy(1, 0.004);
      const p = w.ctl.cath.pills.find((q) => q.id === 'f');
      if (!p || p.alpha < 1) continue;
      seen++;
      const a = w.tipPx();
      assert.ok(Math.abs(p.x - a.x - off.x) < 1.5 && Math.abs(p.y - a.y - off.y) < 1.5, `frame ${i}: the card is ${(p.x - a.x - off.x).toFixed(1)}, ${(p.y - a.y - off.y).toFixed(1)} px off its point`);
      assert.ok(Math.abs(p.to[0] - a.x) < 1e-6 && Math.abs(p.to[1] - a.y) < 1e-6, 'its leader ends on the point');
    }
    assert.ok(seen > 20, 'it stood for the zoom (not hidden)');
  });
}
