// The organs of the figure (heart, right atrium, liver, spleen, stomach with the oesophagus, left kidney, small bowel, colon) and what the patient's disease does to them,
// as the 2D figure does it (stage-diaphragm.js updateOrgans): the liver's shape (cirrhosis) and dusk (congestion), a scale of the spleen with the model's size, a ghost of
// a removed spleen, the grey of a lens other than Pressure, blood in the stomach. Meshes come from meshes.ts (the organs thread) in the shared frame; this file never
// builds one. Everything moves on the clock: `update(now)` returns true while something eases, and nothing is touched when nothing moves.
import { type BufferGeometry, AlwaysDepth, BufferAttribute, Color, Int8BufferAttribute, LessEqualDepth, Group, type Raycaster, Vector3, Vector4 } from 'three';
import { PICK_OF } from './pick.ts';
import { ORGAN_FS, ORGAN_INK_VS, ORGAN_VS } from './organ-shader.ts';
import type { OrganTones2D } from '../../looks/organ-tones.copied.ts';
import { ORGAN_MESHES } from './meshes.ts';
import { CelObject, type CelShared } from '../materials/cel.ts';
import { type Palette, type ToneKey } from '../palette.ts';
import { LIVER_PIVOT, SPLEEN_CENTER, LENS_GREY } from '../disease/copied/anatomy-b4.ts';
import { liverShrink, liverSurface } from '../disease/copied/liver-morph.js';
import { Eased, LiverFollow } from '../disease/follow.ts';
import { type BodyTargets, SPLENIC_GHOST, poolFill } from '../disease/targets.ts';
import { PLAIN, type OrganState, organColour, organInk, mix, rgbOf, type RGB } from './organ-look.ts';
import { PAINTED, VertexPaint } from './vertex-paint.ts';
import { lumenSurface } from '../disease/copied/stomach-lumen.js';
import { POOL_SHARE } from '../disease/copied/bleed-shapes.js';
import { LiverShape } from './liver-shape.ts';
import { x3, y3 } from '../frame2d.ts';
import { bakeOrganDepth } from './organ-depth.ts';
import { CEL_STYLE } from '../cel-style.ts';
import type { OrganFill } from '../../state/settings.ts';
import { OrganArt } from './organ-art.ts';
import { CEL_OF, celTones, lookOfOrgans } from './cel-tones.ts';

type Og = keyof OrganTones2D['tones'];
/** The tone each 2D organ takes, its 2D painter's tones (--og-<og>-1/2/3; anatomy.js `tone`), the outline's width (2D: 1.1 px, the kidney 1.4) and alpha (.62, the kidney .95, the atrium .35),
 *  and which layer opacity it sits at (the gut at --gut-a, the kidney at its own, the rest at the organ layer's). */
export const ORGAN_STYLE: Record<string, { tone: ToneKey; og: Og; px: number; inkA: number; layer: 'organ' | 'gut' | 'kidney' }> = {
  heart: { tone: 'heart', og: 'heart', px: 1.1, inkA: 0.62, layer: 'organ' }, 'heart-ra': { tone: 'heart', og: 'ra', px: 1.1, inkA: 0.35, layer: 'organ' },
  liver: { tone: 'liver', og: 'liver', px: 1.1, inkA: 0.62, layer: 'organ' }, spleen: { tone: 'spleen', og: 'spleen', px: 1.1, inkA: 0.62, layer: 'organ' },
  stomach: { tone: 'stomach', og: 'stomach', px: 1.1, inkA: 0.62, layer: 'organ' }, duodenum: { tone: 'stomach', og: 'stomach', px: 1.1, inkA: 0.62, layer: 'organ' },
  'kidney-l': { tone: 'kidney', og: 'kidney', px: 1.4, inkA: 0.95, layer: 'kidney' }, bowel: { tone: 'gut', og: 'gut', px: 1.1, inkA: 0.62, layer: 'gut' }, colon: { tone: 'gut', og: 'gut', px: 1.1, inkA: 0.62, layer: 'gut' },
};

/** The layer opacity an organ sits at in a look. */
export function organLayerAlpha(p: Palette, id: string): number {
  const st = ORGAN_STYLE[id];
  if (!st) return p.organLayer;
  return st.layer === 'kidney' ? p.kidneyLayer : st.layer === 'gut' ? p.organs.gutA : p.organLayer;
}
const rgba = (v: readonly number[]) => new Vector4(v[0]! / 255, v[1]! / 255, v[2]! / 255, v[3]!);

/** 2D's drawing order (back to front), the gut last: the gut is depth-tested behind the organs already drawn, which is 2D's #gutHide (the gut cut away under the
 *  liver, stomach, spleen and kidney), and lies on bare page elsewhere. */
export const ORGAN_ORDER = ['heart', 'heart-ra', 'kidney-l', 'spleen', 'stomach', 'duodenum', 'liver', 'bowel', 'colon'];

/** Puts 2D's organ painter (organ-shader.ts) in place of the toon fill: the uniforms the paint fills each look, and the organ's own box for the gradient.
 *  The fill is blended at the layer's opacity, so organs show through each other; it writes depth, and each organ's outline is drawn right after it, so the
 *  hull is hidden behind its own fill and shows only round the silhouette. */
/** The dive's cutaway window, one for every organ (scene.ts writes it each frame from the camera's distance to the place dived to; camera/dive.ts cutUniform). Nothing cleared at rest. */
export const ORGAN_CUT: { value: Vector4 } = { value: new Vector4(0, 0, -1, 1) };

function useOrganShader(o: CelObject, g: BufferGeometry, id: string, depth: { value: number }, solid: { value: number }): void {
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox!;
  const m = o.toon;
  m.vertexShader = ORGAN_VS; m.fragmentShader = ORGAN_FS;
  Object.assign(m.uniforms, {
    cut: ORGAN_CUT, depthAmt: depth, solid, o1: { value: new Color() }, o2: { value: new Color() }, o3: { value: new Color() }, page: { value: new Color() }, layer: { value: 0.55 },
    ogLight: { value: new Vector4() }, ogDark: { value: new Vector4() }, volShade: { value: new Vector4() },
    celShade: { value: new Color() }, celBase: { value: new Color() }, celLit: { value: new Color() },
    box: { value: new Vector4(b.min.x, b.max.y, b.max.x - b.min.x, b.max.y - b.min.y) },
  });
  if (id === 'liver') m.defines = { ...m.defines, CEL_NORMAL: '' };   // (its cel normal, set in build)
  m.transparent = true; m.depthWrite = true;
  m.needsUpdate = true;
  const ink = o.ink;
  ink.vertexShader = ORGAN_INK_VS;
  ink.uniforms.dpr = { value: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1 };
  // in the sorted (transparent) list too, so it keeps its place right after its own fill; it stays opaque (pre-mixed against the page)
  ink.transparent = true;
  ink.needsUpdate = true;
  const i = Math.max(0, ORGAN_ORDER.indexOf(id));
  o.toonMesh.renderOrder = 2 * i;
  for (const c of o.group.children) if (c !== o.toonMesh) c.renderOrder = 2 * i + 1;
}

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
  /** quiet depth on a turn (camera/quiet.ts), in steps, set by the scene from the orbit */
  private quiet = 0;
  private readonly sat = new Eased(1, 0.42);
  private readonly blood = new Eased(0, 0.6);
  /** how full the pool of blood stands in the stomach (poolFill of the blood lost; it keeps its level while it fades) */
  private readonly pool = new Eased(0.12, 0.6);
  /** how far the embolized spleen's dead lower part has come in */
  private readonly infarct = new Eased(0, 0.24);
  /** Settings > Figure depth: the organ depth switch and the organ fill, eased (420 ms like the lens) and shared by every organ's shader (depthAmt, solid) */
  private readonly uDepth = { value: 0 };
  private readonly uSolid = { value: 0 };
  private readonly depthE = new Eased(0, 0.14);
  private readonly solidE = new Eased(0, 0.14);
  private painterOn = false;
  private depthGoal = 0; private solidGoal = 0; private fillInstant = true;
  private readonly paints = new Map<string, VertexPaint>();
  /** 2D's art on the organs (the bowel's loops, the colon's haustra, the stomach's rugae) and the esophagus's fade: organ-art.ts */
  private readonly art = new OrganArt();
  private liverShape: LiverShape | null = null;
  private liverGeometry: BufferGeometry | null = null;
  private lastClock = -1;
  private dirtyColours = true;
  private instant = true;

  private readonly shared: CelShared;
  private built = false;
  /** With `meshes` the organs are built at once (the tests); without, `build()` makes them from the organs file once `organsReady` has resolved (scene.ts). */
  constructor(shared: CelShared, meshes?: Record<string, () => BufferGeometry>) {
    this.shared = shared;
    if (meshes) this.build(meshes);
  }

  /** Makes the organs from `meshes` (default: the organs file, which must be loaded), in the patient's state: the look, the phone's lines and the body come straight on, nothing eases in. */
  build(meshes: Record<string, () => BufferGeometry> = ORGAN_MESHES): void {
    if (this.built) return;
    this.built = true;
    // every organ's geometry first: the baked depth term (organ-depth.ts) needs them all together (where one organ meets another)
    const made: [string, BufferGeometry][] = [];
    for (const [id, make] of Object.entries(meshes)) if (ORGAN_STYLE[id]) made.push([id, make()]);
    const baked = bakeOrganDepth(Object.fromEntries(made.map(([id, g]) => {
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      return [id, { pos: g.getAttribute('position').array, normal: g.getAttribute('normal').array, index: g.index ? g.index.array : [] }];
    })));
    for (const [id, g] of made) {
      const st = ORGAN_STYLE[id]!;
      g.setAttribute('depthAo', new BufferAttribute(baked[id]!, 1, true));
      if (PAINTED.has(id)) { if (!g.getAttribute('normal')) g.computeVertexNormals(); this.paints.set(id, new VertexPaint(g, id as 'liver' | 'spleen' | 'stomach')); }
      const o = new CelObject(g, { tone: st.tone, bands: 3, spec: 0, px: st.px }, this.shared);
      useOrganShader(o, g, id, this.uDepth, this.uSolid);
      this.art.attach(id, o.toon, o.ink, g);
      if (this.phone) o.setPhone(true);
      o.ink.uniforms.px!.value = this.inkPx(id);
      this.objects.push(o); this.byId.set(id, o); this.group.add(o.group);
      if (id === 'liver') {
        this.liverGeometry = g;
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        // the cel bands are cut by the healthy liver's smooth normal, one byte an axis: cirrhosis's nodule bumps would make a hard-edged honeycomb of them
        g.setAttribute('celNormal', new Int8BufferAttribute(Int8Array.from(g.getAttribute('normal').array, (v) => Math.round(v * 127)), 3, true));
        this.liverShape = new LiverShape(g.getAttribute('position') as never, g.getAttribute('normal').array);
      }
    }
    this.dirtyColours = true; this.instant = true;
  }

  /** Organ depth on or off (Settings > Figure depth): the baked crease and contact shade and the soft light. It eases in with the clock; `instant` takes it at once (the first call). */
  setDepth(on: boolean, instant = false): void { this.depthGoal = on ? 1 : 0; if (instant) this.fillInstant = true; }
  /** The organ fill: 'solid' (the default since 20 Nov) is the colours opaque, pre-mixed against the page; 'seethrough' is the wash at the layer's opacity. */
  setFill(f: OrganFill, instant = false): void { this.solidGoal = f === 'solid' ? 1 : 0; if (instant) this.fillInstant = true; }

  /** How big the spleen is drawn now (1: normal): a caliper along its axis grows with it. */
  get spleenScaleNow(): number { return this.spleenScale.value; }

  applyLook(p: Palette): void { this.palette = p; this.art.applyLook(p); this.dirtyColours = true; }
  /** Cel shaded organs are painted in 2D's order, flat, as 2D lays its groups: each organ's outline first, then its fill over it, no depth test among the organs (the gut keeps its test, so it stays cut away
   *  behind the others), so the organ laid later always has its line over the one before, wherever their surfaces cross in depth, and it never depends on which is nearer. The wash keeps its depth order. */
  private setPainter(on: boolean): void {
    this.painterOn = on;
    for (const [id, o] of this.byId) {
      if (ORGAN_STYLE[id]!.layer === 'gut') continue;
      const i = Math.max(0, ORGAN_ORDER.indexOf(id));
      o.toon.depthFunc = on ? AlwaysDepth : LessEqualDepth;
      o.ink.depthFunc = on ? AlwaysDepth : LessEqualDepth;
      o.ink.depthWrite = !on;
      o.toonMesh.renderOrder = on ? 2 * i + 1 : 2 * i;
      for (const c of o.group.children) if (c !== o.toonMesh) c.renderOrder = on ? 2 * i : 2 * i + 1;
    }
  }
  /** How much more a vessel behind the organs (the cava's veil) shows once the organs are opaque: the share of it the 2D wash let through (1 - layer) that the veil takes back (cel-style ORGAN.VEIL_SEE), eased with the fill. */
  get veilLift(): number { return this.uSolid.value * 0.6 * CEL_STYLE.ORGAN.VEIL_SEE * (1 - (this.palette?.organLayer ?? 0.55)); }
  /** The organ outline is in the figure's units (ORGAN_INK_VS), so it needs no phone trim: keep 2D's 1.1 (kidney 1.4) on every device. */
  setPhone(phone: boolean): void { this.phone = phone; for (const [id, o] of this.byId) { o.setPhone(phone); o.ink.uniforms.px!.value = this.inkPx(id); } }
  /** The organ outline's width in the figure's units: 2D's (1.1, the kidney 1.4), wider by LINE_SCALE as the fill goes cel shaded. */
  private inkPx(id: string): number { return ORGAN_STYLE[id]!.px * (1 + (CEL_STYLE.ORGAN.LINE_SCALE - 1) * this.uSolid.value); }
  /** A lens other than Pressure greys the organs (organ-dim.js: saturation 0.12, opacity 0.72) and eases in 420 ms (D_SURFACE). */
  setLensGrey(on: boolean): void { this.grey = on; }
  /** The turn's quiet depth (0..1 in steps): the organs' wash eases toward the page; repaints only when the step changes. */
  setQuiet(q: number): void { if (q !== this.quiet) { this.quiet = q; this.dirtyColours = true; } }
  /** The patient's disease for the next frames. `instant` takes it at once (a new patient, the first frame: nothing eases across a jump). */
  setBody(t: BodyTargets, instant = false): void { this.body = t; if (instant) this.instant = true; }

  /** Steps everything; true while something moves (draw another frame). */
  update(now: number): boolean {
    const dt = this.lastClock < 0 ? 0.016 : Math.min(0.1, (now - this.lastClock) / 1000);
    this.lastClock = now;
    const sw = this.fillInstant; this.fillInstant = false;
    let eased = this.depthE.to(this.depthGoal, dt, sw);
    const before = this.solidE.value;
    eased = this.solidE.to(this.solidGoal, dt, sw) || eased;
    if (this.solidE.value !== before) this.dirtyColours = true;
    if ((this.solidE.value > 0.5) !== this.painterOn) this.setPainter(this.solidE.value > 0.5);   // (the cel-shaded outline's strength follows the fill: setColours)
    this.uDepth.value = this.depthE.value; this.uSolid.value = this.solidE.value;
    const t = this.body;
    if (!t) { if (this.dirtyColours) { this.paint(); this.dirtyColours = false; } return eased; }
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
      moving = this.infarct.to(t.splenicRx === 1 ? 1 : 0, dt, inst) || moving;
    }
    moving = this.dimmed.to(this.grey ? LENS_GREY.dim : 1, dt, inst) || moving;
    moving = this.sat.to(this.grey ? LENS_GREY.sat : 1, dt, inst) || moving;
    moving = this.blood.to(t.bleed.active ? 1 : 0, dt, inst) || moving;
    if (t.bleed.active) moving = this.pool.to(poolFill(t.bleed.total), dt, inst) || moving;
    if (moving || this.dirtyColours) { this.paint(); this.dirtyColours = false; }
    return moving || eased;
  }

  private paint(): boolean {
    const p = this.palette;
    if (!p) return false;
    // the organs lie on the page, not on a plate (2D's #backdrop is off): a dimmed or ghosted organ goes toward the page
    const page = rgbOf(p.bg), dark = p.highlight === 'white';
    const k = { plate: page, dark, bleed: rgbOf('#8E1A20'), bg: page };
    for (const [id, o] of this.byId) {
      const s: OrganState = { ...PLAIN, sat: this.sat.value, dim: this.dimmed.value, quiet: this.quiet };
      if (id === 'liver') { const ls = this.liverFollow.shown; s.congestion = ls.congestion; s.tint = ls.tint; s.cirrhosisNod = liverSurface(ls.cirrhosis).nod; }
      if (id === 'spleen') s.ghost = this.ghost.value;
      const st = ORGAN_STYLE[id]!, og = p.organs.tones[st.og];
      const t1 = rgbOf(og[0]), t2 = rgbOf(og[1]), base = mix(t1, t2, 0.5);
      const c = organColour(base, s, k);
      this.setColours(o, organColour(t1, s, k), organColour(t2, s, k), c, organInk(rgbOf(og[2]), s, k), st.inkA, organLayerAlpha(p, id), page, p.organs, organInk(rgbOf(p.ink), s, k));
      // the cel tones: the organ's own 2D tone and a lightness step either side, through the same state (lens grey, dim, ghost, dusk, quiet) as its colour
      const ct = celTones(lookOfOrgans(p.organs), CEL_OF[id]!), cu = o.toon.uniforms;
      (cu.celShade!.value as Color).setRGB(...organColour(ct.shade, s, k)); (cu.celBase!.value as Color).setRGB(...organColour(ct.base, s, k)); (cu.celLit!.value as Color).setRGB(...organColour(ct.lit, s, k));
      this.art.setState(id, s, k, p);
      o.ink.uniforms.px!.value = this.inkPx(id);
      const vp = this.paints.get(id);
      if (!vp) continue;
      // what varies over the surface: the vertices carry it (an organ that has none of it shows its one colour)
      let on = false;
      if (id === 'liver' && s.cirrhosisNod > 0.004) { vp.fillLiver(c, organColour(base, { ...s, septum: 1 }, k)); on = true; }
      else if (id === 'spleen' && this.infarct.value > 0.004) {
        const dead = organColour(base, { ...s, dead: 1 }, k);
        vp.fillSpleen(c, dead, mix(organInk(rgbOf(og[2]), s, k), c, 0.1), this.infarct.value); on = true;
      } else if (id === 'stomach' && this.blood.value > 0.004) {
        vp.fillStomach(c, organColour(base, { ...s, blood: this.blood.value }, k), lumenSurface(POOL_SHARE * this.pool.value)); on = true;
      }
      o.setInkAmount(on ? 1 : 0);
    }
    return false;
  }

  /** The painter's uniforms: the two gradient stops, the organ's one colour (what the vertex paint is measured from), the page, the layer, and the outline:
   *  the wash's is the organ's own third tone at its alpha under the layer, pre-mixed against the page (2D: .62 × .55, so about a third); the cel's is the look's casing ink, bold. */
  private setColours(o: CelObject, t1: RGB, t2: RGB, c: RGB, o3: RGB, inkA: number, layer: number, page: RGB, og: OrganTones2D, casing: RGB): void {
    const u = o.toon.uniforms;
    (u.o1!.value as Color).setRGB(t1[0], t1[1], t1[2]); (u.o2!.value as Color).setRGB(t2[0], t2[1], t2[2]); (u.o3!.value as Color).setRGB(o3[0], o3[1], o3[2]);
    (u.color!.value as Color).setRGB(c[0], c[1], c[2]); (u.page!.value as Color).setRGB(page[0], page[1], page[2]);
    u.layer!.value = layer;
    (u.ogLight!.value as Vector4).copy(rgba(og.light)); (u.ogDark!.value as Vector4).copy(rgba(og.dark)); (u.volShade!.value as Vector4).copy(rgba(og.volShade));
    // cel shaded (solid): the organ's line is the look's casing ink (the vessels' line) at INK_ALPHA_MIN or more, whole (not thinned by the layer's opacity), so the silhouette and the edge where one organ passes over another read as bold ink;
    // the wash keeps 2D's thin line in the organ's own third tone. The two ease with the fill.
    const k = this.uSolid.value, wash = mix(page, o3, inkA * layer);
    const cel = mix(page, casing, Math.max(CEL_STYLE.INK_ALPHA_MIN, inkA));
    const ink = mix(wash, cel, k);
    (o.ink.uniforms.color!.value as Color).setRGB(ink[0], ink[1], ink[2]);
  }

  /** The gut floats up on ascites: the bowel moves up by `units` of the 2D figure (drawAscites: -bulge / 34 * 26). */
  setBowelLift(units: number): void { const b = this.byId.get('bowel'); if (b) b.group.position.y = units / 300; }

  /** The organ a pointer ray hits first among the ones that take a tap (liver, heart with its atrium, spleen: pick.ts), as the 2D organ id the tap opens, and where (scene x). Null for none. */
  pick(rc: Raycaster): { id: 'liver' | 'heart' | 'spleen'; x: number } | null {
    const meshes = [];
    for (const [id, o] of this.byId) {
      if (!PICK_OF[id] || !o.group.visible) continue;
      o.group.updateWorldMatrix(true, false);
      o.toonMesh.geometry.computeBoundingSphere();   // (the liver's shape changes with cirrhosis: the sphere the ray tests first is made anew, never kept from the healthy one)
      meshes.push(o.toonMesh);
    }
    const hit = rc.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    for (const [id, o] of this.byId) if (o.toonMesh === hit.object) return { id: PICK_OF[id]!, x: hit.point.x };
    return null;
  }

  /** The 2D organs this layer draws, for the parity table. */
  get ids(): string[] { return [...this.byId.keys()]; }

  dispose(): void { for (const o of this.objects) o.dispose(); this.art.dispose(); }
}
