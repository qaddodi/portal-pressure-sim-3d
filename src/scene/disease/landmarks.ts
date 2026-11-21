// The two lines the 2D figure draws on the body for the disease, not on an organ: the flank (the abdominal wall's outline, drawn only once ascites bulges it: stage-transitions.js
// drawAscites, `.flank`) and the navel's ring (anatomy.js umbilicus, `.org-umbilicus`), which shows only while the paraumbilical vein that runs to it is open (caput medusae:
// stage-diaphragm.js caputK, in quarters). Both are flat and sit behind the vessels: the flank behind the organs, the navel over them.
import { BufferGeometry, CircleGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { ABDOMEN_OUTLINES, UMBILICUS } from './copied/anatomy-b4.ts';
import { rawColor } from '../materials/cel.ts';
import { LOOKS, type LookId } from '../../looks/looks.ts';
import { UNITS_PER_SCENE, x3, y3 } from '../frame2d.ts';
import { outlinePolygon, bulgeStep, bellyZ } from './ascites.ts';
import { Eased, stepHeld } from './follow.ts';

const U = UNITS_PER_SCENE;
/** The flank's line (2D .flank: --organ-body-line, 1.4 wide, at .8) and the navel's (--text-3 at .7, 1.2 wide, filled with the stage's colour). */
export const FLANK_W = 1.4, FLANK_A = 0.8, NAVEL_W = 1.2, NAVEL_A = 0.7;
/** The plate's line colour in each look (tokens.css --organ-body-line). */
export const BODY_LINE: Record<LookId, string> = { light: '#CFC1AA', soft: '#B5A791', dark: '#3A3733', navy: '#2C3756', black: '#2A2A2E' };
/** The navel over the organs (organs reach 0.26 in front, the vessels start at 0.30). The flank has no depth constant of its own: it lies on the belly's plane with the pool (`bellyZ`, ascites.ts), and is kept behind the organs by draw order, not by depth. */
export const NAVEL_Z = 0.27;
/** Before the first organ's fill (order 0): the flank is behind every organ whatever the camera angle. */
export const FLANK_ORDER = -1;
const QUARTERS = [0, 0.25, 0.5, 0.75, 1];

/** The flank line for a bulge step: the wall's outline without its two top corners, in 2D units. */
export function flankPoints(step: number): [number, number][] { const p = outlinePolygon(ABDOMEN_OUTLINES[step]!); return p.slice(1, p.length - 1); }

/** A flat ribbon of the given half width along a polyline (2D units in, scene units out), at depth z. */
export function ribbon(pts: readonly (readonly [number, number])[], half: number, z: number): BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1, nx = -ty / l * half, ny = tx / l * half;
    pos.push(x3(pts[i]![0] + nx), y3(pts[i]![1] + ny), z, x3(pts[i]![0] - nx), y3(pts[i]![1] - ny), z);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const basic = (a: number, depthTest = true) => new MeshBasicMaterial({ transparent: true, opacity: a, depthWrite: false, depthTest });

export class Landmarks {
  readonly group = new Group();
  private flank = new Mesh(new BufferGeometry(), basic(FLANK_A, false));   // (drawn first, ignoring depth: behind every organ by draw order, whatever the camera angle)
  private navelFill = new Mesh(new CircleGeometry(UMBILICUS[2]! / U, 24), basic(1));
  private navelRing = new Mesh(new RingGeometry((UMBILICUS[2]! - NAVEL_W / 2) / U, (UMBILICUS[2]! + NAVEL_W / 2) / U, 32), basic(NAVEL_A));
  private step = -1;
  private caputHeld: number | null = null;
  private caput = new Eased(0, 0.3, 0.004);
  private fade = 1;
  /** the flank's shown share (0 or 1): it comes in with the first litres, as 2D (u >= 0.04 of 8.5 L) */
  private flankOn = false;
  constructor() {
    for (const m of [this.flank, this.navelFill, this.navelRing]) { m.renderOrder = 1; m.frustumCulled = false; m.visible = false; this.group.add(m); }
    this.flank.renderOrder = FLANK_ORDER;   // (before every organ's fill, which is also where the depth test put it when it sat at -0.4)
    this.flank.position.z = 0;
    for (const m of [this.navelFill, this.navelRing]) m.position.set(x3(UMBILICUS[0]!), y3(UMBILICUS[1]!), NAVEL_Z);
    this.navelRing.position.z = NAVEL_Z + 0.001; this.navelRing.renderOrder = 2;
  }
  applyLook(look: LookId): void {
    const l = LOOKS[look];
    (this.flank.material as MeshBasicMaterial).color = rawColor(BODY_LINE[look]);
    (this.navelFill.material as MeshBasicMaterial).color = rawColor(l.bg);
    (this.navelRing.material as MeshBasicMaterial).color = rawColor(l.text3);
  }
  /** The wall's outline follows the shown ascites volume (mL) in the 2D half-unit steps; it appears from 4% of 8.5 L. */
  setAscites(ml: number): void {
    const on = ml / 8500 >= 0.04, step = on ? bulgeStep(ml) : -1;
    this.flankOn = on;
    if (step !== this.step) {
      this.step = step;
      if (on) { const g = ribbon(flankPoints(step), FLANK_W / 2, bellyZ()); this.flank.geometry.dispose(); this.flank.geometry = g; }
    }
    this.sync();
  }
  /** The navel's ring: from the paraumbilical vein's recruitment (0 closed .. 1), held in steps of 5%, shown in quarters and eased (it never pops). True while it moves. */
  setCaput(recruit: number, dt: number, instant = false): boolean {
    const raw = Math.min(1, Math.max(0, (recruit - 0.15) / 0.3));
    this.caputHeld = stepHeld(this.caputHeld, raw, 0.05);
    const moving = this.caput.to(QUARTERS[Math.round(4 * this.caputHeld)]!, dt, instant);
    this.sync();
    return moving;
  }
  /** The whole body's dissolve (the dive, the Circuit): 1 whole. */
  setFade(f: number): void { this.fade = f; this.sync(); }
  private sync(): void {
    const f = this.fade;
    this.flank.visible = this.flankOn && f > 0.001;
    (this.flank.material as MeshBasicMaterial).opacity = FLANK_A * f;
    const a = this.caput.value * f;
    this.navelFill.visible = this.navelRing.visible = a > 0.003;
    (this.navelFill.material as MeshBasicMaterial).opacity = a;
    (this.navelRing.material as MeshBasicMaterial).opacity = NAVEL_A * a;
  }
  /** What is drawn, for the tests. */
  state(): { flank: boolean; step: number; navel: number } { return { flank: this.flank.visible, step: this.step, navel: this.navelRing.visible ? this.caput.value : 0 }; }
  dispose(): void { for (const m of [this.flank, this.navelFill, this.navelRing]) { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); } }
}
