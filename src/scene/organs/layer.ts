// The organs of the figure (heart, right atrium, liver, spleen, stomach with the oesophagus, left kidney, small bowel, colon) and what the patient's disease does to them,
// as the 2D figure does it (stage-diaphragm.js updateOrgans): the liver's shape (cirrhosis) and dusk (congestion), a scale of the spleen with the model's size, a ghost of
// a removed spleen, the grey of a lens other than Pressure, blood in the stomach. Meshes come from meshes.ts (the organs thread) in the shared frame; this file never
// builds one. Everything moves on the clock: `update(now)` returns true while something eases, and nothing is touched when nothing moves.
import { BackSide, KeepStencilOp, NotEqualStencilFunc, ReplaceStencilOp, type BufferGeometry, BufferAttribute, Color, DataTexture, Float32BufferAttribute, Group, LinearFilter, LinearMipmapLinearFilter, Mesh, type Raycaster, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import { PICK_OF } from './pick.ts';
import { ORGAN_FS, ORGAN_INK_VS, ORGAN_VS } from './organ-shader.ts';
import type { OrganTones2D } from '../../looks/organ-tones.copied.ts';
import { ORGAN_MESHES, bakedOrgans } from './meshes.ts';
import { prepareOrgans } from './prepare.ts';
import { CelObject, type CelShared } from '../materials/cel.ts';
import { INK_FS } from '../materials/shaders.ts';
import { type Palette, type ToneKey } from '../palette.ts';
import { LIVER_PIVOT, SPLEEN_CENTER, LENS_GREY } from '../disease/copied/anatomy-b4.ts';
import { liverShrink, liverSurface } from '../disease/copied/liver-morph.js';
import { Eased, LiverFollow } from '../disease/follow.ts';
import { type BodyTargets, SPLENIC_GHOST, poolFill } from '../disease/targets.ts';
import { PLAIN, type OrganState, organColour, organInk, mix, rgbOf, setLiverTint, type RGB } from './organ-look.ts';
import { PAINTED, VertexPaint } from './vertex-paint.ts';
import { RIPPLE_HZ, poolUniforms } from './pool-level.ts';
import { LiverShape } from './liver-shape.ts';
import { LiverBake, celLook, rawNormalShare, shadeNow, TONE, TEX_H, TEX_PH, TEX_PW, TEX_W, TEX_X0, TEX_Y0 } from './liver-texture.ts';
import { x2d, x3, y2d, y3 } from '../frame2d.ts';
import { OrganArt } from './organ-art.ts';
import { caudateAnchor3, caudateGeometry, caudateScale } from './caudate.ts';
/** Smoothing passes of the shade normal (the outline's own is 8: this one keeps the pillow's turn, a lighter hand). */

import { whenQuiet } from '../../clock/idle.ts';
type Og = keyof OrganTones2D['tones'];
/** The tone each 2D organ takes, its 2D painter's tones (--og-<og>-1/2/3; anatomy.js `tone`), the outline's width (2D: 1.1 px, the kidney 1.4) and alpha (.62, the kidney .95, the atrium .35),
 *  and which layer opacity it sits at (the gut at --gut-a, the kidney at its own, the rest at the organ layer's). */
export const ORGAN_STYLE: Record<string, { tone: ToneKey; og: Og; px: number; inkA: number; layer: 'organ' | 'gut' | 'kidney'; /** the soft AO seat 2D draws under a plain organ (.org-ao); not the atrium (part of the heart) and not the gut, which has its own */ ao?: true; /** the right atrium's own fainter shade and rim */ atrium?: true; /** no rim light in the see-through fill (the liver and the stomach, and the duodenum painted with the stomach's tones: too shiny) */ noRim?: true }> = {
  heart: { tone: 'heart', og: 'heart', px: 1.1, inkA: 0.62, layer: 'organ', ao: true }, 'heart-ra': { tone: 'heart', og: 'ra', px: 1.1, inkA: 0.35, layer: 'organ', atrium: true },
  liver: { tone: 'liver', og: 'liver', px: 1.1, inkA: 0.62, layer: 'organ', ao: true, noRim: true }, spleen: { tone: 'spleen', og: 'spleen', px: 1.1, inkA: 0.62, layer: 'organ', ao: true },
  /** the caudate lobe (caudate.ts): 2D draws it as the liver's own dome (tone-liver) with the organs' one thin line; shown only on a slide about it */
  caudate: { tone: 'liver', og: 'liver', px: 1.1, inkA: 0.62, layer: 'organ', noRim: true },
  stomach: { tone: 'stomach', og: 'stomach', px: 1.1, inkA: 0.62, layer: 'organ', ao: true, noRim: true }, duodenum: { tone: 'stomach', og: 'stomach', px: 1.1, inkA: 0.62, layer: 'organ', noRim: true },
  'kidney-l': { tone: 'kidney', og: 'kidney', px: 1.4, inkA: 0.95, layer: 'kidney', ao: true }, bowel: { tone: 'gut', og: 'gut', px: 1.1, inkA: 0.62, layer: 'gut' }, colon: { tone: 'gut', og: 'gut', px: 1.1, inkA: 0.62, layer: 'gut' },
};

/** The layer opacity an organ sits at in a look. */
export function organLayerAlpha(p: Palette, id: string): number {
  const st = ORGAN_STYLE[id];
  if (!st) return p.organLayer;
  return st.layer === 'kidney' ? p.kidneyLayer : st.layer === 'gut' ? p.organs.gutA : p.organLayer;
}
/** The colour of a selected organ's outline: its own colour lifted toward white, more on the dark looks (where the fill is deep) than the light ones (where the line must stay off the cream page). */
export const organHighlight = (c: RGB, dark: boolean): [number, number, number] => mix(c, [1, 1, 1], dark ? 0.5 : 0.3);
/** The tapped or pinned organ's line: on a dark look its own colour lifted; on a light one the organ's own deep tone at full strength (a lifted tone is paler than the fill and the page and
 *  cannot be seen there, 20 Nov: a tapped spleen showed nothing), never white. */
export const organSelectLine = (c: RGB, ink: RGB, dark: boolean): [number, number, number] => (dark ? organHighlight(c, true) : mix(ink, [0, 0, 0], 0.2));
const rgba = (v: readonly number[]) => new Vector4(v[0]! / 255, v[1]! / 255, v[2]! / 255, v[3]!);

/** 2D's drawing order (back to front), the gut last: the gut is depth-tested behind the organs already drawn, which is 2D's #gutHide (the gut cut away under the
 *  liver, stomach, spleen and kidney), and lies on bare page elsewhere. */
export const ORGAN_ORDER = ['heart', 'heart-ra', 'kidney-l', 'spleen', 'stomach', 'duodenum', 'liver', 'caudate', 'bowel', 'colon'];

/** Puts 2D's organ painter (organ-shader.ts) in place of the toon fill: the uniforms the paint fills each look, and the organ's own box for the gradient.
 *  The fill is blended at the layer's opacity, so organs show through each other; it writes depth, and each organ's outline is drawn right after it, so the
 *  hull is hidden behind its own fill and shows only round the silhouette. */
/** The dive's cutaway window, one for every organ (scene.ts writes it each frame from the camera's distance to the place dived to; camera/dive.ts cutUniform). Nothing cleared at rest. */
export const ORGAN_CUT: { value: Vector4 } = { value: new Vector4(0, 0, -1, 1) };

/** The gut is ONE see-through group in 2D (stage.js: the colon, the small bowel and the duodenum in `organ-gut`, its opacity --gut-a set once on the group), so where the colon crosses the loops it COVERS them and the pair
 *  is as see-through as either alone. Drawn as separate blended organs they stacked their alpha and the overlap shone brighter (Mohammad 20 Nov: "why are the intestines overlapping SHINE brighter?"). Now each gut fill
 *  marks the pixels it drew (stencil bit 2) and a later gut fill leaves a marked pixel alone; the colon is drawn first so it is the one that covers, and the two outlines are drawn after both fills so a line is never
 *  painted over by the other organ's fill. The stencil is cleared with the depth each pass (scene.ts), and bit 2 is the gut's own (the vessels' outline stencil is bit 1). */
export const GUT_GROUP: ReadonlySet<string> = new Set(['bowel', 'colon']);
/** The gut's draw order in the organ layer: fills first (the colon, which covers, then the bowel), then the outlines (the bowel's, then the colon's over it). */
export const GUT_RENDER: Readonly<Record<string, { fill: number; ink: number }>> = { colon: { fill: 14, ink: 15.6 }, bowel: { fill: 14.5, ink: 15.4 } };

/** The organs whose shade steps are cut by the smoothed normal (organ-shader.ts shadeN); the small bowel's folds are its relief, so it keeps its own (the colon is a plain pillow: its own normals were only the triangulation's noise). */
export const SMOOTH_SHADE = new Set(['heart', 'heart-ra', 'kidney-l', 'spleen', 'stomach', 'duodenum', 'liver', 'colon']);

/** The 1x1 texture an organ with no liver look samples (its nodAmt is 0, so it is never read). */
const NO_TEX = new DataTexture(new Uint8Array([0, 0, 128, 255]), 1, 1);
NO_TEX.needsUpdate = true;

function useOrganShader(o: CelObject, g: BufferGeometry, id: string, depth: { value: number }): ShaderMaterial | null {
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox!;
  const m = o.toon;
  m.vertexShader = ORGAN_VS; m.fragmentShader = ORGAN_FS;
  Object.assign(m.uniforms, {
    cut: ORGAN_CUT, depthAmt: depth, o1: { value: new Color() }, o2: { value: new Color() }, o3: { value: new Color() }, page: { value: new Color() }, layer: { value: 0.55 },
    ogLight: { value: new Vector4() }, ogDark: { value: new Vector4() }, volShade: { value: new Vector4() },
    volLight: { value: new Vector4() }, volGeo: { value: new Vector4() }, volShadeAt: { value: 0.8 }, shadeSteps: { value: new Vector3() }, rimK: { value: 0.58 },
    box: { value: new Vector4(b.min.x, b.max.y, b.max.x - b.min.x, b.max.y - b.min.y) },
    poolA: { value: new Vector4() }, poolLand: { value: new Vector4() }, poolDelta: { value: new Vector3() },   // (the stomach's pool, per pixel: pool-level.ts; z 0 = none, nothing runs)
    rimP0: { value: new Vector4(...((g.userData.rimProfile as number[] | undefined)?.slice(0, 4) ?? [0, 0, 0, 0]) as [number, number, number, number]) }, rimP1: { value: new Vector4(...((g.userData.rimProfile as number[] | undefined)?.slice(4, 8) ?? [0, 0, 0, 0]) as [number, number, number, number]) }, rimW: { value: g.userData.rimProfile ? 1 : 0 },
    shadeK: { value: SMOOTH_SHADE.has(id) ? 1 : 0 }, nodTex: { value: NO_TEX }, nodAmt: { value: 0 }, sepDelta: { value: new Vector3() }, nodK: { value: new Vector2() },
  });
  m.userData.hasRim = !!g.userData.rimProfile;
  m.transparent = true; m.depthWrite = true;
  m.needsUpdate = true;
  const ink = o.ink;
  ink.vertexShader = ORGAN_INK_VS;
  ink.defines = { ...(ink.defines ?? {}), INK_EDGE: '' };   // (the outline's outer edge is feathered by arithmetic: INK_FS)
  ink.uniforms.dpr = { value: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1 };
  // in the sorted (transparent) list too, so it keeps its place right after its own fill; it stays opaque (pre-mixed against the page)
  ink.transparent = true;
  ink.needsUpdate = true;
  const i = Math.max(0, ORGAN_ORDER.indexOf(id));
  o.toonMesh.renderOrder = 2 * i;
  for (const c of o.group.children) if (c !== o.toonMesh) c.renderOrder = 2 * i + 1;
  if (GUT_GROUP.has(id)) {
    const r = GUT_RENDER[id]!;
    o.toonMesh.renderOrder = r.fill;
    for (const c of o.group.children) if (c !== o.toonMesh) c.renderOrder = r.ink;
    m.stencilWrite = true; m.stencilRef = 2; m.stencilFuncMask = 2; m.stencilWriteMask = 2;
    m.stencilFunc = NotEqualStencilFunc; m.stencilFail = KeepStencilOp; m.stencilZFail = KeepStencilOp; m.stencilZPass = ReplaceStencilOp;
  }
  if (!ORGAN_STYLE[id]?.ao) return null;
  // 2D's .org-ao: a flat soft seat round the outline (the stroke's outer half), under the fill and the line, in the organ's group. Drawn after the fill with the hull's
  // depth test, so it shows only where the fill is not, and before the outline, so the line lies over it.
  const seat = new ShaderMaterial({ name: 'organ seat',
    vertexShader: ORGAN_INK_VS, fragmentShader: INK_FS, side: BackSide, transparent: true, depthWrite: false,
    uniforms: { color: { value: new Color() }, hiColor: { value: new Color() }, fade: m.uniforms.fade!, reveal: ink.uniforms.reveal!, inkA: { value: 0 }, px: { value: 0 }, dpr: ink.uniforms.dpr!, res: ink.uniforms.res!,
      hiOn: { value: 0 }, hiPx: { value: 0 } },   // (every uniform the shader declares: a missing one keeps what the last material drawn with this program left in it, so a tapped spleen lit the stomach's seat and the esophagus)
  });
  seat.defines = { INK_EDGE: '', INK_SEAT: '' };   // (a soft halo, not a flat band: INK_FS)
  const mesh = new Mesh(g, seat);
  mesh.renderOrder = 2 * i + 0.5;
  mesh.visible = false; mesh.name = 'org-ao';
  o.group.add(mesh);
  return seat;
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
  /** What dims the organs apart from the lens's grey (2D: a selection's dim, a slide spotlight's), eased like the lens: 1 now (nothing in the 3D app dims them yet). The ascites' pool follows this same value. */
  private readonly figureDimE = new Eased(1, 0.42);
  private figureDimGoal = 1;
  /** quiet depth on a turn (camera/quiet.ts), in steps, set by the scene from the orbit */
  private quiet = 0;
  private readonly sat = new Eased(1, 0.42);
  private readonly blood = new Eased(0, 0.6);
  /** how far the pool's ripples stand (0..1): they come in with the bleed and ease out when it stops (a little slower than the pool's colour, so the surface calms as the blood leaves) */
  private readonly ripple = new Eased(0, 0.9);
  /** how full the pool of blood stands in the stomach (poolFill of the blood lost; it keeps its level while it fades) */
  private readonly pool = new Eased(0.12, 0.6);
  /** how far the embolized spleen's dead lower part has come in */
  private readonly infarct = new Eased(0, 0.24);
  /** Settings > Figure depth: the organ depth switch, eased (420 ms like the lens) and shared by every organ's shader (depthAmt) */
  private readonly uDepth = { value: 0 };
  private readonly depthE = new Eased(0, 0.14);
  private depthGoal = 0; private fillInstant = true;
  private readonly paints = new Map<string, VertexPaint>();
  /** the AO seats (2D .org-ao) of the organs that have one, and the meshes that draw them */
  private readonly seats = new Map<string, ShaderMaterial>();
  /** 2D's art on the organs (the bowel's loops, the colon's haustra, the stomach's rugae) and the esophagus's fade: organ-art.ts */
  private readonly art = new OrganArt();
  /** The caudate lobe (caudate.ts): how far it is shown (a slide about it asks; it eases in and out, 0 to 1) and how far it has grown (its veins carry the liver's outflow, 0 to 1). */
  private readonly lobeShown = new Eased(0, 0.3);
  private readonly lobeGrown = new Eased(0, 0.5);
  private lobeGoal = 0; private lobeGrowGoal = 0; private bodyFade = 1;
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
    // the finished organs: from the build's baked file when the page has it (organs/baked.ts), else made here from the organs file (prepare.ts: the rim, the depth term, the smoothed normals, about 2 s of CPU)
    const made = (meshes === ORGAN_MESHES ? bakedOrgans()?.organs : null) ?? prepareOrgans(meshes === ORGAN_MESHES ? { ...meshes, caudate: caudateGeometry } : meshes);   // (the lobe is built from 2D's outline, not shipped in the organs file)
    for (const [id, g] of made) {
      const st = ORGAN_STYLE[id]!;
      if (id === 'liver') {   // the surface's texture (liver-texture.ts): each vertex's place in it is its rest place in the 2D figure
        const pos = g.getAttribute('position'), uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) { uv[i * 2] = (x2d(pos.getX(i)) - TEX_X0) / TEX_W; uv[i * 2 + 1] = (y2d(pos.getY(i)) - TEX_Y0) / TEX_H; }
        g.setAttribute('restUV', new Float32BufferAttribute(uv, 2));
      }
      if (PAINTED.has(id)) { if (!g.getAttribute('normal')) g.computeVertexNormals(); this.paints.set(id, new VertexPaint(g, id as 'liver' | 'spleen')); }
      const o = new CelObject(g, { tone: st.tone, bands: 3, spec: 0, px: st.px }, this.shared);
      const seat = useOrganShader(o, g, id, this.uDepth);
      if (seat) this.seats.set(id, seat);
      this.art.attach(id, o.toon, o.ink, g, seat);
      if (this.phone) o.setPhone(true);
      o.ink.uniforms.px!.value = ORGAN_STYLE[id]!.px;
      this.objects.push(o); this.byId.set(id, o); this.group.add(o.group);
      if (id === 'liver') {
        (o.toon.uniforms.nodK!.value as Vector2).set(shadeNow(), TONE);   // (the texture itself is baked the first time the liver is scarred: paint())
        this.liverGeometry = g;
        this.liverShape = new LiverShape(g.getAttribute('position') as never, g.getAttribute('hullN').array);   // the SMOOTHED rest normals: the raw per-vertex ones jag along the rim, and the nodules pushed along them (direction and weight) came out as teeth and notches
        const shape = this.liverShape;
        const bk = this.liverBake ??= new LiverBake();
        // (the nodules' rest-place heights and the surface texture, a few ms at a time in the background slot: never inside a frame, never the first scarred frame; a rebuilt liver ends this one's job)
        whenQuiet(() => this.liverShape !== shape || (shape.warm(6) && bk.step(6)), { tag: 'liver-shape', delayMs: 500 });
      }
    }
    this.dirtyColours = true; this.instant = true; this.shrinkWas = NaN;
    this.applyLobe();
  }

  /** The canvas's pixel ratio (the drawing buffer's, which Settings > Figure detail caps: 1.5 on a 2x screen), so the outline's one-pixel feather and floor are one pixel of the buffer drawn, not of the screen. */
  setDpr(d: number): void { for (const o of this.objects) if (o.ink.uniforms.dpr) o.ink.uniforms.dpr.value = d; }

  /** Organ depth on or off (Settings > Figure depth): the baked crease and contact shade and the soft light. It eases in with the clock; `instant` takes it at once (the first call). */
  setDepth(on: boolean, instant = false): void { this.depthGoal = on ? 1 : 0; if (instant) this.fillInstant = true; }

  /** How big the spleen is drawn now (1: normal): a caliper along its axis grows with it. */
  get spleenScaleNow(): number { return this.spleenScale.value; }

  applyLook(p: Palette): void { this.palette = p; this.art.applyLook(p); this.dirtyColours = true; }
  /** The organ outline is in the figure's units (ORGAN_INK_VS), so it needs no phone trim: keep 2D's 1.1 (kidney 1.4) on every device. */
  setPhone(phone: boolean): void { this.phone = phone; for (const [id, o] of this.byId) { o.setPhone(phone); o.ink.uniforms.px!.value = ORGAN_STYLE[id]!.px; } }
  /** The organs' dim besides the lens's, 0..1: its goal (eased by the clock in `update`), and the eased value the ascites' pool reads. */
  setFigureDim(k: number): void { this.figureDimGoal = k; }
  get figureDim(): number { return this.figureDimE.value; }
  /** The liver's shown cirrhosis, congestion and tint (the eased values the organs are drawn from). */
  get liverShown(): { readonly cirrhosis: number; readonly congestion: number } { return this.liverFollow.shown; }
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
    this.uDepth.value = this.depthE.value;
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
      if (s !== this.shrinkWas) { this.shrinkWas = s; liver.group.scale.setScalar(s); liver.group.position.set(pv.x * (1 - s), pv.y * (1 - s), 0); this.dirtyColours = true; }   // (repainted only when the liver's own size changed: every organ's colours and the liver's vertex paint were redone in every frame)
    }
    const sp = this.byId.get('spleen');
    if (sp) {
      moving = this.spleenScale.to(t.spleenScale, dt, inst) || moving;
      const s = this.spleenScale.value, pv = pivot(SPLEEN_CENTER);
      sp.group.scale.setScalar(s); sp.group.position.set(pv.x * (1 - s), pv.y * (1 - s), 0);
      moving = this.ghost.to(t.splenicRx === 2 ? SPLENIC_GHOST : 1, dt, inst) || moving;
      moving = this.infarct.to(t.splenicRx === 1 ? 1 : 0, dt, inst) || moving;
    }
    moving = this.stepLobe(dt, inst) || moving;
    moving = this.dimmed.to(this.grey ? LENS_GREY.dim : 1, dt, inst) || moving;
    moving = this.figureDimE.to(this.figureDimGoal, dt, inst) || moving;
    moving = this.sat.to(this.grey ? LENS_GREY.sat : 1, dt, inst) || moving;
    moving = this.blood.to(t.bleed.active ? 1 : 0, dt, inst) || moving;
    if (t.bleed.active) moving = this.pool.to(poolFill(t.bleed.total), dt, inst) || moving;
    moving = this.ripple.to(t.bleed.active ? 1 : 0, dt, inst) || moving;
    if (moving || this.dirtyColours) { this.paint(); this.dirtyColours = false; }
    return this.stepRipple(now) || moving || eased;
  }

  /** The caudate lobe on a slide about it (2D stage.js caud.show): `on` shows it, eased. `grown` (0..1, from its veins' flow: network.ts feederLive 'caudate') sets how far it has enlarged about its anchor (CAUDATE.grow). */
  setCaudate(on: boolean, grown: number, instant = false): void {
    this.lobeGoal = on ? 1 : 0; this.lobeGrowGoal = Math.min(1, Math.max(0, grown));
    if (instant) { this.lobeShown.value = this.lobeGoal; this.lobeGrown.value = this.lobeGrowGoal; this.applyLobe(); }
  }
  /** The body's dissolve (the dive, the Circuit's change) for every organ: the lobe wears it with its own share. */
  setFade(f: number): void { this.bodyFade = f; for (const o of this.objects) if (o !== this.byId.get('caudate')) o.setFade(f); this.applyLobe(); }
  get caudateShown(): number { return this.lobeShown.value; }
  private stepLobe(dt: number, inst: boolean): boolean {
    const a = this.lobeShown.to(this.lobeGoal, dt, inst), b = this.lobeGrown.to(this.lobeGrowGoal, dt, inst);
    this.applyLobe();
    return a || b;
  }
  private lobeKey = '';
  private applyLobe(): void {
    const o = this.byId.get('caudate');
    if (!o) return;
    const f = this.lobeShown.value * this.bodyFade, k = `${f}|${this.lobeGrown.value}`;
    o.group.visible = f > 0.001;   // (every call: the scene's change of view shows every organ's group, the lobe's share is its own)
    if (k === this.lobeKey) return;
    this.lobeKey = k;
    o.setFade(f);
    // 2D's scale(1 + grow * k) about CAUDATE.anchor: x and y only, the dome keeps its height
    const [sx, sy] = caudateScale(this.lobeGrown.value), [ax, ay] = caudateAnchor3();
    o.group.scale.set(sx, sy, 1); o.group.position.set(ax * (1 - sx), ay * (1 - sy), 0);
  }

  private liverBake: LiverBake | null = null;
  private shrinkWas = NaN;
  private paint(): boolean {
    const p = this.palette;
    if (!p) return false;
    // the organs lie on the page, not on a plate (2D's #backdrop is off): a dimmed or ghosted organ goes toward the page
    const page = rgbOf(p.bg), dark = p.highlight === 'white';
    const k = { plate: page, dark, bleed: rgbOf('#8E1A20'), bg: page };
    for (const [id, o] of this.byId) {
      const s: OrganState = { ...PLAIN, sat: this.sat.value, dim: this.dimmed.value * this.figureDimE.value, quiet: this.quiet };
      if (id === 'liver') { const ls = this.liverFollow.shown; s.congestion = ls.congestion; s.tint = ls.tint; s.cirrhosisNod = liverSurface(ls.cirrhosis).nod; }
      if (id === 'spleen') s.ghost = this.ghost.value;
      const st = ORGAN_STYLE[id]!, og = p.organs.tones[st.og];
      const t1 = rgbOf(og[0]), t2 = rgbOf(og[1]), base = mix(t1, t2, 0.5);
      if (id === 'liver') { const cel = celLook(); setLiverTint(cel ? { rgb: rgbOf(cel.colour), a: cel.a } : null); }
      const c = organColour(base, s, k);
      this.setColours(id, o, organColour(t1, s, k), organColour(t2, s, k), c, organInk(rgbOf(og[2]), s, k), st.inkA, organLayerAlpha(p, id), page, p.organs, s.dim * s.ghost);
      this.art.setState(id, s, k, p);
      o.ink.uniforms.px!.value = ORGAN_STYLE[id]!.px;
      if (id === 'stomach') this.paintPool(o, c, organColour(base, { ...s, blood: this.blood.value }, k));
      const vp = this.paints.get(id);
      if (!vp) continue;
      // what varies over the surface: the vertices carry it (an organ that has none of it shows its one colour)
      let on = false;
      if (id === 'liver') {
        if (s.cirrhosisNod > 0.004 && o.toon.uniforms.nodTex!.value === NO_TEX) {   // a healthy liver never pays for the texture
          const bk = this.liverBake ??= new LiverBake(); bk.step();   // (laid in idle slices since the liver was built; this finishes what is left, if a scarred liver was asked for first)
          const tex = new DataTexture(bk.out, TEX_PW, TEX_PH);
          tex.magFilter = LinearFilter; tex.minFilter = LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4; tex.needsUpdate = true;
          o.toon.uniforms.nodTex!.value = tex;
        }
        // the septum is per pixel: the vertices carry the nodule colour only, the shader adds the wall (sepDelta) and the dome's light and tone (nodAmt)
        let wall = organColour(base, { ...s, septum: 1 }, k);
        const cel = celLook();
        if (cel) wall = mix(c, rgbOf(og[2]), 0.8 * s.cirrhosisNod * cel.ink);   // the cel's line is the organ's own ink tone, bold
        (o.toon.uniforms.sepDelta!.value as Vector3).set(wall[0] - c[0], wall[1] - c[1], wall[2] - c[2]);
        o.toon.uniforms.nodAmt!.value = s.cirrhosisNod;
        o.toon.uniforms.shadeK!.value = 1 - s.cirrhosisNod * rawNormalShare();
        if (o.toon.userData.hasRim) o.toon.uniforms.rimW!.value = o.toon.uniforms.shadeK!.value;   // (the strip follows the smooth normal's share: the scarred liver's bumps are its own)   // (the scarred liver's own bumps light it, as much as the look says; eases with the scarring)
      }
      if (id === 'liver' && s.cirrhosisNod > 0.004) { vp.fillLiver(c); on = true; }
      else if (id === 'spleen' && this.infarct.value > 0.004) {
        const dead = organColour(base, { ...s, dead: 1 }, k);
        vp.fillSpleen(c, dead, mix(organInk(rgbOf(og[2]), s, k), c, 0.1), this.infarct.value); on = true;
      }
      o.setInkAmount(on ? 1 : 0);
    }
    return false;
  }

  /** The pool's ripples run on the clock: their height (eased with the bleed) and phase go to the stomach's shader every frame while they show, and nothing else is repainted for them.
   *  True while they show (another frame is wanted); false once they have died away (the height is written 0 once, and nothing is asked for). */
  private stepRipple(now: number): boolean {
    const st = this.byId.get('stomach');
    if (!st) return false;
    const pl = st.toon.uniforms.poolLand!.value as Vector4, on = this.ripple.value > 0.004 && this.blood.value > 0.004;
    if (!on && pl.z === 0) return false;
    pl.z = on ? this.ripple.value : 0; pl.w = ((now / 1000) * RIPPLE_HZ % 1) * 2 * Math.PI;
    return on;
  }

  /** The stomach's pool of blood: the level, the landing and the colour it moves the wash by, written as uniforms for the organ shader (organ-shader.ts) to draw per pixel; nothing per vertex.
   *  `c` is the organ's one colour, `bloody` the same wash with the blood in it (it eases in and out with the bleed, so the pool's colour does). */
  private paintPool(o: CelObject, c: RGB, bloody: RGB): void {
    const u = o.toon.uniforms, a = u.poolA!.value as Vector4;
    if (this.blood.value <= 0.004 || !this.body) { a.z = 0; return; }
    const b = u.box!.value as Vector4, q = poolUniforms([b.x, b.y, b.z, b.w], this.pool.value, this.body.bleed);
    a.set(q.level, q.unitsPerBox, this.blood.value, q.flow);
    const pl = u.poolLand!.value as Vector4; pl.x = q.landX; pl.y = q.landHalf;   // (z and w, the ripples, are the clock's: stepRipple)
    (u.poolDelta!.value as Vector3).set(bloody[0] - c[0], bloody[1] - c[1], bloody[2] - c[2]);
  }

  /** The painter's uniforms: the two gradient stops, the organ's one colour (what the vertex paint is measured from), the page, the layer, and the outline:
   *  the wash's is the organ's own third tone at its alpha under the layer, pre-mixed against the page (2D: .62 × .55, so about a third); the cel's is the organ's own ink tone, bold. */
  private setColours(id: string, o: CelObject, t1: RGB, t2: RGB, c: RGB, o3: RGB, inkA: number, layer: number, page: RGB, og: OrganTones2D, shown: number): void {
    const u = o.toon.uniforms;
    (u.o1!.value as Color).setRGB(t1[0], t1[1], t1[2]); (u.o2!.value as Color).setRGB(t2[0], t2[1], t2[2]); (u.o3!.value as Color).setRGB(o3[0], o3[1], o3[2]);
    (u.color!.value as Color).setRGB(c[0], c[1], c[2]); (u.page!.value as Color).setRGB(page[0], page[1], page[2]);
    u.layer!.value = layer;
    (u.ogLight!.value as Vector4).copy(rgba(og.light)); (u.ogDark!.value as Vector4).copy(rgba(og.dark)); (u.volShade!.value as Vector4).copy(rgba(og.volShade));
    // #ogVol's two ends (its light is --light-ink at its stop's opacity, its shade the volume shade at its own) and the form's steps (the atrium's fainter: 2D .organ-heart-ra)
    const v = og.vol, st = ORGAN_STYLE[id]!;
    (u.volLight!.value as Vector4).copy(rgba(v.light)); (u.volShade!.value as Vector4).set(og.volShade[0] / 255, og.volShade[1] / 255, og.volShade[2] / 255, v.shadeA);
    (u.volGeo!.value as Vector4).set(v.cx, v.cy, v.r, v.lightEnd); u.volShadeAt!.value = v.shadeStart;
    (u.shadeSteps!.value as Vector3).set(...(st.atrium ? [og.raShade, og.raShade, og.raShade] : og.shade) as [number, number, number]);
    u.rimK!.value = st.noRim ? 0 : st.atrium ? og.raRim : og.rim;   // (no rim light on the liver and the stomach: too shiny)
    const ink = mix(page, o3, inkA * layer);   // (the organ's own third tone at its alpha under the layer, pre-mixed against the page)
    (o.ink.uniforms.color!.value as Color).setRGB(ink[0], ink[1], ink[2]);
    // a pinned or tapped organ's heavy line is the organ's own colour, brighter (never the vessel's white: highlightColour is white on the dark looks, which an organ must not take)
    const hi = organSelectLine(c, o3, this.palette?.highlight === 'white');
    (o.ink.uniforms.hiColor!.value as Color).setRGB(hi[0], hi[1], hi[2]);
    const seat = this.seats.get(id);
    if (seat) {
      // 2D's .org-ao seat
      (seat.uniforms.color!.value as Color).setRGB(og.ao[0] / 255, og.ao[1] / 255, og.ao[2] / 255);
      seat.uniforms.inkA!.value = og.ao[3] * layer * shown ;   // in the organ's group: at the layer's opacity, and as faded as the organ
      seat.uniforms.px!.value = og.aoW / 2;                             // the stroke is centred on the outline: its outer half shows
      const m = o.group.children.find((c) => c.name === 'org-ao'); if (m) m.visible = (seat.uniforms.inkA!.value as number) > 0.0005;
    }
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

  dispose(): void { for (const o of this.objects) o.dispose(); for (const m of this.seats.values()) m.dispose(); this.art.dispose(); }
}
