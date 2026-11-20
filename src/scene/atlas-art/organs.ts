// The atlas organs (Settings > Figure depth > Atlas art): the artist's meshes in the artist's shader, in place of the classic organ layer while Atlas is on. Static meshes in the app's own
// frame, identity transforms. Swapped by the patient's specimen (specimen.ts): the liver, spleen and bowel by name, with the ascites mesh in the diseased forms. A swap is a crossfade, never a
// pop. The classic organ layer keeps running underneath, hidden (its liver follow, spleen scale and pick state are still the figure's), so going back to Classic is a visibility switch.
//
// What the atlas organs follow from the live patient: the specimen, the spleen's size (the healthy form; the diseased forms are already drawn enlarged) and its ghost after a splenectomy,
// the ascites volume (the pool's height and its fade-in, the 2D rules' own numbers), the grey of a lens other than Pressure, the body's dissolve (the dive, the Circuit) and the dive's
// cutaway window. What they do not follow: a live liver shape (the specimens are the three shapes), the spleen's partial-embolization infarct, and the quiet depth of a turn.
import { BackSide, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, GLSL3, type Mesh as MeshT, Mesh, type Raycaster, RawShaderMaterial, type Texture, Vector3, type Vector2, type Vector4 } from 'three';
import { ATLAS_FS, ATLAS_INK_FS, ATLAS_INK_VS, ATLAS_VS, stripVersion } from './shaders.ts';
import { CASING } from '../vessels/cel-ink.ts';
import type { LookId } from '../../looks/looks.ts';
import { ATLAS_PALETTE, type AtlasKey } from './palette.ts';
import type { GlbMesh } from './glb.ts';
import type { Specimen } from './types.ts';
import { PICK_OF } from '../organs/pick.ts';
import { LENS_GREY, SPLEEN_CENTER } from '../disease/copied/anatomy-b4.ts';
import { fluidLevel, poolFade, POOL_MIN } from '../disease/copied/fluid-step.js';
import { x3, y3 } from '../frame2d.ts';


/** The organs that never change with the disease (the artist's healthy file); liver, spleen and bowel swap, and the ascites comes with the diseased files. */
export const FIXED_ORGANS = ['heart', 'heart-ra', 'kidney-l', 'kidney-r', 'duodenum', 'stomach', 'colon'] as const;
export const SWAP_ORGANS = ['liver', 'spleen', 'bowel'] as const;
/** Back to front, as the classic layer draws them (the gut last); the pool after all of them. */
const ORDER = ['heart', 'heart-ra', 'kidney-l', 'kidney-r', 'spleen', 'stomach', 'duodenum', 'liver', 'bowel', 'colon', 'ascites'];
/** The artist's alpha for the fluid proxy (the node's extras) and how long a crossfade takes. */
export const ASCITES_ALPHA = 0.28;
const FADE_TAU = 0.12;   // seconds
/** The fluid's full height as a share of the proxy at the fullest belly, and the least it shows at: the proxy is a fixed trapezoid, so a pool is the proxy squeezed up from its floor. */
const POOL_LEAST = 0.22;

/** The ink line's width in the figure's units (the 2D organ line is 1.1, a touch firmer here for the cel look), never under 1.5 device px (shaders.ts ATLAS_INK_VS). */
export const INK_UNITS = 1.4;

interface Part {
  id: string;
  /** the transform of the organ and of its ink (the spleen's size) */
  g: Group;
  /** the ink hull's mesh and material (none on the ascites) */
  ink: MeshT | null; inkMat: RawShaderMaterial | null;
  /** which form it belongs to (the swapped organs and the ascites); undefined: the organs that do not change */
  specimen?: Specimen;
  mesh: MeshT;
  mat: RawShaderMaterial;
  /** 0..1, eased toward `goal` */
  mix: number; goal: number;
  /** the mesh's own lowest y (the pool is squeezed up from it) */
  floorY: number;
}

const geometryOf = (m: GlbMesh): BufferGeometry => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.position, 3));
  if (m.normal) g.setAttribute('normal', new BufferAttribute(m.normal, 3)); else { g.setIndex(new BufferAttribute(m.index, 1)); g.computeVertexNormals(); }
  if (m.uv) g.setAttribute('uv', new BufferAttribute(m.uv, 2)); else g.setAttribute('uv', new BufferAttribute(new Float32Array((m.position.length / 3) * 2), 2));
  // COLOR_0 is the artist's linear multiplicative wash (3 values a vertex); an organ without one is washed 1
  g.setAttribute('color', new BufferAttribute(m.color ?? new Float32Array(m.position.length).fill(1), 3));
  g.setIndex(new BufferAttribute(m.index, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
};

export class AtlasOrgans {
  readonly group = new Group();
  private readonly parts: Part[] = [];
  private readonly loaded = new Set<Specimen>();
  private grain: Texture | null = null;
  private cut: { value: Vector4 };
  private res: { value: Vector2 };
  private look: LookId = 'light';
  private dark = false;
  private specimen: Specimen = 'healthy';
  /** the form shown (the wanted one once it is in) and the volume of the ascites in mL */
  private shown: Specimen = 'healthy';
  private ascites = 0;
  private spleenScale = 1; private spleenGhost = 1;
  private body = 1;
  private grey = false;
  private dim = 1; private sat = 1;
  private lastClock = -1;
  private dirty = true;
  private visible = false;

  /** `cut`: the dive's window (organs/layer.ts ORGAN_CUT), shared with the classic organs. */
  constructor(cut: { value: Vector4 }, res: { value: Vector2 }) { this.cut = cut; this.res = res; this.group.visible = false; }

  /** Whether the form `s`'s organ file is in. */
  has(s: Specimen): boolean { return this.loaded.has(s); }

  /** The grain every material reads (a linear grayscale texture, repeat wrap, mipmaps: loader.ts). */
  setGrain(t: Texture): void { this.grain = t; for (const p of this.parts) p.mat.uniforms.uGrain!.value = t; }

  /** Adds one organ file: the healthy file brings the organs that never change; every file brings its liver, spleen and bowel (and the ascites proxy). */
  add(s: Specimen, meshes: readonly GlbMesh[]): void {
    if (this.loaded.has(s)) return;
    this.loaded.add(s);
    for (const m of meshes) {
      const fixed = (FIXED_ORGANS as readonly string[]).includes(m.name), swap = (SWAP_ORGANS as readonly string[]).includes(m.name), asc = m.name === 'ascites';
      if (!(swap || asc || (fixed && s === 'healthy'))) continue;
      const g = geometryOf(m);
      const mat = new RawShaderMaterial({
        glslVersion: GLSL3, vertexShader: stripVersion(ATLAS_VS), fragmentShader: stripVersion(ATLAS_FS), transparent: true, depthWrite: !asc, side: asc ? DoubleSide : 0,
        uniforms: {
          uGrain: { value: this.grain }, uColor: { value: new Color() }, uDark: { value: 0 }, uAlpha: { value: 1 }, uFlat: { value: asc ? 1 : 0 }, cut: this.cut,
        },
      });
      const order = Math.max(0, ORDER.indexOf(m.name));
      const grp = new Group();
      grp.name = asc ? `atlas ascites (${s})` : `atlas ${m.name}`;
      grp.visible = false;
      const mesh = new Mesh(g, mat);
      mesh.renderOrder = order;
      grp.add(mesh);
      // the ink line: the same mesh again, back faces only, pushed out in screen space (shaders.ts); after its own fill, tested against it
      let ink: MeshT | null = null, inkMat: RawShaderMaterial | null = null;
      if (!asc) {
        inkMat = new RawShaderMaterial({
          glslVersion: GLSL3, vertexShader: stripVersion(ATLAS_INK_VS), fragmentShader: stripVersion(ATLAS_INK_FS), transparent: true, depthWrite: false, side: BackSide,
          uniforms: { px: { value: INK_UNITS }, dpr: { value: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1 }, res: this.res, inkColor: { value: new Color() }, inkA: { value: 0.64 }, uAlpha: { value: 1 }, cut: this.cut },
        });
        ink = new Mesh(g, inkMat);
        ink.renderOrder = order + 0.5;
        grp.add(ink);
      }
      this.group.add(grp);
      this.parts.push({ id: m.name, g: grp, ink, inkMat, specimen: swap || asc ? s : undefined, mesh, mat, mix: 0, goal: 0, floorY: g.boundingBox?.min.y ?? 0 });
    }
    this.dirty = true;
  }

  /** The look: the artist's Light palette on Light and Soft, his Dark palette on the dark looks (`dark`), and the look's own casing ink for the outline line. */
  setLook(look: LookId, dark: boolean): void { if (look !== this.look || dark !== this.dark) { this.look = look; this.dark = dark; this.dirty = true; } }
  /** The form the patient is: what the swapped organs crossfade to once its file is in (until then the form shown stays). */
  setSpecimen(s: Specimen): void { if (s !== this.specimen) { this.specimen = s; this.dirty = true; } }
  /** The patient's ascites (mL), the spleen's size against normal and its splenic treatment (2 = removed: a ghost), from the engine's body targets. */
  setBody(ascitesMl: number, spleenScale: number, splenicRx: 0 | 1 | 2, instant = false): void {
    this.ascites = ascitesMl; this.spleenScale = spleenScale; this.spleenGhost = splenicRx === 2 ? 0.14 : 1;
    if (instant) this.snap();
    this.dirty = true;
  }
  /** A lens other than Pressure greys the organs, as the classic layer does (organ-dim.js). */
  setLensGrey(on: boolean): void { if (on !== this.grey) { this.grey = on; this.dirty = true; } }
  /** The body's dissolve (the dive into the liver, the Circuit's turn): 1 whole, 0 gone. */
  setFade(f: number): void { if (f !== this.body) { this.body = f; this.dirty = true; } }
  /** Shown or not (Atlas art on and its files in). Going back to Classic is this with false. */
  setVisible(on: boolean): void { if (on !== this.visible) { this.visible = on; this.group.visible = on; this.dirty = true; } }

  /** Which of the forms' files the patient needs now: its own, and the diseased ascites proxy when there is a pool in a healthy-form patient. */
  needs(): Specimen[] {
    const out: Specimen[] = [this.specimen];
    if (this.specimen === 'healthy' && this.ascites >= POOL_MIN) out.push('cirr-decomp');
    return out;
  }

  /** The form the swapped organs show: the wanted one when its file is in, else the one already showing. */
  private pickShown(): Specimen { if (this.loaded.has(this.specimen)) return this.specimen; return this.loaded.has(this.shown) ? this.shown : 'healthy'; }
  /** The form the ascites proxy comes from: the patient's own file's, else the decompensated one's (a healthy-form patient with a pool). */
  private ascitesFrom(): Specimen | null {
    for (const s of [this.shown, 'cirr-decomp', 'budd-chiari'] as Specimen[]) if (s !== 'healthy' && this.loaded.has(s)) return s;
    return null;
  }

  /** Which form and which pool each part is for now. */
  private setGoals(): void {
    const shown = this.pickShown();
    if (shown !== this.shown) { this.shown = shown; this.dirty = true; }
    const asc = this.ascitesFrom(), pool = poolFade(this.ascites) > 0;
    for (const p of this.parts) p.goal = p.id === 'ascites' ? (pool && p.specimen === asc ? 1 : 0) : p.specimen === undefined ? 1 : p.specimen === this.shown ? 1 : 0;
  }
  /** Takes every crossfade to its end at once (Atlas has just come on, or a new patient: nothing eases across a jump). */
  snap(): void { this.setGoals(); for (const p of this.parts) p.mix = p.goal; this.dirty = true; }

  /** Steps the crossfades one frame; true while anything moves. */
  update(now: number): boolean {
    const dt = this.lastClock < 0 ? 0.016 : Math.min(0.1, (now - this.lastClock) / 1000);
    this.lastClock = now;
    if (!this.visible) return false;
    this.setGoals();
    let moving = false;
    const k = 1 - Math.exp(-dt / FADE_TAU);
    for (const p of this.parts) {
      if (p.mix !== p.goal) {
        p.mix += (p.goal - p.mix) * k;
        if (Math.abs(p.goal - p.mix) < 0.003) p.mix = p.goal;
        moving = true; this.dirty = true;
      }
    }
    const g = this.grey ? LENS_GREY : { dim: 1, sat: 1 }, kd = 1 - Math.exp(-dt / 0.42);
    if (this.dim !== g.dim || this.sat !== g.sat) {
      this.dim += (g.dim - this.dim) * kd; this.sat += (g.sat - this.sat) * kd;
      if (Math.abs(g.dim - this.dim) < 0.002 && Math.abs(g.sat - this.sat) < 0.002) { this.dim = g.dim; this.sat = g.sat; }
      moving = true; this.dirty = true;
    }
    if (this.dirty) { this.paint(); this.dirty = false; }
    return moving;
  }

  private readonly c = new Color();
  private paint(): void {
    const pal = this.dark ? ATLAS_PALETTE.dark : ATLAS_PALETTE.light;
    const pool = Math.min(1, Math.max(POOL_LEAST, POOL_LEAST + (1 - POOL_LEAST) * (fluidLevel(this.ascites).h / 485)));
    for (const p of this.parts) {
      const key: AtlasKey = p.id === 'liver' ? (p.specimen === 'cirr-decomp' ? 'liver.cirr' : p.specimen === 'budd-chiari' ? 'liver.budd' : 'liver') : (p.id as AtlasKey);
      this.c.set(pal[key] ?? pal.liver);
      if (this.sat !== 1) { const l = 0.2126 * this.c.r + 0.7152 * this.c.g + 0.0722 * this.c.b; this.c.r = l + (this.c.r - l) * this.sat; this.c.g = l + (this.c.g - l) * this.sat; this.c.b = l + (this.c.b - l) * this.sat; }
      (p.mat.uniforms.uColor!.value as Color).copy(this.c);
      p.mat.uniforms.uDark!.value = this.dark ? 1 : 0;
      const asc = p.id === 'ascites';
      let a = this.body * p.mix * (asc ? ASCITES_ALPHA * poolFade(this.ascites) : this.dim);
      if (p.id === 'spleen') a *= this.spleenGhost;
      p.mat.uniforms.uAlpha!.value = a;
      p.g.visible = this.visible && a > 0.003;
      if (p.inkMat) {
        const k = CASING[this.look];
        (p.inkMat.uniforms.inkColor!.value as Color).setRGB(k.rgb[0] / 255, k.rgb[1] / 255, k.rgb[2] / 255);   // (sRGB as is: the ink pass writes it unconverted, as the cel shaders do)
        p.inkMat.uniforms.inkA!.value = k.a; p.inkMat.uniforms.uAlpha!.value = a;
      }
      if (asc) { p.g.scale.y = pool; p.g.position.y = p.floorY * (1 - pool); }
      if (p.id === 'spleen') {
        // the healthy form's spleen is the model's size about its centre, as the classic one is (the diseased forms are drawn enlarged already)
        const s = p.specimen === 'healthy' ? this.spleenScale : 1, cx = x3(SPLEEN_CENTER[0]), cy = y3(SPLEEN_CENTER[1]);
        p.g.scale.setScalar(s); p.g.position.set(cx * (1 - s), cy * (1 - s), 0);
      }
    }
  }

  /** The meshes now drawn, by organ id (the bounding box and pick read them). */
  private drawn(): Part[] { return this.parts.filter((p) => p.g.visible && p.mat.uniforms.uAlpha!.value > 0.35); }

  /** The organ a pointer ray hits first among the ones that take a tap, as organs/layer.ts answers it. */
  pick(rc: Raycaster): { id: 'liver' | 'heart' | 'spleen'; x: number } | null {
    const parts = this.drawn().filter((p) => PICK_OF[p.id]);
    for (const p of parts) p.mesh.updateWorldMatrix(true, false);
    const hit = rc.intersectObjects(parts.map((p) => p.mesh), false)[0];
    if (!hit) return null;
    const p = parts.find((q) => q.mesh === hit.object);
    return p ? { id: PICK_OF[p.id]!, x: hit.point.x } : null;
  }

  /** The drawn mesh of an organ id (the form shown), for the labels' boxes. */
  meshOf(id: string): MeshT | null { return this.drawn().find((p) => p.id === id)?.mesh ?? null; }

  /** Anchor points the label layer can use, for tests and tags: the centre of an organ's box in the scene. */
  centreOf(id: string, out = new Vector3()): Vector3 | null {
    const m = this.meshOf(id);
    if (!m?.geometry.boundingBox) return null;
    return m.geometry.boundingBox.getCenter(out);
  }

  dispose(): void { for (const p of this.parts) { p.mesh.geometry.dispose(); p.mat.dispose(); p.inkMat?.dispose(); } this.parts.length = 0; this.loaded.clear(); }
}
