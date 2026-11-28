// The wireframe of a slide and the words about its framing, drawn from the same numbers the scene uses: the organs' placed outlines and the vessels' placed courses (scene/anatomy/source.ts)
// projected through the slide's camera (frame.ts), and the cards where the layout planner puts them. Flat, no shading, no text wrapping, no look: it shows where things stand and how big,
// never how they are painted. One slide is a few hundred microseconds of arithmetic, so it needs no GPU and no browser.
import { PLACED_ORGAN_RINGS, PLACED_ORGAN_BOX, PLACED_ORGAN_NAMES } from '../../../scene/anatomy/source.ts';
import { MAPPED } from '../../../scene/vessels/network.ts';
import { stationDot } from '../../../decks/hp/cams.ts';
import { stationById } from '../../../scene/labels/stations.ts';
import { x3, y3 } from '../../../scene/frame2d.ts';
import { inside, type Framing, type V3 } from './frame.ts';

/** The organs' display names, by ring key. */
const ORGAN_WORD: Readonly<Record<string, string>> = {
  liver: 'liver', stomach: 'stomach', esophagus: 'oesophagus', spleen: 'spleen', 'kidney-l': 'left kidney', heart: 'heart', bowel: 'small bowel', colon: 'colon',
};
export const organWord = (k: string): string => ORGAN_WORD[k] ?? k;

export interface OrganView {
  key: string;
  word: string;
  /** the share of the organ's drawn outline that stands inside the free room (0 to 1) */
  shown: number;
  /** its width and height as a share of the room's */
  span: [number, number];
  centre: [number, number];
}
export interface StationView {
  id: string;
  name: string;
  x: number;
  y: number;
  /** how many px the dot stands inside the room's edge (under 40 is crowding the edge, negative is out) */
  clear: number;
  where: string;
}
export interface VesselView {
  label: string;
  host: string;
  tone: string;
  /** how many of the course's points stand in the room, of how many */
  inRoom: number;
  points: number;
  /** the vessel's drawn width in px */
  widthPx: number;
}
export interface Survey { organs: OrganView[]; stations: StationView[]; vessels: VesselView[]; /** the share of the whole figure's height the room shows, 0 to 1 and over */ heightShown: number }

const r1 = (n: number) => Math.round(n * 10) / 10;
const third = (v: number, lo: number, hi: number, names: [string, string, string]) => (v < lo + (hi - lo) / 3 ? names[0] : v > lo + (2 * (hi - lo)) / 3 ? names[2] : names[1]);

/** Each organ's outline in screen px (null when it is not on the figure): the ring points mapped to the scene at the organ's front depth, then through the camera. */
function organRings(fr: Framing): Map<string, { x: number; y: number }[][]> {
  const out = new Map<string, { x: number; y: number }[][]>();
  for (const [key, rings] of Object.entries(PLACED_ORGAN_RINGS)) {
    const box = PLACED_ORGAN_BOX[key], z = box ? box[5] : 0;
    const drawn: { x: number; y: number }[][] = [];
    for (const ring of rings as readonly (readonly (readonly [number, number])[])[]) {
      const pts = ring.map((p) => fr.project([x3(p[0]), y3(p[1]), z] as V3)).filter((p): p is { x: number; y: number; z: number } => !!p);
      if (pts.length > 2) drawn.push(pts);
    }
    if (drawn.length) out.set(key, drawn);
  }
  return out;
}

const bounds = (rings: { x: number; y: number }[][]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
};

/**
 * Every vessel the figure draws, in screen px: the network's own courses and radii (scene/vessels/network.ts, the vessels the tubes are built from).
 * A collateral or a shunt is only there once the patient has opened it, which node does not know: it is listed `faint`.
 */
interface Line { id: string; host: string; label: string; tone: string; w: number; faint: boolean; pts: { x: number; y: number }[] }
function vesselLines(fr: Framing): Line[] {
  const out: Line[] = [];
  for (const v of MAPPED) {
    const pts = v.pts.map((p) => fr.project(p as V3)).filter((p): p is { x: number; y: number; z: number } => !!p);
    if (pts.length < 2) continue;
    out.push({ id: v.id, host: v.host, label: v.label, tone: v.tone, w: Math.max(1.2, 2 * v.radius * fr.pxPerUnit), faint: v.kind === 'collateral' || v.kind === 'shunt', pts });
  }
  return out;
}

/**
 * What the camera shows: the organs (how much of each is in the room and how big), the labelled stations (where they stand and how far
 * from the room's edge), the vessels in the room and the share of the figure's height.
 */
export function surveyOf(fr: Framing, labels: readonly string[], whole: { half: readonly [number, number] }): Survey {
  const room = fr.free, organs: OrganView[] = [];
  for (const [key, rings] of organRings(fr)) {
    const b = bounds(rings);
    const shown = inside(room, b);
    organs.push({ key, word: organWord(key), shown, span: [r1((b.x1 - b.x0) / room.w), r1((b.y1 - b.y0) / room.h)], centre: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2] });
  }
  organs.sort((a, b) => b.shown * b.span[0] * b.span[1] - a.shown * a.span[0] * a.span[1]);
  const stations: StationView[] = [];
  for (const id of labels) {
    const at = stationDot(id);
    if (!at) continue;
    const p = fr.project([at[0], at[1], 0.03]);
    if (!p) continue;
    const clear = Math.min(p.x - room.x, room.x + room.w - p.x, p.y - room.y, room.y + room.h - p.y);
    const row = third(p.y, room.y, room.y + room.h, ['upper', 'middle', 'lower']);
    const col = third(p.x, room.x, room.x + room.w, ['left', 'centre', 'right']);
    stations.push({ id, name: stationById(id)?.name ?? id, x: p.x, y: p.y, clear: Math.round(clear), where: `${row} ${col}` });
  }
  const byHost = new Map<string, VesselView>();
  for (const v of vesselLines(fr)) {
    if (v.faint) continue;
    const n = v.pts.filter((p) => p.x >= room.x && p.x <= room.x + room.w && p.y >= room.y && p.y <= room.y + room.h).length;
    const cur = byHost.get(v.host) ?? { label: v.label, host: v.host, tone: v.tone, inRoom: 0, points: 0, widthPx: 0 };
    cur.inRoom += n; cur.points += v.pts.length; cur.widthPx = Math.max(cur.widthPx, r1(v.w));
    byHost.set(v.host, cur);
  }
  const vessels = [...byHost.values()].filter((v) => v.inRoom > 0).sort((a, b) => b.inRoom - a.inRoom);
  const heightShown = (2 * fr.seen[1]) / (2 * whole.half[1]);
  return { organs, stations, vessels, heightShown };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const path = (pts: { x: number; y: number }[], close: boolean) => pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p.x)} ${r1(p.y)}`).join('') + (close ? 'Z' : '');

export interface WireOptions {
  title: string;
  /** what to say about the view when the figure is not the body (lobule, sinusoid, circuit) */
  notDrawn?: string;
  labels: readonly string[];
  cards: { name: string; note: string }[];
}

/** The slide as a flat SVG: the screen, the room the cards leave, the organs, the vessels, the stations the slide labels, and the planned cards. Self-contained, light on dark-free paper tones. */
export function wireSvg(fr: Framing, o: WireOptions): string {
  const { vp, plan, free } = fr;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vp.w} ${vp.h}" width="${Math.min(vp.w, 560)}" role="img" aria-label="${esc(o.title)}" font-family="Inter, system-ui, sans-serif">`);
  out.push(`<rect width="${vp.w}" height="${vp.h}" fill="#f6f3ed"/>`);
  out.push(`<rect x="${r1(free.x)}" y="${r1(free.y)}" width="${r1(free.w)}" height="${r1(free.h)}" fill="none" stroke="#9aa0a6" stroke-width="1" stroke-dasharray="6 5"/>`);
  if (o.notDrawn) {
    out.push(`<text x="${r1(free.x + free.w / 2)}" y="${r1(free.y + free.h / 2)}" text-anchor="middle" font-size="${Math.max(12, Math.round(vp.h / 45))}" fill="#6b6b6b">${esc(o.notDrawn)}</text>`);
  } else {
    for (const [key, rings] of organRings(fr)) {
      out.push(`<g fill="#e8d9cc" stroke="#b79d8c" stroke-width="1.2" opacity="0.9">${rings.map((r) => `<path d="${path(r, true)}"/>`).join('')}</g>`);
    }
    const col = { portal: '#3b6fb5', sys: '#a84b4b', artery: '#d08a2e' } as Record<string, string>;
    for (const v of vesselLines(fr)) {
      const look = `stroke="${col[v.tone] ?? '#777'}" stroke-width="${r1(v.w)}" opacity="${v.faint ? 0.35 : 0.85}"${v.faint ? ' stroke-dasharray="4 4"' : ''}`;
      out.push(`<path d="${path(v.pts, false)}" fill="none" ${look} stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    for (const [name, at] of Object.entries(PLACED_ORGAN_NAMES) as [string, readonly [number, number, number]][]) {
      const p = fr.project([x3(at[0]), y3(at[1]), at[2]]);
      if (!p || p.x <= free.x || p.x >= free.x + free.w || p.y <= free.y || p.y >= free.y + free.h) continue;
      const fs = Math.max(10, Math.round(vp.h / 70));
      out.push(`<text x="${r1(p.x)}" y="${r1(p.y)}" text-anchor="middle" font-size="${fs}" fill="#8a7a6e">${esc(name)}</text>`);
    }
    for (const id of o.labels) {
      const at = stationDot(id), p = at ? fr.project([at[0], at[1], 0.03]) : null;
      if (!p) continue;
      const dot = Math.max(4, Math.round(vp.h / 150)), fs = Math.max(11, Math.round(vp.h / 60));
      out.push(`<circle cx="${r1(p.x)}" cy="${r1(p.y)}" r="${dot}" fill="#222"/>`);
      out.push(`<text x="${r1(p.x + 8)}" y="${r1(p.y - 8)}" font-size="${fs}" font-weight="600" fill="#222">${esc(stationById(id)?.abbr ?? id)}</text>`);
    }
  }
  plan.cards.forEach((c, i) => {
    const info = o.cards[i];
    const { x, y, w, h } = c.rect;
    out.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="14" fill="#ffffff" fill-opacity="0.72" stroke="#444" stroke-width="1.5"/>`);
    const fs = Math.max(12, Math.round(vp.h / 48));
    out.push(`<text x="${r1(x + 14)}" y="${r1(y + 14 + fs)}" font-size="${fs}" font-weight="700" fill="#222">${esc(info?.name ?? c.id)}</text>`);
    if (info?.note) out.push(`<text x="${r1(x + 14)}" y="${r1(y + 22 + 2 * fs)}" font-size="${Math.round(fs * 0.85)}" fill="#555">${esc(info.note)}</text>`);
  });
  const b = plan.bar.rect;
  out.push(`<rect x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" rx="${r1(b.h / 2)}" fill="#d8d4cc" stroke="#999"/>`);
  out.push(`</svg>`);
  return out.join('\n');
}
