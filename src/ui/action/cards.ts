// The tap-anything cards: for a vessel, an organ or a part of the lobule, what it reads and what can be done to it. A port of the 2D app's actions.js (the card catalogue):
// the same words, verbs, ranges and readings, held to the 2D app's own answers by tests/action-cards.test.ts (tests/fixtures/actions-2d.json, scripts/gen-actions.mjs).
// A card is a fixed description: its readings are functions of an Env (a frame, the patient's parameters, the healthy reference) and its verbs are carried out through an Act
// (the changes go through updateParams, so each lands in History as one entry). Nothing here draws; ActionCard.tsx does.
import { EDGES, SHUNT_PORTAL, SHUNT_SYSTEMIC, dMinOf, edgePresent } from '../../engine/hales/portal/topology.js';
import { edgeWhy } from '../../engine/hales/portal/explain-ids.js';
import { PREGNANCY_INFO } from '../../engine/hales/portal/scenario.js';
import { stentStill } from '../../engine/hales/portal/flow-cuts.js';
import { flowReversed } from '../../scene/lenses/vel-normal.copied.js';
import { fmt } from '../charts/fmt.ts';
import { TREAT_WORDS } from '../treat/treat.generated.ts';
import * as W from './actions.generated.ts';
import type { FeatureId } from '../shell/features.ts';
import type { Sel } from './selection.ts';
import type { Params } from './params.ts';
import { EI, NI, piecesOf, STATION_OF, SIN_EDGES, ST, SPAN_HVPG, spanOfEdge, edgeValue, bedStats, vesselReads, flowNum, pressureReading, cellOf, clamp, pct, mult, weeks, lobuleOf, portalBack,
  type Edge, type Env, type Reading, type Status, type SpanDef, type LobuleState } from './read.ts';
import { lymphDay, lymphText, LYMPH_UNIT } from './lymph-day.ts';

/** How a verb reaches the app: the parameter changes (one History entry each), a new selection, the features other batches own, the engine's own actions. */
export interface Act {
  update(patchOrFn: Record<string, unknown> | ((p: Params) => Params), o: { label: string }): void;
  select(sel: Sel | null): void;
  feature(id: FeatureId, name: string): void;
  /** Point the Doppler's probe at a vessel (2D: the vessel card's Doppler button asks the model to sample that vessel, then shows the pane). */
  probe(id: string): void;
  action(a: { kind: string; [k: string]: unknown }): void;
}

interface Base { id?: string; key?: string; label?: string | null; short?: string; icon?: string; showIf?(env: Env): boolean }
export type Verb = Base & (
  | { type: 'read'; unit: string; value(env: Env): string }
  | { type: 'stat'; value(env: Env): string }
  | { type: 'about'; text(env: Env): readonly string[] }
  | { type: 'meter'; share(env: Env): number }
  | { type: 'slider'; key: string; min: number; max: number; step: number; def: number; format(v: number): string; get(p: Params): number; set(p: Params, v: number): void; hist: string; info?: string; ticks?: number[]; tickNames?: string }
  | { type: 'toggle'; key: string; get(p: Params): boolean; set(p: Params, v: boolean): void; hist: string }
  | { type: 'seg'; small?: boolean; options: [string | number, string][]; get(p: Params): string | number; set(act: Act, v: string | number, p: Params): void }
  | { type: 'button'; run(act: Act): void; danger?: boolean; quiet?: boolean; note?(env: Env): string | null }
  | { type: 'link'; run(act: Act): void }
  | { type: 'dye'; run(act: Act): void }
  | { type: 'panel'; stent: string; run?(act: Act): void }
);
export interface Card {
  key: string; sel: Sel; kicker: string; title: string; why: string | null; edge?: string; noValue?: boolean; noDetails?: boolean;
  span: SpanDef | null; verbs: Verb[];
  value(env: Env): Reading | null;
  status?(env: Env): Status;
}

const HEP_VEIN: Record<string, string> = { RHV_IVC: 'R', POST_R_RHV: 'R', MHV_IVC: 'M', POST_R_MHV: 'M', POST_L_MHV: 'M', LHV_IVC: 'L', POST_L_LHV: 'L' };
const POST_TO_HV: Record<string, string> = { POST_R_RHV: 'RHV_IVC', POST_R_MHV: 'MHV_IVC', POST_L_MHV: 'MHV_IVC', POST_L_LHV: 'LHV_IVC' };
const WEDGE_OF: Record<string, string> = { W_R: 'RHV_IVC', W_M: 'MHV_IVC', W_L: 'LHV_IVC' };
// A label or station stands for a structure: clicking "Portal vein" opens the portal vein's card.
const NODE_SEL: Record<string, [string, string]> = {
  CONF: ['edge', 'PV_TRUNK'], PVH: ['edge', 'PV_TRUNK'], SV: ['edge', 'SV_CONF'], SMV: ['edge', 'SMV_CONF'], IMV: ['edge', 'V_IMV'], LGV: ['edge', 'LGV_CONF'],
  RPV: ['edge', 'PVH_R'], LPV: ['edge', 'PVH_L'], RHV: ['edge', 'RHV_IVC'], MHV: ['edge', 'MHV_IVC'], LHV: ['edge', 'LHV_IVC'], IVCS: ['edge', 'IVCS_RA'], IVCI: ['edge', 'IVC_IS'],
  SVC: ['edge', 'SVC_RA'], AZY: ['edge', 'AZY_SVC'], ILI: ['edge', 'ILI_IVC'], LRV: ['edge', 'LRV_IVC'], KID_L: ['edge', 'V_KID_L'], COL: ['edge', 'V_COL'], INT: ['edge', 'V_INT'],
  SIN_R: ['edge', 'SIN_RR'], SIN_L: ['edge', 'SIN_LL'], CV_R: ['organ', 'liver'], CV_L: ['organ', 'liver'], HA: ['edge', 'A_HEP'],
  RA: ['organ', 'heart'], VAR: ['organ', 'varices'], GV: ['organ', 'gastric'], STO: ['organ', 'gastric'], SPL: ['organ', 'spleen'], EPI: ['organ', 'abdomen'],
};
const edges = EDGES as Edge[];
const NORM_NODE = new Map<string, Sel>();
for (const id of Object.keys(WEDGE_OF)) NORM_NODE.set(id, { type: 'edge', id: WEDGE_OF[id]! });
for (const [id, m] of Object.entries(NODE_SEL)) if (!NORM_NODE.has(id)) NORM_NODE.set(id, m[0] === 'edge' ? { type: 'edge', id: m[1] } : { type: 'organ', id: m[1] });
const NORM_EDGE = new Map<string, Sel>();
for (const e of edges) {
  // A central vein that runs into a hepatic vein is that hepatic vein to the eye; the liver's other micro-vessels are the liver; the drawn sinusoids are a vessel of their own.
  if (POST_TO_HV[e.id]) NORM_EDGE.set(e.id, { type: 'edge', id: POST_TO_HV[e.id]! });
  else if (e.kind === 'liver' && !SIN_EDGES.has(e.id)) NORM_EDGE.set(e.id, { type: 'organ', id: 'liver', lobe: e.lobe === 'L' ? 'L' : e.lobe === 'R' ? 'R' : null, zone: e.zone });
}
/** The structure a selection stands for (liver micro-vessels are the liver; stations their vessel). */
export function normalizeSel(sel: Sel | null): Sel | null {
  if (!sel) return null;
  if (sel.type === 'node') return NORM_NODE.get(sel.id) ?? null;
  if (sel.type === 'edge') return EI[sel.id] === undefined ? null : NORM_EDGE.get(sel.id) ?? sel;
  return sel;
}

// ── the verbs a card is made of ──
const read = (unit: string, value: (env: Env) => string, label: string | null = null): Verb => ({ type: 'read', label, unit, value });
const PRESS_NOTE = (n: number) => `${Math.round(n)} band${n >= 1.5 ? 's' : ''} placed`;
const FMT1 = (x: number) => fmt(x, 1);
const qOf = (env: Env, k: number) => (env.f.Qf || env.f.Q)[k]!;
const pOf = (env: Env, i: number) => (env.f.Pf || env.f.P)[i]!;
const PROC = TREAT_WORDS.procedures;
const HEP_ART = new Set(['A_HEP', 'A_HR', 'A_HL']);
const PETAL_COLL = new Set(['C8']);   // (collaterals that carry portal blood TOWARD the liver: the cavernoma bypasses the clot into the portal hilum)
const PRESENT_ONLY_ESO = new Set(['C1a', 'C1b']), PRESENT_ONLY_GAS = new Set(['C2', 'C5']);

const dopplerOn = (id: string): Verb => ({ type: 'button', id: 'doppler', label: 'Doppler', icon: 'doppler', run: (a) => { a.probe(id); a.feature('doppler', 'Doppler'); a.select(null); } });
const dye: Verb = { type: 'dye', id: 'dye', label: 'Inject dye', short: 'Dye', icon: 'drop', run: (a) => a.feature('dye', 'Inject dye') };

function varixVerbs(site: 'eso' | 'gas'): Verb[] {
  const eso = site === 'eso', out: Verb[] = [];
  if (eso) out.push({ type: 'button', id: 'band', label: PROC.band.label, short: 'Band', icon: 'band', run: (a) => { a.action({ kind: 'band' }); }, note: ({ f }) => ((f as unknown as { bands?: number }).bands ? PRESS_NOTE((f as unknown as { bands: number }).bands) : null) });
  out.push({ type: 'button', id: 'endoscope', label: 'Endoscope', short: 'Scope', icon: 'endoscope', run: (a) => a.feature('endoscopy', 'Endoscope') });
  // The tamponade tube. Its gastric balloon is the first step; the esophageal balloon is the second, only on a tube whose gastric balloon is up: switching it on brings
  // the gastric one with it, and letting the gastric one down lets the esophageal one down first.
  out.push({ type: 'toggle', id: 'balloon-gas', key: 'balloonGas', label: 'Gastric balloon', short: 'Gastric balloon', icon: 'balloon', get: (p) => !!p.balloonGas, set: (p, v) => { p.balloonGas = v; if (!v) p.balloonEso = false; }, hist: 'Gastric balloon' });
  if (eso) out.push({ type: 'toggle', id: 'balloon', key: 'balloonEso', label: 'Esophageal balloon', icon: 'balloon', get: (p) => !!p.balloonEso, set: (p, v) => { p.balloonEso = v; if (v) p.balloonGas = true; }, hist: 'Esophageal balloon' });
  return out;
}
const VARIX_ESO = varixVerbs('eso'), VARIX_GAS = varixVerbs('gas');
const VARIX_ESO_ACTS = VARIX_ESO.filter((v) => v.type === 'button'), VARIX_GAS_ACTS = VARIX_GAS.filter((v) => v.type === 'button');

const CIRRHOSIS: Verb = { type: 'slider', id: 'cirrhosis', key: 'cirrhosis', label: 'Cirrhosis', icon: 'liver', min: 0, max: 1, step: 0.01, def: 0, format: pct, get: (p) => p.cirrhosis, set: (p, v) => { p.cirrhosis = v; }, hist: 'Cirrhosis',
  ticks: [0.4, 0.6, 0.85], tickNames: '40% compensated, 60% CSPH, 85% decompensated' };
const ZONE_NAME = { pre: 'portal tract', sin: 'sinusoids', post: 'central vein' } as const;
const FIB_INFO = { pre: 'Resistance before the sinusoids, as in schistosomiasis: portal pressure rises, the WHVP does not.', sin: 'Collagen in the space of Disse and closing fenestrae: resistance in the sinusoids themselves, measured by the HVPG.', post: 'Resistance at the central veins, as in sinusoidal obstruction syndrome: the sinusoids congest from the outflow side.' } as const;
/** Fibrosis in one zone of every lobule (both lobes: one lobule stands for the liver). */
const fibrosisVerb = (z: 'pre' | 'sin' | 'post'): Verb => ({ type: 'slider', id: 'fibrosis', key: 'fibrosis', label: `Fibrosis · ${ZONE_NAME[z]}`, short: 'Fibrosis', icon: 'fibrosis', min: 1, max: 80, step: 0.5, def: 1, format: mult,
  get: (p) => Math.max(p.fibrosis.R[z], p.fibrosis.L[z]), set: (p, v) => { p.fibrosis.R[z] = v; p.fibrosis.L[z] = v; }, hist: `Fibrosis · ${ZONE_NAME[z]}`, info: FIB_INFO[z] });
const FIB = { pre: fibrosisVerb('pre'), sin: fibrosisVerb('sin'), post: fibrosisVerb('post') };

// ── a vessel ──
function edgeCard(e: Edge): Card {
  const id = e.id, k = EI[id]!, verbs: Verb[] = [], doppler = dopplerOn(id);
  const isColl = e.kind === 'collateral', isShunt = e.kind === 'shunt', isArt = e.kind === 'artery' || e.kind === 'arteriole';
  const narrow: Verb = { type: 'slider', id: 'narrow', key: 'stenosis', label: 'Stenosis', icon: 'pinch', min: 0, max: 0.95, step: 0.01, format: pct, def: 0,
    get: (p) => p.stenosis[id] || 0, set: (p, v) => { if (v <= 0.004) delete p.stenosis[id]; else p.stenosis[id] = +v.toFixed(2); }, hist: `${e.label}: stenosis`,
    info: 'Lumen narrowing. Resistance rises with (1 − s)⁻⁴ (Poiseuille).' };
  const clot: Verb = { type: 'slider', id: 'clot', key: 'thrombus', label: 'Thrombus', icon: 'clot', min: 0, max: 1, step: 0.01, format: pct, def: 0,
    get: (p) => p.thrombus[id] || 0, set: (p, v) => { if (v <= 0.004) delete p.thrombus[id]; else p.thrombus[id] = +v.toFixed(2); }, hist: `${e.label}: thrombus`,
    info: 'Occlusive thrombus. With anticoagulation it recanalizes slowly on the disease clock.' };
  // (Shown on a portal vessel or a systemic vein that can start a shunt.)
  const shunt: Verb = { type: 'button', id: 'shunt', label: 'Add shunt', short: 'Shunt', icon: 'stent', run: (a) => a.feature('shunt', 'Add shunt') };
  let kicker: string, span: SpanDef | null = spanOfEdge(e);
  const portalSide = (SHUNT_PORTAL as string[]).includes(e.from) || (SHUNT_PORTAL as string[]).includes(e.to);
  // (The TIPS and the DIPS read their own line under the stent's picture: no flow, velocity and diameter tiles above it.)
  if (!SIN_EDGES.has(id) && id !== 'TIPS' && id !== 'DIPS') {
    verbs.push(read('L/min', ({ f }) => vesselReads(k, f)[0]), read('cm/s', ({ f }) => vesselReads(k, f)[1]), read('mm', ({ f }) => vesselReads(k, f)[2]));
  }
  if (isArt) {
    kicker = 'Artery';
    // The hepatic artery and its two branches are full vessels, as the veins are: narrow it, clot it, stent it open, read its Doppler.
    if (HEP_ART.has(id)) {
      verbs.push(narrow, clot);
      verbs.push({ type: 'button', id: 'stent', label: 'Stent open', short: 'Stent', icon: 'stent', showIf: ({ p }) => (p.stenosis[id] || 0) > 0 || (p.thrombus[id] || 0) > 0,
        run: (a) => a.update((p) => { delete p.stenosis[id]; delete p.thrombus[id]; return p; }, { label: `${e.label}: stented open` }) });
      verbs.push(doppler);
    }
  } else if (isColl) {
    kicker = `Collateral · ${e.code || id}`;
    // How far the collateral has opened, from closed to its widest: a meter read off the model (not a control).
    verbs.push({ type: 'meter', id: 'recruit', label: 'Recruited', icon: 'vessel', share: ({ f }) => { const s = (f as unknown as { slow: { dEff?: Record<string, number>; d: Record<string, number> } }).slow; return clamp(((s.dEff?.[id] ?? s.d[id]!) - dMinOf(e)) / (e.dMax - dMinOf(e)), 0, 1); } });
    verbs.push({ type: 'toggle', id: 'occlude', key: 'occluded', label: id === 'C5' ? 'Occlude (BRTO)' : 'Occlude (plug)', short: id === 'C5' ? 'BRTO' : 'Occlude', icon: 'occlude',
      get: (p) => !!p.occluded[id], set: (p, v) => { if (v) p.occluded[id] = true; else delete p.occluded[id]; }, hist: `${e.label}: occlusion` });
    if (e.spontaneous || e.variant) verbs.push({ type: 'toggle', id: 'variant', key: 'spontaneous', label: 'Present in this patient', short: 'Present', icon: 'vessel', get: (p) => edgePresent(e, p), set: (p, v) => { p.spontaneous[id] = v; }, hist: `${e.label} present` });
    // (Band and scope from the vessel; the tamponade balloons are on the varices' own card.)
    if (PRESENT_ONLY_ESO.has(id)) verbs.push(...VARIX_ESO_ACTS);
    if (PRESENT_ONLY_GAS.has(id)) verbs.push(...VARIX_GAS_ACTS);
    verbs.push(doppler);
  } else if (isShunt) {
    kicker = 'Shunt';
    if (id === 'TIPS' || id === 'DIPS') {
      const key = id.toLowerCase();   // the stent's params key: tips or dips
      span = null;   // (no PV to IVC bar: the PPG is the first number of the card's own line)
      verbs.push({ type: 'panel', id: 'stent', label: 'Edit stent', stent: id });
      verbs.push({ type: 'button', id: 'remove', key, label: `Remove ${id}`, short: 'Remove', icon: 'close', danger: true, run: (a) => { a.update({ [key]: { on: false } }, { label: `Remove ${id}` }); a.select(null); } });
    } else if (e.shunt === 'custom') {
      verbs.push({ type: 'panel', id: 'stent', label: 'Edit stent', stent: id });
      verbs.push({ type: 'button', id: 'remove', key: 'customShunts', label: 'Take down shunt', short: 'Remove', icon: 'close', danger: true, run: (a) => { a.update((p) => { const c = { ...(p.customShunts || {}) }; delete c[id]; p.customShunts = c; return p; }, { label: `Remove ${e.label}` }); a.select(null); } });
    }
    if (['S_PC', 'S_DSR', 'S_MC', 'REX'].includes(id)) {
      const key = { S_PC: 'portocaval', S_DSR: 'dsrs', S_MC: 'mesocaval', REX: 'rex' }[id]!;
      // A portocaval shunt is made end-to-side (the trunk divided at the liver) or side-to-side (the trunk kept): one model edge, the ligation under it set by portocavalSide.
      if (id === 'S_PC') verbs.push({ type: 'seg', id: 'pcKind', label: 'Made', small: true, options: [['end', 'End-to-side'], ['side', 'Side-to-side']], get: (p) => (p.portocavalSide ? 'side' : 'end'),
        set: (a, val) => a.update((p) => { p.portocavalSide = val === 'side'; return p; }, { label: `Portocaval shunt: ${val === 'side' ? 'side-to-side' : 'end-to-side'}` }) });
      verbs.push({ type: 'button', id: 'remove', key, label: 'Take down shunt', short: 'Remove', icon: 'close', danger: true, run: (a) => { a.update(id === 'S_PC' ? { portocaval: false, portocavalSide: false } : { [key]: false }, { label: `Remove ${e.label}` }); a.select(null); } });
    }
    verbs.push(doppler);
  } else if (SIN_EDGES.has(id)) {
    // Each side's sinusoids: their own card, read at the station, with the liver's cirrhosis and its lobule.
    kicker = 'Liver microcirculation';
    verbs.push(read('L/min', ({ f }) => flowNum(bedStats(e, f).q)));
    verbs.push(read('mmHg·min/L', ({ f }) => { const r = bedStats(e, f).r; return r == null ? '—' : fmt(r, 1); }));
    verbs.push(...liverVerbs());
  } else {
    kicker = portalSide ? 'Vein · portal system' : 'Vein · systemic';
    if (HEP_VEIN[id]) kicker = 'Hepatic vein';
    verbs.push(narrow, clot, doppler, shunt);
    if (id === 'SV_CONF' || id === 'SV_MID' || id === 'V_SPL') verbs.push({ type: 'link', label: 'Spleen', icon: 'vessel', run: (a) => a.select({ type: 'organ', id: 'spleen' }) });
  }
  // Dye into this vessel, beside Doppler: a few seconds a press, or as long as it is held.
  if (!SIN_EDGES.has(id)) {
    const at = verbs.indexOf(doppler);
    if (at >= 0) verbs.splice(at + 1, 0, dye); else verbs.push(dye);
    // The TIPS and the DIPS open their own test, beside Doppler and Dye: Tests › IR › TIPS on this stent (a quiet word).
    if (id === 'TIPS' || id === 'DIPS') verbs.splice(verbs.indexOf(dye) + 1, 0, { type: 'button', id: 'ir', label: `Test ${id} in IR`, short: 'IR', icon: 'catheter', quiet: true, run: (a) => a.feature('ir', `Test ${id} in IR`) });
  }
  return {
    key: `e:${id}`, sel: NORM_EDGE.get(id) ?? { type: 'edge', id }, kicker, title: e.label, why: edgeWhy(id), edge: id, verbs, span, noValue: id === 'TIPS' || id === 'DIPS',
    value: (env) => edgeValue(e, env, true),
    status: (env) => {
      if (isArt) return null;
      const q = qOf(env, k), refQ = env.ref?.Q?.[k] ?? 1;
      // (A TIPS or DIPS reads the engine's own stent state, with its memory: the one rule the Doppler, tiles and pictures read too.)
      const m = env.f.metrics as unknown as { tips?: { still: boolean }; dips?: { still: boolean } };
      const st = id === 'TIPS' ? m.tips : id === 'DIPS' ? m.dips : null;
      if (st ? st.still : stentStill(q)) return ST.STASIS;
      if (isShunt) return ST.PATENT;
      const back = flowReversed(q, refQ, through(e.id, env.f.Qf || env.f.Q));
      // A collateral carries portal blood away from the liver; a link between two portal veins has no physiological direction (the pressure picks it).
      if (isColl) return (back !== PETAL_COLL.has(e.id)) ? ST.PETAL : ST.FUGAL;   // (the periportal bypass runs toward the liver, round the clot: forward is hepatopetal)
      if (e.portal) return null;
      if (portalSide) return back ? ST.FUGAL : ST.PETAL;
      return back ? ST.REVERSED : null;
    },
  };
}
/** The flow through the vein a vessel is a piece of: the largest of its pieces' flows (mL/s, magnitude), or 0 for a vein that is whole. */
function through(id: string, Q: ArrayLike<number>): number {
  const ids = piecesOf(id);
  if (ids.length < 2) return 0;
  let m = 0;
  for (const i of ids) { const q = Math.abs(Q[EI[i]!]!); if (q > m) m = q; }
  return m;
}

// ── an organ ──
const SPLEEN_RX = ['Spleen untreated', 'Partial splenic embolization', 'Splenectomy'];
const REMOVED: Reading = { v: 'Removed', u: '' }, OBLITERATED: Reading = { v: 'Obliterated', u: '' };
const PLATELETS = (n: number) => `${(Math.round(n) * 1000).toLocaleString('en-US')}/µL`;
function liverVerbs(): Verb[] {
  return [
    // (Its inflows: the portal vein's and the hepatic artery's.)
    read('L/min', (env) => flowNum(qOf(env, EI.PV_TRUNK!) * 0.06), 'Portal'),
    read('L/min', (env) => flowNum(qOf(env, EI.A_HEP!) * 0.06), 'Arterial'),
    CIRRHOSIS,
    { type: 'button', id: 'lobule', label: 'Open the lobule view', short: 'Lobule', icon: 'zones', run: (a) => a.feature('view:lobule', 'Lobule view') },
    { type: 'button', id: 'fibroscan', label: 'FibroScan', short: 'FibroScan', icon: 'probe', run: (a) => { a.feature('fibroscan', 'FibroScan'); a.select(null); } },
  ];
}
function organCard(id: string): Card | null {
  const sel: Sel = { type: 'organ', id };
  if (id === 'liver') {
    return { key: 'o:liver', sel, kicker: 'Organ', title: 'Liver', why: 'hvpg', span: SPAN_HVPG, verbs: liverVerbs(),
      value: (env) => pressureReading(cellOf('o:liver'), pOf(env, NI.SIN_R!), env.ref?.P[NI.SIN_R!], 'mmHg sinusoids') };
  }
  if (id === 'heart') {
    const sl = (vid: string, key: string, label: string, short: string, min: number, max: number, def: number, info: string): Verb =>
      ({ type: 'slider', id: vid, key, label, short, icon: 'heart', min, max, step: 0.01, def, format: pct, get: (p) => p[key], set: (p, v) => { p[key] = v; }, hist: label, info });
    return { key: 'o:heart', sel, kicker: 'Organ', title: 'Right heart', why: 'ra', span: null,
      value: (env) => pressureReading(cellOf('o:heart'), pOf(env, NI.RA!), env.ref?.P[NI.RA!], 'mmHg RA'),
      verbs: [
        sl('contractility', 'contractility', 'Contractility', 'Contractility', 0.15, 1.6, 1, 'Right ventricular contractility (Frank–Starling).'),
        sl('tr', 'tr', 'Tricuspid regurgitation', 'TR', 0, 1, 0, 'Systolic backflow into the right atrium: large v-waves reach the liver.'),
        sl('pericardial', 'pericardial', 'Pericardial constraint', 'Constriction', 0, 1, 0, 'Constrictive pericarditis limits filling.'),
        // On every patient's heart card; it starts at Not pregnant (0 weeks), so no patient changes until it is moved.
        { type: 'slider', id: 'gestation', key: 'gestation', label: 'Pregnancy', icon: 'clock', min: 0, max: 40, step: 1, def: 0, format: weeks, get: (p) => p.gestation || 0, set: (p, v) => { p.gestation = v; }, hist: 'Pregnancy', info: PREGNANCY_INFO },
        read('L/min', ({ f }) => fmt(f.metrics.co as number, 1), 'CO'),
      ] };
  }
  if (id === 'varices' || id === 'gastric') {
    const eso = id === 'varices';
    type Varix = { present: boolean; closed?: boolean; redWale?: boolean; d: number; grade: { label: string } };
    const vx = ({ f }: Env) => ((eso ? f.metrics.varix : (f.metrics as unknown as { gastricVarix: Varix }).gastricVarix) as unknown as Varix);
    const verbs: Verb[] = [...(eso ? VARIX_ESO : VARIX_GAS)];
    if (!eso) verbs.push({ type: 'toggle', id: 'occlude', key: 'occluded', label: 'Occlude the gastrorenal shunt (BRTO)', short: 'BRTO', icon: 'occlude', showIf: ({ p }) => p.spontaneous.C5 !== false, get: (p) => !!p.occluded.C5, set: (p, v) => { if (v) p.occluded.C5 = true; else delete p.occluded.C5; }, hist: 'BRTO' });
    verbs.push(read('', (env) => { const v = vx(env); return !v.present ? 'none' : `${v.grade.label} · ${fmt(v.d, 1)} mm`; }, 'Grade'));
    if (eso) verbs.push({ type: 'link', label: 'Left gastric vein', icon: 'vessel', run: (a) => a.select({ type: 'edge', id: 'LGV_CONF' }) });
    else verbs.push({ type: 'link', label: 'Short gastric veins', icon: 'vessel', run: (a) => a.select({ type: 'edge', id: 'C2' }) });
    const n = NI[eso ? 'VAR' : 'GV']!;
    return { key: `o:${id}`, sel, kicker: 'Collateral bed', title: eso ? 'Esophageal varices' : 'Fundal varices', why: 'varix', span: null, verbs,
      // (A varix closed off by BRTO or coils is a clot, not a vein with a pressure: its card says so rather than print the bed's pressure beside Grade none.)
      value: (env) => (vx(env).closed ? OBLITERATED : pressureReading(cellOf(`o:${id}`), pOf(env, n), env.ref?.P[n], 'mmHg')),
      status: (env) => { const b = (env.f.metrics as unknown as { bleeding?: { site: string } }).bleeding; return b && (b.site === 'GV') === !eso ? ST.BLEEDING : vx(env).redWale ? ST.WALE : null; } };
  }
  if (id === 'spleen') {
    return { key: 'o:spleen', sel, kicker: 'Organ', title: 'Spleen', why: 'spleen', span: null,
      value: ({ f }) => { const s = (f.metrics as unknown as { spleen: { length: number; platelets: number } }).spleen; return s.length > 0 ? { v: fmt(s.length, 1), u: 'cm long' } : REMOVED; },
      verbs: [
        read('', ({ f }) => PLATELETS((f.metrics as unknown as { spleen: { platelets: number } }).spleen.platelets), 'Platelets'),
        { type: 'seg', label: 'Treat', options: [[0, 'None'], [1, 'Embolize'], [2, 'Splenectomy']], get: (p) => p.splenicRx | 0, set: (a, val) => a.update((p) => { p.splenicRx = val; return p; }, { label: SPLEEN_RX[val as number]! }) },
        { type: 'slider', id: 'clot', key: 'thrombus', label: 'Splenic vein thrombosis', icon: 'clot', min: 0, max: 1, step: 0.01, def: 0, format: pct, get: (p) => p.thrombus.SV_CONF || 0,
          set: (p, v) => { if (v <= 0.004) delete p.thrombus.SV_CONF; else p.thrombus.SV_CONF = +v.toFixed(2); }, hist: 'Splenic vein thrombus', info: 'Sinistral (left-sided) portal hypertension: splenic outflow decompresses through the short gastric veins.' },
        { type: 'link', label: 'Splenic vein', icon: 'vessel', run: (a) => a.select({ type: 'edge', id: 'SV_CONF' }) },
      ] };
  }
  return null;
}

// ── a part of the lobule ──
const LOBULE_BASE = { kicker: 'Lobule', why: 'hvpg', noDetails: true, span: null } as const;
const L = lobuleOf;
const stat = (label: string, value: (m: LobuleState) => string): Verb => ({ type: 'stat', label, value: (env) => value(L(env)) });
const about = (fill: (m: LobuleState, out: string[]) => void): Verb => ({ type: 'about', text: (env) => { const out: string[] = []; fill(L(env), out); return out; } });
const said = (...lines: string[]): Verb => ({ type: 'about', text: () => lines });
/** The reading of a pressure along the lobule, against the reference. */
const lpressure = (key: string, get: (m: { P1: number; P2: number; P3: number }) => number) => (env: Env): Reading => {
  const x = get(L(env)), ref = env.ref?.P;
  const r = ref ? get({ P1: ref[NI.RPV!]!, P2: ref[NI.SIN_R!]!, P3: ref[NI.CV_R!]! }) : null;
  return pressureReading(cellOf(key), x, r, 'mmHg');
};
const fixed = (x: number, unit: string) => `${fmt(x, 1)} ${unit}`;
const dayText = (x: number) => `${lymphText(x)} ${LYMPH_UNIT}`;
const portalPct = (m: LobuleState) => (portalBack(m) ? 'reversed' : pct(Math.max(0, m.portal)));
const BILE: Reading = { v: 'Bile', u: 'flows out to the triad' };
const PLUS_MM = (x: number) => `+${fmt(x, 1)} mmHg`;
const HEP_VALUE: (Reading | null)[] = [null, { v: 'Zone 1', u: 'periportal' }, { v: 'Zone 2', u: 'midzonal' }, { v: 'Zone 3', u: 'centrilobular' }];
function lobuleCards(): Map<string, Card> {
  const cards = new Map<string, Card>();
  const add = (part: string, title: string, c: Omit<Card, 'key' | 'sel' | 'kicker' | 'why' | 'title' | 'noDetails' | 'span'>) =>
    cards.set(part, { key: `l:${part}`, sel: { type: 'lobule', part }, ...LOBULE_BASE, title, ...c });
  add('triad', 'Portal triad', { value: lpressure('l:triad', (m) => m.P1), verbs: [about((m, o) => { o.push(W.TRIAD_A); if (m.fibPre > 0.1) o.push(W.TRIAD_FIB(m.zone.pre)); if (portalBack(m)) o.push(W.TRIAD_BACK); }),
    FIB.pre, stat('Portal inflow', portalPct), stat('Arterial inflow', (m) => pct(m.art))] });
  add('in', 'Inlet venule', { value: lpressure('l:in', (m) => m.P1), verbs: [about((m, o) => { o.push(W.IN_A); if (portalBack(m)) o.push(W.IN_BACK); }), FIB.pre, stat('Portal inflow', portalPct)] });
  // (A sinusoid and a cross-link between sinusoids read alike but for the first sentence.)
  for (const part of ['sin', 'an']) {
    const first = part === 'an' ? W.AN_A : W.SIN_A;
    add(part, part === 'an' ? 'Sinusoidal anastomosis' : 'Sinusoid', { value: lpressure(`l:${part}`, (m) => m.P2), verbs: [about((m, o) => { o.push(first); if (m.fibSin > 0.1) o.push(W.SIN_FIB); if (m.congU > 0.1) o.push(W.SIN_CONG); }),
      { type: 'button', id: 'sinusoid', label: 'Zoom into the sinusoid', short: 'Sinusoid', icon: 'explore', run: (a) => a.feature('view:sinusoid', 'Sinusoid view') },
      FIB.sin, CIRRHOSIS, stat('Into the central vein', (m) => fixed(m.P3, 'mmHg')), stat('Sinusoidal flow', (m) => pct(m.flow))] });
  }
  add('cv', 'Central vein', { value: lpressure('l:cv', (m) => m.P3), status: (env) => (L(env).congU > 0.1 ? ST.CONGESTED : null),
    verbs: [about((m, o) => { o.push(W.CV_A); if (m.fibPost > 0.1) o.push(W.CV_FIB(m.zone.post)); if (m.congU > 0.1) o.push(W.CV_CONG); }),
      FIB.post, stat('Hepatic vein', (m) => fixed(m.P4, 'mmHg')), stat('Above normal', (m) => (m.congU > 0.05 ? PLUS_MM(m.cong) : 'none'))] });
  add('ha', 'Hepatic arteriole', { value: (env) => ({ v: pct(L(env).art), u: 'of normal flow' }), verbs: [about((m, o) => { o.push(W.HA_A); if (m.art > 1.15) o.push(W.HA_BUFFER(m.art)); })] });
  add('bd', 'Bile ductule', { value: () => BILE, verbs: [said(W.BD_A)] });
  add('bs', 'Bile canaliculus', { value: () => BILE, verbs: [said(W.BS_A)] });
  add('bh', 'Canal of Hering', { value: () => BILE, verbs: [said(W.BH_A)] });
  add('lv', 'Lymphatic', {
    value: (env) => {
      // (The change shows from 10% of the comparison's rate.)
      const m = L(env), d = m.lymph - m.lymphRef, shown = m.lymphRef > 0 && Math.abs(d) / m.lymphRef >= 0.1;
      return { v: lymphText(m.lymph), u: `${LYMPH_UNIT} (whole liver)`, d: shown ? `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) / m.lymphRef * 100)}%` : null, up: d > 0 };
    },
    verbs: [about((m, o) => { o.push(W.LV_A); if (m.lymph > m.lymphRef * 1.25) o.push(W.LV_UP); if (m.lymph < m.lymphRef * 0.75) o.push(W.LV_DOWN); }),
      stat('Hepatic lymph', (m) => dayText(m.lymph)), stat('Healthy', (m) => dayText(m.lymph0))] });
  add('septum', 'Fibrous septum', { value: (env) => ({ v: pct(L(env).s), u: 'cirrhosis' }), verbs: [said(W.SEPTUM_A), CIRRHOSIS] });
  return cards;
}
function hepatocyteCards(): (Card | null)[] {
  const cards: (Card | null)[] = [null];
  for (let z = 1; z <= 3; z++) cards.push({ key: `l:zone${z}`, sel: { type: 'lobule', zone: z }, ...LOBULE_BASE, title: `Hepatocytes · zone ${z}`, value: () => HEP_VALUE[z]!,
    verbs: [about((m, o) => { o.push(W.ZONE_TEXT[z - 1]!); if (z === 3 && m.congU > 0.1) o.push(W.HEP_CONG); }), CIRRHOSIS] });
  return cards;
}

// ── the catalogue: every card, made once and looked up by cardFor ──
const ORGAN_CARD = new Map<string, Card>(), EDGE_CARD = new Map<string, Card>();
for (const id of ['liver', 'heart', 'varices', 'gastric', 'spleen']) { const c = organCard(id); if (c) ORGAN_CARD.set(id, c); }
for (const e of edges) if (e.kind !== 'wedge') EDGE_CARD.set(e.id, edgeCard(e));
const LOBULE_CARD = lobuleCards(), HEP_CARD = hepatocyteCards();

/** The card for a selection, or null where it has none (a structure the 2D app has no card for either). */
export function cardFor(selIn: Sel | null): Card | null {
  const sel = normalizeSel(selIn);
  if (!sel) return null;
  if (sel.type === 'lobule') return (sel.part ? LOBULE_CARD.get(sel.part) : undefined) ?? HEP_CARD[(sel.zone as number) || 1] ?? HEP_CARD[1]!;
  if (sel.type === 'organ') return ORGAN_CARD.get(sel.id) ?? null;
  return EDGE_CARD.get(sel.id) ?? null;
}
/** Can a shunt start from this vessel (a portal vessel or a systemic vein)? */
export function shuntable(id: string): boolean {
  const e = edges[EI[id]!];
  if (!e || !['vein', 'collateral'].includes(e.kind)) return false;
  return [e.from, e.to].some((n) => (SHUNT_PORTAL as string[]).includes(n) || (SHUNT_SYSTEMIC as string[]).includes(n));
}
