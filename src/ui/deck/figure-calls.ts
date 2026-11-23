// The calls a slide's figure plan makes on the scene: which vessels are named and when, which organs are outlined, which vessels stand out, the cards and the
// calipers the label layer stands, the Circuit's resistors. Pure (no scene, no DOM): figure-link.ts applies the result, and node judges every slide's calls
// (tests/deck-figure-link.test.ts: each one resolves to a vessel, an organ or a place the figure has).
import type { FigurePlan } from './figure-plan.ts';
import { toneCss } from './figure-plan.ts';
import { ORGAN_STYLE } from '../../scene/organs/layer.ts';
import { CAUDATE_FRONT_Z } from '../../scene/organs/caudate.ts';
import { SITE_DEF_2D, SPLEEN_AXIS_2D, ORGAN_ANCHOR_2D, VAL_TONE_2D } from '../../scene/labels/figure2d.copied.ts';
import type { FigCard, FigCaliper, FigSpan, Anchor } from '../../scene/labels/figure-cards.ts';
import type { ResKey } from '../../scene/circuit/res-model.ts';
import { NETWORK_BY_ID } from '../../scene/vessels/network.ts';
import { valueText, parseToken, VALUE_PENDING } from '../../decks/hp/numbers.ts';
import { fmtPressure } from '../text/line.ts';
import { portalSplit } from './from2d/table-marks.js';

export type Fp = Record<string, number | null | undefined> & { at?: { P?: ArrayLike<number>; D?: ArrayLike<number> } };
export interface Reads {
  /** The numbers of the slide's state (hp/calc.ts), when they are in. */
  fp?: Fp | null;
  /** The model's parameters at the slide (a clot's size, the stents). */
  params?: { thrombus?: Record<string, number>; tips?: { on?: boolean; d?: number }; dips?: { on?: boolean; d?: number } } | null;
  /** The live pressure at a node (mmHg), when the slide's own number is not in. */
  pressure?: (node: string) => number | null;
  /** An edge's index in the engine's arrays (for a vessel's own diameter). */
  indexOf?: (edge: string) => number;
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
  cards: FigCard[];
  calipers: FigCaliper[];
  /** The Circuit's brackets, each with its words filled from the slide's numbers. */
  spans: FigSpan[];
  /** Whatever the plan names that is not drawn: 2D draws nothing for it either (a ripple's halo, a lobule's pointer), or it is another view's. */
  notDrawn: string[];
}

export const EMPTY_CALLS: FigureCalls = { named: [], pins: [], normalSpleen: false, marked: [], res: [], caudate: false, caudateVeins: false, cards: [], calipers: [], spans: [], notDrawn: [] };

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

/** An organ's anchor on the plate: 2D's point, at the organ's front (the caudate lobe lies on the cava's plane, so its mark sits on its dome, not 0.22 in front of it). */
const organAnchor = (organ: string): Anchor => (organ === 'caudate' ? { at2d: ORGAN_ANCHOR_2D[organ]!.at, z: CAUDATE_FRONT_Z } : { at2d: ORGAN_ANCHOR_2D[organ]!.at });

/** (the caudate lobe is in the organ layer but is shown by `caudate`, not outlined: 2D's lobe has its own line and no pin glow) */
const pinsOf = (organs: readonly { id: string }[]): string[] => organs.map((o) => o.id).filter((id) => id in ORGAN_STYLE && id !== 'caudate');

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
    const anchor: Anchor | null = m.organ ? organAnchor(m.organ === 'kidney' ? 'kidney-l' : m.organ) : m.edges[0] && NETWORK_BY_ID.has(m.edges[0]) ? { edge: m.edges[0] } : null;
    if (!anchor) { notDrawn.push(`mark ${m.edges[0] ?? m.organ} (hidden in 2D too)`); return; }
    cards.push({ id: `mark:${i}`, kind: 'mark', text, tone: m.kind === 'block' ? 'block' : m.kind === 'treat' ? 'treat' : 'note', anchor });
  });

  // the lobule's pointer at the lesion (lobule-zoom.js callSet): a block, treatment or note ring on the framed portal tract or on a sinusoid (resistance is in the sinusoids: the central-vein slides ring a zone 3 one, never the vein; lobule/callout-spot.ts); it stands only while the lobule is the figure
  if (plan.callout) {
    const at = { triad: 'tract', sin: 'sinusoid:mid', cv: 'sinusoid:zone3' }[plan.callout.at];
    if (at) cards.push({ id: 'callout', kind: 'mark', text: plan.callout.label, tone: plan.callout.kind === 'treat' ? 'treat' : plan.callout.kind === 'note' ? 'note' : 'block', anchor: { lobule: at } });
    else notDrawn.push(`callout ${plan.callout.at}`);
  }

  // sites: a station's reading on the figure, and the portal blood's split
  for (const k of plan.sites) {
    const d = SITE_DEF_2D[k];
    if (!d || d.res || !d.node) continue;
    if (d.split) {
      const sh = fp?.shunt;
      if (typeof sh !== 'number' || !Number.isFinite(sh)) continue;
      const p = portalSplit(sh);
      cards.push({ id: `site:${k}`, kind: 'split', text: d.kicker, tone: 'pv', anchor: { node: d.node }, below: true, split: { liver: p.liver, shunt: p.shunt, rate: p.rate } });
      continue;
    }
    const own = fp?.[k], v = typeof own === 'number' && Number.isFinite(own) ? own : r.pressure?.(d.node) ?? null;
    cards.push({ id: `site:${k}`, kind: 'site', text: d.kicker, value: fmtPressure(v, 1, false), unit: d.unit ?? 'mmHg', tone: VAL_TONE_2D[k] ?? 'accent', anchor: d.node === 'IVCS' || d.node === 'RA' || d.node === 'CONF' ? { station: d.node } : { node: d.node }, below: d.below });
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
  return { named, pins, normalSpleen: plan.normalOutline.includes('spleen'), marked, res: plan.res, caudate: plan.caudate, caudateVeins: plan.caudateVeins, cards, calipers, spans, notDrawn };
}

export { toneCss };
