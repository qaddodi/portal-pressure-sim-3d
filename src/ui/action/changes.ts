// Everything set away from a healthy adult, worded as the 2D app words it (inspector.js activeInterventions), with the edit that takes each back. Treat's Changes list,
// the "n running" count, the search and History read it. tests/treat-changes.test.ts holds it equal to the 2D app's list for every preset and for edits of each branch.
import { DRUGS } from '../../engine/hales/portal/scenario.js';
import { EDGES } from '../../engine/hales/portal/topology.js';
import type { Params } from './params.ts';

export interface Change { key: string; label: string; remove: (q: Params) => void }

const ZONES = ['pre', 'sin', 'post'] as const, LOBES = ['R', 'L'] as const;
const ZONE_WORD: Record<string, string> = { pre: 'Presinusoidal', sin: 'Sinusoidal', post: 'Postsinusoidal' };
const EDGE_LABEL = new Map<string, string>((EDGES as { id: string; label?: string }[]).map((e) => [e.id, e.label ?? e.id]));
const edgeName = (id: string) => EDGE_LABEL.get(id) || id;

/** A number worded as the 2D app words it: `pre` + the number (as a percent of `scale`, to `digits` places; -1 whole, -2 as it stands) + `suf`. */
function num(v: number, scale: number, digits: number): string {
  return digits === -2 ? String(v) : digits < 0 ? String(Math.round(v * scale)) : (v * scale).toFixed(digits);
}
const numbered = (key: string, pre: string, suf: string, v: number, scale: number, digits: number, remove: (q: Params) => void): Change => ({ key, label: `${pre}${num(v, scale, digits)}${suf}`, remove });
const worded = (key: string, label: string, remove: (q: Params) => void): Change => ({ key, label, remove });

/** The changes of these params, in the 2D app's order. A new list each call (a handful of rows; called on a change, never per frame). */
export function activeInterventions(p: Params): Change[] {
  const out: Change[] = [];
  const put = (c: Change) => { out.push(c); };
  if (p.cirrhosis > 0) put(numbered('cirrhosis', 'Cirrhosis ', '%', p.cirrhosis, 100, -1, (q) => { q.cirrhosis = 0; }));
  for (let i = 0; i < 3; i++) {
    const z = ZONES[i], r: number = p.fibrosis.R[z], l: number = p.fibrosis.L[z];
    if (r !== 1 && Math.abs(r - l) < 1e-9) put(numbered(`fib:${z}`, `${ZONE_WORD[z]} fibrosis ×`, '', r, 1, r < 10 ? 1 : 0, (q) => { q.fibrosis.R[z] = 1; q.fibrosis.L[z] = 1; }));
    else for (let j = 0; j < 2; j++) {
      const lobe = LOBES[j], x: number = p.fibrosis[lobe][z];
      if (x !== 1) put(numbered(`fib:${lobe}:${z}`, `${ZONE_WORD[z]} fibrosis, ${lobe === 'R' ? 'right' : 'left'} lobe ×`, '', x, 1, 1, (q) => { q.fibrosis[lobe][z] = 1; }));
    }
  }
  for (const id in p.stenosis) put(numbered(`sten:${id}`, `${edgeName(id)} narrowed `, '%', p.stenosis[id], 100, -1, (q) => { delete q.stenosis[id]; }));
  for (const id in p.thrombus) put(numbered(`thr:${id}`, `${edgeName(id)} thrombus `, '%', p.thrombus[id], 100, -1, (q) => { delete q.thrombus[id]; }));
  for (const k in p.drugs) if (p.drugs[k]) put(worded(`drug:${k}`, (DRUGS as Record<string, { label: string }>)[k].label, (q) => { q.drugs[k] = false; }));
  if (p.splenicRx) put(worded('splenicRx', p.splenicRx === 2 ? 'Splenectomy' : 'Partial splenic embolization', (q) => { q.splenicRx = 0; }));
  if (p.tips.on) put(numbered('tips', 'TIPS ', ' mm', p.tips.d, 1, -2, (q) => { q.tips.on = false; }));
  if (p.dips.on) put(numbered('dips', 'DIPS ', ' mm', p.dips.d, 1, -2, (q) => { q.dips.on = false; }));
  if (p.portocaval) put(worded('portocaval', p.portocavalSide ? 'Portocaval shunt (side-to-side)' : 'Portocaval shunt', (q) => { q.portocaval = false; q.portocavalSide = false; }));
  if (p.dsrs) put(worded('dsrs', 'Distal splenorenal shunt', (q) => { q.dsrs = false; }));
  if (p.mesocaval) put(worded('mesocaval', 'Mesocaval shunt', (q) => { q.mesocaval = false; }));
  if (p.rex) put(worded('rex', 'Meso-Rex bypass', (q) => { q.rex = false; }));
  const cs = p.customShunts;
  if (cs) for (const id in cs) put(numbered(`cs:${id}`, `${edgeName(id)} `, ' mm', cs[id], 1, -2, (q) => { const c = { ...(q.customShunts || {}) }; delete c[id]; q.customShunts = c; }));
  // (the esophageal balloon goes on a tube whose gastric balloon is up: it comes off with it)
  if (p.balloonGas) put(worded('balloonGas', 'Gastric balloon', (q) => { q.balloonGas = false; q.balloonEso = false; }));
  if (p.balloonEso) put(worded('balloonEso', 'Esophageal balloon', (q) => { q.balloonEso = false; }));
  for (const id in p.occluded) put(worded(`occ:${id}`, id === 'C5' ? 'BRTO (gastrorenal shunt occluded)' : `${edgeName(id)} occluded`, (q) => { delete q.occluded[id]; }));
  if (p.splanchnicTone !== 1) put(numbered('splTone', 'Splanchnic tone ×', '', p.splanchnicTone, 1, 2, (q) => { q.splanchnicTone = 1; }));
  if (p.meal > 0) put(worded('meal', 'After a meal', (q) => { q.meal = 0; }));
  if (p.systemicTone !== 1) put(numbered('sysTone', 'Systemic tone ×', '', p.systemicTone, 1, 2, (q) => { q.systemicTone = 1; }));
  if (p.contractility !== 1) put(numbered('contractility', 'RV contractility ', '%', p.contractility, 100, -1, (q) => { q.contractility = 1; }));
  if (p.tr > 0) put(numbered('tr', 'Tricuspid regurgitation ', '%', p.tr, 100, -1, (q) => { q.tr = 0; }));
  if (p.pericardial > 0) put(numbered('pericardial', 'Pericardial constraint ', '%', p.pericardial, 100, -1, (q) => { q.pericardial = 0; }));
  if (p.apShunt > 0) put(numbered('apShunt', 'Arterioportal shunting ', '%', p.apShunt, 100, -1, (q) => { q.apShunt = 0; }));
  if (p.habrStrength !== 1) put(numbered('habr', 'Arterial buffer ×', '', p.habrStrength, 1, 2, (q) => { q.habrStrength = 1; }));
  if (p.gestation > 0) put(numbered('gestation', 'Pregnancy ', ' weeks', p.gestation, 1, -1, (q) => { q.gestation = 0; }));
  if (p.albumin !== 4) put(numbered('albumin', 'Albumin ', ' g/dL', p.albumin, 1, 1, (q) => { q.albumin = 4; }));
  if (p.diuretics) put(worded('diuretics', 'Diuretics', (q) => { q.diuretics = false; }));
  if (p.anticoag) put(worded('anticoag', 'Anticoagulation', (q) => { q.anticoag = false; }));
  if (p.spontaneous.C5 === false) put(worded('C5', 'No gastrorenal shunt (no fundal varices)', (q) => { q.spontaneous.C5 = true; }));
  if (p.spontaneous.C6) put(worded('C6', 'Splenorenal shunt', (q) => { q.spontaneous.C6 = false; }));
  return out;
}

/** The interventions treatCount counts, besides any drug (chart.js). */
const TREATMENT_KEYS = new Set(['anticoag', 'diuretics', 'tips', 'dips', 'balloonEso', 'balloonGas', 'portocaval', 'dsrs', 'mesocaval', 'rex', 'occ:C5', 'splenicRx']);
/** How many treatments are running now (drugs, shunts, balloons, BRTO). */
export function treatCount(p: Params): number {
  let n = 0;
  for (const c of activeInterventions(p)) if (c.key.startsWith('drug:') || TREATMENT_KEYS.has(c.key)) n++;
  return n;
}

/** Where on the figure a patient fact is set, so its row can take you there (fact-target.js; U14). */
export type Target = { type: 'organ'; id: string } | { type: 'edge'; id: string };
const ORGAN: Record<string, string> = { cirrhosis: 'liver', splenicRx: 'spleen', balloonEso: 'varices', balloonGas: 'gastric', C5: 'gastric', tr: 'heart', contractility: 'heart', pericardial: 'heart', gestation: 'heart' };
const EDGE: Record<string, string> = { tips: 'TIPS', dips: 'DIPS', portocaval: 'S_PC', dsrs: 'S_DSR', mesocaval: 'S_MC', rex: 'REX', C6: 'C6', meal: 'A_SMA' };
export function factTarget(key: string): Target | null {
  if (ORGAN[key]) return { type: 'organ', id: ORGAN[key] };
  if (EDGE[key]) return { type: 'edge', id: EDGE[key] };
  if (key.startsWith('fib:')) return { type: 'organ', id: 'liver' };
  const m = /^(sten|thr|occ|cs):(.+)$/.exec(key);
  return m ? { type: 'edge', id: m[2] } : null;
}
