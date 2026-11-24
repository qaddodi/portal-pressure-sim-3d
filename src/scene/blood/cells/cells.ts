// Blood streaks (Settings > Figure depth > Blood streaks, off by default; the chevrons stay the flow mark). They were discs ("bubbles", Mohammad, 20 Nov); now fine lines along the flow (shader.ts). One THREE.Points, one draw call, a vertex a cell. Nothing about a
// cell is worked out per frame on the CPU: each carries (vessel, phase, thinning order) and the vertex shader (shader.ts) finds its place on the vessel's course, slides it with
// the blood's own distance (the chevrons' stream, from the engine's flow), and counts itself in or out by the vessel's flow. The CPU keeps three small textures current, and only
// when something changed: the courses (from the tubes' own vertices, read again when a vessel reshapes), and a row of numbers a vessel (length, width rule, fade, draw-on).
//
// Off costs nothing: the layer is built the first time it is wanted, not in the scene before then; once faded out it is not visible, so it is not drawn, and it asks for no frame.
// With Reduce Motion on the cells are not drawn at all. In the Circuit, the lobule and the sinusoid they are not drawn (those views have their own blood).
import { BufferGeometry, Color, DataTexture, Float32BufferAttribute, FloatType, NearestFilter, type Object3D, Points, RGBAFormat, ShaderMaterial, Sphere, type Texture, type Vector4 } from 'three';
import { EDGES } from '../../../engine/hales/portal/topology.js';
import { EDGE_COUNT, indexOf } from '../../../engine/vessel-data.ts';
import { useSettings } from '../../../state/settings.ts';
import type { CelShared } from '../../materials/cel.ts';
import type { LensShared, VesselObject } from '../../vessels/vessel-object.ts';
import type { NetVessel } from '../../vessels/network.ts';
import { BACK_EDGES } from '../../anatomy/source.ts';
import { CAVA_LIKE } from '../../vessels/fades.ts';
import { tubularOf } from '../../vessels/shape.ts';
import { slicesFor } from '../../circuit/geometry.ts';
import type { BloodShared } from '../field.ts';
import { CELLS_FS, CELLS_VS } from './shader.ts';
import {
  CELL_SAMPLES, EDGE_ROWS, UNITS, type BudgetEdge, type EdgeLive, cellCap, cellsWanted, designFlow, easeAmount, layoutCells, particleBudget, resample, ringCentres, writeCourse, writeEdgeLength, writeEdgeLive, writeEdgeStatic,
} from './core.ts';

/** The scene units to the figure's own 2D units (the vessel shader's `* 300`). */
/** The vessel behind the organs shows through them at 0.4 (the veil, vessel-object.ts), the cava at a fraction of that: its cells follow. */
const VEIL = 0.4, CAVA_VEIL = 0.2;
const FADE_MS = 240;

export interface CellsDeps {
  vessels: readonly NetVessel[];
  object(id: string): VesselObject | undefined;
  shared: CelShared;
  lens: LensShared;
  blood: BloodShared;
  /** the group the vessels are in (the cells share its frame) */
  parent: Object3D;
  /** the camera layer of everything drawn over the organs: the vessels' */
  layer: number;
  phone(): boolean;
}
export interface CellsFrame {
  view: 'body' | 'circuit' | 'lobule' | 'sinusoid';
  /** the Circuit's change, 0 the body to 1 the map */
  circuit: number;
  /** how much of the body shows (the dive into the liver dissolves it) */
  body: number;
  /** the blood's streams are moving (so the cells are) */
  flowMoving: boolean;
  /** a procedure is on the figure: no streaks while it runs */
  quiet?: boolean;
}

interface Item { e: number; obj: VesselObject; seg: number; len: number }

const tex = (data: Float32Array, w: number, h: number): DataTexture => {
  const t = new DataTexture(data, w, h, RGBAFormat, FloatType);
  t.minFilter = t.magFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
};

/** What the blood streaks' material is built with besides its shaders (the program stand-in, materials/prototypes.ts, wears the same). */
export const STREAK_FLAGS = { transparent: true, depthWrite: false, depthTest: true } as const;

export class BloodCells {
  private points: Points | null = null;
  private material: ShaderMaterial | null = null;
  private items: Item[] = [];
  private course = new Float32Array(0);
  private edge = new Float32Array(0);
  private courseTex: DataTexture | null = null;
  private edgeTex: DataTexture | null = null;
  private amount = 0;
  private builtPhone = false;
  private reduced: MediaQueryList | null | undefined;
  private readonly live: EdgeLive = { reveal: 1, visible: 1, fadeMode: 0, fadeA: [0, 1, 1, 1], fadeLine: [0, 0, 0, 1] };
  /** how many cells the last build made (the tests and ?perf read it) */
  count = 0;

  private readonly deps: CellsDeps;
  constructor(deps: CellsDeps) { this.deps = deps; }

  /** The layer is in the scene (built); it may still be faded out. */
  get built(): boolean { return !!this.points; }
  /** The one object, or null while it has never been wanted. */
  get object(): Points | null { return this.points; }
  /** How much of the layer shows now, 0 to 1. */
  get shown(): number { return this.amount; }

  private firstWaited = false;
  private reduceMotion(): boolean {
    if (this.reduced === undefined) this.reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    return !!this.reduced?.matches;
  }

  /** Steps the layer one frame. Returns true while it needs frames: fading in or out, or on and the blood moving. Off and faded out it does nothing at all. */
  step(dtMs: number, f: CellsFrame): boolean {
    const want = cellsWanted({ on: useSettings.getState().particles, reduceMotion: this.reduceMotion(), view: f.view, quiet: f.quiet });
    if (!want && this.amount === 0) { if (this.points) this.points.visible = false; this.deps.blood.streakAmt.value = 0; return false; }
    if (want && (!this.points || this.builtPhone !== this.deps.phone())) {
      // (the first build is 10 ms: it waits one frame, so the first frame's update is not the one that pays for it. The streaks fade in from 0 anyway, so nothing shows the delay.)
      if (!this.points && !this.firstWaited) { this.firstWaited = true; return true; }
      this.build();
    }
    const pts = this.points, mat = this.material;
    if (!pts || !mat) return false;
    const goal = want ? 1 : 0;
    this.amount = easeAmount(this.amount, goal, dtMs, FADE_MS);
    // (a program the device refused is swapped for a plain material by the shader guard: the cells are then not drawn, never as grey dots)
    const drawn = this.amount > 0.001 && pts.material === mat;
    // THE STREAKS ARE PART OF THE TUBES (vessels/shaders.ts, in the tube's own fragment shader: contained in the lumen, following its alpha and fades by construction). This layer keeps the amount
    // (the setting, the view, the Circuit) and hands it to them; its own sprites are never drawn, so nothing can stray past a tube's end.
    pts.visible = false;
    this.deps.blood.streakAmt.value = drawn ? this.amount * (1 - Math.min(1, Math.max(0, f.circuit))) * Math.min(1, Math.max(0, f.body)) : 0;
    if (!drawn) return false;
    mat.uniforms.amount!.value = this.deps.blood.streakAmt.value;
    this.poll();
    return this.amount !== goal || f.flowMoving;
  }

  /** Makes the layer: the cells of every vessel by the budget, the course and edge textures, the one Points. Rebuilt when the device class changes (a phone's budget is half). */
  private build(): void {
    this.dropGpu();
    const { deps } = this;
    const phone = deps.phone();
    const flows = new Map((EDGES as { id: string; Q?: number }[]).map((e) => [e.id, e.Q ?? 0]));
    const items: Item[] = [];
    const budget: BudgetEdge[] = Array.from({ length: EDGE_COUNT }, () => ({ flow: 0, length: 0, radius: 0 }));
    for (const v of deps.vessels) {
      if (v.feeder || v.plan?.kind !== 'coil') continue;
      const obj = deps.object(v.id);
      if (!obj) continue;
      const e = indexOf(v.id), len = obj.toon.uniforms.len!.value as number;
      items.push({ e, obj, seg: tubularOf(v, slicesFor(v.id))[0]!, len });
      budget[e] = { flow: designFlow(flows.get(v.id) ?? 0), length: len * UNITS, radius: v.radius * UNITS };
    }
    const counts = particleBudget(budget, cellCap(phone));
    const layout = layoutCells(counts);

    this.course = new Float32Array(EDGE_COUNT * CELL_SAMPLES * 4);
    this.edge = new Float32Array(EDGE_COUNT * EDGE_ROWS * 4);
    for (const it of items) {
      const v = deps.vessels.find((x) => x.id === it.obj.edge!.id)!;
      writeEdgeStatic(this.edge, EDGE_COUNT, it.e, {
        length: it.len * UNITS, radius: v.radius, baseD: v.baseD, design: budget[it.e]!.flow, widthKind: v.widthKind, tone: v.tone === 'portal' ? 0 : v.tone === 'sys' ? 1 : 2, taper: v.taper,
        veil: CAVA_LIKE.has(v.id) ? CAVA_VEIL : BACK_EDGES.has(v.id) ? VEIL : 1,
      });
      this.sample(it);
    }
    this.items = items;
    this.courseTex = tex(this.course, CELL_SAMPLES, EDGE_COUNT);
    this.edgeTex = tex(this.edge, EDGE_COUNT, EDGE_ROWS);

    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(layout.place, 3));
    g.setAttribute('aB', new Float32BufferAttribute(layout.extra, 4));
    g.boundingSphere = new Sphere(undefined, 1e6);   // (the cells are placed in the shader: the positions in the buffer mean nothing to a bounding volume)
    const tone = (t: string): { value: Color } => (deps.object(deps.vessels.find((v) => v.tone === t && !v.feeder)?.id ?? '')?.toon.uniforms.color as { value: Color } | undefined) ?? { value: new Color(0.5, 0.5, 0.5) };
    const lens = deps.lens, b = deps.blood, sh = deps.shared;
    this.material = new ShaderMaterial({
      name: 'blood streaks', vertexShader: CELLS_VS, fragmentShader: CELLS_FS, ...STREAK_FLAGS,
      uniforms: {
        streamTex: b.streamTex as { value: Texture }, projY: b.projY, dpr: b.dpr, res: sh.res, vdata: sh.vdata, vdataSize: sh.vdataSize,
        courseTex: { value: this.courseTex }, edgeTex: { value: this.edgeTex }, amount: { value: 0 },
        tubeDark: ((deps.object(deps.vessels.find((x) => !x.feeder)?.id ?? '')?.toon.uniforms.tubeDark as { value: number } | undefined) ?? { value: 0 }),
        colPortal: tone('portal'), colSys: tone('sys'), colArt: tone('artery'),
        lensMix: lens.lensMix, lensModeA: lens.lensModeA, lensModeB: lens.lensModeB, lensRawA: lens.lensRawA, lensRawB: lens.lensRawB,
        lensGradA: lens.lensGradA, lensLaneA: lens.lensLaneA, lensGradB: lens.lensGradB, lensLaneB: lens.lensLaneB, laneColA: lens.laneColA, laneColB: lens.laneColB,
      },
    });
    const pts = new Points(g, this.material);
    pts.name = 'blood streaks'; pts.frustumCulled = false; pts.renderOrder = 10; pts.visible = false;
    pts.raycast = () => undefined;   // (never picked)
    pts.layers.set(deps.layer);
    deps.parent.add(pts);
    this.points = pts; this.builtPhone = phone; this.count = layout.count;
  }

  /** The vessel's course from its tube's own vertices into its row of the course texture. */
  private sample(it: Item): void {
    const pos = it.obj.toonMesh.geometry.getAttribute('position').array;
    writeCourse(this.course, it.e, resample(ringCentres(pos, it.seg)));
  }

  /** Brings the textures up to date with the vessels: a reshaped course (its length changed), a fade or a draw-on that moved. Uploads only what changed. */
  private poll(): void {
    let courseDirty = false, edgeDirty = false;
    const l = this.live;
    for (const it of this.items) {
      const u = it.obj.toon.uniforms;
      const len = u.len!.value as number;
      if (len !== it.len) { it.len = len; this.sample(it); courseDirty = true; if (writeEdgeLength(this.edge, EDGE_COUNT, it.e, len * UNITS)) edgeDirty = true; }
      const a = u.fadeA!.value as Vector4, ln = u.fadeLine!.value as Vector4;
      l.reveal = u.reveal!.value as number;
      l.visible = it.obj.group.visible && (u.dotted!.value as number) < 0.5 ? 1 : 0;
      l.fadeMode = u.fadeMode!.value as number;
      l.fadeA[0] = a.x; l.fadeA[1] = a.y; l.fadeA[2] = a.z; l.fadeA[3] = a.w; l.fadeLine[0] = ln.x; l.fadeLine[1] = ln.y; l.fadeLine[2] = ln.z; l.fadeLine[3] = ln.w;
      if (writeEdgeLive(this.edge, EDGE_COUNT, it.e, l)) edgeDirty = true;
    }
    if (courseDirty && this.courseTex) this.courseTex.needsUpdate = true;
    if (edgeDirty && this.edgeTex) this.edgeTex.needsUpdate = true;
  }

  private dropGpu(): void {
    if (this.points) { this.deps.parent.remove(this.points); this.points.geometry.dispose(); }
    this.material?.dispose(); this.courseTex?.dispose(); this.edgeTex?.dispose();
    this.points = null; this.material = null; this.courseTex = null; this.edgeTex = null; this.items = [];
  }

  dispose(): void { this.dropGpu(); this.amount = 0; }
}
