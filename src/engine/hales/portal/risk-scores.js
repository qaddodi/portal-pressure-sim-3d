// Liver-function scores, published formulas only (no imports, so the worker loads it too). The engine does not model bilirubin, INR, creatinine or sodium: a slide or a
// tool gives them as case facts, and the model supplies the albumin. Nothing here is calibrated; every number below is in the paper named beside it.
//
// - Child–Pugh: Pugh RN et al., Br J Surg 1973;60:646. Five components, 1 to 3 points each; A 5–6, B 7–9, C 10–15.
// - MELD: Kamath PS et al., Hepatology 2001;33:464, in the UNOS form (bilirubin, INR and creatinine floored at 1.0, creatinine capped at 4.0 mg/dL, the score at 40, rounded).
// - MELD-Na: Kim WR et al., N Engl J Med 2008;359:1018, in the UNOS 2016 form (sodium held between 125 and 137 mmol/L, applied above a MELD of 11).
// - Baveno VIII (J Hepatol 2026) uses the Child–Pugh points: a preemptive TIPS for class C 10 to 13 or class B above 7 with active bleeding (5.31), recompensation needs Child–Pugh A5 or A6 (7.4).

/** The three levels a clinical finding is graded in: ascites 'none' | 'mild' | 'moderate' (moderate to severe, or refractory); HE 'none' | 'mild' (grade 1–2, or controlled on treatment) | 'severe' (grade 3–4). */
const LEVEL = Object.freeze({ none: 1, mild: 2, moderate: 3, severe: 3 });

/** Points for each component of the Child–Pugh score (null when the input is not a usable number or level). Cut-offs belong to the higher-scoring side only above the stated limit:
 *  bilirubin <2 / 2–3 / >3 mg/dL; albumin >3.5 / 2.8–3.5 / <2.8 g/dL; INR <1.7 / 1.7–2.3 / >2.3. */
export const cpBilirubin = (mgdl) => (!Number.isFinite(mgdl) || mgdl < 0 ? null : mgdl < 2 ? 1 : mgdl <= 3 ? 2 : 3);
export const cpAlbumin = (gdl) => (!Number.isFinite(gdl) || gdl <= 0 ? null : gdl > 3.5 ? 1 : gdl >= 2.8 ? 2 : 3);
export const cpInr = (inr) => (!Number.isFinite(inr) || inr <= 0 ? null : inr < 1.7 ? 1 : inr <= 2.3 ? 2 : 3);
export const cpAscites = (level) => (level === 'none' || level === 'mild' || level === 'moderate' ? LEVEL[level] : null);
export const cpHe = (level) => (level === 'none' || level === 'mild' || level === 'severe' ? LEVEL[level] : null);

export const cpClass = (total) => (total <= 6 ? 'A' : total <= 9 ? 'B' : 'C');

/** Child–Pugh from { bili (mg/dL), albumin (g/dL), inr, ascites, he }. Any component missing: `total` and `class` are null and `missing` names what is lacking, so a card never guesses.
 *  Returns { points: {bili, albumin, inr, ascites, he}, total, class, missing }. */
export function childPugh({ bili, albumin, inr, ascites, he } = {}) {
  const points = { bili: cpBilirubin(bili), albumin: cpAlbumin(albumin), inr: cpInr(inr), ascites: cpAscites(ascites), he: cpHe(he) };
  const missing = Object.keys(points).filter((k) => points[k] == null);
  const total = missing.length ? null : Object.values(points).reduce((a, b) => a + b, 0);
  return { points, total, class: total == null ? null : cpClass(total), missing };
}

/** Baveno VIII 5.31: a preemptive TIPS is for Child–Pugh C of 10 to 13 points, or Child–Pugh B above 7 (8 or 9) with active bleeding at endoscopy. */
export const preemptiveByCp = (total, activeBleeding = false) => Number.isFinite(total) && ((total >= 10 && total <= 13) || (total > 7 && total <= 9 && !!activeBleeding));
/** Baveno VIII 7.4: liver function consistent with Child–Pugh A5 or A6. */
export const recompensatedByCp = (total) => Number.isFinite(total) && total >= 5 && total <= 6;

const floor1 = (v) => Math.max(1, v);
/** MELD (UNOS form) from { bili (mg/dL), inr, creatinine (mg/dL), dialysis (two or more sessions in the past week: creatinine counts as 4.0) }; null with a missing or non-positive input. */
export function meld({ bili, inr, creatinine, dialysis = false } = {}) {
  if (![bili, inr, creatinine].every((v) => Number.isFinite(v) && v > 0)) return null;
  const cr = dialysis ? 4 : Math.min(4, floor1(creatinine));
  const raw = 0.957 * Math.log(cr) + 0.378 * Math.log(floor1(bili)) + 1.12 * Math.log(floor1(inr)) + 0.643;
  return Math.min(40, Math.round(raw * 10));
}
/** MELD-Na (UNOS 2016): MELD, and above 11 the sodium term 1.32 × (137 − Na) − 0.033 × MELD × (137 − Na), sodium held between 125 and 137 mmol/L. Null without a MELD or a sodium. */
export function meldNa(a = {}) {
  const m = meld(a);
  if (m == null || !Number.isFinite(a.na)) return null;
  if (m <= 11) return m;
  const d = 137 - Math.min(137, Math.max(125, a.na));
  return Math.min(40, Math.round(m + 1.32 * d - 0.033 * m * d));
}
