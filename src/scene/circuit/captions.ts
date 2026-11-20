// The words on the map: the zone titles along the top, the stations' names and readings, the lanes' captions, and the resistors' readings ("R liver x2.3"). This builds what the one label
// solver (labels/solver.ts) is given - every caption as an item with its forms, its preferred sides and its priority - from the map as it stands on the canvas; the solver places them clear
// of the cards, the vessels and each other. Pure: no DOM, no three.js (node judges it). The words, sides and priorities are the 2D app's (data.copied.ts, names.copied.ts).
import type { Box, Dir } from '../labels/geometry.ts';
import { LABEL_NAMES } from '../labels/names.copied.ts';
import type { Form, Item } from '../labels/solver.ts';
import { type Measure, type Run, type Vp, boxSize, nameRun, stationRuns, valueRun } from '../labels/type.ts';
import { CIRCUIT_LABELS, CIRCUIT_ZONES, LANE_CAPTIONS, LIVER_INNER, RES_FULL, RES_LABEL, ZONE_SHORT } from './data.copied.ts';
import { type ResKey, RES_OUTLINE, resAmp, resText } from './res-model.ts';

/** Turned upright, a side given on the map points somewhere else on the screen (2D TURN_DIR). */
export const TURN_DIR: Readonly<Record<string, Dir>> = { N: 'W', W: 'S', S: 'E', E: 'N', NE: 'NW', NW: 'SW', SW: 'SE', SE: 'NE' };

export type CapKind = 'station' | 'zone' | 'lane' | 'res';
/** What the layer writes into an element for a placed caption. */
export interface CapMeta {
  id: string;
  kind: CapKind;
  /** the words of each form: name (may be empty), then whether the reading follows; res: the lines */
  forms: readonly { name: string; value: boolean; key?: string }[];
  /** for a station: the node whose pressure it reads */
  node?: string;
  /** for a resistor: its key and the reading's text */
  res?: ResKey;
  label?: string;
  /** upright, a zone title or a lane that runs up the screen is written turned to read bottom to top (2D `it.rot`); the placed box is the turned one */
  rot?: boolean;
  /** a zone title that opens an organ's card when tapped (2D: the Liver's and the Heart's, there being no organ to click in the Circuit) */
  link?: string;
}

export interface CapCtx {
  /** a map point (units) on the canvas now (turned with the map, through the camera), CSS px */
  proj(x: number, y: number): [number, number];
  upright: boolean;
  vp: Vp;
  measure: Measure;
  /** a station has a drawn vessel at it (its dot shows) */
  stationOn(id: string): boolean;
  /** the lane's vessel is drawn solid now */
  laneDrawn(id: string): boolean;
  /** the visible part of the canvas (the room the figure has), for a zone title's centre */
  view: Box;
  /** zoomed in on the liver (x1.9 over the home zoom) or one of its stations picked: its inner stations show */
  liverOpen: boolean;
  /** zoomed in at all: the minor stations show too */
  zoomed: boolean;
  /** the stage is narrow (a phone): only the major stations show */
  compact: boolean;
  /** a map course's points (units) for a lane, and a station's place */
  laneCourse(id: string): readonly (readonly [number, number])[] | null;
  station(id: string): readonly [number, number] | null;
  /** the resistors that show and their ratios, the scale (px a map unit) and each line's width (px) */
  res: Readonly<Partial<Record<ResKey, number>>>;
  scale: number;
  resWidth(key: ResKey): number;
  /** the resistor's lane course (map units) for the collaterals' and the gut's zigzags */
  resLane(key: ResKey): readonly (readonly [number, number])[] | null;
  /** the stations that must stand (a slide names them, or one is picked) */
  must: ReadonlySet<string>;
  /** a box on the canvas that stands in the free room, off the cards, and on no vessel's line but `own`'s: where a lane's caption may go beside its lane (absent: any box) */
  clear?(box: Box, own: string): boolean;
  /** half the drawn width (px) of the vessel a station stands on: a name keeps that much further off (2D: `it.vw / 2`). Absent: 5. */
  halfW?(id: string): number;
}

/** The zone titles that open a card (2D stage-label-solve.js: `{ 'Liver · sinusoids': 'liver', Heart: 'heart' }`). */
/** A tier's name: its size, px, and its letter-spacing, em. */
export const ZONE_PX = 9.5;
export const ZONE_TRACK = 0.08;
export const ZONE_ORGAN: Readonly<Record<string, string>> = { 'Liver · sinusoids': 'liver', Heart: 'heart' };
/** The places along a lane its caption tries, in order (2D stage.js `laneAlt`: the middle first, then 0.3, 0.7, 0.15, 0.85 of its run). */
export const LANE_SPOTS: readonly number[] = [0.5, 0.3, 0.7, 0.15, 0.85];

/** The point a share `u` of the way along a polyline (by length), and the way it runs there. */
export function along(course: readonly (readonly [number, number])[], u: number): { p: [number, number]; q: [number, number] } {
  let total = 0;
  for (let i = 1; i < course.length; i++) total += Math.hypot(course[i]![0] - course[i - 1]![0], course[i]![1] - course[i - 1]![1]);
  const at = (f: number): [number, number] => {
    let want = Math.min(1, Math.max(0, f)) * total;
    for (let i = 1; i < course.length; i++) {
      const a = course[i - 1]!, b = course[i]!, d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (want <= d || i === course.length - 1) { const k = d > 1e-9 ? Math.min(1, want / d) : 0; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
      want -= d;
    }
    return [course[0]![0], course[0]![1]];
  };
  return { p: at(u), q: at(Math.min(1, u + 0.03)) };
}

const SHORT = LABEL_NAMES.SHORT as Record<string, string>;
const ABBR = LABEL_NAMES.ABBR as Record<string, string>;
/** The station ID -> the topology node whose pressure it reads (the same id: the 2D app's captions read the station's own). */
const readsNode = (id: string): string => id;

export interface Built { items: Item[]; meta: Map<string, CapMeta> }

/** The room's width along the zone band, px: the visible part of the band (the part on the canvas inside `view`). */
function bandSpan(ctx: CapCtx, x0: number, x1: number): { lo: number; hi: number; vertical: boolean; at: [number, number] } {
  const a = ctx.proj(x0, 60), b = ctx.proj(x1, 60), vertical = ctx.upright;
  const ca = vertical ? a[1] : a[0], cb = vertical ? b[1] : b[0];
  const lo = Math.min(ca, cb), hi = Math.max(ca, cb);
  const v0 = vertical ? ctx.view.y0 : ctx.view.x0, v1 = vertical ? ctx.view.y1 : ctx.view.x1;
  return { lo: Math.max(lo, v0), hi: Math.min(hi, v1), vertical, at: a };
}


/** A station's name in its next shorter form when 2D gave it none: its side word as a letter ("Left sinusoids" to "L sinusoids"). */
export function compactName(name: string): string | null {
  const m = /^(Left|Right|Middle) (.+)$/.exec(name);
  return m ? `${m[1]![0]} ${m[2]}` : null;
}

/** The least priority a station shows at (every one: the azygos, the lower IVC and the renal vein are named on a phone as on a desktop). */
export const MIN_PRI = 2;
function shows(id: string, ctx: CapCtx): boolean {
  const k = CIRCUIT_LABELS[id];
  if (!k) return false;
  if (ctx.must.has(id)) return true;
  if (!ctx.stationOn(id)) return false;
  if (LIVER_INNER.includes(id) && id !== 'HA' && !ctx.liverOpen) return false;
  // (every station is named, on a phone too: the solver gives a name its shorter forms and then its dot when two collide, the least important first)
  return k.pri >= MIN_PRI || id === 'HA' || ctx.zoomed;
}

export function buildCaptions(ctx: CapCtx): Built {
  const items: Item[] = [], meta = new Map<string, CapMeta>();
  const { vp, measure } = ctx;
  const form = (text: string, w: number, h: number): Form => ({ text, w, h });

  // ── the resistors' readings: where they have to stand ──
  const present = (['rGut', 'rColl', 'rLiver'] as const).filter((k) => ctx.res[k] != null);
  const keyOn = present[0] ?? null;   // ("vs healthy liver" rides once, on the outermost reading)
  for (const key of present) {
    const ratio = ctx.res[key]!;
    const runs: Run[] = [{ ...nameRun(RES_LABEL[key]!), size: 11.5, weight: 600 }, { ...valueRun(resText(ratio), false), size: 11.5, weight: 650 }];
    const b1 = boxSize(runs, vp, measure);
    let w = b1.w, h = b1.h;
    const keyed = keyOn === key;
    let keyH = 0, keyW = 0;
    if (keyed) { const kb = boxSize([{ ...nameRun('vs healthy liver'), size: 9.5, weight: 500 }], vp, measure); keyW = kb.w; keyH = kb.h; w = Math.max(w, keyW); h += keyH; }
    let cx: number, cy: number;
    if (key === 'rLiver') { [cx, cy] = ctx.proj(850, 345); } else {
      const course = ctx.resLane(key);
      if (!course) continue;
      const mid = course[Math.floor((course.length - 1) / 2)]!, nxt = course[Math.min(course.length - 1, Math.floor((course.length - 1) / 2) + 1)]!;
      const [ax, ay] = ctx.proj(mid[0], mid[1]), [bx, by] = ctx.proj(nxt[0], nxt[1]);
      let tx = bx - ax, ty = by - ay;
      const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      let nx = -ty, ny = tx;
      if (Math.abs(ny) >= Math.abs(nx) ? ny > 0 : nx < 0) { nx = -nx; ny = -ny; }   // (up, else to the right)
      const band = Math.max(resAmp(ctx.scale) * ctx.scale, 8) + ctx.resWidth(key) / 2 + RES_OUTLINE;
      let off = band + 6 + Math.abs(nx) * w / 2 + Math.abs(ny) * h / 2;
      off = Math.max(off, 0);
      cx = ax + nx * off; cy = ay + ny * off;
    }
    const id = `res:${key}`;
    items.push({ id, ax: cx, ay: cy, au: 0.5, forms: [form(id, w, h)], pri: 100, must: true, region: true });
    meta.set(id, { id, kind: 'res', forms: [{ name: RES_LABEL[key]!, value: true, key: keyed ? 'vs healthy liver' : undefined }], res: key, label: `${RES_FULL[key]}: ${resText(ratio)} the healthy liver's resistance` });
  }

  // ── the zone titles ──
  // (Upright, the title runs up the map's left edge, turned to read bottom to top, centred on the visible part of its band; it keeps 8 px from the canvas's edge, and a wide one 14 px from its top.)
  for (const [txt, x0, x1] of CIRCUIT_ZONES) {
    const span = bandSpan(ctx, x0, x1);
    const tries = [txt, ...(ZONE_SHORT[txt] ?? [])].map((t) => t.toUpperCase());
    for (const t of tries) {
      // (a tier's name is set in small capitals, a little spaced out: the box takes the spacing's width too)
      const b0 = boxSize([{ ...nameRun(t), size: ZONE_PX, weight: 700 }], vp, measure), b = { ...b0, w: b0.w + ZONE_TRACK * ZONE_PX * t.length };
      const need = span.vertical ? b.h : b.w;
      if (span.hi - span.lo < need + 8) continue;
      const along = (span.lo + span.hi) / 2;
      const px = span.vertical ? Math.max(span.at[0], ctx.view.x0 + b.h / 2 + 8) : along;
      const py = span.vertical ? along : Math.max(span.at[1], ctx.view.y0 + b.h / 2 + 2);
      const id = `z:${txt}`;
      items.push({ id, ax: px, ay: py, au: 0.5, forms: [span.vertical ? form(t, b.h, b.w) : form(t, b.w, b.h)], pri: 60, region: true });
      meta.set(id, { id, kind: 'zone', forms: [{ name: t, value: false }], rot: span.vertical, link: ZONE_ORGAN[txt] });
      break;
    }
  }

  // ── the stations, by priority ──
  const pri = LABEL_NAMES.CIRCUIT_PRI as Record<string, number>;
  for (const id of Object.keys(CIRCUIT_LABELS)) {
    if (!shows(id, ctx)) continue;
    const at = ctx.station(id);
    if (!at) continue;
    const name = SHORT[id] ?? id, abbr = ABBR[id] ?? null;
    const [ax, ay] = ctx.proj(at[0], at[1]);
    const mk = (n: string, v: boolean): { f: Form; name: string } => { const b = boxSize(stationRuns(n, v, false), vp, measure); return { f: form(n, b.w, b.h), name: n }; };
    const full = mk(name, true), forms = [full], formMeta = [{ name, value: true }];
    // (a name with no abbreviation of its own is shortened before it is given up: "Left sinusoids 7.3" beside the right one's on a phone stood as a bare "7.3", Mohammad 20 Nov)
    const short = abbr && abbr !== name ? abbr : compactName(name);
    if (short && short !== name) { forms.push(mk(short, true)); formMeta.push({ name: short, value: true }); }
    forms.push(mk('', true)); formMeta.push({ name: '', value: true });
    const dirs = CIRCUIT_LABELS[id]!.dirs.map((d) => (ctx.upright ? TURN_DIR[d] : d) as Dir);
    items.push({ id, ax, ay, au: 0.5, forms: forms.map((x) => x.f), pri: ctx.must.has(id) ? 100 : pri[id] ?? CIRCUIT_LABELS[id]!.pri, must: ctx.must.has(id), dirs, vw: ctx.halfW?.(id) ?? 5 });
    meta.set(id, { id, kind: 'station', forms: formMeta, node: readsNode(id) });
  }

  // ── the lanes' captions, beside their runs (the last to stand) ──
  for (const [id, cap] of Object.entries(LANE_CAPTIONS)) {
    if (!ctx.laneDrawn(id)) continue;
    const course = ctx.laneCourse(id);
    if (!course || course.length < 2) continue;
    // (a lane with a resistor's zigzag on it is captioned in two lines, short enough to sit beside the zigzag)
    const zig = (id === 'C1b' && ctx.res.rColl != null) || (id === 'A_SMA' && ctx.res.rGut != null);
    const cut = !zig ? -1 : cap.includes(' → ') ? cap.indexOf(' → ') : cap.lastIndexOf(' ', cap.length / 2);
    const lines = cut > 0 ? [cap.slice(0, cut), cap.slice(cut + 1)] : [cap];
    const sizes = lines.map((l) => boxSize([{ ...nameRun(l), size: 10, weight: 550 }], vp, measure));
    const w = Math.max(...sizes.map((s) => s.w)), h = sizes.reduce((a, s) => a + s.h, 0);
    // The caption stands beside its lane at the first of its spots where no other vessel touches it and it is in the free room (2D laneU / laneAlt: N then S of a run, 3 px and then 12 px off the
    // lane's edge; upright, one that runs up the screen is turned and goes E then W of it); with no such spot it takes the middle's, as before.
    const pts = (u: number) => { const { p, q } = along(course, u); const [ax, ay] = ctx.proj(p[0], p[1]), [bx, by] = ctx.proj(q[0], q[1]); return { ax, ay, bx, by }; };
    const place = (u: number): { cx: number; cy: number; rot: boolean; box: Box } | null => {
      const { ax, ay, bx, by } = pts(u);
      const rot = ctx.upright && Math.abs(by - ay) > Math.abs(bx - ax) * 1.2;
      const ww = rot ? h : w, hh = rot ? w : h;
      const vertical = !rot && Math.abs(by - ay) > Math.abs(bx - ax);
      const half = 3 + 2.5;
      const spots: [number, number][] = rot || vertical ? [[1, 0], [-1, 0]] : [[0, -1], [0, 1]];
      for (const gap of [half, 12 + 2.5]) for (const [sx, sy] of spots) {
        const cx = ax + sx * (ww / 2 + gap), cy = ay + sy * (hh / 2 + gap);
        const box = { x0: cx - ww / 2 - 2, y0: cy - hh / 2 - 2, x1: cx + ww / 2 + 2, y1: cy + hh / 2 + 2 };
        if (!ctx.clear || ctx.clear(box, id)) return { cx, cy, rot, box };
      }
      return null;
    };
    let got: ReturnType<typeof place> = null;
    if (ctx.clear) for (const u of LANE_SPOTS) { got = place(u); if (got) break; }
    if (!got) {
      // (no clear spot: the middle's, beside it, as every lane had been)
      const { ax, ay, bx, by } = pts(0.5);
      const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay), rot = ctx.upright && Math.abs(by - ay) > Math.abs(bx - ax) * 1.2, gap = 5;
      const ww = rot ? h : w;
      got = { cx: horizontal ? ax : ax + ww / 2 + gap, cy: horizontal ? ay - h / 2 - gap : ay, rot, box: { x0: 0, y0: 0, x1: 0, y1: 0 } };
    }
    const fw = got.rot ? h : w, fh = got.rot ? w : h;
    items.push({ id: `lane:${id}`, ax: got.cx, ay: got.cy, au: 0.5, forms: [form(cap, fw, fh)], pri: 1, region: true });
    meta.set(`lane:${id}`, { id: `lane:${id}`, kind: 'lane', forms: [{ name: lines.join('\n'), value: false }], rot: got.rot });
  }
  return { items, meta };
}
