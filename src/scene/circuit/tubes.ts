// What only the map has: the liver's branch trees (the portal venules dividing, the sinusoids gathering), the caudate's own lane, and the custom shunts a learner opens, each routed as a
// transit-map line. They are real vessel tubes (the same shader, so the lens colour, the width and the flow marks follow the engine) laid along their map course; they carry the morph's
// attributes with the body course set equal to the map course, so the map's quarter turn takes them along, and they are drawn only as the map comes in (the ramp of the change) -
// the body never shows them. Each fades with the map and with its own presence (a branch with its parent; the caudate lane while a slide is about the caudate; a shunt while open).
import { Group, Vector3 } from 'three';
import { EDGES } from '../../engine/hales/portal/topology.js';
import { indexOf, hasVessel } from '../../engine/vessel-data.ts';
import { buildTube } from '../anatomy/vessels.ts';
import type { BloodShared } from '../blood/field.ts';
import { markSpeed } from '../flow.ts';
import { len3 } from '../frame2d.ts';
import type { CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import { NETWORK_BY_ID, radiusOf, widthPx } from '../vessels/network.ts';
import { VesselObject, type LensShared } from '../vessels/vessel-object.ts';
import { attachCircuit } from './geometry.ts';
import { CIRCUIT_D, CIRCUIT_TREES, CUSTOM_EDGES, NODE_CIRCUIT, ROUTER_STATIONS, VB_CIRC } from './data.copied.ts';
import { mapToScene } from './map.ts';
import { courseOf, cumulative, resample } from './paths.ts';
import type { CircuitShared } from './uniforms.ts';
import { createRouter, route as routeText } from './router.copied.js';

type Edge = { id: string; from: string; to: string; kind: string; shunt?: string; portal?: boolean; d?: number; dMax?: number; label?: string; zone?: string };
const edges = EDGES as Edge[];
const edgeById = new Map(edges.map((e) => [e.id, e]));

/** The least a branch is drawn: 1.2 figure units wide (the 2D app's `Math.max(1.2, w * k)`). */
const MIN_BRANCH_W = 1.2;
/** The caudate lane's own colour is its vein's; this is how long it takes to come in or go (ms), as a vessel that comes and goes does. */
const EASE_MS = 320;

/** A course (map units) as scene points, even in arc length and dense enough that corners keep their rounding. */
function scenePoints(dense: readonly (readonly [number, number])[]): Vector3[] {
  const { total } = cumulative(dense);
  const n = Math.max(12, Math.min(600, Math.ceil(total / 2.5)));
  return resample(dense, n).map(([x, y]) => { const p = mapToScene(x, y); return new Vector3(p[0], p[1], p[2]); });
}

export type TubeKind = 'tree' | 'caud' | 'custom';
interface Entry { id: string; kind: TubeKind; obj: VesselObject; parent: string; goal: number; amount: number }

export interface TubesContext {
  /** the map's ramp of the change (0 the body, 1 the map) */
  ramp: number;
  /** the dive's fade of the whole body (1 whole) */
  body: number;
  /** whether the vessel is drawn now (its presence) */
  drawn(id: string): boolean;
  /** a slide is about the caudate lobe: its lane shows */
  caudPin: boolean;
  /** the diameters (mm) of the custom shunts that are open, by edge ID */
  open: Readonly<Record<string, number>>;
}

export class CircuitTubes {
  readonly group = new Group();
  private readonly entries: Entry[] = [];
  private readonly routed = new Map<string, [number, number][]>();
  private palette: Palette | null = null;
  private phone = false;
  private useData = false;
  private readonly deps: { shared: CelShared; lens: LensShared; blood: BloodShared; circuit: CircuitShared };

  constructor(shared: CelShared, lens: LensShared, blood: BloodShared, circuit: CircuitShared) {
    this.deps = { shared, lens, blood, circuit };
    this.group.name = 'circuit-only';
    // the liver's branches: each a tube from its parent's lane to where it ends, a share of the parent's caliber
    for (const [id, list] of Object.entries(CIRCUIT_TREES)) {
      const parent = NETWORK_BY_ID.get(id);
      if (!parent) continue;
      list.forEach((b, i) => this.add(`${id}#${i}`, 'tree', id, courseOf(b.d), Math.max(len3(MIN_BRANCH_W / 2), parent.radius * b.k), parent.tone === 'artery' ? 'portal' : parent.tone, parent.baseD, 2));
    }
    // the caudate's own vein, drawn only while a slide is about the caudate lobe
    const caud = edgeById.get('CAUD');
    const d = CIRCUIT_D.CAUD;
    if (caud && d && hasVessel('CAUD')) this.add('CAUD', 'caud', 'CAUD', courseOf(d), radiusOf(widthPx(caud, caud.d ?? caud.dMax ?? 2)), 'sys', caud.d ?? caud.dMax ?? 2, 0);
  }

  private add(id: string, kind: TubeKind, edge: string, dense: [number, number][], radius: number, tone: 'portal' | 'sys', baseD: number, widthKind: 0 | 1 | 2): Entry {
    const built = buildTube(scenePoints(dense), radius, true, 0);
    // the body course IS the map course: the morph only turns it (the tube is the body's own where the map is not showing, and hidden then)
    attachCircuit(built, { curveA: built.curve, curveC: built.curve, lenA: built.length, lenC: built.length } as never, radius);
    const { shared, lens, blood, circuit } = this.deps;
    const o = new VesselObject(built.geometry, {
      tone, artery: false, lensIndex: indexOf(edge), widthKind, bands: 2, spec: 1, px: kind === 'tree' ? 0.9 : 1.2,
      vessel: { index: indexOf(edge), len: built.length, stubSpeed: markSpeed(1), radius, baseD },
    }, shared, lens, blood, circuit);
    o.edge = { id: edge, from: edgeById.get(edge)?.from ?? '', to: edgeById.get(edge)?.to ?? '', length: built.length };
    o.group.visible = false;
    o.setFade(0);
    if (this.palette) o.applyPalette(this.palette);
    o.setPhone(this.phone);
    o.setUseData(this.useData);
    this.group.add(o.group);
    const e: Entry = { id, kind, obj: o, parent: edge, goal: 0, amount: 0 };
    this.entries.push(e);
    return e;
  }

  applyPalette(p: Palette): void { this.palette = p; for (const e of this.entries) e.obj.applyPalette(p); }
  setPhone(phone: boolean): void { this.phone = phone; for (const e of this.entries) e.obj.setPhone(phone); }
  setUseData(on: boolean): void { this.useData = on; for (const e of this.entries) e.obj.setUseData(on); }

  /** The routed course (map units) of a custom shunt, or null when none could be made. Kept: a shunt keeps its course while it is open, and nothing else on the map moves when another opens. */
  routeOf(id: string): readonly [number, number][] | null { return this.routed.get(id) ?? null; }

  /** Routes the custom shunts that are open and have no course yet, each round everything drawn before it (2D routeCustomShunts). Returns the ones routed now. */
  routeOpen(open: Readonly<Record<string, number>>): string[] {
    const want = Object.keys(open).filter((id) => open[id]! > 0 && CUSTOM_EDGES.some((c) => c[0] === id)).sort();
    for (const id of this.routed.keys()) if (!want.includes(id)) this.routed.delete(id);
    // past a dozen at once there is no room left to route another clear of the rest (and the search would stall): those stay unrouted
    const room = Math.max(0, 12 - this.routed.size), fresh = want.filter((id) => !this.routed.has(id)).slice(0, room);
    if (!fresh.length) return [];
    const lines: [number, number][][] = Object.values(CIRCUIT_D).map((d) => courseOf(d));
    for (const list of Object.values(CIRCUIT_TREES)) for (const b of list) lines.push(courseOf(b.d));
    const router = createRouter({ lines, stations: ROUTER_STATIONS.map((p) => [p[0], p[1]]), bounds: [VB_CIRC[0], 100, VB_CIRC[0] + VB_CIRC[2], VB_CIRC[1] + VB_CIRC[3] + 10] });
    for (const r of this.routed.values()) router.addLine(r, true);
    const done: string[] = [];
    for (const id of fresh) {
      const c = CUSTOM_EDGES.find((q) => q[0] === id)!, a = NODE_CIRCUIT[c[1]], b = NODE_CIRCUIT[c[2]];
      if (!a || !b) continue;
      const pts = router.route([a[0], a[1]], [b[0], b[1]]) as [number, number][] | null;
      if (!pts) continue;
      const dense = courseOf(routeText(pts, 16) as string);
      router.addLine(dense, true);
      this.routed.set(id, dense);
      const e = edgeById.get(id)!, dmm = open[id]!;
      this.add(id, 'custom', id, dense, radiusOf(widthPx(e, dmm)), e.portal ? 'portal' : 'sys', dmm, 0);
      done.push(id);
    }
    return done;
  }

  /** Eases each tube in or out with the map and its own presence, and writes its fade. Returns true while any is easing. */
  update(dtMs: number, c: TubesContext): boolean {
    const k = Math.min(1, dtMs / EASE_MS);
    let moving = false;
    for (const e of this.entries) {
      const want = e.kind === 'caud' ? c.caudPin : e.kind === 'custom' ? (c.open[e.id] ?? 0) > 0 : c.drawn(e.parent);
      e.goal = want && c.ramp > 0 ? 1 : 0;
      if (e.amount !== e.goal) { e.amount = Math.abs(e.goal - e.amount) <= k ? e.goal : e.amount + Math.sign(e.goal - e.amount) * k; moving = true; }
      const f = c.ramp * e.amount * c.body;
      e.obj.setFade(f);
      e.obj.group.visible = f > 0.002;
    }
    return moving;
  }

  /** The tubes' own objects, for tests. */
  get objects(): readonly VesselObject[] { return this.entries.map((e) => e.obj); }
  /** Which entries there are and what each follows, for tests. */
  get ids(): readonly { id: string; kind: TubeKind; parent: string }[] { return this.entries.map(({ id, kind, parent }) => ({ id, kind, parent })); }

  dispose(): void { for (const e of this.entries) e.obj.dispose(); }
}

