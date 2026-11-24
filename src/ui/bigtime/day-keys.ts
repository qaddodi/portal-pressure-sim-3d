// What a day's point of the record holds besides the pressures the Over time list already kept (feed.ts noteDay): the measures the timeline chart draws in its own lanes.
// Pure: a frame in, the readings out; a reading the frame does not carry is left out (never a made-up 0), so a lane draws only the days the model gave a value.
import { NODES } from '../../engine/hales/portal/topology.js';

const NI: Record<string, number> = Object.fromEntries((NODES as { id: string }[]).map((n, i) => [n.id, i]));

/** the frame's own fields these readings come from (the engine's frame, loosely) */
export interface DayFrame { metrics?: Record<string, unknown>; Pf?: ArrayLike<number> | undefined }

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** ascites in litres (`asc`), the shunt as a share 0..1 (`shunt`), cardiac output L/min (`co`), the PPG (`ppg`), the varix and the SMV pressures (`var`, `smv`), the liver's and the spleen's stiffness in kPa (`lsm`, `ssm`: the metrics' own; no spleen, no `ssm`), and the rest the chart can draw: the spleen's length in cm (`spl`, none after a splenectomy) and the platelets (`plt`), the portal inflow in L/min (`pflow`) and the liver's flow as a share of healthy (`perf`, %), the mean arterial pressure (`map`), the abdominal perfusion pressure (`app`, the metrics' `rpp`), the heart rate (`hr`), the esophageal varix's diameter in mm (`vx`), the encephalopathy risk index 0..1 (`he`) and the hepatic artery buffer response (`habr`, 1 = none). */
export function dayExtras(f: DayFrame): Record<string, number> {
  const m = f.metrics ?? {}, out: Record<string, number> = {};
  const asc = num((m.ascites as { volume?: unknown } | undefined)?.volume), shunt = num(m.shuntFraction), co = num(m.co), ppg = num(m.ppg), lsm = num(m.lsm), ssm = num(m.ssm);
  const sp = m.spleen as { length?: unknown; platelets?: unknown } | undefined, len = num(sp?.length), plt = num(sp?.platelets);
  const one = (k: string, v: number | null) => { if (v != null) out[k] = v; };
  if (asc != null) out.asc = asc / 1000;
  if (shunt != null) out.shunt = shunt;
  if (co != null) out.co = co;
  if (ppg != null) out.ppg = ppg;
  if (lsm != null) out.lsm = lsm;
  if (ssm != null) out.ssm = ssm;
  if (len != null && len > 0) out.spl = len;   // (no spleen after a splenectomy: no size, never a 0; the platelets then read the model's own 380)
  one('plt', plt); one('pflow', num(m.portalIn)); one('perf', num(m.liverPerfPct)); one('map', num(m.map)); one('app', num(m.rpp)); one('hr', num(m.hr));
  one('vx', num((m.varix as { d?: unknown } | undefined)?.d)); one('he', num((m.heRisk as { index?: unknown } | undefined)?.index)); one('habr', num(m.habr));
  const P = f.Pf;
  // the EUS-PPG: the left portal vein less the left hepatic vein as the needle reads them, each at a tenth (the monitor's own sum, tests/endo/eus-source.ts pinLive)
  const lpv = P ? num(P[NI.LPV!]) : null, lhv = P ? num(P[NI.LHV!]) : null;
  if (lpv != null && lhv != null) out.eus = Math.round((Math.round(lpv * 10) / 10 - Math.round(lhv * 10) / 10) * 10) / 10;
  if (P) for (const [k, node] of [['var', 'VAR'], ['smv', 'SMV']] as const) { const i = NI[node], v = i == null ? null : num(P[i]); if (v != null) out[k] = v; }
  return out;
}
