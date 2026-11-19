// What Tube vs patient needs besides the 2D file's curve tool (copied/curves-parts.copied.js): the sweep's key (stent, setting, day), the setting as the stent stands now (filled from the engine's geometry
// where the parameters leave it unset, so the dashed line has somewhere to stand), and the ring's live reading. Pure, so a test reads it.
import type { StentId } from './store.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const GEOM_AT: Record<string, string> = { waist: 'waist', length: 'len' };

/** The sweep's identity: a new sweep is worked out when the stent, the setting or the day changes (2D ir-curves.js update). */
export function sweepKey(which: StentId, sweep: string, f: { clock?: string; day?: number } | null | undefined): string {
  const day = f?.clock === 'disease' && Number.isFinite(f.day) ? Math.floor(f.day as number) : 0;
  return `${which}|${sweep}|${day}`;
}
/** The parameters with the sweep's own setting filled from the stent's geometry where they leave it unset (2D liveParams). */
export function liveParams(p: Any, st: Any, sweep: string, which: StentId): Any {
  const g = GEOM_AT[sweep], v = g && st?.geom ? st.geom[g] : null;
  if (g && Number.isFinite(v) && !Number.isFinite(p?.stentGeom?.[which]?.[g])) return { ...p, stentGeom: { ...p.stentGeom, [which]: { ...p.stentGeom?.[which], [g]: v } } };
  return p;
}
/** The ring's reading: the stent as it stands now, on the lines worked out for the sweep's moment (2D ring: tipsFlow and tipsBench). */
export const ringFp = (st: Any, which: StentId): Record<string, number> => { const k = which === 'DIPS' ? 'dips' : 'tips'; return { [`${k}Flow`]: st?.flow, [`${k}Bench`]: st?.bench }; };
/** A short stable word for a parameter record, so the same patient is not worked out twice. */
export function paramsId(p: unknown): string {
  const s = JSON.stringify(p) ?? '';
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
