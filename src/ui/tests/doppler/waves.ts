// A hepatic vein's a, S, v and D waves in the newest settled whole beat (2D doppler.js hvWaves): beats are cut at the a-waves (the reversals toward the probe's atrial side); between two,
// the two deepest forward troughs are S (first) and D, v is the turn toward the baseline between them. Read from a lightly smoothed trace; nothing is named when the pattern is not
// triphasic (no clear reversal, or a single forward wave). Only the newest beat whose closing a-wave has settled (the last 0.35 s can still change) is named, so the letters never shift.
export type Wave = [number, number, string];
export type WavePts = [Wave, Wave, Wave, Wave];
const HW_CAP = 4096;

/** The four waves of the newest settled beat between t0 and t1 in the record `buf` ([[t, v], …]), signed by `sgn` for the display; null when no beat can be named. */
export function hvWaves(buf: readonly (readonly number[])[], t0: number, t1: number, sgn: number): WavePts | null {
  let i0 = 0; while (i0 < buf.length && buf[i0]![0]! < t0) i0++;
  let n = 0; while (i0 + n < buf.length && buf[i0 + n]![0]! <= t1) n++;
  if (n < 12 || n > HW_CAP) return null;
  const y = new Float64Array(n), A: number[] = [], T = (i: number) => buf[i0 + i]![0]!;
  for (let i = 0; i < n; i++) { let s = 0, m = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { s += sgn * buf[i0 + j]![1]!; m++; } y[i] = s / m; }
  let top = -Infinity, bot = Infinity;   // (top: the biggest reversal, which has to exist)
  for (let i = 0; i < n; i++) { if (y[i]! > top) top = y[i]!; if (y[i]! < bot) bot = y[i]!; }
  if (top < 0.5 || bot > -5) return null;
  const ext = (i: number, s2: number) => s2 * y[i]! >= s2 * y[i - 1]! && s2 * y[i]! >= s2 * y[i + 1]!;
  // An a-wave: the highest point within 0.3 s either side, at or near the baseline.
  const crest = (i: number) => {
    const ti = T(i);
    for (let j = i - 1; j >= 0 && ti - T(j) < 0.3; j--) if (y[j]! > y[i]!) return false;
    for (let j = i + 1; j < n && T(j) - ti < 0.3; j++) if (y[j]! > y[i]!) return false;
    return true;
  };
  for (let i = 1; i < n - 1; i++) if (y[i]! > bot * 0.15 && ext(i, 1) && crest(i) && (!A.length || T(i) - T(A[A.length - 1]!) > 0.35)) A.push(i);
  const tEnd = T(n - 1) - 0.35;
  for (let b = A.length - 2; b >= 0; b--) {
    if (T(A[b + 1]!) > tEnd) continue;
    const low: number[] = [];
    for (let i = A[b]! + 1; i < A[b + 1]!; i++) if (y[i]! < bot * 0.25 && ext(i, -1)) low.push(i);
    // Keep the deepest trough of each dip (troughs closer than 0.12 s are one wave), then the two deepest dips.
    const dip: number[] = [];
    for (const i of low) {
      if (dip.length && T(i) - T(dip[dip.length - 1]!) < 0.12) { if (y[i]! < y[dip[dip.length - 1]!]!) dip[dip.length - 1] = i; } else dip.push(i);
    }
    if (dip.length < 2) continue;
    let m1 = -1, m2 = -1;   // (the two deepest, the earlier of equal ones first)
    for (let q = 0; q < dip.length; q++) { if (m1 < 0 || y[dip[q]!]! < y[dip[m1]!]!) { m2 = m1; m1 = q; } else if (m2 < 0 || y[dip[q]!]! < y[dip[m2]!]!) m2 = q; }
    const two0 = Math.min(dip[m1]!, dip[m2]!), two1 = Math.max(dip[m1]!, dip[m2]!);
    let v = two0 + 1;   // v: the turn toward the baseline between S and D (the highest point between their troughs)
    for (let i = two0 + 1; i < two1; i++) if (y[i]! > y[v]!) v = i;
    return [[T(A[b]!), y[A[b]!]!, 'a'], [T(two0), y[two0]!, 'S'], [T(v), y[v]!, 'v'], [T(two1), y[two1]!, 'D']];
  }
  return null;
}
