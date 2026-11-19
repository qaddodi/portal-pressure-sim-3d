// The Trials pane's decisions (the 2D app's trials-pane.js, its pure part): each landmark trial against the patient on screen (trial-fit, copied by B10), sorted into the list's sections, with the chips of
// the rules that keep trials out, a row's two lines, and the pips. The 2D words are kept as they are; nothing here touches the page. A trial's numbers are its own, never the model's.
import { TRIALS, BAVENO_VIII, type Trial } from '../charts/trial/trials.generated.ts';
import { fitTrial, failedRows, openDefining, groupOf, countWords, whyNot, lcFirst, stillNeeded, FITS_HEAD, FITS_WORDS, NOT_IN_MODEL } from '../charts/trial/trial-fit.generated.js';
import { hvBlocked, hvpgSev, ppgSev, PTIPS_HVPG } from '../../engine/hales/portal/pressure-cuts.js';
import { fmt } from '../charts/fmt.ts';
export { lcFirst };

export interface FitRow { rule: string; state: 'yes' | 'no' | 'na'; value: string; defining: boolean; context?: boolean; need?: string; test?: string }
export interface TrialFit { verdict: 'fits' | 'no' | 'unknown'; rows: FitRow[]; met: number; of: number }
export interface Placed { t: Trial; fit: TrialFit }
export interface Groups { fits: Placed[]; possible: Placed[]; no: Placed[]; unknown: Placed[] }
export interface Sections { closest: Placed[]; also: Placed[]; no: Placed[]; unknown: Placed[] }

export const TRIAL_IDS: readonly string[] = Object.keys(TRIALS);
export const GROUPS = Object.freeze([['fits', FITS_HEAD], ['possible', 'Possibly fits'], ['no', 'Not this patient'], ['unknown', 'Cannot tell from the model']] as const);
/** The list's sections, in order: [key, heading]. */
export const SECTIONS = Object.freeze([['closest', 'Closest to this patient'], ['also', 'Also possible'], ['no', 'Not this patient'], ['unknown', 'Needs history the model lacks']] as const);
export const MARK: Record<string, string> = { yes: '✓', no: '✕', na: '?' };
export const MARK_WORD: Record<string, string> = { yes: 'Met', no: 'Not met', na: 'Not known' };
export const CLOSEST_MAX = 2;
export { FITS_WORDS, NOT_IN_MODEL };

/** The patient's facts as the card states them: the HVPG (null when it is not known), and the varix and ascites words. `m` is the engine's metrics. */
export function patientFacts(m: Record<string, any> | null | undefined, p: unknown): { hvpg: number | null; blocked: boolean; varix: string; ascites: string } {
  const blocked = !!hvBlocked(p as never);
  const hvpg = blocked ? null : Number.isFinite(m?.hvpg) ? (m!.hvpg as number) : null;
  const vx = m?.varix, g = vx?.grade?.label;
  const varix = !vx ? '' : !vx.present || g === 'None' ? 'No varices' : `${g} varices`;
  const a = m?.ascites, asc = !a ? '' : a.grade ? `Ascites ${fmt((a.volume || 0) / 1000, 1)} L` : 'No ascites';
  return { hvpg, blocked, varix, ascites: asc };
}

/** Each trial's fit for this patient, in the order of the trials, then grouped. `history`: the case history fitTrial reads ({ decompensated }). */
export function sortTrials(ids: readonly string[], m: Record<string, unknown> | null, p: unknown, facts: { hvpg: number | null }, history: unknown = null): Groups {
  const view = { ...m, hvpg: facts.hvpg };
  const out: Groups = { fits: [], possible: [], no: [], unknown: [] };
  for (const id of ids) { const t = TRIALS[id]; if (t) { const fit = fitTrial(t, view, p, history as never) as TrialFit; out[groupOf(fit) as keyof Groups].push({ t, fit }); } }
  return out;
}

/** The list's sections from the groups: closest (every trial that matches, then the possible ones ranked by the share of key rules met, then by how many, at most CLOSEST_MAX in all), also, no, unknown. */
export function closestOf(groups: Groups): Sections {
  const share = ({ fit }: Placed) => (fit.of ? fit.met / fit.of : 0);
  const ranked = [...groups.fits, ...groups.possible.map((q, i) => ({ q, i })).sort((a, b) => share(b.q) - share(a.q) || b.q.fit.met - a.q.fit.met || a.i - b.i).map((x) => x.q)];
  return { closest: ranked.slice(0, CLOSEST_MAX), also: ranked.slice(CLOSEST_MAX), no: groups.no, unknown: groups.unknown };
}

const CHIP: Record<string, string> = {
  cirrhosis: 'Cirrhosis', compensated: 'Compensated', decompensated: 'Decompensated', ascites: 'Ascites', acute_bleed: 'Bleeding now',
  varices_present: 'Varices', varices_medium_large: 'Varices ≥5 mm', varices_high_risk: 'High-risk varices', varices_not_high_risk: 'No high-risk varices',
  gastric_varices: 'Fundal varices', diuretics: 'On diuretics', tips: 'TIPS in place', no_tips: 'No TIPS',
};
/** A failing rule as a chip's words: what the trial needs that this patient lacks ("Bleeding now", "HVPG ≥10", "Albumin <3.0"). */
export function chipOf(row: (FitRow & { test?: string }) | undefined): string | null {
  if (!row) return null;
  if (row.need) return `${({ hvpg_ge: 'HVPG', albumin_lt: 'Albumin', platelets_ge: 'Platelets', ascitic_protein_lt: 'Ascitic protein' } as Record<string, string>)[row.test ?? ''] || row.rule} ${row.need}`;
  return CHIP[row.test ?? ''] || row.rule;
}
/** The chips of the "Not this patient" fold, the most common rule first. Each trial counts once, under its first failing rule. */
export function chipsOf(no: Placed[]): { key: string; label: string; ids: string[] }[] {
  const by = new Map<string, { key: string; label: string; ids: string[] }>();
  for (const { t, fit } of no) {
    const label = chipOf(failedRows(fit)[0]);
    if (!label) continue;
    if (!by.has(label)) by.set(label, { key: label, label, ids: [] });
    by.get(label)!.ids.push(t.id);
  }
  return [...by.values()].sort((a, b) => b.ids.length - a.ids.length);
}

/** Why a trial is in its group, in a line: the rules it fails, or the rules the model cannot check. */
export function reasonOf(_t: Trial, fit: TrialFit): string {
  if (fit.verdict === 'no') return (failedRows(fit) as FitRow[]).map((r) => `${r.rule} (${r.value === NOT_IN_MODEL ? 'not in the model' : lcFirst(r.value)})`).join('; ');
  if (fit.verdict === 'unknown') {
    if (!fit.rows.length) return 'Its entry rules are not listed yet';
    const open = `Not in the model: ${(openDefining(fit) as FitRow[]).map((r) => lcFirst(r.rule)).join(', ')}`;
    return groupOf(fit) === 'possible' ? `${countWords(fit)}. ${open}` : open;
  }
  return [FITS_WORDS, stillNeeded(fit) && `${stillNeeded(fit)}.`].filter(Boolean).join(' ');
}
/** A row's second line: a trial that fails says the one rule and this patient's value ("HVPG 8.2, needs ≥10"). */
export const rowReason = (t: Trial, fit: TrialFit): string => (fit.verdict === 'no' ? (whyNot(fit) as string) || reasonOf(t, fit) : reasonOf(t, fit));

const treatArm = (t: Trial) => t.arms.find((a) => a.side === 'treat') ?? t.arms[0];
/** "Beta-blocker vs placebo". */
export const comparisonOf = (t: Trial): string => t.arms.map((a, i) => (i ? lcFirst(a.label) : a.label)).join(' vs ');
/** The row's numbers in words: ["16%", " vs 27% decompensated"]; a trial with no per-arm result reads its outcome word alone. */
export function ratesOf(t: Trial): [string, string] {
  const tr = treatArm(t);
  const o = (t as unknown as { outcome?: string; effect?: string });
  if (!tr) return [t.arms.length ? (o.outcome ? o.outcome.charAt(0).toUpperCase() + o.outcome.slice(1) : '') : (o.effect || ''), ''];
  const rest = t.arms.filter((a) => a !== tr);
  return [`${tr.rate}%`, `${rest.length ? ` vs ${rest.map((a) => `${a.rate}%`).join(' / ')}` : ''}${o.outcome ? ` ${o.outcome}` : ''}`];
}
/** "Lancet 2019 · Villanueva · 201 randomized · PMID 30910320". */
export const sourceLine = (t: Trial): string => `${t.journal} ${t.year} · ${t.firstAuthor} · ${t.n} randomized${t.pmid ? ` · PMID ${t.pmid}` : ''}`;
/** The pips of a row, one letter per key rule (defining, not context): 'y' met, 'x' failed, 'o' not known. */
export const pipsOf = (fit: TrialFit): string => fit.rows.filter((r) => r.defining && !r.context).map((r) => (r.state === 'yes' ? 'y' : r.state === 'no' ? 'x' : 'o')).join('');
/** The open trial's checklist: defining rules first, then the fine print. */
export const ruleRows = (fit: TrialFit): FitRow[] => [...fit.rows.filter((r) => r.defining), ...fit.rows.filter((r) => !r.defining)];

/** The case history fitTrial reads: the preset's own (`facts` in its record), and this session's, once it has shown ascites or a bleed. A preset that says decompensated wins; a session that saw a decompensation says so next. */
export function historyOf(presetFacts: { decompensated?: boolean } | null | undefined, seenDecomp = false): { decompensated: boolean; source?: 'session' } | null {
  if (presetFacts?.decompensated === true) return { decompensated: true };
  if (seenDecomp) return { decompensated: true, source: 'session' };
  return presetFacts && typeof presetFacts.decompensated === 'boolean' ? { decompensated: presetFacts.decompensated } : null;
}

// ── The open trial's Model line and Baveno VIII lines (2D trials-pane.js: modelRx, paintModel, today531) ──

/** What the model can do of a trial's treatment, from its treated arm: a change to the params, and its name in the Model line; or, for a treatment the model holds but does not run as the trial did
 *  (albumin), { name, kind } with no patch; or null. */
export interface Rx { name: string; kind?: 'albumin'; patch: { drugs?: Record<string, boolean>; tips?: { on: boolean; d: number } } | null }
export function modelRx(t: Trial | null | undefined): Rx | null {
  const arm = (t?.arms || []).find((a) => a.side === 'treat') || t?.arms?.[0];
  const label = arm?.label || '', s = `${label} ${t?.name || ''}`;
  if (/carvedilol/i.test(label)) return { name: 'carvedilol', patch: { drugs: { carvedilol: true } } };
  if (/propranolol/i.test(label)) return { name: 'propranolol', patch: { drugs: { propranolol: true } } };
  if (/beta-blocker|\bNSBB\b/i.test(label)) return { name: 'carvedilol', patch: { drugs: { carvedilol: true } } };
  if (/\bTIPS\b/.test(label) && !/before TIPS/i.test(s)) return { name: 'TIPS', patch: { tips: { on: true, d: 8 } } };
  if (/terlipressin/i.test(label)) return { name: 'terlipressin', patch: { drugs: { terlipressin: true } } };
  if (/albumin/i.test(label)) return { name: 'albumin', kind: 'albumin', patch: null };
  return null;
}
type RxParams = { tips?: { on?: boolean }; drugs?: Record<string, boolean> } | null | undefined;
/** Whether the patient is already on the treatment. */
export const rxOn = (rx: Rx, p: unknown): boolean => {
  const q = p as RxParams;
  return rx.patch?.tips ? !!q?.tips?.on : Object.keys(rx.patch?.drugs ?? {}).every((k) => q?.drugs?.[k]);
};
/** Whether a trial has a band ligation arm: its Model line says that ligation treats the varix, not the pressure (TC-T5). */
export const hasEvlArm = (t: Trial | null | undefined): boolean => (t?.arms || []).some((a) => /band ligation|\bEVL\b/i.test(a.label));

/** Baveno VIII 5.31 checked against the patient's HVPG (TC-A2): the HVPG ≥20 rule is the one the model can check. */
export function today531(hvpg: number | null | undefined, bleeding: boolean): string {
  if (!Number.isFinite(hvpg)) return 'This patient: HVPG not measured.';
  const v = `HVPG ${fmt(hvpg as number, 1)} mmHg`;
  if (!bleeding) return `The HVPG rule applies at a bleed. This patient: ${v}.`;
  return (hvpg as number) >= PTIPS_HVPG ? `This patient is bleeding with ${v}: meets the HVPG rule.` : `This patient is bleeding with ${v}: under the HVPG rule.`;
}
/** "5.31. Preemptive covered TIPS …" as 2D prints it after the bold "Baveno VIII 5.31." (the number once). */
export const bavenoText = (k: string): string => BAVENO_VIII[k] ?? '';
/** The Baveno VIII lines of an open trial: its number, the words, and (5.31) the line that checks this patient against it. */
export function bavenoLines(t: Trial, facts: { hvpg: number | null }, bleeding: boolean): { k: string; text: string; today: string | null }[] {
  return (t.bav ?? []).map((k) => ({ k, text: bavenoText(k), today: k === '5.31' ? today531(facts.hvpg, bleeding) : null }));
}

/** The numbers the Model line starts from and ends on (the engine's whatIf: the patient settled as it is, and with the treatment). */
export interface Settled { hvpg: number; ppg: number; map: number; hr: number }
export interface WhatIf { base: Settled; rx: Settled }
export interface ModelNums { lead: 'HVPG ' | 'PPG '; from: number; to: number; sevFrom: string; sevTo: string; more: string }
export interface ModelLine {
  /** "Model · carvedilol on this patient" */
  head: string;
  /** the line when it has no numbers to colour */
  text: string;
  nums: ModelNums | null;
  sub: string;
  /** 'wait': the answer is being worked out (the pane asks the engine) */
  state: 'none' | 'albumin' | 'hidden' | 'on' | 'wait' | 'now' | 'ok';
}
/** The Model line (TC-T1 to T5): the model's own numbers for this patient settled with the trial's treatment, the one place a model number sits beside a trial. `result`: undefined while it is being worked out, null
 *  when the engine gave none. `live`: the card's own readings, which the line starts from (TC-fit-4), so its first number is the head line's and never a settled copy's. */
export function modelLineOf(t: Trial, c: { facts: { hvpg: number | null }; albumin?: number | null; params?: unknown; hidden?: ReadonlySet<string> | null; result: WhatIf | null | undefined; live?: Partial<Settled> }): ModelLine {
  const rx = modelRx(t), head = `Model${rx ? ` · ${rx.name} on this patient` : ''}`;
  const evl = hasEvlArm(t) ? 'Band ligation treats the varix, not the pressure: the model\'s HVPG does not change with it.' : '';
  const hvNow = Number.isFinite(c.facts.hvpg) ? `${fmt(c.facts.hvpg as number, 1)} mmHg` : 'not measured';
  const line = (state: ModelLine['state'], text: string, sub = ''): ModelLine => ({ head, text, nums: null, sub, state });
  if (!rx) return line('none', 'The model does not run this treatment.', evl);
  if (rx.kind === 'albumin') {
    // (TC-T5: the model holds the serum albumin and gives albumin as an infusion from Treat, but does not run a trial's weeks-long course.)
    return line('albumin', Number.isFinite(c.albumin) ? `Serum albumin ${fmt(c.albumin as number, 1)} g/dL` : 'Serum albumin not in the model', 'An infusion from Treat raises it in the model. The model does not run the trial\'s long course.');
  }
  // (A reading this case keeps hidden stays hidden here too: the HVPG until it is measured, the portal pressures in the Imaging view.)
  if (c.hidden?.has('trueHVPG') || (rx.patch?.tips && c.hidden?.has('pv'))) return line('hidden', 'Measure the HVPG to see the model\'s numbers.', evl);
  if (rxOn(rx, c.params)) return line('on', `Already on. HVPG ${hvNow}.`, evl);
  if (c.result === undefined) return line('wait', 'Settling the model…');
  if (!c.result?.base || !c.result?.rx) return line('now', `HVPG now ${hvNow}.`, evl);
  const r = c.result;
  // (A TIPS lowers the portal pressure gradient, which the HVPG does not see: its line leads with the PPG.)
  const tips = !!rx.patch?.tips, sev = tips ? ppgSev : hvpgSev, k0 = tips ? 'ppg' : 'hvpg';
  const live = c.live ?? {}, B: Settled = { ...r.base };
  for (const k of ['hvpg', 'ppg', 'map', 'hr'] as const) { const v = k === 'hvpg' ? c.facts.hvpg : live[k]; if (v != null && Number.isFinite(v)) B[k] = v; }
  const at = (k: keyof Settled) => B[k] + (r.rx[k] - r.base[k]);
  const from = B[k0], to = at(k0);
  const more = tips ? ` · HVPG ${fmt(B.hvpg, 1)} → ${fmt(at('hvpg'), 1)}` : rx.patch?.drugs?.terlipressin ? ` · MAP ${fmt(B.map, 0)} → ${fmt(at('map'), 0)} mmHg` : ` · heart rate ${fmt(B.hr, 0)} → ${fmt(at('hr'), 0)}/min`;
  // (TC-T3: the fall in percent, the model's own, beside the trial's response rule where the audit gives one.)
  const pct = Number.isFinite(from) && from > 0 ? Math.round(((to - from) / from) * 100) : null;
  const sub = [pct != null && pct !== 0 ? `${pct < 0 ? '−' : '+'}${Math.abs(pct)}% in the model.` : '', typeof t.response === 'string' ? t.response : '', evl].filter(Boolean).join(' ');
  return { head, text: '', nums: { lead: tips ? 'PPG ' : 'HVPG ', from, to, sevFrom: sev(from), sevTo: sev(to), more }, sub, state: 'ok' };
}
