// The sinusoid's names as the label layer writes them (SinusoidCaptions.tsx): 2D's layout (names.ts) given what the figure knows (where the plane stands on the canvas, the free room the cards leave,
// the model's numbers, the name a tap explained), and the words, lines and sizes of each name. Pure: no DOM, no three.js, so a test reads what the layer writes.
import { type Measure, type Vp, LS, lineSize, nameRun, valueRun } from '../labels/type.ts';
import { LYMPH_UNIT, lymphText } from '../../ui/action/lymph-day.ts';
import { type NameKey, type NamePlacement, type NamesInput, type Rect, SV_NOTE } from './names.ts';

/** The numbers the names read (the lobule's model: the pressures at the ends and in the sinusoid, the hepatic lymph and its protein). */
export interface CapModel { P1: number; P2: number; P3: number; lymph: number; lyProt: number }

/** What the layer needs of the view: its names layout and where a place of the plane (µm along, µm across with y down as the shader has it) is on the canvas. */
export interface CapView {
  names(inp: Omit<NamesInput, 'g' | 'act' | 'portrait'>): NamePlacement[];
  readonly porosity: number;
}
export interface CapCtx {
  view: CapView;
  /** a place of the plane on the canvas now, CSS px */
  proj(xum: number, yDown: number): [number, number];
  vp: Vp & { safe?: { top: number } };
  measure: Measure;
  /** the canvas's size, the free room the cards leave (px) and the top inset the names stay under */
  stage: { w: number; h: number };
  free: Rect;
  insTop: number;
  /** the model, or null before the first frame (the readings read "?") */
  model: CapModel | null;
  /** the name a tap explained (it takes one more line), and the terms a slide lights */
  explain?: NameKey | null;
  lit?: ReadonlySet<string>;
}

const fmt1 = (v: number): string => (Number.isFinite(v) ? (v < 0 && Number(Math.abs(v).toFixed(1)) !== 0 ? '−' : '') + Math.abs(v).toFixed(1) : '—');

/** The readings, as 2D writes them (`value~unit`: the ends and the sinusoid carry the number alone, the unit is said once in the pressure legend). */
export function readings(m: CapModel | null, porosity: number): NamesInput['text'] {
  const pct = `${Math.round(Math.min(1, Math.max(0, porosity)) * 100)}%~open`;
  if (!m) return { inValue: '?', outValue: '?', sin: '?', fen: pct, lymph: '?', lymphTall: '?' };
  const lym = `${lymphText(m.lymph)}~${LYMPH_UNIT}`, prot = `Protein ${Math.round(m.lyProt * 100)}%`;
  // (the no-break space before the dot keeps a wide caption on one line; a tall one splits there, the reading under its name)
  return { inValue: fmt1(m.P1), outValue: fmt1(m.P3), sin: fmt1(m.P2), fen: pct, lymph: `${lym} · ${prot}`, lymphTall: `${lym} · ${prot}` };
}

/** The lines a name is written in: its words (one a line), then each reading (a figure and its unit), then, while it is explained, the one line saying what the part is. */
export interface Lines { name: string[]; value: string[]; note: string | null }
export function linesOf(name: string, value: string, key: NameKey, explain: NameKey | null | undefined): Lines {
  return {
    name: name.split('\n'),
    value: value ? value.split(' · ').map((l) => l.replace('~', ' ').replace(/ · /, ' · ')) : [],
    note: explain === key ? SV_NOTE[key] ?? null : null,
  };
}
/** A name's box on the canvas: each line at the label type's size, the 2D padding round them. */
export function boxOf(l: Lines, vp: Vp, measure: Measure): [number, number] {
  const rows = [...l.name.map((t) => lineSize([nameRun(t)], vp, measure)), ...l.value.map((t) => lineSize([valueRun(t)], vp, measure)), ...(l.note ? [lineSize([nameRun(l.note)], vp, measure)] : [])];
  const w = Math.max(...rows.map((r) => r.w), 0), h = rows.reduce((s, r) => s + r.h, 0);
  return [w + LS.PAD.x * 2, h + LS.PAD.y * 2];
}

/** Lays the sinusoid's names out for the canvas as it stands. A tall canvas runs the sinusoid top to bottom; the names are always level (no turn is ever written to one). */
export function buildSinusoidNames(c: CapCtx): NamePlacement[] {
  const o = c.proj(0, 0), a = c.proj(1, 0);
  const k = Math.hypot(a[0] - o[0], a[1] - o[1]);
  if (!(k > 0)) return [];
  return c.view.names({
    W: c.stage.w, H: c.stage.h, C: o, k, free: c.free, insTop: c.insTop,
    text: readings(c.model, c.view.porosity), lit: c.lit,
    measure: (key, name, value) => boxOf(linesOf(name, value, key, c.explain), c.vp, c.measure),
  });
}

/** Whether the names are on: only while the sinusoid is the view and drawn (nothing of them stands in the lobule, the body or the Circuit). */
export const namesOn = (view: string, drawn: boolean): boolean => view === 'sinusoid' && drawn;
/** A name's translate and size on the canvas (px): its box's corner. Never a turn: a tall screen's names read across. */
export const placeOf = (p: Pick<NamePlacement, 'cx' | 'cy' | 'w' | 'hh'>): { x: number; y: number; w: number; h: number } => ({ x: p.cx - p.w / 2, y: p.cy - p.hh / 2, w: p.w, h: p.hh });

/** 2D's side margin of the room the names stand in (sinusoid-view.js freeRect: l = 12, r = W - 12) and the breathing room under the top bar (its `+ 8`). */
export const NAMES_SIDE = 12, NAMES_TOP = 8;
/** The room the names keep to: the figure's own room (the one the camera frames the sinusoid in: the screen less the top bar and the foot, or what the cards leave in a talk), kept 12 px in from its sides
 *  and 8 under its top, as 2D's freeRect keeps it. It is NOT `boxes.free` (the cards' plan): in free play that is never published, stays empty, and put every name against the left edge. */
export function namesFree(room: { x: number; y: number; w: number; h: number } | null | undefined, stage: { w: number; h: number }): Rect {
  const r = room && room.w > 1 && room.h > 1 ? room : { x: 0, y: 0, w: stage.w, h: stage.h };
  const l = r.x + NAMES_SIDE, t = r.y + NAMES_TOP, rr = r.x + r.w - NAMES_SIDE, b = r.y + r.h;
  return { l: Math.round(l), t: Math.round(t), r: Math.round(Math.max(l + 80, rr)), b: Math.round(Math.max(t + 80, b)) };
}
