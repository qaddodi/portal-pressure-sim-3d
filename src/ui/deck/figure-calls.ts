// The calls a slide's figure plan makes on the scene: which vessels are named and when, which organs are outlined, which vessels stand out, the cards and the
// calipers the label layer stands, the Circuit's resistors. Pure (no scene, no DOM): figure-link.ts applies the result, and node judges every slide's calls
// (tests/deck-figure-link.test.ts: each one resolves to a vessel, an organ or a place the figure has).
import { focusOfStations } from '../../scene/focus-reveal/config.ts';
import type { FigurePlan } from './figure-plan.ts';
import { toneCss } from './figure-plan.ts';
import { ORGAN_STYLE } from '../../scene/organs/layer.ts';
import { CAUDATE_FRONT_Z } from '../../scene/organs/caudate.ts';
import { planeMap, mapX, mapY } from '../../scene/organs/placed-map.ts';
import { PLACED_CAUDATE } from '../../scene/anatomy/placement.generated.ts';
import { x2d, x3, y2d, y3 } from '../../scene/frame2d.ts';
import { SITE_DEF_2D, SPLEEN_AXIS_2D, ORGAN_ANCHOR_2D } from '../../scene/labels/figure2d.copied.ts';
import { PAIR_AT } from '../../scene/labels/pair.ts';
import type { FigCard, FigCaliper, FigSpan, Anchor } from '../../scene/labels/figure-cards.ts';
import type { ResKey } from '../../scene/circuit/res-model.ts';
import { NETWORK_BY_ID } from '../../scene/vessels/network.ts';
import { valueText, parseToken, VALUE_PENDING } from '../../decks/hp/numbers.ts';
import { portalSplit } from './from2d/table-marks.js';
import { tearPoint, TEAR_EDGES, type BleedSite } from '../../scene/disease/tear.ts';
import { streamDepth } from '../../scene/disease/stream-fit.ts';

export type Fp = Record<string, number | null | undefined> & { at?: { P?: ArrayLike<number>; D?: ArrayLike<number> } };
export interface Reads {
  /** The numbers of the slide's state (hp/calc.ts), when they are in. */
  fp?: Fp | null;
  /** The model's parameters at the slide (a clot's size, the stents). */
  params?: { thrombus?: Record<string, number>; tips?: { on?: boolean; d?: number }; dips?: { on?: boolean; d?: number } } | null;
  /** An edge's index in the engine's arrays (for a vessel's own diameter). */
  indexOf?: (edge: string) => number;
  /** Where the slide's bleed is running (its `rupture` action's site), if one is: a mark on that varix points at the tear, where the jet leaves it. */
  bleed?: BleedSite | null;
}

export interface FigureCalls {
  /** Vessels named (they carry the flow marks), each from its ms after the slide lands. */
  named: { id: string; at: number }[];
  /** The organ layer's ids to outline. */
  pins: string[];
  normalSpleen: boolean;
  /** Vessels that stand out whole (a spotlight). */
  marked: string[];
  res: ResKey[];
  caudate: boolean;
  /** with its short hepatic veins (plan.caudateVeins) */
  caudateVeins: boolean;
  /** The foci the slide is about (focus-reveal/config.ts focusOfStations: the stations it labels). */
  focus: string[];
  cards: FigCard[];
  calipers: FigCaliper[];
  /** The Circuit's brackets, each with its words filled from the slide's numbers. */
  spans: FigSpan[];
  /** The lobule's stations whose pressure the slide's callout asks to stand beside their names (`callout.reads`, 'sin' on the wedge slide):
   *  each stands first with its reading (lobule/captions.ts `must`). */
  reads: string[];
  /** The colour those stations and the callout take (a station colour token, 'wedge' on the wedge slide), or null for none. */
  readsTone: string | null;
  /** the stations of `reads` that take that colour (the rest only show their pressure) */
  lit: string[];
  /** Whatever the plan names that is not drawn: 2D draws nothing for it either (a ripple's halo, a lobule's pointer), or it is another view's. */
  notDrawn: string[];
}

export const EMPTY_CALLS: FigureCalls = {
  named: [], pins: [], normalSpleen: false, marked: [], res: [], caudate: false, caudateVeins: false, focus: [], cards: [], calipers: [], spans: [], reads: [], readsTone: null, lit: [], notDrawn: [],
};

/**
 * The portal blood's split card for a site (stage-sites-paint.js SPLIT_B), or null where there is nothing to say: no reading yet, or none of
 * the blood bypasses the liver (owner W19, 27 Nov: "0% bypasses the liver" stood on the portal vein of a healthy liver, naming a thing that is
 * not there). Pure: tests/split-card.test.ts.
 */
export function splitCardOf(key: string, d: { kicker: string; node?: string }, fp: Record<string, unknown> | null | undefined): FigCard | null {
  const sh = fp?.shunt;
  if (typeof sh !== 'number' || !Number.isFinite(sh)) return null;
  const p = portalSplit(sh);
  if (p.shunt <= 0) return null;
  return { id: `site:${key}`, kind: 'split', text: d.kicker, tone: 'pv', anchor: { node: d.node! }, below: true, split: { liver: p.liver, shunt: p.shunt, rate: p.rate } };
}

/** The words of a clot mark that follows the model (callout-math.js clotWords). */
export function clotWords(v: number | undefined): string | null {
  const n = Math.round(Math.min(1, Math.max(0, +(v ?? 0) || 0)) * 100);
  return n <= 0 ? null : n >= 100 ? 'Occlusive thrombus' : 'Nonocclusive thrombus';
}

/** A mark's words with its live readings filled in ("Ascites {asc}" -> "Ascites 3.2 L"); a brace that names no reading stays as written. */
export function liveLabel(label: string, fp: Fp | null | undefined): string {
  return label.replace(/\{([^}]+)\}/g, (m, body: string) => {
    const t = parseToken(body);
    if (t.kind !== 'value') return m;
    const v = valueText(t.key, fp as never, t.whole);
    return v === VALUE_PENDING ? '…' : v;
  });
}

/** An organ's anchor: 2D's point carried by the organ's own move in the approved placement (organs/placed-map.ts planeMap), at the organ's front; the caudate lobe's is its egg's front pole
 *  (PLACED_CAUDATE), so its mark sits on its dome. Root cause of a card beside its organ (kidney, spleen, atrium, caudate lobe off their placed meshes): the anchor was 2D's point read as if the organ had not moved. */
export const organAnchor = (organ: string): Anchor => {
  if (organ === 'caudate') return { at2d: [x2d(PLACED_CAUDATE.c[0]), y2d(PLACED_CAUDATE.c[1])], z: CAUDATE_FRONT_Z };
  const [x, y] = ORGAN_ANCHOR_2D[organ]!.at, m = planeMap(organ);
  return { at2d: [x2d(mapX(m, x3(x))), y2d(mapY(m, y3(y)))] };
};

/** (the caudate lobe is in the organ layer but is shown by `caudate`, not outlined: 2D's lobe has its own line and no pin glow) */
const pinsOf = (organs: readonly { id: string }[]): string[] => organs.map((o) => o.id).filter((id) => id in ORGAN_STYLE && id !== 'caudate');

/** A callout's kind as the card's tone: block is the danger red, treat the accent, note the quiet ink;
 *  'wedge' is the slide's own colour for the wedged pressure and the sinusoids (the amber of its words and its equation). */
const CALLOUT_TONES: Readonly<Record<string, string>> = { treat: 'treat', note: 'note', wedge: 'wedge' };

export function figureCalls(plan: FigurePlan, r: Reads = {}): FigureCalls {
  const fp = r.fp ?? null, notDrawn: string[] = [];
  // named vessels: the glow's (each at its own moment), the note marks' pointers are in it already
  const named = plan.glow.map((g) => ({ id: g.id, at: g.at })).filter((g) => NETWORK_BY_ID.has(g.id));
  // outlined organs: the glow's and the terms', the spotlight's, the lapse's glow
  const pins = [...new Set([...pinsOf(plan.organs), ...pinsOf(plan.spot?.organs ?? []), ...pinsOf(plan.lapseGlow)])];
  const marked = plan.spot?.edges ?? [];
  const cards: FigCard[] = [];

  // marks: a vessel's, or an organ's
  plan.marks.forEach((m, i) => {
    const text = m.clot ? clotWords(r.params?.thrombus?.[m.edges[0] ?? '']) : liveLabel(m.label, fp);
    if (!text) return;   // (a clot of 0 %: no mark at all)
    // (one tag per vessel: a caliper across the same vessel already says its name and size, "TIPS 8 mm"; a second "TIPS" beside it was the same words twice, two-inflows 9, audit f9a5d2e0)
    if (!m.organ && m.edges[0] && text === m.edges[0] && plan.calipers.some((c) => c.edge === m.edges[0])) return;
    const tear = !m.organ && r.bleed && m.edges.some((e) => TEAR_EDGES[r.bleed!].has(e));   // (the words stand where the blood leaves the vein, not on the vessel's middle, which is up the esophagus under the scope ring)
    const anchor: Anchor | null = tear ? { at2d: tearPoint(r.bleed!), z: streamDepth(r.bleed!, ...tearPoint(r.bleed!)) } : m.organ ? organAnchor(m.organ === 'kidney' ? 'kidney-l' : m.organ) : m.edges[0] && NETWORK_BY_ID.has(m.edges[0]) ? { edge: m.edges[0] } : null;
    if (!anchor) { notDrawn.push(`mark ${m.edges[0] ?? m.organ} (hidden in 2D too)`); return; }
    cards.push({ id: `mark:${i}`, kind: 'mark', text, tone: m.kind === 'block' ? 'block' : m.kind === 'treat' ? 'treat' : 'note', anchor });
  });

  // the lobule's pointer at the lesion (lobule-zoom.js callSet): a block, treatment or note ring on the framed portal tract or on a sinusoid (the central-vein slides, postsinusoidal and SOS, ring the vein itself; only a label that names sinusoids rings a zone 3 sinusoid; lobule/callout-spot.ts); it stands only while the lobule is the figure
  if (plan.callout) {
    // (a callout on a sinusoid whose slide also asks for the Sinusoids pressure is the lower of a pair of readings on one sinusoid: labels/pair.ts)
    const paired = plan.callout.at === 'sin' && !!plan.callout.reads?.includes('sin');
    const at = plan.callout.at === 'cv' ? (/sinusoid/i.test(plan.callout.label) ? 'sinusoid:zone3' : 'central') : paired ? PAIR_AT : { triad: 'tract', sin: 'sinusoid:mid' }[plan.callout.at];
    if (at) cards.push({ id: 'callout', kind: 'mark', text: liveLabel(plan.callout.label, fp), tone: CALLOUT_TONES[plan.callout.kind] ?? 'block', anchor: { lobule: at } });
    else notDrawn.push(`callout ${plan.callout.at}`);
  }

  // sites: the portal blood's split (every other site is its station's own label)
  for (const k of plan.sites) {
    const d = SITE_DEF_2D[k];
    if (!d || d.res || !d.node) continue;
    if (d.split) {
      const c = splitCardOf(k, d, fp);
      if (c) cards.push(c);
      continue;
    }
    // (no other site is built: a site on a station is that station's own label, and figure-plan.ts fails a site that is neither: a reading is never a card on the figure)
  }

  // numbered steps: each entry of the glow, at its moment, at the first vessel (or the organ) it names
  for (const s of plan.steps ?? []) {
    const ids = s.ids ?? plan.glow.filter((g) => g.at === s.at).map((g) => g.id);
    const edge = ids.find((id) => NETWORK_BY_ID.has(id));
    // a group's number stands between its vessels, on a leader to the middle of each (2D stage-label-solve.js: `fans`); a single vessel's, by its own middle
    const members = s.group ? ids.filter((id) => NETWORK_BY_ID.has(id)) : [];
    const anchor: Anchor | null = s.organ ? organAnchor(s.organ) : members.length > 1 ? { edges: members } : edge ? { edge } : null;
    if (!anchor) { notDrawn.push(`step ${s.n}`); continue; }
    cards.push({ id: `step:${s.n}`, kind: 'step', text: String(s.n), n: s.n, tone: 'note', anchor, at: s.at });
  }

  // calipers: the spleen's axis, a line across a vessel, with the reading
  const calipers: FigCaliper[] = [];
  for (const c of plan.calipers) {
    if (c.organ === 'spleen') { calipers.push({ id: c.id, line: { ends: SPLEEN_AXIS_2D }, text: valueText('spleen', fp as never) }); continue; }
    if (!c.edge || !NETWORK_BY_ID.has(c.edge)) { notDrawn.push(`caliper ${c.id}`); continue; }
    const stent = c.edge === 'TIPS' ? r.params?.tips : c.edge === 'DIPS' ? r.params?.dips : null;
    const ei = r.indexOf?.(c.edge) ?? -1, d = ei >= 0 ? fp?.at?.D?.[ei] : null;
    const text = c.key ? valueText(c.key, fp as never)
      : stent ? (stent.on && Number.isFinite(stent.d) ? `${stent.d} mm` : VALUE_PENDING)
      : Number.isFinite(d) && (d as number) > 0 ? `${(d as number).toFixed(1)} mm` : VALUE_PENDING;
    calipers.push({ id: c.id, line: { across: c.edge }, text });
  }

  // spans: a bracket on the Circuit between two stations, its words read from the slide's numbers
  const spans: FigSpan[] = plan.spans.map((sp, i) => ({ id: `span:${i}`, from: sp.from, to: sp.to, text: liveLabel(sp.label, fp) }));

  if (plan.ripple) notDrawn.push('ripple (2D draws no halo: stage-glow.js, 13 Nov 2026)');
  // (the lobule's stations whose pressure the slide's callout asks to stand beside their names: only a slide that says so)
  const reads = plan.callout?.reads ?? [];
  const lit = (plan.callout?.lit ?? []).filter((k) => reads.includes(k));
  const readsTone = reads.length && plan.callout?.kind === 'wedge' ? 'wedge' : null;
  return { named, pins, normalSpleen: plan.normalOutline.includes('spleen'), marked, res: plan.res, caudate: plan.caudate, caudateVeins: plan.caudateVeins, focus: focusOfStations(plan.labels), cards, calipers, spans,
    reads, readsTone, lit, notDrawn };
}

export { toneCss };
