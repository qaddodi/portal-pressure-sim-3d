// What a 2D slide asks the FIGURE to draw, worked out from the slide's own fields and the 2D app's own tables (scene/labels/figure2d.copied.ts), never typed per slide.
// The 2D presenter does this in presenter-words.js `slideTargets` and presenter-overlays.js `paintOverlays` (its labels, the station colours its terms give, its glows, outlined organs,
// marks, sites, calipers, spotlight, steps and the lapse's glow); here the same sums are written once, in node-testable form, and figure-link.ts applies the result to the scene.
// Every id the plan names is checked against what the 3D figure has (`unresolved`), so a field that points at nothing fails a test instead of drawing nothing quietly.
import type { CopiedSlide } from '../../decks/hp/types.ts';
import { STATIONS } from '../../scene/labels/stations.ts';
import { NETWORK_BY_ID } from '../../scene/vessels/network.ts';
import { HIDDEN_EDGES } from '../../scene/anatomy/source.ts';
import { ENGINE_EDGE_IDS } from '../../decks/hp/figure-engine.ts';
import { ORGAN_STYLE } from '../../scene/organs/layer.ts';
import { RES_KEYS, type ResKey } from '../../scene/circuit/res-model.ts';
import { spanOf } from '../../scene/labels/span-math.ts';
import {
  TARGETS_FIG, EDGE_TONE_2D, SITE_NODE_2D, VAL_TONE_2D, SETS_FIG, ORGANS_FIG, ORGAN_ANCHOR_2D, ORGAN_MARKS_2D, VARIX_EDGE_2D, SITE_DEF_2D, type Target2D,
} from '../../scene/labels/figure2d.copied.ts';

export type Json = unknown;
const list = <T,>(v: T | readonly T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? [...(v as T[])] : [v as T]);
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** '@name' in a glow, spot or a mark's edges stands for the vessels of a named set (highlight-math.js SETS). */
export const expandIds = (v: Json): Json[] => list(v as Json).flatMap((g) => (typeof g === 'string' && g[0] === '@' ? [...(SETS_FIG[g.slice(1)] ?? [])] : [g]));

const STATION_IDS = new Set(STATIONS.map((s) => s.id));
/** A vessel the 3D figure draws, or one the 2D figure hides too (HIDDEN_EDGES: nothing to light). The engine's edges that no tube stands for are unknown. */
const ENGINE_EDGES = ENGINE_EDGE_IDS;
export const isVessel = (id: string): boolean => NETWORK_BY_ID.has(id);
const vesselKnown = (id: string): boolean => NETWORK_BY_ID.has(id) || HIDDEN_EDGES.has(id) || (ENGINE_EDGES.has(id) && false);
const ORGAN_IDS = new Set(Object.keys(ORGAN_STYLE));

/** A colour the 2D app names by a token ('pv': the station's --tr-pv; '--tour-sys': a custom property; 'accent'), as the CSS value the figure's layers use. */
export const toneCss = (tone: string | null | undefined): string => (!tone ? 'var(--text-2)' : tone === 'accent' ? 'var(--accent)' : tone.startsWith('--') ? `var(${tone})` : `var(--tr-${tone})`);

export interface GlowItem { id: string; tone: string | null; /** ms after the slide lands (glowSeq) */ at: number; soft: boolean }
export interface MarkItem { edges: string[]; organ: string | null; label: string; kind: 'block' | 'treat' | 'note'; free: boolean; seg?: string; clot?: boolean }
export interface CaliperItem { id: string; organ: 'spleen' | null; edge: string | null; key: string | null }
/** A bracket on the Circuit between two stations, with its words (a brace in them names a reading of the slide's state). */
export interface SpanItem { from: string; to: string; label: string }
export interface StepItem { n: number; at: number; ids: string[] | null; organ: string | null; group: boolean }
export interface OrganPin { id: string; tone: string | null }

export interface FigurePlan {
  /** The station labels shown (its `labels`, the stations its terms name in the line, those a site lends a colour). */
  labels: string[];
  /** Station -> the colour token its words take (the terms' tone, `tint`, a site's lent colour). */
  tones: Record<string, string>;
  /** The vessels named (glow, terms' vessels, a note mark's pointer), in the order they light, each at its ms. */
  glow: GlowItem[];
  /** Organs outlined (a glow naming an organ, a term's organ, a mark on the caudate lobe). */
  organs: OrganPin[];
  /** The Circuit's resistors lit (rLiver, rColl, rGut). */
  res: ResKey[];
  /** The lobule's and sinusoid's own parts lit (their labels take the colour). */
  lit: string[];
  marks: MarkItem[];
  /** A mark on the caudate lobe: the Circuit draws the lobe's own lane (2D pinOrgans). */
  caudate: boolean;
  /** The lobe is drawn with its short hepatic veins (the slide pins 'caudate', not only 'caudate-lobe': 2D pinOrgans `caud.show(on, veins)`). */
  caudateVeins: boolean;
  /** The lobule's pointer: where it points and its words. */
  callout: { at: string; label: string; kind: string } | null;
  /** The readings on the figure (pv, ivc, ra, web, split) that no station label already carries, and the Circuit's (rLiver...). */
  sites: string[];
  calipers: CaliperItem[];
  /** The Circuit's brackets (`span`). */
  spans: SpanItem[];
  spot: { edges: string[]; organs: OrganPin[] } | null;
  normalOutline: string[];
  lapseGlow: OrganPin[];
  ripple: true | string | null;
  /** Numbered glow steps (steps + glowSeq), or null. */
  steps: StepItem[] | null;
  glowSeq: number;
  /** The `since` lens: the slide whose state it counts from ('previous' = the slide before; 'lapse' = the lapse's own start). */
  since: { from: string | 'previous' | 'lapse'; label: string | null } | null;
  /** Every id the slide names that the 3D figure cannot place (a test asserts none). */
  unresolved: string[];
}

export const EMPTY_PLAN: FigurePlan = { labels: [], tones: {}, glow: [], organs: [], res: [], lit: [], marks: [], caudate: false, caudateVeins: false, callout: null, sites: [], calipers: [], spans: [], spot: null, normalOutline: [], lapseGlow: [], ripple: null, steps: null, glowSeq: 0, since: null, unresolved: [] };

// ── the words of a slide that point at the figure (presenter-words.js termList / slideTargets) ──
const AUTO_TERMS = ['cavernoma'];
function termList(s: CopiedSlide): [string, string][] {
  const t = s.terms ?? [];
  const own: [string | undefined, string][] = Array.isArray(t) ? (t as string[]).map((k) => [TARGETS_FIG[k]?.words, k]) : Object.entries(t as Record<string, string>).map(([w, k]) => [esc(w), k]);
  const have = new Set(own.map(([, k]) => k));
  return [...own, ...AUTO_TERMS.filter((k) => !have.has(k)).map((k): [string | undefined, string] => [TARGETS_FIG[k]?.words, k])].filter((x): x is [string, string] => !!x[0] && !!TARGETS_FIG[x[1]]);
}

/** The terms the line points at: a [link](key), or a word of the slide's `terms` that the line says. */
export function termsInLine(s: CopiedSlide, line: string = s.line ?? ''): string[] {
  const keys = new Set<string>();
  for (const m of line.matchAll(/\[([^\]]+)\]\(([\w:]+)\)/g)) if (TARGETS_FIG[m[2]!]) keys.add(m[2]!);
  for (const [w, k] of termList(s)) if (new RegExp(`\\b(?:${w})\\b`, 'i').test(line)) keys.add(k);
  return [...keys];
}

/** Words that name a pressure reading, not an organ: 2D's target for them carries the organ the reading is taken in (WHVP: the liver), and 3D does not light it. Lighting it darkened and outlined the liver the moment the
 *  catheter wedged (Mohammad, 25 Nov: "why does the liver turn dark and glow when the catheter wedges? it shouldn't"). A reading's station label (the sinusoids) stays; an organ is outlined only when the slide names the organ. */
export const READING_TARGETS: ReadonlySet<string> = new Set(['whvp']);
/** The organ a target outlines: its own, unless the words only name a reading taken there. */
export const organOfTarget = (id: string, t: Target2D | undefined): string | undefined => (READING_TARGETS.has(id) ? undefined : t?.organ);

/** The Circuit's zigzag a target names ('rLiver'...). */
const resOf = (t: Target2D | undefined): ResKey | null => { const r = t?.res; return r && (RES_KEYS as readonly string[]).includes(r) ? (r as ResKey) : null; };

/** deck visuals: spot (highlight-math.js spotOf). */
function spotOf(listIn: Json[]): { edges: string[]; organs: OrganPin[]; unknown: string[] } {
  const edges: string[] = [], organs: OrganPin[] = [], unknown: string[] = [], seen = new Set<string>();
  for (const g of listIn) {
    const id = typeof g === 'string' ? g : (g as { id?: string } | null)?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const t = TARGETS_FIG[id], organ = organOfTarget(id, t);
    if (t && organ) organs.push({ id: organ, tone: t.tone });
    else if (ORGANS_FIG.includes(id)) organs.push({ id, tone: TARGETS_FIG[id]?.tone ?? '--text-2' });
    else if (NETWORK_BY_ID.has(id)) edges.push(id);
    else unknown.push(id);
  }
  return { edges, organs, unknown };
}

/** A live word in a mark's label ({asc}, {varix}) stands for a tile's reading; the plan keeps the label as written and the link fills it. */
export const hasLive = (label: string): boolean => /\{\w+\}/.test(label);

/** What a slide asks the figure to draw. `fp` is not needed here: readings are filled when the slide is on (figure-link.ts). */
export function figurePlan(s: CopiedSlide): FigurePlan {
  const unresolved: string[] = [];
  const bad = (what: string, id: string) => unresolved.push(`${what} "${id}"`);
  const line = s.line ?? '';

  // terms: the stations, vessels and organs the line points at
  const labels: string[] = [], tones: Record<string, string> = {}, glow = new Map<string, GlowItem>(), organs = new Map<string, string | null>(), res = new Map<ResKey, string>(), lit = new Set<string>(), sitesFromTerms = new Set<string>();
  for (const k of termsInLine(s, line)) {
    const t = TARGETS_FIG[k]!;
    if (t.node) { labels.push(t.node); tones[t.node] = t.tone; }
    if (t.lit) lit.add(k);
    if (t.site) sitesFromTerms.add(t.site);
    for (const e of t.edges ?? []) glow.set(e, { id: e, tone: t.tone, at: 0, soft: false });
    const organ = organOfTarget(k, t);
    if (organ) organs.set(organ, t.tone);
    const r = resOf(t); if (r) res.set(r, t.tone);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marksIn = list<unknown>((s.marks ?? s.mark) as unknown).filter((m): m is Record<string, any> => !!m && typeof m === 'object');
  // a mark that names the caudate lobe points at it, so the lobe is drawn whether or not the line says its name
  for (const m of marksIn) if (m.organ === 'caudate' && !organs.has('caudate') && !organs.has('caudate-lobe')) organs.set('caudate', TARGETS_FIG.caudate!.tone);
  for (const k of list(s.tint as string[] | undefined)) { const t = TARGETS_FIG[k]; if (t?.node) tones[t.node] = t.tone; else bad('tint', k); }

  // glow: each entry (a list is one step) lights at i x glowSeq ms
  const seq = typeof s.glowSeq === 'number' ? s.glowSeq : 0;
  const soft = new Set<string>();
  expandIds(s.glow).forEach((g0, i) => {
    for (const g of Array.isArray(g0) ? expandIds(g0) : [g0]) {
      const obj = typeof g === 'string' ? null : (g as { id: string; tone?: string; soft?: boolean });
      const id = typeof g === 'string' ? g : obj!.id, tone = obj?.tone ?? null, ms = seq ? i * seq : 0, isSoft = !!obj?.soft;
      const add = (e: string, tn: string | null) => { glow.delete(e); glow.set(e, { id: e, tone: tn, at: ms, soft: isSoft }); if (isSoft) soft.add(e); else soft.delete(e); };
      const t = TARGETS_FIG[id];
      if (t) { if (t.lit) lit.add(id); const r = resOf(t); if (r) res.set(r, tone ?? t.tone); for (const e of t.edges ?? []) add(e, tone ?? t.tone); const organ = organOfTarget(id, t); if (organ) organs.set(organ, tone ?? t.tone); }
      else if (ORGANS_FIG.includes(id)) organs.set(id, tone ?? TARGETS_FIG[id]?.tone ?? null);
      else if (vesselKnown(id)) add(id, tone ?? EDGE_TONE_2D[id] ?? 'accent');
      else bad('glow', id);
    }
  });

  // marks: a note mark is a pointer whose vessel glows in its station's colour, and goes where a station label already names it
  const named = new Set<string>([...(s.labels ?? []), ...labels].flatMap((n) => TARGETS_FIG[n]?.edges ?? []));
  let marks: MarkItem[] = marksIn.map((m) => ({
    edges: expandIds(m.edges).filter((e): e is string => typeof e === 'string'), organ: typeof m.organ === 'string' ? m.organ : null,
    label: typeof m.label === 'string' ? m.label : '', kind: (m.kind === 'treat' || m.kind === 'note' ? m.kind : 'block'), free: !!m.free,
    ...(typeof m.seg === 'string' ? { seg: m.seg } : {}), ...(m.clot ? { clot: true } : {}),
  }));
  for (const m of marks) {
    for (const e of m.edges) if (!vesselKnown(e)) bad('mark edge', e);
    if (m.organ && !ORGAN_MARKS_2D.includes(m.organ)) bad('mark organ', m.organ);
    if (m.organ && !ORGAN_ANCHOR_2D[m.organ]) bad('mark organ anchor', m.organ);
    if (!m.label && !m.clot) bad('mark without words', m.edges.join(',') || m.organ || '?');
  }
  for (const m of marks) if (m.kind === 'note') for (const e of m.edges) if (!glow.has(e)) glow.set(e, { id: e, tone: EDGE_TONE_2D[e] ?? 'accent', at: 0, soft: false });
  marks = marks.filter((m) => !(m.kind === 'note' && m.edges.some((e) => named.has(e))));

  // a site the label stands in for lends it its station colour
  const siteKeys = [...new Set([...list(s.sites as string[] | undefined), ...sitesFromTerms])];
  // A site that sits on a station (the portal vein, the IVC, the right atrium) is that station's own label, with its reading and colour, like "Portal vein 19.0 mmHg": never a speech-bubble card that
  // points somewhere else (Mohammad, 22 Nov, slide "The PPG detects resistance the HVPG misses": the IVC bubble pointed at the spleen). Only a site that is no station (the portal blood's split) is a card.
  const siteStations = siteKeys.map((k) => SITE_NODE_2D[k]).filter((n): n is string => !!n && STATION_IDS.has(n));
  const labelSet = [...new Set([...(s.labels ?? []), ...labels, ...siteStations])];
  for (const k of siteKeys) { const n = SITE_NODE_2D[k]; if (n && labelSet.includes(n)) tones[n] ??= TARGETS_FIG[k]?.tone ?? VAL_TONE_2D[k] ?? 'accent'; }
  for (const id of s.labels ?? []) if (!STATION_IDS.has(id)) bad('label', id);
  for (const id of labels) if (!STATION_IDS.has(id)) bad('term station', id);
  // sites no station label carries
  const sites = siteKeys.filter((k) => !labelSet.includes(SITE_NODE_2D[k]!));
  for (const k of sites) if (!SITE_DEF_2D[k]) bad('site', k);
  // a site no station carries and that is no resistor and no split would be a card of its own on the figure: there is no such card, so a deck that asks for one fails here, not on screen
  for (const k of sites) { const d = SITE_DEF_2D[k]; if (d && !d.res && !d.split && d.node) bad('site off station', k); }
  const siteRes = sites.map((k) => (SITE_DEF_2D[k]?.res ? (`r${SITE_DEF_2D[k]!.res![0]!.toUpperCase()}${SITE_DEF_2D[k]!.res!.slice(1)}` as ResKey) : null)).filter((k): k is ResKey => !!k);
  for (const k of siteRes) if (!(RES_KEYS as readonly string[]).includes(k)) bad('site resistor', k);
  for (const k of siteRes) if (!res.has(k)) res.set(k, TARGETS_FIG[k]?.tone ?? 'accent');

  // outlined organs must be organs the 3D figure draws (the caudate lobe and the ascites are the lobe's lane and the pool: not organ meshes)
  const pins: OrganPin[] = [...organs].map(([id, tone]) => ({ id, tone }));
  for (const o of pins) if (!ORGAN_IDS.has(o.id) && o.id !== 'caudate' && o.id !== 'caudate-lobe') bad('organ', o.id);

  // spot, normalOutline, lapseGlow
  const sp = s.spot ? spotOf(expandIds(s.spot)) : null;
  for (const u of sp?.unknown ?? []) bad('spot', u);
  const normalOutline = expandIds(s.normalOutline).filter((id): id is string => id === 'spleen');
  const lapseGlow: OrganPin[] = expandIds(s.lapseGlow).map((id) => ({ id: typeof id === 'string' ? (TARGETS_FIG[id]?.organ ?? (ORGANS_FIG.includes(id) ? id : '')) : '', tone: '--origin-smv' })).filter((o) => { if (!o.id) { bad('lapseGlow', '?'); return false; } return true; });
  for (const o of lapseGlow) if (!ORGAN_IDS.has(o.id)) bad('lapseGlow organ', o.id);

  // calipers (callout-math.js caliperOf)
  const calipers: CaliperItem[] = [...new Set(list(s.calipers as string[] | undefined).filter((x): x is string => typeof x === 'string'))].map((id) =>
    id === 'spleen' ? { id, organ: 'spleen' as const, edge: null, key: 'spleen' }
    : id === 'varix' || id === 'C1a' || id === 'C1b' ? { id, organ: null, edge: id === 'varix' ? VARIX_EDGE_2D : id, key: 'varix' }
    : { id, organ: null, edge: id, key: null });
  for (const c of calipers) if (c.edge && !vesselKnown(c.edge)) bad('caliper', c.id);

  // the Circuit's brackets (callout-math.js spanOf): both stations must be on the map, and not at one x
  const spans: SpanItem[] = [];
  for (const sp of list(s.span as { from?: string; to?: string; label?: unknown }[] | undefined)) {
    if (!sp || typeof sp.from !== 'string' || typeof sp.to !== 'string') { bad('span', '?'); continue; }
    if (!spanOf(sp.from, sp.to)) { bad('span', `${sp.from}-${sp.to}`); continue; }
    spans.push({ from: sp.from, to: sp.to, label: String(sp.label ?? '') });
  }

  // numbered steps (callout-math.js stepPlan): one for each entry of the glow, in order
  const steps: StepItem[] | null = s.steps && seq > 0
    ? list(s.glow as Json).flatMap((g) => (Array.isArray(g) ? [expandIds(g.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)))] : expandIds([typeof g === 'string' ? g : (g as { id?: string })?.id]))).map((g, i) => {
      const ids = (Array.isArray(g) ? g : [g]).map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)).filter((x): x is string => !!x);
      const vessels = ids.length && ids.every((x) => NETWORK_BY_ID.has(x)) ? ids : null;
      return { n: i + 1, at: i * seq, ids: vessels, organ: ids.length === 1 && !!ORGAN_ANCHOR_2D[ids[0]!] ? ids[0]! : null, group: Array.isArray(g) && (vessels?.length ?? 0) > 1 };
    }) : null;

  // the lobule's pointer
  const callout = s.callout && typeof s.callout === 'object' ? { kind: 'block', ...(s.callout as { at: string; label: string }) } : null;

  const since = s.lens === 'since'
    ? { from: typeof s.since === 'string' ? s.since : s.lapse ? ('lapse' as const) : ('previous' as const), label: typeof s.sinceLabel === 'string' ? s.sinceLabel : null }
    : null;

  return {
    labels: [...new Set(labelSet)], tones, glow: [...glow.values()], organs: pins, res: [...res.keys()], lit: [...lit], marks, caudate: pins.some((o) => o.id === 'caudate' || o.id === 'caudate-lobe'), caudateVeins: pins.some((o) => o.id === 'caudate'),
    callout, sites, calipers, spans, spot: sp ? { edges: sp.edges, organs: sp.organs } : null, normalOutline, lapseGlow,
    ripple: s.ripple === true ? true : typeof s.ripple === 'string' ? s.ripple : null, steps, glowSeq: seq, since, unresolved,
  };
}
