// The patient in one line, for a screen reader (the 2D app's a11y.js `caption`, the same words from the same cut-off tables):
// "Cirrhosis. Portal pressure 23 mmHg, HVPG 17.0 mmHg (CSPH). Large varices, 0.8 L ascites, flow toward the liver."
// It hides what the figure hides. Pure: handed the numbers, so a Node test drives it; the app's glue is mount.ts.
import { EDGES } from '../../engine/hales/portal/topology.js';
import { hvpgSev, HVPG_WORDS } from '../../engine/hales/portal/pressure-cuts.js';
import { judgeFlow } from '../../scene/lenses/vel-normal.copied.js';
import { fmt } from '../charts/fmt.ts';

const EI: Record<string, number> = Object.fromEntries((EDGES as { id: string }[]).map((e, i) => [e.id, i]));

/** What the line reads of an engine frame (a subset of EngineFrame, so a test can hand a small object). */
export interface CaptionFrame {
  metrics: {
    pv?: number; hvpg: number; hr?: number; map?: number; vitals?: { hr?: number; map?: number }; pvVel?: number; pvVelMean?: number;
    varix?: { present: boolean; grade: { label: string }; redWale?: boolean };
    ascites?: { grade: number; volume: number };
  } & Record<string, unknown>;
  Q?: ArrayLike<number>; Qf?: ArrayLike<number>;
  bleed?: { active?: boolean };
}

export interface CaptionOptions {
  /** the patient's name leads the line (the figure's description); false leaves it out (a toast or a live word) */
  scenario?: boolean;
  /** the patient's label ("Cirrhosis"); 'Custom patient' when none */
  label?: string;
  /** readouts the figure hides, as the 2D app's `hidden` set ('pv', 'trueHVPG') */
  hidden?: ReadonlySet<string> | null;
  /** the healthy patient's edge flows (the reference a slow flow is judged against) */
  healthyQ?: ArrayLike<number> | null;
}

export function caption(f: CaptionFrame | null | undefined, { scenario = true, label, hidden = null, healthyQ = null }: CaptionOptions = {}): string {
  if (!f) return '';
  const m = f.metrics;
  const parts: string[] = scenario ? [`${label || 'Custom patient'}.`] : [];
  if (f.bleed?.active) parts.push(`Active variceal bleed, HR ${fmt(m.vitals?.hr ?? m.hr, 0)}, MAP ${fmt(m.vitals?.map ?? m.map, 0)}.`);
  const p: string[] = [];
  // The absolute portal pressure is read out as a number with no severity word of its own: no guideline grades it (the 2D app's R09). The gradient carries the
  // interpretation, the band the HVPG tile shows, from the same table (pressure-cuts.js), the number at one decimal as the tile prints and rates it.
  if (!hidden?.has('pv') && m.pv != null) p.push(`Portal pressure ${fmt(m.pv, 0)} mmHg`);
  if (!hidden?.has('trueHVPG')) { const h = +fmt(m.hvpg, 1); p.push(`HVPG ${fmt(m.hvpg, 1)} mmHg (${(HVPG_WORDS as unknown as Record<string, readonly string[]>)[hvpgSev(h)]![0]})`); }
  if (p.length) parts.push(p.join(', ') + '.');
  const q = (f.Qf || f.Q)?.[EI.PV_TRUNK!];
  // The same cut-offs as the Doppler's reading and the figure's labels (vel-normal judgeFlow): a screen-reader listener keeps the direction of a slow flow.
  const jf = judgeFlow(m.pvVelMean ?? m.pvVel, q, null, { ref: healthyQ?.[EI.PV_TRUNK!] });
  const flow = jf.none ? 'no portal flow' : jf.stasis ? (jf.reversed ? 'sluggish, reversed portal flow' : 'sluggish portal flow')
    : jf.reversed ? 'flow reversed, away from the liver' : 'flow toward the liver';
  const e: string[] = [];
  if (m.varix?.present) e.push(`${m.varix.grade.label === 'None' ? 'banded' : m.varix.grade.label.toLowerCase()} varices${m.varix.redWale ? ' with red wale signs' : ''}`);
  if (m.ascites && m.ascites.grade > 0) e.push(`${fmt(m.ascites.volume / 1000, 1)} L ascites`);
  e.push(flow);
  const tail = e.join(', ');
  parts.push(tail[0]!.toUpperCase() + tail.slice(1) + '.');
  return parts.join(' ');
}
