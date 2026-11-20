// The lobule's tissue as ONE flat plate (WP5, atlas-look-plan.md §5.1): the 2D app's own painter (lobule-paint.js paintLobule, copied by
// scripts/copy-lobule.mjs) paints the hepatocyte plates, their membranes and nuclei, the nutmeg of congestion, the collagen of fibrosis and cirrhosis
// and the stellate cells into a canvas, once per state, and the canvas is laid on a flat square under the vessels. Nothing is extruded, so nothing
// shows a side wall; the plates are 2D's to the pixel. As in 2D ("drawn once into a cached canvas, never per frame"), a new state is painted into the
// second canvas and crossfaded in over PLATE_FADE_MS, so nothing jumps.
//
//   const plate = new LobulePlate(net);          group.add(plate.group)
//   plate.want(state, look)                       the state the tissue should show (cheap: compares a key)
//   plate.step(dtMs) → true while it fades        paints at most one state at a time, in the frame after it was asked for
import { CEL_TISSUE_GLSL, tissueInk } from './cel.ts';
import { CanvasTexture, Color, CustomBlending, DataTexture, DoubleSide, Group, LinearFilter, LinearMipmapLinearFilter, Mesh, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial } from 'three';
import { paintWorldInto, useTokens } from './from2d/lobule-paint.generated.js';
import type { LobuleNet, Course, P2 } from './geometry.ts';
import { LOBULE_R } from './shots.ts';
import { lookColours } from './lz-colours.ts';
import type { LookId } from '../../looks/looks.ts';

/** The painting's world units per lobule radius: the 2D app's lobule is about this many CSS px across on an iPad, so every pixel rule in its painter
 *  (a 0.6 px membrane, a 0.9 px nucleus at least, the fibres' widths) lands as it does in 2D. */
export const PLATE_S = 400;
/** The canvas covers the lobule out to this many radii each way (the hexagon's own fill reaches 1.015). */
export const PLATE_BOX = 1.04;
/** The canvas's side in pixels: a whole lobule at twice the fit on an iPad Pro stays sharp; mipmapped for the fit. */
export const PLATE_PX = 2048;
/** The plate's depth under the courses (the vessels lie at 0, their lowest edge about -0.07 when congested zone 3 dilates). */
export const PLATE_Z = -0.1;
export const PLATE_FADE_MS = 320;

/** The tissue values the painting reads (lobule-paint.js P.m), and the layers it draws. */
export interface PlateState { congU: number; septU: number; fibSin: number; act: number; fibPre: number; fibPost: number }

/** A state rounded to the steps the painting is redone at (1/32 of each value: finer than the eye sees on the plates, coarse enough that an easing
 *  model asks for a handful of paintings, not one a frame). */
export function plateKey(s: PlateState, look: LookId): string {
  const q = (x: number) => Math.round(Math.min(1, Math.max(0, x || 0)) * 32);
  return `${look}|${q(s.congU)},${q(s.septU)},${q(s.fibSin)},${q(s.act)},${q(s.fibPre)},${q(s.fibPost)}`;
}
const unkey = (k: string): PlateState => { const v = k.split('|')[1]!.split(',').map((x) => Number(x) / 32); return { congU: v[0]!, septU: v[1]!, fibSin: v[2]!, act: v[3]!, fibPre: v[4]!, fibPost: v[5]! }; };

/** Scene radii of the sinusoids (the view's RAD, in lobule radii): the space of Disse's collagen follows them. */
export interface SinCourse { c: Course; r: number }

/** The lobule's shape in the painter's world units (lobule-zoom.js worldShape), from the 3D network: centre at 0, y down, PLATE_S per radius. */
export function plateShape(net: LobuleNet) {
  const S = PLATE_S, sc = (p: P2): [number, number] => [p[0] * S, p[1] * S];
  return {
    R: S, cx: 0, cy: 0, rt: net.rt * S, rs0: net.rs0 * S, rcv0: net.rcv0 * S,
    lobules: [{ x: 0, y: 0, corners: net.corners.map(sc) }],
    cells: net.cells.map((k) => ({ x: k.x * S, y: k.y * S, a: k.a, l: k.l * S, w: k.w * S, tone: k.tone, nu: k.nu, q: k.q, drop: k.drop, jx: k.jx, jy: k.jy, ja: k.ja })),
    hsc: net.stellate.map((k) => ({ x: k.x * S, y: k.y * S, a: k.a, nx: k.nx, ny: k.ny })),
    septaPC: net.septa.map((pts) => ({ pts: pts.map(sc) })),
  };
}

/** What paintLobule reads for a state and a look (lobule-zoom.js worldInput). */
export function plateInput(G: ReturnType<typeof plateShape>, sins: readonly SinCourse[], cvR: number, s: PlateState, look: LookId) {
  const L = lookColours(look), S = PLATE_S;
  const bg = L.text('--stage-bg') ? L.rgb01('--stage-bg') : L.rgb01('--bg');
  return {
    m: { congU: s.congU, septU: s.septU, fibSin: s.fibSin, act: s.act, fibPre: s.fibPre, fibPost: s.fibPost },
    G, dark: L.dark, zonesOn: false,   // (the Zones layer is its own overlay, so it eases in and out with no new painting: zones.ts)
    rgb: { bg, gap: L.rgb01('--og-liver-2'), cell: L.rgb01('--og-liver-1'), col: L.rgb01('--lz-septum'), dis: L.rgb01('--collagen') },
    sin: s.fibSin > 0.05 ? sins.map(({ c, r }) => ({ pts: c.pts.map((p) => [p[0] * S, p[1] * S]), r: r * S })) : [],
    cvIn: s.fibPost > 0.05 ? cvR * S : 0,
  };
}

/** Paints one state of the tissue into a 2D context the size of the plate's canvas (n × n). */
export function paintPlate(ctx: CanvasRenderingContext2D, n: number, G: ReturnType<typeof plateShape>, sins: readonly SinCourse[], cvR: number, s: PlateState, look: LookId): void {
  const L = lookColours(look);
  useTokens((name: string, a?: number | string) => L.tk(name, a));
  const B = PLATE_BOX * PLATE_S, sc = n / (2 * B);
  paintWorldInto(ctx, n, sc, -B, -B, plateInput(G, sins, cvR, s, look));
}

export const LOBULE_PLATE_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// (The canvas is sent premultiplied, so its transparent edge filters to nothing rather than to a dark fringe; the colours are the canvas's sRGB as they are,
// as the cel shaders write theirs.)
export const LOBULE_PLATE_FS = /* glsl */ `
${CEL_TISSUE_GLSL}
uniform sampler2D map;
uniform float opacity;
uniform vec3 ink;   // 2D's casing over the cell colour: the colour of the clean line on every strong edge (cel.ts)
varying vec2 vUv;
void main() {
  vec4 p = texture2D(map, vUv);
  if (p.a < 0.002) { gl_FragColor = vec4(0.0); return; }
  vec3 c = p.rgb / p.a;
  // the tissue in three flat tones about its own local lightness (the painted colour blurred a few mip levels), hard edges one pixel wide
  vec4 m = texture2D(map, vUv, 3.0);
  float lb = celLight(m.rgb / max(m.a, 1e-3));
  float dv = (celLight(c) - lb) / max(lb, 0.08);
  c = celTissue(c, lb, max(fwidth(dv) * CEL_EDGE_PX * 1.5, 1e-3));
  // the clean ink: every strong edge of the painting takes 2D's casing line, LINE_MIN device px across
  vec2 uvPerPx = vec2(length(vec2(dFdx(vUv.x), dFdy(vUv.x))), length(vec2(dFdx(vUv.y), dFdy(vUv.y))));
  c = mix(c, ink, smoothstep(CEL_EDGE_LO, CEL_EDGE_HI, celEdge(map, vUv, uvPerPx)));
  gl_FragColor = vec4(c * p.a, p.a) * opacity;
}`;

/** A clear 1 × 1 texture, so a sampler always has a value (no canvas: node, or a browser that gave none). */
export const blankTexture = (): DataTexture => { const t = new DataTexture(new Uint8Array(4), 1, 1); t.needsUpdate = true; return t; };

/** A canvas-backed plate (null canvas in node: nothing is painted, the bookkeeping still runs). */
export type MakeCanvas = (n: number) => HTMLCanvasElement | null;
export const defaultCanvas: MakeCanvas = (n) => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = n; return c;
};

interface Slot { mesh: Mesh; mat: ShaderMaterial; tex: CanvasTexture | null; canvas: HTMLCanvasElement | null; key: string }

export class LobulePlate {
  readonly group = new Group();
  private readonly G: ReturnType<typeof plateShape>;
  private readonly slots: [Slot, Slot];
  private front = 0;
  /** The key on the front plate, the one wanted, and the crossfade's progress (1: the front alone). */
  private shown = '';
  private wanted = '';
  private fade = 1;
  /** How many times the tissue was painted (for the tests: a state change paints once, a frame of the same state never). */
  paints = 0;
  private readonly sins: readonly SinCourse[];
  private readonly cvR: number;
  constructor(net: LobuleNet, sins: readonly SinCourse[], cvR: number, makeCanvas: MakeCanvas = defaultCanvas) {
    this.sins = sins; this.cvR = cvR;
    this.G = plateShape(net);
    const side = 2 * PLATE_BOX * LOBULE_R;
    const geo = new PlaneGeometry(side, side);
    const mk = (order: number): Slot => {
      const canvas = makeCanvas(PLATE_PX);
      let tex: CanvasTexture | null = null;
      if (canvas) {
        tex = new CanvasTexture(canvas);
        tex.flipY = true; tex.premultiplyAlpha = true; tex.generateMipmaps = true; tex.minFilter = LinearMipmapLinearFilter; tex.magFilter = LinearFilter; tex.anisotropy = 4;
      }
      const mat = new ShaderMaterial({
        vertexShader: LOBULE_PLATE_VS, fragmentShader: LOBULE_PLATE_FS, uniforms: { map: { value: tex ?? blankTexture() }, opacity: { value: 0 }, ink: { value: new Color() } },
        transparent: true, depthWrite: false, side: DoubleSide,
        blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.z = PLATE_Z; mesh.renderOrder = order; mesh.visible = false; mesh.name = 'lobule/plate';
      this.group.add(mesh);
      return { mesh, mat, tex, canvas, key: '' };
    };
    this.slots = [mk(-2), mk(-1)];
  }

  /** The meshes (picking: a tap on the tissue is a tap on the cords). */
  get meshes(): readonly Mesh[] { return this.slots.map((s) => s.mesh); }
  get key(): string { return this.shown; }
  get pending(): boolean { return this.wanted !== this.shown || this.fade < 1; }

  want(s: PlateState, look: LookId): void {
    this.wanted = plateKey(s, look);
    if (look !== this.inkLook) { this.inkLook = look; const c = tissueInk(look); for (const sl of this.slots) (sl.mat.uniforms.ink!.value as Color).setRGB(c[0], c[1], c[2]); }
  }
  private inkLook: LookId | '' = '';

  /** Paints the wanted state straight onto the front plate, no crossfade (the view opening, a new look). */
  snap(): void { if (this.wanted && this.wanted !== this.shown) { this.paintInto(this.slots[this.front]!, this.wanted); this.shown = this.wanted; } this.fade = 1; this.show(); }

  /** One frame: finishes the crossfade under way, or begins the next one. True while anything changes. */
  step(dtMs: number, reduce = false): boolean {
    if (this.fade < 1) {
      this.fade = reduce ? 1 : Math.min(1, this.fade + dtMs / PLATE_FADE_MS);
      if (this.fade >= 1) this.front = 1 - this.front;
      this.show();
      return true;
    }
    if (!this.wanted || this.wanted === this.shown) return false;
    if (!this.shown) { this.snap(); return true; }
    // (one painting at a time: the next state waits for this one's fade, so an easing model paints a few times in all, never every frame)
    const back = this.slots[1 - this.front]!;
    this.paintInto(back, this.wanted);
    this.shown = this.wanted;
    this.fade = reduce ? 1 : 0;
    if (reduce) this.front = 1 - this.front;
    this.show();
    return true;
  }

  private paintInto(slot: Slot, key: string): void {
    this.paints++;
    slot.key = key;
    if (!slot.canvas || !slot.tex) return;
    const ctx = slot.canvas.getContext('2d');
    if (!ctx) return;
    const look = key.split('|')[0] as LookId;
    paintPlate(ctx, PLATE_PX, this.G, this.sins, this.cvR, unkey(key), look);
    slot.tex.needsUpdate = true;
  }

  /** The two plates' opacities: the front whole, the back coming in over it (painted over, so the pair never shows the field through). */
  private show(): void {
    const f = this.slots[this.front]!, b = this.slots[1 - this.front]!;
    if (this.fade >= 1) {
      f.mesh.visible = !!f.key; f.mat.uniforms.opacity!.value = 1; f.mesh.renderOrder = -2;
      b.mesh.visible = false; b.mat.uniforms.opacity!.value = 0;
    } else {
      f.mesh.visible = true; f.mat.uniforms.opacity!.value = 1; f.mesh.renderOrder = -2;
      b.mesh.visible = true; b.mat.uniforms.opacity!.value = this.fade; b.mesh.renderOrder = -1;
    }
  }

  dispose(): void { for (const s of this.slots) { s.tex?.dispose(); s.mat.dispose(); } this.slots[0].mesh.geometry.dispose(); }
}
