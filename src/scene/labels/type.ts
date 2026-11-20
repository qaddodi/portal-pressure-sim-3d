// How a figure label is set: the 2D app's type, copied (names.copied.ts LABEL_STYLE). A label is no pill: its words stand on the figure with a
// halo (the look's own halo colour round every letter), a small name in the quiet ink and the reading large and bold. Sizes are the 2D roles
// (reading, name, caption) at this screen's short side; gaps and the line height scale as the 2D app's do. Pure: node judges all of it.
import { LABEL_NAMES } from './names.copied.ts';

export const LS = LABEL_NAMES.LABEL_STYLE;
export type Role = 'cap' | 'lab' | 'val';
export interface Vp { w: number; h: number }

/** A run's role from its design size (the 2D app's roleOf): readings are 'val', names 'lab', units and captions 'cap'. */
export const roleOf = (size: number): Role => (size >= LS.ROLE_VAL_FROM ? 'val' : size >= LS.ROLE_LAB_FROM ? 'lab' : 'cap');
/** How far the screen is from a phone (0) to a laptop (1), by its short side. */
export const fluid = (vp: Vp): number => Math.min(1, Math.max(0, (Math.min(vp.w, vp.h) - LS.FLUID_FROM) / LS.FLUID_SPAN));
/** A run's size on screen, px. */
export const fontPx = (size: number, vp: Vp): number => { const [a, b] = LS.ROLES[roleOf(size)]; return a + (b - a) * fluid(vp); };

/** A role's size at this screen, px (the 2D rolePx). */
export const rolePx = (role: keyof typeof LS.ROLES, vp: Vp): number => { const [a, b] = LS.ROLES[role]; return a + (b - a) * fluid(vp); };

export type RunKind = 'name' | 'val' | 'unit' | 'delta' | 'alert' | 'note' | 'rev' | 'organ';
export interface Run { kind: RunKind; text: string; size: number; weight: number; /** space before it, in label-size units (the 2D gap) */ gap: number; /** letter spacing in em */ track: number }

const run = (kind: RunKind, text: string, size: number, weight: number, gap = 0, track = 0): Run => ({ kind, text, size, weight, gap, track });
export const nameRun = (text: string): Run => run('name', text, LS.NAME.size, LS.NAME.weight);
/** The reading, laid out at its widest (two digits before the point), so a value ticking from 9.8 to 10.2 keeps its box. */
export const valueRun = (text: string, first = true): Run => run('val', text, LS.VALUE.size, LS.VALUE.weight, first ? 0 : LS.NAME_TO_VALUE);
/** The unit after a reading (2D lb-unit: 10 px / 500, 2.5 gap), the change badge (lb-delta: 10.5 / 650, 6), an alert (lb-alert, as the badge), and words standing in for the number (a note: the unit's type, joined to the name by the name's gap). */
export const unitRun = (text: string): Run => run('unit', text, LS.UNIT.size, LS.UNIT.weight, LS.UNIT.gap);
export const deltaRun = (text: string): Run => run('delta', text, LS.DELTA.size, LS.DELTA.weight, LS.DELTA.gap);
export const alertRun = (text: string): Run => run('alert', text, LS.DELTA.size, LS.DELTA.weight, LS.DELTA.gap);
export const noteRun = (text: string): Run => run('note', text, LS.UNIT.size, LS.UNIT.weight, LS.NAME_TO_VALUE);
export const revRun = (): Run => run('rev', '⟲', LS.REVERSED.size, LS.REVERSED.weight, LS.REVERSED.gap);
export const organRun = (text: string): Run => run('organ', text.toUpperCase(), LS.ORGAN.size, LS.ORGAN.weight, 0, LS.ORGAN.track);

/** What a station says after its name (readings.ts decides; the layout reserves the widest of each): the number (laid out as wide as `value`), the unit, the change badge (laid out as wide as `delta`), an alert, or a note in place of the number. */
export interface Say { value?: string; unit?: string; delta?: string; alert?: string; note?: string }
export const NO_SAY: Say = Object.freeze({});

/** A station's line: its name, its reading (when it has one), the unit, the change badge, an alert, and the reversal mark last, when its blood runs backwards (2D: the mark stays through every shortening). */
export function stationRuns(name: string, hasValue: boolean, reversed: boolean, value = '00.0', say: Say = NO_SAY): Run[] {
  const runs: Run[] = [];
  if (name) runs.push(nameRun(name));
  if (say.note) runs.push({ ...noteRun(say.note), gap: name ? LS.NAME_TO_VALUE : 0 });
  else if (hasValue) {
    runs.push({ ...valueRun(say.value ?? value), gap: name ? LS.NAME_TO_VALUE : 0 });
    if (say.unit) runs.push(unitRun(say.unit));
    if (say.delta) runs.push(deltaRun(say.delta));
    if (say.alert) runs.push(alertRun(say.alert));
  }
  if (reversed) runs.push(revRun());
  return runs;
}

export type Measure = (text: string, size: number, weight: number, trackPx?: number) => number;

/** A label's own size: the line's width and height (the 2D lineW and LINE_H), without padding. */
export function lineSize(runs: readonly Run[], vp: Vp, measure: Measure): { w: number; h: number } {
  let w = 0, hi = 0;
  runs.forEach((r, i) => {
    const px = fontPx(r.size, vp);
    w += measure(r.text, px, r.weight, r.track * px) + (i ? r.gap * LS.LABEL_K : 0);
    hi = Math.max(hi, px);
  });
  return { w, h: hi * LS.LINE_H };
}

/** The box a label takes on the figure: its line and the 2D padding round it. */
export function boxSize(runs: readonly Run[], vp: Vp, measure: Measure, organ = false): { w: number; h: number; padX: number; padY: number } {
  const { w, h } = lineSize(runs, vp, measure);
  const padX = organ ? LS.ORGAN.padX : LS.PAD.x, padY = organ ? LS.ORGAN.padY : LS.PAD.y;
  return { w: w + padX * 2, h: h + padY * 2, padX, padY };
}

/** Where the baseline stands from the top of a label's box (the 2D app writes text at 0.78 of its line). */
export const baselineAt = (boxH: number, padY: number): number => padY + LS.BASELINE * (boxH - padY * 2);

/** The halo's width round a letter, px (the 2D stroke: at least 2, else 3 times the label size). */
export const haloPx = (): number => Math.max(LS.HALO.min, LS.HALO.perK * LS.LABEL_K);

/** The custom properties a layer carries so its stylesheet holds no number of its own: sizes at this screen, weights, gaps, halo, ring. */
export function typeVars(vp: Vp): Record<string, string> {
  const px = (n: number) => `${Math.round(n * 100) / 100}px`;
  return {
    '--lb-f-name': px(fontPx(LS.NAME.size, vp)), '--lb-w-name': String(LS.NAME.weight),
    '--lb-f-val': px(fontPx(LS.VALUE.size, vp)), '--lb-w-val': String(LS.VALUE.weight),
    '--lb-f-rev': px(fontPx(LS.REVERSED.size, vp)), '--lb-w-rev': String(LS.REVERSED.weight),
    '--lb-f-unit': px(fontPx(LS.UNIT.size, vp)), '--lb-w-unit': String(LS.UNIT.weight), '--lb-g-unit': px(LS.UNIT.gap * LS.LABEL_K),
    '--lb-f-delta': px(fontPx(LS.DELTA.size, vp)), '--lb-w-delta': String(LS.DELTA.weight), '--lb-g-delta': px(LS.DELTA.gap * LS.LABEL_K),
    '--lb-f-organ': px(fontPx(LS.ORGAN.size, vp)), '--lb-w-organ': String(LS.ORGAN.weight), '--lb-track-organ': `${LS.ORGAN.track}em`,
    '--lb-g-val': px(LS.NAME_TO_VALUE * LS.LABEL_K), '--lb-g-rev': px(LS.REVERSED.gap * LS.LABEL_K),
    '--lb-halo-w': px(haloPx()),
    '--lb-ring': px(LS.RING.r * 2 + LS.RING.stroke), '--lb-ring-w': px(LS.RING.stroke), '--lb-lead-w': px(LS.LEADER_WIDTH),
    '--lb-pad-x': px(LS.PAD.x), '--lb-pad-y': px(LS.PAD.y),
  };
}

/** The ink, halo and ring colours of a look at this screen, as the custom properties the stylesheet reads. */
export function lookVars(look: string, vp: Vp): Record<string, string> {
  const t = (LS.LOOKS as Record<string, Record<string, string>>)[look];
  if (!t) throw new Error(`no label ink for the look "${look}"`);
  return {
    '--lb-halo': t['label-halo'], '--lb-leader': t['leader'], '--lb-rev': t['flow-reversed'], '--lb-ring-fill': t['stage-bg'],
    '--lb-name': t['text-2'], '--lb-val': t['text'], '--lb-alert': t['danger'], '--lb-accent': t['accent-ink'],
    // (on a phone the organ captions step back in ink, so they and the names share the 12 px floor: looks review L8)
    '--lb-organ': vp.w <= LS.ORGAN_PHONE.maxWidth ? `color-mix(in srgb, ${t['text-3']} ${LS.ORGAN_PHONE.mixPercent}%, ${t['stage-bg']})` : t['text-3'],
  };
}
