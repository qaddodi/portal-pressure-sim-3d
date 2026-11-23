// The lines of equal resistance name themselves "R = 8" in full. The 2D layout (layout.generated.js isoOf) keeps a name that finds no room at its ray's end as its bare number ("8", on the
// idea that the card's caption names the resistance), and takes that before a full name a few pixels further in along the ray: on a narrow plot "R = 32", "R = 16" and "R = 4" then stand
// beside a lone "8" (masld 9 on an iPhone, review bbe955e5 item 10). This looks for the full name further in, along the ray on either side, clear of everything the 2D layout kept clear of
// (the points, their names, the zones' words, the lines' names, the numbers), of the other names and of the other rays; where there is no such place the number alone stays.
import { est, isoRays } from './layout.generated.js';
import type { Box } from './model.ts';

type Label = { text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; box?: Box };
interface IsoLine { r: number; seg: { x1: number; y1: number; x2: number; y2: number }; label: Label }
const hit = (b: readonly number[], o: readonly number[]) => b[0]! < o[2]! && b[2]! > o[0]! && b[1]! < o[3]! && b[3]! > o[1]!;

export function fullIsoNames(lines: readonly IsoLine[] | null | undefined, pl: unknown, X: (v: number) => number, Y: (v: number) => number, fr: { L: number; R: number; T: number; B: number }, fs: number, avoid: readonly Box[]): IsoLine[] | null {
  if (!lines) return null;
  const rs = isoRays(pl, X, Y) as { lines: { r: number; atTop: boolean; seg: IsoLine['seg'] }[]; own: Box[][] } | null;
  const out: IsoLine[] = lines.map((l) => ({ ...l, label: { ...l.label } }));
  if (!rs) return out;
  const inside = (b: Box) => b[0] >= fr.L && b[2] <= fr.R + 6 && b[1] >= Math.min(fr.T, 0) && b[3] <= fr.B;
  // the steepest first, as the 2D layout names them, so each takes the room the ones before it left
  const order = out.map((_, k) => k).sort((a, b) => out[b]!.r - out[a]!.r);
  for (const k of order) {
    const l = out[k]!;
    if (/^R = /.test(l.label.text)) continue;
    const ki = rs.lines.findIndex((x) => x.r === l.r);
    if (ki < 0) continue;
    const ray = rs.lines[ki]!, { seg } = ray, len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) || 1, text = `R = ${l.r}`, w = est(text, fs, 0.62);
    const taken = out.filter((_, j) => j !== k).flatMap((o) => (o.label.box ? [o.label.box] : []));
    let found: Label | null = null;
    for (let s = 0; s <= len * 0.6 && !found; s += 4) {
      const px = seg.x2 - (seg.x2 - seg.x1) * s / len, py = seg.y2 - (seg.y2 - seg.y1) * s / len;
      for (const side of [0, 1]) {
        const anchor = (ray.atTop ? side === 0 : side === 1) ? 'start' : 'end';
        const x = anchor === 'start' ? px + (ray.atTop ? 5 : 4) : px - (ray.atTop ? 5 : 4);
        const y = ray.atTop ? py + fs * (s ? 0.45 : 0.95) : side === 0 ? py - 4 : py + fs * 0.95;
        const x0 = anchor === 'start' ? x : x - w, box: Box = [x0 - 2, y - fs * 0.8 - 2, x0 + w + 2, y + fs * 0.25 + 2];
        if (!inside(box) || taken.some((o) => hit(box, o)) || avoid.some((o) => hit(box, o))) continue;
        if (rs.own.some((mine, j) => j !== ki && mine.some((o) => hit(box, o)))) continue;
        found = { text, x, y, anchor, box };
        break;
      }
    }
    if (found) l.label = found;
  }
  return out;
}
