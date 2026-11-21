// "Copy figure" and "Save figure" (Figure menu): the figure as a picture, for a slide, a handout or a message. The pure part is here and is tested in node (tests/figure-image.test.ts):
// what the labels look like on the screen (`Seen`, read from the label layer's elements by figure-image-dom.ts) becomes the drawing commands for the picture, scaled to the canvas's own pixels,
// with everything hidden, faded out or off the stage left out. The canvas is read in the task that draws it (src/debug/look-hook.ts), so no `preserveDrawingBuffer` is kept.

/** CSS pixels. */
export interface Box { x: number; y: number; w: number; h: number }
export interface SeenFont { size: number; weight: string; family: string }
/** A piece of text as it stands on the screen: `x` the left of its box and `y` the middle of its line. */
export interface SeenText { text: string; x: number; y: number; font: SeenFont; fill: string; halo: string; haloW: number; alpha: number }
export interface SeenLine { x1: number; y1: number; x2: number; y2: number; w: number; color: string; alpha: number }
export interface SeenRing { x: number; y: number; r: number; w: number; stroke: string; fill: string; alpha: number }
export interface Seen { texts: SeenText[]; lines: SeenLine[]; rings: SeenRing[] }

export type Cmd =
  | { op: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; color: string; alpha: number }
  | { op: 'ring'; x: number; y: number; r: number; w: number; stroke: string; fill: string; alpha: number }
  | { op: 'text'; text: string; x: number; y: number; font: string; fill: string; halo: string; haloW: number; alpha: number };

/** Below this opacity a label is on its way in or out and is left out (the picture shows what is settled). */
export const MIN_ALPHA = 0.5;

const inside = (b: Box, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
const cssFont = (f: SeenFont, scale: number) => `${f.weight} ${Math.round(f.size * scale * 100) / 100}px ${f.family}`;

/** The drawing commands of a picture of `stage` (CSS px) made `scale` times as large: leaders, then rings, then text (each text's halo first, as the labels' own paint-order). */
export function figureCmds(seen: Seen, stage: Box, scale: number): Cmd[] {
  const at = (x: number, y: number) => [(x - stage.x) * scale, (y - stage.y) * scale] as const;
  const out: Cmd[] = [];
  for (const l of seen.lines) {
    if (l.alpha < MIN_ALPHA || !(inside(stage, l.x1, l.y1) || inside(stage, l.x2, l.y2))) continue;
    const [x1, y1] = at(l.x1, l.y1), [x2, y2] = at(l.x2, l.y2);
    out.push({ op: 'line', x1, y1, x2, y2, w: Math.max(1, l.w * scale), color: l.color, alpha: l.alpha });
  }
  for (const r of seen.rings) {
    if (r.alpha < MIN_ALPHA || !inside(stage, r.x, r.y)) continue;
    const [x, y] = at(r.x, r.y);
    out.push({ op: 'ring', x, y, r: r.r * scale, w: r.w * scale, stroke: r.stroke, fill: r.fill, alpha: r.alpha });
  }
  for (const t of seen.texts) {
    if (!t.text.trim() || t.alpha < MIN_ALPHA || !inside(stage, t.x, t.y)) continue;
    const [x, y] = at(t.x, t.y);
    out.push({ op: 'text', text: t.text, x, y, font: cssFont(t.font, scale), fill: t.fill, halo: t.halo, haloW: t.haloW * scale, alpha: t.alpha });
  }
  return out;
}

/** The file's name: what the picture shows, so a folder of them reads. */
export function figureFileName(view: string, patient: string | null): string {
  const part = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return ['portal-pressure', part(view), patient ? part(patient) : ''].filter(Boolean).join('-') + '.png';
}
