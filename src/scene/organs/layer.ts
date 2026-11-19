// The organs of the figure (heart, right atrium, liver, spleen, stomach with the oesophagus, left kidney, small bowel, colon) and what the patient's disease does to them,
// as the 2D figure does it (stage-diaphragm.js updateOrgans): the liver's shape (cirrhosis) and dusk (congestion), a scale of the spleen with the model's size, a ghost of
// a removed spleen, the grey of a lens other than Pressure, blood in the stomach. Meshes come from meshes.ts (the organs thread) in the shared frame; this file never
// builds one. Everything moves on the clock: `update(now)` returns true while something eases, and nothing is touched when nothing moves.
import { type BufferGeometry, Group, Vector3 } from 'three';
import { ORGAN_MESHES } from './meshes.ts';
import { CelObject, type CelShared, rawColor } from '../materials/cel.ts';
import { type Palette, type ToneKey } from '../palette.ts';
import { LIVER_PIVOT, SPLEEN_CENTER, LENS_GREY } from '../disease/copied/anatomy-b4.ts';
import { liverShrink, liverSurface } from '../disease/copied/liver-morph.js';
import { Eased, LiverFollow } from '../disease/follow.ts';
import { type BodyTargets, SPLENIC_GHOST } from '../disease/targets.ts';
import { PLAIN, type OrganState, organColour, organInk, rgbOf, type RGB } from './organ-look.ts';
import { LiverShape } from './liver-shape.ts';
import { x3, y3 } from '../frame2d.ts';

/** The tone each 2D organ takes (looks.ts has a token for the five; the kidney and the atrium take the spleen's and the heart's) and the ink's width on a Mac or iPad. */
export const ORGAN_STYLE: Record<string, { tone: ToneKey; px: number }> = {
  heart: { tone: 'heart', px: 1.5 }, 'heart-ra': { tone: 'heart', px: 1.5 }, liver: { tone: 'liver', px: 1.8 }, spleen: { tone: 'spleen', px: 1.8 },
  stomach: { tone: 'stomach', px: 1.5 }, duodenum: { tone: 'stomach', px: 1.4 }, 'kidney-l': { tone: 'spleen', px: 1.5 }, bowel: { tone: 'gut', px: 1.4 }, colon: { tone: 'gut', px: 1.5 },
};

const pivot = (c: readonly [number, number]) => new Vector3(x3(c[0]), y3(c[1]), 0);

export class OrganLayer {
  readonly group = new Group();
  readonly objects: CelObject[] = [];
  readonly byId = new Map<string, CelObject>();
  private palette: Palette | null = null;
  private phone = false;
  private grey = false;
  private body: BodyTargets | null = null;
  private readonly liverFollow = new LiverFollow();
  private readonly spleenScale = new Eased(1, 0.25);
  private readonly ghost = new Eased(1, 0.24);
  private readonly dimmed = new Eased(1, 0.42);
  private readonly sat = new Eased(1, 0.42);
  private readonly blood = new Eased(0, 0.6);
  private liverShape: LiverShape | null = null;
  private liverGeometry: BufferGeometry | null = null;
  private lastClock = -1;
  private dirtyColours = true;
  private instant = true;

  constructor(shared: CelShared, meshes: Record<string, () => BufferGeometry> = ORGAN_MESHES) {
    for (const [id, make] of Object.entries(meshes)) {
      const st = ORGAN_STYLE[id];
      if (!st) continue;
      const g = make();
      const o = new CelObject(g, { tone: st.tone, bands: 3, spec: 0, px: st.px }, shared);
      this.objects.push(o); this.byId.set(id, o); this.group.add(o.group);
      if (id === 'liver') {
        this.liverGeometry = g;
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        this.liverShape = new LiverShape(g.getAttribute('position') as never, g.getAttribute('normal').array);
      }
    }
  }

  applyLook(p: Palette): void { this.palette = p; this.dirtyColours = true; }
  setPhone(phone: boolean): void { this.phone = phone; for (const o of this.objects) o.setPhone(phone); }
  /** A lens other than Pressure greys the organs (organ-dim.js: saturation 0.12, opacity 0.72) and eases in 420 ms (D_SURFACE). */
  setLensGrey(on: boolean): void { this.grey = on; }
  /** The patient's disease for the next frames. `instant` takes it at once (a new patient, the first frame: nothing eases across a jump). */
  setBody(t: BodyTargets, instant = false): void { this.body = t; if (instant) this.instant = true; }

  /** Steps everything; true while something moves (draw another frame). */
  update(now: number): boolean {
    const dt = this.lastClock < 0 ? 0.016 : Math.min(0.1, (now - this.lastClock) / 1000);
    this.lastClock = now;
    const t = this.body;
    if (!t) { if (this.dirtyColours) { this.paint(); this.dirtyColours = false; } return false; }
    const inst = this.instant; this.instant = false;
    let moving = false;
    moving = this.liverFollow.follow(t, dt, inst) || moving;
    const ls = this.liverFollow.shown;
    const liver = this.byId.get('liver');
    if (liver) {
      if (this.liverShape?.apply(ls.cirrhosis)) { this.liverGeometry!.computeVertexNormals(); this.dirtyColours = true; }
      const s = liverShrink(ls.cirrhosis, ls.congestion);   // the figure's own, on the shown values
      const pv = pivot(LIVER_PIVOT);
      liver.group.scale.setScalar(s); liver.group.position.set(pv.x * (1 - s), pv.y * (1 - s), 0);
      this.dirtyColours = true;
    }
    const sp = this.byId.get('spleen');
    if (sp) {
      moving = this.spleenScale.to(t.spleenScale, dt, inst) || moving;
      const s = this.spleenScale.value, pv = pivot(SPLEEN_CENTER);
      sp.group.scale.setScalar(s); sp.group.position.set(pv.x * (1 - s), pv.y * (1 - s), 0);
      moving = this.ghost.to(t.splenicRx === 2 ? SPLENIC_GHOST : 1, dt, inst) || moving;
    }
    moving = this.dimmed.to(this.grey ? LENS_GREY.dim : 1, dt, inst) || moving;
    moving = this.sat.to(this.grey ? LENS_GREY.sat : 1, dt, inst) || moving;
    moving = this.blood.to(t.bleed.active ? Math.min(1, Math.max(0.12, Math.sqrt(t.bleed.total / 1500))) : 0, dt, inst) || moving;
    if (moving || this.dirtyColours) { this.paint(); this.dirtyColours = false; }
    return moving;
  }

  private paint(): boolean {
    const p = this.palette;
    if (!p) return false;
    const plate = rgbOf(p.body), ink = rgbOf(p.ink), dark = p.highlight === 'white';
    const k = { plate, dark, bleed: rgbOf(dark ? '#8E1A20' : '#8E1A20') };
    for (const [id, o] of this.byId) {
      const s: OrganState = { ...PLAIN, sat: this.sat.value, dim: this.dimmed.value };
      if (id === 'liver') { const ls = this.liverFollow.shown; s.congestion = ls.congestion; s.tint = ls.tint; s.cirrhosisNod = liverSurface(ls.cirrhosis).nod; }
      if (id === 'spleen') s.ghost = this.ghost.value;
      if (id === 'stomach') s.blood = this.blood.value;
      const base = rgbOf(p.tones[o.tone]);
      const c = organColour(base, s, k), ik = organInk(ink, s, k);
      this.setColours(o, c, ik, p.shade);
    }
    return false;
  }

  private setColours(o: CelObject, c: RGB, ink: RGB, shade: number): void {
    const u = o.toon.uniforms, col = u.color!.value as ReturnType<typeof rawColor>, sh = u.shade!.value as ReturnType<typeof rawColor>;
    col.setRGB(c[0], c[1], c[2]);
    sh.setRGB(c[0] * shade * 0.92 + ink[0] * 0.08, c[1] * shade * 0.92 + ink[1] * 0.08, c[2] * shade * 0.92 + ink[2] * 0.08);
    (o.ink.uniforms.color!.value as typeof col).setRGB(ink[0], ink[1], ink[2]);
  }

  /** The gut floats up on ascites: the bowel moves up by `units` of the 2D figure (drawAscites: -bulge / 34 * 26). */
  setBowelLift(units: number): void { const b = this.byId.get('bowel'); if (b) b.group.position.y = units / 300; }

  /** The 2D organs this layer draws, for the parity table. */
  get ids(): string[] { return [...this.byId.keys()]; }

  dispose(): void { for (const o of this.objects) o.dispose(); }
}
