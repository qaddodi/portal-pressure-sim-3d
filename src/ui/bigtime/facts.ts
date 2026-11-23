// What a TIPS row of "What happened" opens to: the route, the stent, and the numbers on the day before it and a week after (pure; the series and the entry's saved parameters go in).
import { valueAt, type Series } from './record.ts';
import { fmt } from '../charts/fmt.ts';
import { BT } from './words.ts';

/** the last reading before a day (a step has two points on its day: the one before the change is the earlier) */
export function before(s: Series | null | undefined, day: number): number | null {
  if (!s || !s.x.length) return null;
  let i = -1; for (let k = 0; k < s.x.length; k++) { if (s.x[k]! < day - 1e-9) i = k; else break; }
  return i < 0 ? s.y[0]! : s.y[i]!;
}
/** how long after a procedure the "after" number is read: the model has settled by then */
export const SETTLE_DAYS = 8;

export interface Params { tips?: { on?: boolean; d?: number }; stentGeom?: Record<string, { len?: number } | undefined> }
export const isTips = (keys: readonly string[] | undefined, p: unknown): boolean => !!keys?.includes('tips') && !!(p as Params | null | undefined)?.tips?.on;

export function tipsFacts(p: Params, day: number, end: number, ser: { shunt?: Series | undefined; pv?: Series | undefined; ivc?: Series | undefined; hvpg?: Series | null; asc?: Series | undefined }): [string, string][] {
  const after = Math.min(end, day + SETTLE_DAYS), d = p.tips?.d ?? 8, len = p.stentGeom?.TIPS?.len ?? 8;
  const pair = (s: Series | null | undefined, w: (v: number) => string): string | null => { const a = before(s, day), b = valueAt(s, after); return a == null || b == null ? null : `${w(a)} → ${w(b)}`; };
  const ppg = ser.pv && ser.ivc ? { x: ser.pv.x, y: ser.pv.y.map((v, i) => v - (valueAt(ser.ivc, ser.pv!.x[i]!) ?? 0)) } : null;
  const rows: [string, string | null][] = [
    [BT.route, BT.tipsRoute],
    [BT.stent, `${d} mm × ${len} cm`],
    ['Shunt fraction', pair(ser.shunt, (v) => `${Math.round(v * 100)}%`)],
    ['PPG', pair(ppg, (v) => fmt(v, 1)) && `${pair(ppg, (v) => fmt(v, 1))} mmHg`],
    ['HVPG', pair(ser.hvpg, (v) => fmt(v, 1)) && `${pair(ser.hvpg, (v) => fmt(v, 1))} mmHg`],
    ['Ascites', pair(ser.asc, (v) => `${fmt(v, 1)} L`)],
  ];
  return rows.filter((r): r is [string, string] => r[1] != null);
}

/** "HVPG 11.6 · PV 15.9 · PPG 11.4" at a day */
export function readingsAt(day: number, ser: { pv?: Series | undefined; ivc?: Series | undefined; hvpg?: Series | null }): string {
  const h = valueAt(ser.hvpg, day), pv = valueAt(ser.pv, day), ivc = valueAt(ser.ivc, day);
  return [h != null && `HVPG ${fmt(h, 1)}`, pv != null && `PV ${fmt(pv, 1)}`, pv != null && ivc != null && `PPG ${fmt(pv - ivc, 1)}`].filter(Boolean).join(' · ');
}
