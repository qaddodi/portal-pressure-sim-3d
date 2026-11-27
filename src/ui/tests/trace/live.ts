// The pure parts of the Over time pane that read the record and the clock: where the trace's right edge stands, the header's words and the lanes' gliding y ranges (2D pressure-time.js).
import { fmt } from '../../charts/fmt.ts';
import { feed, headOf } from '../feed.ts';
import { NOT_MEASURABLE } from '../../../engine/hv-flag.ts';
import { hvpgWordOf, sevTok, type Range } from './model.ts';

const NOT_SHOWN = '—';

export { headOf };

/** The header's readings as words: the HVPG, its band and its change over the range on screen (2D updateHero). */
export function heroOf(hvpg: number, range: Range = 'beats', hidden: ReadonlySet<string> | null = null, measured: number | null = null) {
  // an HVPG the case leaves unmeasured: the number of the measurement if there is one, else the dash (2D updateHero)
  // a blocked hepatic vein takes no catheter, so there is no measurement either: the word where the number would be (hidden.ts HV_BLOCKED)
  if (hidden?.has('hvBlocked')) return { num: NOT_SHOWN, word: NOT_MEASURABLE, sev: 'none', delta: '', dir: '' };
  if (hidden?.has('trueHVPG')) return { num: measured != null ? fmt(measured, 1) : NOT_SHOWN, word: measured != null ? 'Measured' : 'Not measured', sev: measured != null ? sevTok(measured) : 'none', delta: '', dir: '' };
  const v = Math.max(0, hvpg);
  const num = Number.isFinite(hvpg) ? fmt(v, 1) : NOT_SHOWN;
  const word = Number.isFinite(hvpg) ? hvpgWordOf(v) : '';
  const { binT, bin, days } = feed;
  let d: number | null = null, over = '';
  if (range === 'days' && days.length > 1) {
    const last = days[days.length - 1]!.day, first = days.find((x) => x.day >= last - 730) || days[0]!;
    d = v - first.v.hvpg!; over = `since day ${first.day}`;
  } else if (range !== 'days' && binT.length > 60) {
    const lastT = feed.last;
    let fi = 0; while (fi < binT.length && !(binT[fi]! >= lastT - 120)) fi++;
    const t0 = binT[fi]!, h = bin.hvpg;
    let a = 0, an = 0, b = 0, bn = 0;
    for (let q = fi; q < binT.length; q++) {
      const m = h.mean[q]!;
      if (m !== m) continue;
      if (binT[q]! < t0 + 1) { a += m; an++; }
      if (binT[q]! >= lastT - 1) { b += m; bn++; }
    }
    if (an && bn) { d = b / bn - a / an; over = lastT - t0 > 100 ? 'in 2 min' : `in ${Math.round(lastT - t0)} s`; }
  }
  const flat = d == null || Math.abs(d) < 0.4;
  const delta = d == null ? '' : flat ? `Steady ${over}` : `${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d), 1)} ${over}`;
  return { num, word, sev: Number.isFinite(hvpg) ? sevTok(v) : 'none', delta, dir: flat ? '' : d! > 0 ? 'up' : 'down' };
}

/** Where the lanes' y ranges glide (2D ease(): a range is kept until the data leaves it or fills under 55% of it, then re-set with 8% room, and the drawn one glides there, τ 0.15 s). */
export function createEase() {
  const want: Record<string, [number, number] | undefined> = {}, shown: Record<string, [number, number] | undefined> = {}, at: Record<string, number> = {};
  const fn = (key: string, lo: number, hi: number, now: number): readonly [number, number] => {
    let r = want[key];
    if (!r || lo < r[0] || hi > r[1] || hi - lo < (r[1] - r[0]) * 0.55) { const m = (hi - lo) * 0.08; r = want[key] = [lo - m, hi + m]; }
    let sh = shown[key];
    if (!sh) sh = shown[key] = [r[0], r[1]];
    else {
      const k = -Math.expm1(-Math.min(0.1, (now - at[key]!) / 1000) / 0.15), snap = (r[1] - r[0]) * 0.002;
      for (let i = 0; i < 2; i++) sh[i] = Math.abs(r[i]! - sh[i]!) <= snap ? r[i]! : sh[i]! + (r[i]! - sh[i]!) * k;
    }
    at[key] = now;
    return sh;
  };
  const gliding = () => Object.keys(shown).some((k) => shown[k]![0] !== want[k]![0] || shown[k]![1] !== want[k]![1]);
  const reset = () => { for (const k of Object.keys(want)) { delete want[k]; delete shown[k]; } };
  /** A change of traces, range or smoothing: the ranges are chosen again from the data, and the drawn ones glide there (2D: yr.pressure = yr.hvpg = null). */
  const retarget = () => { for (const k of Object.keys(want)) delete want[k]; };
  return { fn, gliding, reset, retarget };
}

