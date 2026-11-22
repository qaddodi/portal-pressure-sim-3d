import { BackSide, Color, Mesh, ShaderMaterial } from 'three';
import type { CelObject } from './materials/cel.ts';
import { HI_NONE } from './materials/shaders.ts';

// Vessel highlight (look-and-feel.md section 9): the picked vein (every piece the engine cuts it into) gets a glow (glow.ts) in its own tone, no outline of its own and no lift, that fades
// away at the vein's two ends and is full in the middle. Nothing else is lit or dimmed. (`computeHighlight` can still walk the flow past the ends
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
/** The picked outline's extra width over the vessel's own line, CSS px: none (it was 1.6, then 0.8: "instead of an outline, make it a glow", 20 Nov; the glow is glow.ts). */
export const HI_PX = 0;
/** How much stronger the glow of a shunt's target is while the pointer is over it (2D shuntGlow: stronger and wider). It is the glow only: a picked vessel's tube is never grown (the old 0.012 `inflate` lift widened the mesh but not the lumen, so the ink filled the difference: the thick dark bands along a picked vein's walls, ending square at each piece, 20 Nov). */
export const HOVER_GLOW = 0.7;
/** Fade in and out of the outline, ms. */
export const HIGHLIGHT_FADE_MS = 180;
/** The share of the glow still shown at `t` of the Circuit's change (eased, circuit.t): whole at rest, gone by the change's first 15 %, a smoothstep between (the glow lies along the body's course, which the change leaves). */
export const glowGate = (t: number): number => { const x = Math.min(1, Math.max(0, t / 0.15)); return 1 - x * x * (3 - 2 * x); };

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

interface Track { obj: CelObject; on: number; target: number; boost: number; boostTarget: number; spec: HighlightSpec | null }

/** Applies a pick to the vessel objects and fades it in and out. `step` returns true while anything is still moving, so the clock keeps
 *  asking for frames and goes quiet afterwards (nothing is drawn when nothing moves). */
export class Highlight {
  private tracks = new Map<string, Track>();
  private range: HighlightRange;
  private edges: HighlightEdge[];
  picked: string | null = null;
  private hostOf: ReadonlyMap<string, string>;

  private glowShown = 1;
  /** Whether any vessel's glow is showing now (glow-fx.ts makes and lays the mask only then). */
  glowing = false;

  /** The vessel asked for, whether or not its tube is registered yet (a custom shunt's tube is routed a frame after the shunt is made and selected): it lights the moment its tube arrives. */
  private wanted: string | null = null;
  /** Ids that may be picked before their tube exists (the custom shunts: their tubes come and go with the params, circuit/tubes.ts). */
  expect: (id: string) => boolean = () => false;
  /** Told whenever `picked` changes, from any path (a pick, the lit set clearing it, a late tube lighting the wanted id): the ONE writer of the page's pick store (scene/api.ts). Integration review I6. */
  onPicked: (id: string | null) => void = () => {};
  private tellPicked(was: string | null): void { if (this.picked !== was) this.onPicked(this.picked); }

  constructor(objects: readonly CelObject[], range: HighlightRange = DEFAULT_RANGE, hostOf: ReadonlyMap<string, string> = new Map()) {
    this.hostOf = hostOf;
    this.range = range;
    this.edges = [];
    for (const o of objects) this.register(o);
  }

  /** Make a vessel object pickable and lit like every other vessel (the tubes the map adds when a learner opens a custom shunt come after the constructor). Replaces the object of the same id; if that id is the pick, it lights now. */
  register(o: CelObject): void {
    if (!o.isVessel || !o.edge) return;
    const id = o.edge.id;
    this.edges = this.edges.filter((e) => e.id !== id);
    this.edges.push({ id, from: o.edge.from, to: o.edge.to, length: o.edge.length });
    this.tracks.set(id, { obj: o, on: 0, target: 0, boost: 0, boostTarget: 0, spec: null });
    const u = o.ink.uniforms;
    u.hiAhead.value = this.range.ahead;
    u.hiBehind.value = this.range.behind;
    u.hiPx.value = HI_PX;
    if (this.wanted === id) this.set(id);
  }

  /** Let go of a vessel object that is being disposed (only if it is still the one registered for its id: a shunt closed and opened again has a newer tube). */
  unregister(o: CelObject): void {
    const id = o.edge?.id;
    if (!id || this.tracks.get(id)?.obj !== o) return;
    this.tracks.delete(id);
    this.edges = this.edges.filter((e) => e.id !== id);
    if (this.picked === id && !this.expect(id)) { this.picked = null; this.onPicked(null); }   // (its tube is gone: nothing is picked; `wanted` keeps it for a tube that comes back)
  }

  set(id: string | null): void {
    const was = this.picked;
    this.wanted = id;
    this.picked = id && (this.tracks.has(id) || this.expect(id)) ? id : null;
    const spec = this.picked && this.tracks.has(this.picked) ? computeHighlight(this.group(this.picked), this.edges, this.range) : new Map<string, HighlightSpec>();
    for (const [eid, t] of this.tracks) {
      const s = spec.get(eid);
      t.spec = s ?? t.spec;
      t.target = s ? 1 : 0;
      t.boostTarget = 0;
      if (s) {
        const u = t.obj.ink.uniforms;
        u.hiDir.value = s.dir;
        u.hiOffset.value = s.offset;
        (u.hiEnds!.value as { set(x: number, y: number): void }).set(s.start ?? HI_NONE, s.end ?? HI_NONE);
        u.hiFade!.value = s.fade ?? 1;
      }
    }
    this.tellPicked(was);
  }

  /** Light exactly these vessels (and every piece of a vein the engine cuts), each outlined whole and nothing run on downstream: the shunt's targets. Clears the pick. */
  setOnly(ids: readonly string[]): void {
    const was = this.picked;
    this.picked = null;
    this.tellPicked(was);
    this.wanted = null;
    const hosts = new Set(ids.map((id) => this.hostOf.get(id) ?? id));
    for (const [eid, t] of this.tracks) {
      const on = hosts.has(this.hostOf.get(eid) ?? eid);
      t.target = on ? 1 : 0;
      t.boostTarget = 0;
      if (on) t.spec = { dir: 0, offset: 0 };
      if (on) { const u = t.obj.ink.uniforms; u.hiDir.value = 0; u.hiOffset.value = 0; (u.hiEnds!.value as { set(x: number, y: number): void }).set(HI_NONE, HI_NONE); }
    }
  }

  /** The shunt's target under the pointer (the lit ones stay lit): its glow is stronger (2D shuntGlow); null lets it go. */
  setHover(id: string | null): void {
    const host = id ? (this.hostOf.get(id) ?? id) : null;
    for (const [eid, t] of this.tracks) if (t.target === 1) t.boostTarget = host != null && (this.hostOf.get(eid) ?? eid) === host ? 1 : 0;
  }

  /** All the pieces of the vein a picked piece belongs to. */
  private group(id: string): string[] {
    const host = this.hostOf.get(id) ?? id;
    return this.edges.filter((e) => (this.hostOf.get(e.id) ?? e.id) === host).map((e) => e.id);
  }

  step(dtMs: number): boolean {
    const k = Math.min(1, dtMs / HIGHLIGHT_FADE_MS); // linear: the full fade takes HIGHLIGHT_FADE_MS
    let moving = false, glowing = false;
    for (const t of this.tracks.values()) {
      if (t.on !== t.target || t.boost !== t.boostTarget) {
        t.on = approach(t.on, t.target, k);
        t.boost = approach(t.boost, t.boostTarget, k);
        moving = true;
      }
      t.obj.ink.uniforms.hiOn.value = t.on;
      if (t.obj.toon.uniforms.glowK) t.obj.toon.uniforms.glowK.value = 1 + HOVER_GLOW * t.boost * t.boost * (3 - 2 * t.boost);   // (the shunt target under the pointer: a stronger glow, eased)
      this.glow(t);
      if (t.obj.glowMesh?.visible) glowing = true;
    }
    this.glowing = glowing;
    return moving;
  }

  /** How much of the glow may show, 0 to 1 (the body's courses only: the Circuit lays the vessels out afresh). It eases with the Circuit's change (`glowGate`), as 2D's selection glow eases on its SEL_FADE: a
   *  boolean made it snap off at the first frame of a view switch. */
  setGlowShown(shown: boolean | number): void { this.glowShown = typeof shown === 'number' ? Math.min(1, Math.max(0, shown)) : shown ? 1 : 0; }

  /** The glow of one track (glow.ts): the vessel's own hull, drawn by its program built with `GLOW`. Its reach and alpha follow the pick's weight in the vertex and fragment stages (`hiOn` x the weight along the vein, the uniforms the tube
   *  shares with it), so all this does is show the mesh while the pick is on or easing, and hide it when it has gone (nothing drawn that draws nothing). */
  private glow(t: Track): void {
    const m = t.obj.glowMesh;
    if (!m) return;
    m.visible = !!t.spec && (t.on > 0 || t.target > 0) && this.glowShown > 0.001;
  }
}

/** Fade in and out of a pinned organ's outline, ms (2D OL_FADE: a flip's step). */
export const PIN_FADE_MS = 300;
/** The thin line of the normal-sized spleen inside an enlarged one (2D OL_LOOK.normal: 1.4 px, half an alpha). */
/** What a slide's pin and a tapped organ add to the organ's own 1.1 line: a modest step up (Mohammad, 20 Nov: "insanely thick"). */
export const PIN_PX = 0, SELECT_PX = 0;   // (figure units, as the organ's own 1.1 line is: 1.6 and 3.6 drew a white band several times the line when zoomed, 20 Nov)
/** What an organ's glow shell and the spleen's normal-range ring are built with besides the organ's own ink shaders (the program stand-in, materials/prototypes.ts, wears the same). */
export const HALO_FLAGS = { side: BackSide, transparent: true, depthWrite: false } as const;
/** The glow shell's defines (INK_FS): a feathered hull whose coverage is one squared fall from the outline to its outer edge. The stand-in wears the same, so the first highlight compiles nothing. */
export const GLOW_DEFINES = { INK_EDGE: '', INK_GLOW: '' } as const;

/** An organ's glow: ONE hull, `out` figure units past the organ's line (as the organ's line is measured), whose alpha is `alpha` at the line and falls smoothly to nothing at its outer edge (INK_FS, INK_GLOW).
 *  It was five flat hulls stacked (26 / 19 / 13 / 8 / 4 units at 0.05 .. 0.2), each a hard-edged plateau: five concentric bands round the organ, not a glow (Mohammad, 22 Nov). Their total at the line was 0.56. */
export const ORGAN_GLOW = { out: 26, alpha: 0.7 } as const;
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

  private glows = new Map<string, Mesh>();

  /** The organ's glow: ORGAN_GLOW's one soft hull round the organ's own line, in the organ's selection colour, eased in with `amount`. Made the first time the organ is lit. */
  private glowOf(id: string, o: CelObject, amount: number): void {
    let shell = this.glows.get(id);
    if (!shell) {
      if (amount <= 0 || !o.group.parent) return;
      const ink = o.group.children.find((c) => (c as Mesh).material === o.ink) as Mesh | undefined, base = ink ? ink.renderOrder - 0.45 : 0;
      const u = o.ink.uniforms;
      const mat = new ShaderMaterial({ name: 'organ halo', vertexShader: o.ink.vertexShader, fragmentShader: o.ink.fragmentShader, ...HALO_FLAGS, defines: { ...GLOW_DEFINES },
        uniforms: { ...u, px: { value: 0 }, color: { value: new Color() }, hiColor: { value: new Color() }, inkA: { value: 0 }, hiOn: { value: 0 }, hiPx: { value: 0 } } });
      shell = new Mesh(ink?.geometry ?? o.toonMesh.geometry, mat);
      shell.frustumCulled = false; shell.renderOrder = base; shell.visible = false; shell.name = `highlight/glow/${id}/0`;
      o.group.add(shell);
      this.glows.set(id, shell);
    }
    const e = amount * amount * (3 - 2 * amount), hi = o.ink.uniforms.hiColor!.value as Color, px = o.ink.uniforms.px!.value as number;
    const u = (shell.material as ShaderMaterial).uniforms;
    u.px!.value = px + ORGAN_GLOW.out; u.inkA!.value = ORGAN_GLOW.alpha * e;
    (u.color!.value as Color).copy(hi); (u.hiColor!.value as Color).copy(hi);
    shell.visible = e > 0.001;
  }

  step(dtMs: number, byId: ReadonlyMap<string, CelObject>): boolean {
    const k = Math.min(1, dtMs / PIN_FADE_MS);
    let moving = false;
    for (const [id, o] of byId) {
      const goal = this.want.has(id) || this.chosen.has(id) ? 1 : 0, was = this.on.get(id) ?? 0;
      const px = this.chosen.has(id) ? SELECT_PX : PIN_PX;
      if (o.ink.uniforms.hiPx!.value !== px) { o.ink.uniforms.hiPx!.value = px; moving = true; }
      if (was !== goal) {
        const v = approach(was, goal, k);
        this.on.set(id, v);
        o.ink.uniforms.hiOn.value = v; o.ink.uniforms.hiDir.value = 0; o.ink.uniforms.hiOffset.value = 0;
        moving = true;
      }
      this.glowOf(id, o, this.on.get(id) ?? 0);
    }
    // an organ asked for that the layer has not built: keep asking for frames until it is in
    for (const id of [...this.want, ...this.chosen]) if (!byId.has(id)) moving = true;
    const sp = byId.get('spleen');
    if (sp && (this.normal || this.normalAmt > 0)) {
      if (!this.normalMesh && sp.group.parent) {
        const u = sp.ink.uniforms;
        const mat = new ShaderMaterial({ name: 'spleen ring', vertexShader: sp.ink.vertexShader, fragmentShader: sp.ink.fragmentShader, ...HALO_FLAGS, depthTest: false,
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
