// The liver-function card (tool kind 'scores'): Child–Pugh (each component's points, the total and the class) and one MELD, tied to how Baveno VIII uses them: a preemptive
// TIPS for Child–Pugh C 10 to 13 or B above 7 with active bleeding (5.31) and recompensation at Child–Pugh A5 or A6 (7.4). The maths is the engine's (hales-engine
// risk-scores.js: Pugh 1973, Kamath 2001, Kim 2008). The model holds the albumin; the other four values are case facts a slide gives, never made up here: a missing one is named.
import * as engineScores from '../../../engine/hales/portal/risk-scores.js';
import { wrapWords } from '../trial/model.ts';
import { TYPE, sizeOf } from '../stiff/model.ts';
import type { Measure } from '../flows/layout.ts';

// (the engine file is plain JS: its argument defaults make the inferred types too narrow, so the calls are typed here)
const { childPugh, meld, meldNa, preemptiveByCp, recompensatedByCp } = engineScores as unknown as {
  childPugh(a: ScoreFacts): unknown; meld(a: ScoreFacts): number | null; meldNa(a: ScoreFacts): number | null; preemptiveByCp(t: number, bleeding?: boolean): boolean; recompensatedByCp(t: number): boolean;
};

export type Level = 'none' | 'mild' | 'moderate' | 'severe';
/** What a slide says of the case (tool.facts): bilirubin and creatinine mg/dL, albumin g/dL (when the slide, not the model, sets it), INR, sodium mmol/L, ascites and HE levels, active bleeding. */
export interface ScoreFacts { bili?: number; albumin?: number; inr?: number; creatinine?: number; na?: number; dialysis?: boolean; ascites?: Level; he?: Level; bleeding?: boolean }
export type Focus = 'preemptive' | 'recompensation' | 'elective' | null;
export interface ScoresIn extends ScoreFacts { focus?: Focus }

type Tone = 'ok' | 'mid' | 'hi';
const TONE: Record<string, Tone> = { A: 'ok', B: 'mid', C: 'hi' };
const fixed = (v: number | undefined, d = 1) => (Number.isFinite(v) ? String(Math.round(v! * 10 ** d) / 10 ** d) : null);

export interface Row { name: string; value: string | null; pts: number | null }
export interface Scores {
  rows: Row[]; total: number | null; cls: 'A' | 'B' | 'C' | null; missing: string[];
  /** the one MELD the card shows: the sodium-adjusted value when a sodium is given, the plain one when not (owner, 24 Nov: "Just MELD"; the inputs line says whether a sodium was used) */
  meld: number | null;
  /** the Baveno VIII sentence for the slide's focus, with its tone (null: none to say) */
  verdict: { text: string; tone: Tone } | null;
  inputs: string;
}

const ASC: Record<string, string> = { none: 'none', mild: 'mild', moderate: 'moderate to severe' };
const HE: Record<string, string> = { none: 'none', mild: 'grade 1 to 2', severe: 'grade 3 to 4' };

/** The model's albumin is used unless the slide gives its own. */
export function scoresOf(a: ScoresIn, modelAlbumin: number | null | undefined = null): Scores {
  const albumin = Number.isFinite(a.albumin) ? a.albumin : Number.isFinite(modelAlbumin) ? modelAlbumin! : undefined;
  const cp = childPugh({ bili: a.bili, albumin, inr: a.inr, ascites: a.ascites, he: a.he }) as { points: Record<string, number | null>; total: number | null; class: 'A' | 'B' | 'C' | null; missing: string[] };
  const p = cp.points;
  const rows: Row[] = [
    { name: 'Bilirubin', value: fixed(a.bili) && `${fixed(a.bili)} mg/dL`, pts: p.bili! },
    { name: 'Albumin', value: fixed(albumin) && `${fixed(albumin)} g/dL`, pts: p.albumin! },
    { name: 'INR', value: fixed(a.inr), pts: p.inr! },
    { name: 'Ascites', value: a.ascites ? ASC[a.ascites] ?? null : null, pts: p.ascites! },
    { name: 'Encephalopathy', value: a.he ? HE[a.he] ?? null : null, pts: p.he! },
  ];
  const m = meld({ bili: a.bili, inr: a.inr, creatinine: a.creatinine, dialysis: a.dialysis }) as number | null;
  const mn = meldNa({ bili: a.bili, inr: a.inr, creatinine: a.creatinine, dialysis: a.dialysis, na: a.na }) as number | null;
  let verdict: Scores['verdict'] = null;
  if (cp.total != null) {
    const t = cp.total;
    if (a.focus === 'preemptive') {
      const yes = preemptiveByCp(t, !!a.bleeding) as boolean;
      verdict = { text: yes ? `Meets the Child–Pugh criterion for a preemptive TIPS (Baveno VIII 5.31)` : `Does not meet the Child–Pugh criterion for a preemptive TIPS (Baveno VIII 5.31)`, tone: yes ? 'hi' : 'ok' };
    } else if (a.focus === 'recompensation') {
      const yes = recompensatedByCp(t) as boolean;
      verdict = { text: yes ? 'Liver function is consistent with Child–Pugh A5 or A6 (Baveno VIII 7.4)' : 'Liver function is not yet consistent with Child–Pugh A5 or A6 (Baveno VIII 7.4)', tone: yes ? 'ok' : 'mid' };
    }
  }
  const inputs = [`Creatinine ${fixed(a.creatinine) ? `${fixed(a.creatinine)} mg/dL` : 'not given'}`, `INR ${fixed(a.inr) ?? 'not given'}`, `Sodium ${Number.isFinite(a.na) ? `${Math.round(a.na!)} mmol/L` : 'not given'}`].join(', ');
  return { rows, total: cp.total, cls: cp.class, missing: cp.missing, meld: mn ?? m, verdict, inputs };
}

export const NOTE = 'Baveno VIII: a preemptive TIPS for Child–Pugh C of 10 to 13 points, or B above 7 with active bleeding (5.31); recompensation needs Child–Pugh A5 or A6 (7.4). Scores: Pugh 1973; MELD, Kamath 2001, with the sodium adjustment (Kim 2008) when a sodium is given.';

export function scoresWords(s: Scores): string {
  const cp = s.total == null ? `Child–Pugh not scored: ${s.missing.join(', ')} not given.` : `Child–Pugh ${s.cls} ${s.total}: ${s.rows.map((r) => `${r.name} ${r.pts}`).join(', ')}.`;
  const m = s.meld == null ? 'MELD not scored.' : `MELD ${s.meld}.`;
  return `${cp} ${m}${s.verdict ? ` ${s.verdict.text}.` : ''}`;
}

export interface SText { x: number; y: number; t: string; look: string; anchor: 'start' | 'middle' | 'end' }
export interface SRect { x: number; y: number; w: number; h: number; r: number; look: string }
export interface ScoresLayout { texts: SText[]; rects: SRect[]; mark: number[] | null; H: number }

/** The points bar spans 5 to 15; each integer owns one cell, so a class's width is its number of totals (A 2, B 3, C 6). */
export const CP_ZONES: readonly { from: number; to: number; name: string; look: string }[] = [{ from: 5, to: 6, name: 'A', look: 'stiff.z0' }, { from: 7, to: 9, name: 'B', look: 'stiff.z2' }, { from: 10, to: 15, name: 'C', look: 'stiff.z3' }];

/** The card at width W and type size f. Pure; the words are never under 12 px (stiff/model.ts sizeOf). */
export function scoresLayout(W: number, f: number, meas: Measure, s: Scores, note = true): ScoresLayout {
  const texts: SText[] = [], rects: SRect[] = [];
  const px = (look: string) => sizeOf(look, f), wt = (look: string) => TYPE[look]![0];
  const say = (x: number, y: number, t: string, look: string, anchor: SText['anchor'] = 'start') => texts.push({ x, y, t, look, anchor });
  const pl = px('stiff.plt'), lh = pl * 1.45;
  let y = 0;
  // the head: the score and its class in the class's own colour
  const head = s.total == null ? 'Child–Pugh not scored' : `Child–Pugh ${s.cls}, ${s.total} points`;
  say(0, y + pl * 0.85, head, `stiff.v.${s.cls ? TONE[s.cls] : 'mid'}`);
  y += lh * 1.05;
  for (const r of s.rows) {
    say(0, y + pl * 0.8, r.value ? `${r.name}: ${r.value}` : r.name, 'stiff.plt');
    say(W, y + pl * 0.8, r.pts == null ? 'not given' : `${r.pts} ${r.pts === 1 ? 'point' : 'points'}`, 'stiff.plt', 'end');
    y += lh;
  }
  // the bar: one cell for each total, 5 to 15, the mark in the total's cell
  y += f * 0.35;
  const cells = 11, cw = (W - 2) / cells, bh = Math.max(8, Math.round(f * 0.9)), X = (v: number) => 1 + (v - 5) * cw;
  for (const z of CP_ZONES) rects.push({ x: X(z.from) + 0.75, y, w: (z.to - z.from + 1) * cw - 1.5, h: bh, r: Math.min(3, bh / 2), look: z.look });
  let mark: number[] | null = null;
  if (s.total != null) {
    const mx = X(s.total) + cw / 2, a = f * 0.5, k = a * 0.62;
    mark = [mx - k, y - a - 2, mx + k, y - a - 2, mx, y - 2];
    rects.push({ x: mx - 1, y: y - 2, w: 2, h: bh + 4, r: 1, look: 'stiff.mk' });
  } else mark = [0, 0, 0, 0, 0, 0];
  y += bh + f * 0.3;
  const tk = px('stiff.tk'), zl = px('stiff.zl');
  for (const z of CP_ZONES) say(X(z.from) + ((z.to - z.from + 1) * cw) / 2, y + zl * 0.8, `${z.name}  ${z.from === z.to ? z.from : `${z.from}–${z.to}`}`, 'stiff.zl', 'middle');
  y += zl * 1.2 + f * 0.1;
  void tk;
  // MELD, then what it was worked from
  y += f * 0.5;
  const mw = s.meld == null ? 'MELD not scored' : `MELD ${s.meld}`;
  say(0, y + pl * 0.85, mw, 'stiff.v.mid');
  y += lh * 1.05;
  wrapWords(s.inputs, W, pl, wt('stiff.plt'), meas, 2).forEach((l, i) => say(0, y + pl * (0.8 + i * 1.3), l, 'stiff.plt'));
  y += wrapWords(s.inputs, W, pl, wt('stiff.plt'), meas, 2).length * pl * 1.3;
  if (s.verdict) {
    y += f * 0.5;
    // (the verdict is drawn in its tone's look, 600, and measured at that weight: measured at the plain words' 500 its lines were set up to 4 px wider than the box and the last letters were cut)
    const vl = wrapWords(s.verdict.text, W, pl, wt('stiff.v'), meas, 3);
    vl.forEach((l, i) => say(0, y + pl * (0.8 + i * 1.3), l, `stiff.v.${s.verdict!.tone}`));
    y += vl.length * pl * 1.3;
  }
  if (note) {
    y += f * 0.5;
    const nf = px('stiff.note'), nl = wrapWords(NOTE, W, nf, wt('stiff.note'), meas, 4);
    nl.forEach((l, i) => say(0, y + nf * 0.85 + i * nf * 1.3, l, 'stiff.note'));
    y += nl.length * nf * 1.3;
  }
  return { texts, rects, mark, H: Math.ceil(y + f * 0.2) };
}
