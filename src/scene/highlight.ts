import { BackSide, Mesh, ShaderMaterial } from 'three';
import type { CelObject } from './materials/cel.ts';
import { HI_NONE } from './materials/shaders.ts';

// Vessel highlight (look-and-feel.md section 9): the picked vein (every piece the engine cuts it into) gets a bolder outline in its own tone lifted, thin, that fades
// away at the vein's two ends and is full in the middle. It lifts a hair. Nothing else is lit or dimmed. (`computeHighlight` can still walk the flow past the ends
// when given a range, read from the topology: edge `from` to `to`; a pick gives none.)

export interface HighlightEdge {
  id: string;
  from: string;
  to: string;
  /** Centreline length in scene units. */
  length: number;
}

export interface HighlightSpec {
  /** 0 = the picked vessel, +1 downstream of it, -1 upstream of it. */
  dir: -1 | 0 | 1;
  /** Distance along the flow from the picked vessel's end (downstream) or start (upstream) to this vessel's near end. */
  offset: number;
  /** The picked vein itself (dir 0): how far this piece's start is from the vein's outer start, and its end from the vein's outer end (HI_NONE when that end runs on into
   *  another piece of the same vein), and how far in from an outer end the line takes to come to full. The line is nothing at an outer end and full a `fade` in. */
  start?: number;
  end?: number;
  fade?: number;
}

export interface HighlightRange {
  /** How far the outline runs on downstream, in scene units. */
  ahead: number;
  /** How far it reaches upstream. */
  behind: number;
}

/** A pick lights its own vein and nothing else: the line fades away at the vein's two ends (Mohammad, 20 Nov: "the outline fades away at both ends"; only the vein I tap, not the
 *  cava, the shunts and every collateral that 2.4 ahead lit). Nothing runs on into the next vessel, so the range is none; `computeHighlight` still walks the flow when given one. */
export const DEFAULT_RANGE: HighlightRange = { ahead: 0, behind: 0 };
/** The share of a vein's length each end takes to fade in (the middle half holds full). */
export const END_FADE = 0.25;
/** The picked outline's width over the vessel's own line, CSS px (it was 1.6: "less thick", 20 Nov). */
export const HI_PX = 0.8;
/** Outline lift on the picked vessel (scene units), mocks: 0.012. */
export const PICK_LIFT = 0.012;
/** Fade in and out of the outline, ms. */
export const HIGHLIGHT_FADE_MS = 180;

/** Which vessels carry the outline for a pick, and where along the flow each one starts. Walks the topology both ways. A pick is a group
 *  when the engine cuts a vein into pieces (a vein with a shunt joining part-way along it is one vein to the eye): every piece is the pick. */
export function computeHighlight(pick: string | readonly string[], edges: readonly HighlightEdge[], range: HighlightRange = DEFAULT_RANGE): Map<string, HighlightSpec> {
  const ids = typeof pick === 'string' ? [pick] : pick;
  const byId = new Map(edges.map((e) => [e.id, e]));
  const group = ids.map((id) => byId.get(id)).filter((e): e is HighlightEdge => !!e);
  const out = new Map<string, HighlightSpec>();
  if (!group.length) return out;
  // the vein's own line: nothing at an outer end (one no other piece of the vein runs into), full a fade in; ends that join another piece of the same vein run on
  const total = group.reduce((a, e) => a + e.length, 0), fade = Math.max(END_FADE * total, 1e-4);
  const reach = (e: HighlightEdge, forward: boolean, seen: ReadonlySet<string> = new Set()): number => {
    if (seen.has(e.id)) return HI_NONE;
    const next = group.filter((g) => g !== e && (forward ? g.from === e.to : g.to === e.from));
    if (!next.length) return 0;
    const s2 = new Set(seen).add(e.id);
    return Math.min(HI_NONE, Math.min(...next.map((g) => g.length + reach(g, forward, s2))));
  };
  // (for a piece's start: the distance back along the pieces to the vein's outer start; for its end: on to the outer end. An end with nothing beyond it is an outer end: 0)
  for (const e of group) out.set(e.id, { dir: 0, offset: 0, start: reach(e, false), end: reach(e, true), fade });
  const nodes = new Set(group.flatMap((e) => [e.from, e.to]));

  // downstream: edges that leave any node of the pick
  const down = [...nodes].map((node) => ({ node, offset: 0 }));
  while (down.length) {
    const { node, offset } = down.shift()!;
    if (offset >= range.ahead) continue;
    for (const e of edges) {
      if (e.from !== node || out.has(e.id)) continue;
      out.set(e.id, { dir: 1, offset });
      down.push({ node: e.to, offset: offset + e.length });
    }
  }
  // upstream: edges that flow into any node of the pick (short)
  const up = [...nodes].map((node) => ({ node, offset: 0 }));
  while (up.length) {
    const { node, offset } = up.shift()!;
    if (offset >= range.behind) continue;
    for (const e of edges) {
      if (e.to !== node || out.has(e.id)) continue;
      out.set(e.id, { dir: -1, offset });
      up.push({ node: e.from, offset: offset + e.length });
    }
  }
  return out;
}

/** Outline strength 0 to 1 at a distance along the flow, as the ink shader computes it (smoothstep fade). */
export function outlineStrength(spec: HighlightSpec, arc: number, length: number, range: HighlightRange = DEFAULT_RANGE): number {
  if (spec.dir === 0) {   // the vein's own line: nothing at an outer end, full a `fade` in
    if (spec.fade === undefined) return 1;
    const d = Math.min((spec.start ?? HI_NONE) + arc, (spec.end ?? HI_NONE) + (length - arc)), t = Math.min(1, Math.max(0, d / spec.fade));
    return t * t * (3 - 2 * t);
  }
  const dist = spec.dir > 0 ? spec.offset + arc : spec.offset + (length - arc);
  const limit = spec.dir < 0 ? range.behind : range.ahead;
  const t = Math.min(1, Math.max(0, dist / Math.max(limit, 1e-4)));
  return 1 - t * t * (3 - 2 * t);
}

/** Moves `v` toward `goal` by at most `step`, landing on it exactly. */
const approach = (v: number, goal: number, step: number): number => (Math.abs(goal - v) <= step ? goal : v + Math.sign(goal - v) * step);

interface Track { obj: CelObject; on: number; target: number; lift: number; liftTarget: number }

/** Applies a pick to the vessel objects and fades it in and out. `step` returns true while anything is still moving, so the clock keeps
 *  asking for frames and goes quiet afterwards (nothing is drawn when nothing moves). */
export class Highlight {
  private tracks = new Map<string, Track>();
  private range: HighlightRange;
  private edges: HighlightEdge[];
  picked: string | null = null;
  private hostOf: ReadonlyMap<string, string>;

  constructor(objects: readonly CelObject[], range: HighlightRange = DEFAULT_RANGE, hostOf: ReadonlyMap<string, string> = new Map()) {
    this.hostOf = hostOf;
    this.range = range;
    this.edges = [];
    for (const o of objects) {
      if (!o.isVessel || !o.edge) continue;
      this.edges.push({ id: o.edge.id, from: o.edge.from, to: o.edge.to, length: o.edge.length });
      this.tracks.set(o.edge.id, { obj: o, on: 0, target: 0, lift: 0, liftTarget: 0 });
      const u = o.ink.uniforms;
      u.hiAhead.value = range.ahead;
      u.hiBehind.value = range.behind;
      u.hiPx.value = HI_PX;
    }
  }

  set(id: string | null): void {
    this.picked = id && this.tracks.has(id) ? id : null;
    const spec = this.picked ? computeHighlight(this.group(this.picked), this.edges, this.range) : new Map<string, HighlightSpec>();
    for (const [eid, t] of this.tracks) {
      const s = spec.get(eid);
      t.target = s ? 1 : 0;
      t.liftTarget = s && s.dir === 0 ? PICK_LIFT : 0;
      if (s) {
        const u = t.obj.ink.uniforms;
        u.hiDir.value = s.dir;
        u.hiOffset.value = s.offset;
        (u.hiEnds!.value as { set(x: number, y: number): void }).set(s.start ?? HI_NONE, s.end ?? HI_NONE);
        u.hiFade!.value = s.fade ?? 1;
      }
    }
  }

  /** Light exactly these vessels (and every piece of a vein the engine cuts), each outlined whole and nothing run on downstream: the shunt's targets. Clears the pick. */
  setOnly(ids: readonly string[]): void {
    this.picked = null;
    const hosts = new Set(ids.map((id) => this.hostOf.get(id) ?? id));
    for (const [eid, t] of this.tracks) {
      const on = hosts.has(this.hostOf.get(eid) ?? eid);
      t.target = on ? 1 : 0;
      t.liftTarget = 0;
      if (on) { const u = t.obj.ink.uniforms; u.hiDir.value = 0; u.hiOffset.value = 0; (u.hiEnds!.value as { set(x: number, y: number): void }).set(HI_NONE, HI_NONE); }
    }
  }

  /** All the pieces of the vein a picked piece belongs to. */
  private group(id: string): string[] {
    const host = this.hostOf.get(id) ?? id;
    return this.edges.filter((e) => (this.hostOf.get(e.id) ?? e.id) === host).map((e) => e.id);
  }

  step(dtMs: number): boolean {
    const k = Math.min(1, dtMs / HIGHLIGHT_FADE_MS); // linear: the full fade takes HIGHLIGHT_FADE_MS
    let moving = false;
    for (const t of this.tracks.values()) {
      if (t.on !== t.target || t.lift !== t.liftTarget) {
        t.on = approach(t.on, t.target, k);
        t.lift = approach(t.lift, t.liftTarget, k * PICK_LIFT);
        moving = true;
      }
      t.obj.ink.uniforms.hiOn.value = t.on;
      t.obj.toon.uniforms.inflate.value = t.lift;
    }
    return moving;
  }
}

/** Fade in and out of a pinned organ's outline, ms (2D OL_FADE: a flip's step). */
export const PIN_FADE_MS = 300;
/** The thin line of the normal-sized spleen inside an enlarged one (2D OL_LOOK.normal: 1.4 px, half an alpha). */
/** What a slide's pin and a tapped organ add to the organ's own 1.1 line: a modest step up (Mohammad, 20 Nov: "insanely thick"). */
export const PIN_PX = 0.6, SELECT_PX = 0.9;   // (figure units, as the organ's own 1.1 line is: 1.6 and 3.6 drew a white band several times the line when zoomed, 20 Nov)
export const NORMAL_LINE = { px: 1.4, alpha: 0.5 };

/** A slide's outlined organs (2D `pinOrgans`: the organ's own deep tone, a wider line, fading in and out), by the organs' own ids. The line is the organ's ink hull at the
 *  highlight width (`hiOn` on the organ's own object: the same uniforms a picked vessel uses, in the organ's own highlight colour). Organs the layer has not built yet are
 *  taken the frame they appear. Run after `Highlight.step`: it never touches a vessel, so the two never fight over `hiOn`. */
export class OrganPins {
  private want = new Set<string>();
  private chosen = new Set<string>();
  private on = new Map<string, number>();
  private normal = false;
  private normalMesh: Mesh | null = null;
  private normalAmt = 0;

  /** Outline exactly these organs (ids of the organ layer: liver, spleen, heart, bowel, colon, duodenum, kidney-l, stomach, heart-ra); [] clears them all. */
  set(ids: readonly string[]): void { this.want = new Set(ids); }
  get pinned(): readonly string[] { return [...this.want]; }
  /** The organs the learner tapped (the selection): a heavy outline, in the same highlight colour; a slide's pin on the same organ keeps its own. */
  select(ids: readonly string[]): void { this.chosen = new Set(ids); }
  get selected(): readonly string[] { return [...this.chosen]; }
  /** The normal-sized spleen's outline inside an enlarged one (2D `normalOutline`). */
  setNormalOutline(on: boolean): void { this.normal = on; }

  step(dtMs: number, byId: ReadonlyMap<string, CelObject>): boolean {
    const k = Math.min(1, dtMs / PIN_FADE_MS);
    let moving = false;
    for (const [id, o] of byId) {
      const goal = this.want.has(id) || this.chosen.has(id) ? 1 : 0, was = this.on.get(id) ?? 0;
      const px = this.chosen.has(id) ? SELECT_PX : PIN_PX;
      if (o.ink.uniforms.hiPx!.value !== px) { o.ink.uniforms.hiPx!.value = px; moving = true; }
      if (was === goal) continue;
      const v = approach(was, goal, k);
      this.on.set(id, v);
      o.ink.uniforms.hiOn.value = v; o.ink.uniforms.hiDir.value = 0; o.ink.uniforms.hiOffset.value = 0;
      moving = true;
    }
    // an organ asked for that the layer has not built: keep asking for frames until it is in
    for (const id of [...this.want, ...this.chosen]) if (!byId.has(id)) moving = true;
    const sp = byId.get('spleen');
    if (sp && (this.normal || this.normalAmt > 0)) {
      if (!this.normalMesh && sp.group.parent) {
        const u = sp.ink.uniforms;
        const mat = new ShaderMaterial({ vertexShader: sp.ink.vertexShader, fragmentShader: sp.ink.fragmentShader, side: BackSide, transparent: true, depthTest: false, depthWrite: false,
          uniforms: { ...u, px: { value: NORMAL_LINE.px }, inflate: { value: 0 }, hiOn: { value: 0 }, inkA: { value: 0 } } });
        this.normalMesh = new Mesh(sp.toonMesh.geometry, mat); this.normalMesh.frustumCulled = false;
        this.normalMesh.renderOrder = 20;
        sp.group.parent.add(this.normalMesh);
      }
      const goal = this.normal ? NORMAL_LINE.alpha : 0;
      if (this.normalAmt !== goal) { this.normalAmt = approach(this.normalAmt, goal, k * NORMAL_LINE.alpha); moving = true; }
      if (this.normalMesh) {
        (this.normalMesh.material as ShaderMaterial).uniforms.inkA!.value = this.normalAmt;
        this.normalMesh.visible = this.normalAmt > 0;
      }
    }
    return moving;
  }
}
