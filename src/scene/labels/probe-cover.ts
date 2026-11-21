// The devices drawn OVER the labels. The labels are DOM above the canvas, so a probe (a mesh in the canvas) was always under a name or a number it lay across. Each device writes its solid body's outline
// here, in stage px, each frame (devices/probes/cover.ts); the label layer clips itself with the holes (clip-path, one write a frame). The hole grows from nothing with the device's own opacity, so a
// probe coming in or out eases the text away and back: nothing pops. Pure data and strings: node judges it.
const CAP = 4, MAXPTS = 96;
const pool: { n: number; a: number; xy: Float32Array }[] = [];
for (let i = 0; i < CAP; i++) pool.push({ n: 0, a: 0, xy: new Float32Array(MAXPTS * 2) });
let used = 0;
const BIG = 20000;

/** Starts a new frame's list. */
export function beginCover(): void { used = 0; }
/** Adds one outline (x, y pairs, px) of a device at opacity `alpha` (0..1); more than MAXPTS points are thinned. */
export function addCover(pts: ArrayLike<number>, alpha: number): void {
  if (used >= CAP || !(alpha > 0.01) || pts.length < 6) return;
  const c = pool[used++]!, total = pts.length >> 1, step = Math.max(1, Math.ceil(total / MAXPTS));
  let n = 0;
  for (let i = 0; i < total && n < MAXPTS; i += step) { c.xy[n * 2] = pts[i * 2]!; c.xy[n * 2 + 1] = pts[i * 2 + 1]!; n++; }
  c.n = n; c.a = Math.min(1, alpha);
}
/** How many outlines the frame has. */
export const coverCount = (): number => used;
/** The label layer's clip-path for the frame: 'none' with no device, else the whole stage with each outline cut out (even-odd), each grown about its centre from nothing by its opacity. */
export function coverClip(): string {
  if (!used) return 'none';
  const r = (v: number): string => `${Math.round(v * 10) / 10}px`;
  let s = `polygon(evenodd,${-BIG}px ${-BIG}px,${BIG}px ${-BIG}px,${BIG}px ${BIG}px,${-BIG}px ${BIG}px,${-BIG}px ${-BIG}px`;
  for (let k = 0; k < used; k++) {
    const c = pool[k]!;
    let cx = 0, cy = 0;
    for (let i = 0; i < c.n; i++) { cx += c.xy[i * 2]!; cy += c.xy[i * 2 + 1]!; }
    cx /= c.n; cy /= c.n;
    const g = c.a * c.a * (3 - 2 * c.a);   // (eased: a probe at half strength cuts a hole a little under half its size)
    for (let i = 0; i < c.n; i++) s += `,${r(cx + (c.xy[i * 2]! - cx) * g)} ${r(cy + (c.xy[i * 2 + 1]! - cy) * g)}`;
    s += `,${r(cx + (c.xy[0]! - cx) * g)} ${r(cy + (c.xy[1]! - cy) * g)},${-BIG}px ${-BIG}px`;
  }
  return `${s})`;
}
