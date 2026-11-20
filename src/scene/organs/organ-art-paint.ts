// Paints the 2D figure's gut art and organ surface lines (data: public/anatomy/organ-art.json, copied by scripts/copy-organ-art.mjs) into a 2D canvas context, in 2D's own
// classes and order, in a look's tones. The result is a texture laid on the organ's pillow (organ-art.ts). No DOM here: the context is passed in, so a test can hand it a recorder.
// Every class below is a rule of the 2D stylesheet (styles/app-06-plate.css: .oc-*, .ob-*, .org-detail .od-*); the copy script fails when one of them changes there.

export type Rgb = readonly [number, number, number];
export interface ArtLeaf { c: string; s: number[][]; z?: number[]; w?: number; t?: [number, number] }
export interface ArtGroup { clip?: string; op?: number; kids: ArtNode[] }
export type ArtNode = ArtLeaf | ArtGroup;
export interface Art { tone: string; box: [number, number, number, number]; clips: Record<string, number[]>; kids: ArtNode[] }
export interface ArtTokens { hi: Rgb; hiK: number; rimK: number; ao: readonly [number, number, number, number] }

/** What the painter needs of a canvas 2D context (and of the one it makes for a group's opacity). */
export interface Ctx2D {
  save(): void; restore(): void; setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void; translate(x: number, y: number): void;
  clip(path: Path2D): void; fill(path: Path2D): void; stroke(path: Path2D): void; drawImage(img: never, x: number, y: number): void;
  fillStyle: string; strokeStyle: string; lineWidth: number; lineCap: string; lineJoin: string; globalAlpha: number;
}
export interface Surface { ctx: Ctx2D; canvas: unknown }
export interface Env { path(): Path2D; surface(): Surface | null }

interface Colour { rgb: Rgb; a: number }
interface Style { fill?: Colour; stroke?: Colour; w?: number; cap?: 'butt' | 'round'; join?: 'round' | 'miter' }
/** The tones a class reads: the organ's three (--o1, --o2, --o3) and the look's light (--og-light), ao, hi, hi-k and gut-rim-k. */
export interface Tones { o1: Rgb; o2: Rgb; o3: Rgb; light: readonly [number, number, number, number]; tok: ArtTokens; soft: boolean; /** cel shaded: no light strokes (the colon's rim light), only flat tones */ cel?: boolean }

const mixc = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] * k + b[0] * (1 - k), a[1] * k + b[1] * (1 - k), a[2] * k + b[2] * (1 - k)];
const solid = (rgb: Rgb, a = 1): Colour => ({ rgb, a });

/** A class as the 2D stylesheet draws it. `o1` for the small bowel's classes in Soft leans toward the middle tone (app-06-plate.css, "Soft only"). */
export function styleOf(cls: string, t: Tones, w?: number): Style {
  const ao: Colour = { rgb: [t.tok.ao[0], t.tok.ao[1], t.tok.ao[2]], a: t.tok.ao[3] };
  const light = (k: number): Colour => ({ rgb: [t.light[0], t.light[1], t.light[2]], a: t.light[3] * k });
  const ob1: Rgb = t.soft ? mixc(t.o1, t.o2, 0.65) : t.o1;   // (--og-gut-1 at 65%, --og-gut-2)
  const hair = (sw: number, a: number): Style => ({ stroke: solid(t.o3, a), w: sw, join: 'round', cap: 'round' });
  switch (cls) {
    // the small bowel's loops: strokes only, butt ends, round joins, the width the markup gives
    case 'ob-ao': return { stroke: ao, w, cap: 'butt', join: 'round' };
    case 'ob-deep': return { stroke: solid(mixc(ob1, t.o2, 0.4)), w, cap: 'butt', join: 'round' };
    case 'ob-space': { const c = solid(mixc(ob1, t.o2, 0.4)); return { fill: c, stroke: c, w, cap: 'butt', join: 'round' }; }
    case 'ob-rim': return { stroke: solid(mixc(ob1, t.o3, t.tok.rimK)), w, cap: 'butt', join: 'round' };
    case 'ob-edge': return { stroke: solid(mixc(ob1, t.o3, 0.58)), w, cap: 'butt', join: 'round' };
    case 'ob-wall': return { stroke: solid(ob1), w, cap: 'butt', join: 'round' };
    case 'ob-shade': return { stroke: solid(mixc(ob1, t.o2, 0.5)), w, cap: 'butt', join: 'round' };
    case 'ob-hi': return { stroke: solid(mixc(ob1, t.tok.hi, 1 - t.tok.hiK)), w, cap: 'butt', join: 'round' };
    // the colon
    case 'oc-ao': return { fill: ao, stroke: ao, w: 8, join: 'round', cap: 'round' };
    case 'oc-o1': return { fill: solid(t.o1) };
    case 'oc-wall': return { fill: solid(t.o2, 0.49), ...hair(0.84, 0.42) };
    case 'oc-pouch': return { fill: solid(t.o2, 0.42), ...hair(0.84, 0.42) };
    case 'oc-tail': return { fill: solid(t.o2, 0.5) };
    case 'oc-line': return hair(0.84, 0.42);
    case 'oc-valve': return hair(1, 0.35);
    case 'oc-band': return { fill: solid(t.o1), ...hair(0.9, 0.45) };
    case 'oc-band-lit': return { fill: light(0.32) };
    case 'oc-shade': return { fill: solid(t.o3), stroke: solid(t.o3), w: 16, join: 'round', cap: 'round' };
    case 'oc-fold': return hair(1.6, 0.7);
    case 'oc-rim-shade s1': return { stroke: solid(t.o3, 0.08), w: 24, join: 'round', cap: 'round' };
    case 'oc-rim-shade s2': return { stroke: solid(t.o3, 0.12), w: 14, join: 'round', cap: 'round' };
    case 'oc-rim-shade s3': return { stroke: solid(t.o3, 0.18), w: 6, join: 'round', cap: 'round' };
    case 'oc-rim-light': return { stroke: light(t.cel ? 0 : 0.22), w: 4, join: 'round', cap: 'round' };
    // the lines an organ carries on its surface
    case 'od-fine': return { stroke: solid(t.o3, 0.55), w: 0.9 };
    case 'od-fold': return { stroke: solid(t.o3, 0.16), w: 1.4 };
    case 'cel-line': return { stroke: solid(t.o3, 0.9), w: 1.6, join: 'round', cap: 'round' };   // (cel shaded: the one thin even ink line)
    default: throw new Error(`organ art: no style for class "${cls}"`);
  }
}
/** Every class styleOf knows (the tests check the data uses no other). */
export const ART_CLASSES = ['ob-ao', 'ob-deep', 'ob-space', 'ob-rim', 'ob-edge', 'ob-wall', 'ob-shade', 'ob-hi', 'oc-ao', 'oc-o1', 'oc-wall', 'oc-pouch', 'oc-tail', 'oc-line', 'oc-valve', 'oc-band', 'oc-band-lit', 'oc-shade', 'oc-fold', 'oc-rim-shade s1', 'oc-rim-shade s2', 'oc-rim-shade s3', 'oc-rim-light', 'od-fine', 'od-fold', 'cel-line'];

const css = (c: Colour): string => `rgba(${Math.round(c.rgb[0] * 255)},${Math.round(c.rgb[1] * 255)},${Math.round(c.rgb[2] * 255)},${c.a})`;

function pathOf(env: Env, s: number[][], z?: number[]): Path2D {
  const p = env.path();
  s.forEach((pts, i) => {
    p.moveTo(pts[0]!, pts[1]!);
    for (let k = 2; k < pts.length; k += 2) p.lineTo(pts[k]!, pts[k + 1]!);
    if (z?.[i]) p.closePath();
  });
  return p;
}

/** Paints `art` into `ctx` (whose transform already maps 2D units to pixels, `setBase` restores it), the way the 2D stage's markup is painted: in order, clipped and faded as its groups say. */
export function paintArt(env: Env, ctx: Ctx2D, art: Art, t: Tones, setBase: (c: Ctx2D) => void): void {
  const clipPaths = new Map<string, Path2D>();
  const clipOf = (id: string): Path2D => { let p = clipPaths.get(id); if (!p) { p = pathOf(env, [art.clips[id]!], [1]); clipPaths.set(id, p); } return p; };
  const leaf = (c: Ctx2D, l: ArtLeaf): void => {
    const st = styleOf(l.c, t, l.w), p = pathOf(env, l.s, l.z);
    c.save();
    if (l.t) c.translate(l.t[0], l.t[1]);
    if (st.fill) { c.fillStyle = css(st.fill); c.fill(p); }
    if (st.stroke && (st.w ?? 1) > 0) {
      c.strokeStyle = css(st.stroke); c.lineWidth = st.w ?? 1; c.lineCap = st.cap ?? 'butt'; c.lineJoin = st.join ?? 'miter'; c.stroke(p);
    }
    c.restore();
  };
  const kids = (c: Ctx2D, list: ArtNode[]): void => {
    for (const k of list) {
      if (!('kids' in k)) { leaf(c, k); continue; }
      c.save();
      if (k.clip) c.clip(clipOf(k.clip));
      if (k.op !== undefined && k.op < 1) {
        // a group's opacity is the whole group at once (its fill and stroke overlap without adding): paint it on its own layer, then lay that on at the opacity
        const layer = env.surface();
        if (layer) {
          setBase(layer.ctx); kids(layer.ctx, k.kids);
          c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = k.op; c.drawImage(layer.canvas as never, 0, 0); c.globalAlpha = 1;
        } else kids(c, k.kids);
      } else kids(c, k.kids);
      c.restore();
    }
  };
  setBase(ctx);
  kids(ctx, art.kids);
}

/** The colon's art for the cel fill: only its haustra and fold lines, as one thin even ink line (no fills, no shade, no rim, no ao), clipped as 2D clips them. A class that draws a closed shape has its outline kept, its fill dropped. */
export function haustraOf(art: Art): Art {
  const keep = new Set(['oc-wall', 'oc-pouch', 'oc-line', 'oc-valve', 'oc-band', 'oc-fold']);
  const walk = (list: ArtNode[]): ArtNode[] => {
    const out: ArtNode[] = [];
    for (const k of list) {
      if ('kids' in k) { const kids = walk(k.kids); if (kids.length) out.push(k.clip ? { clip: k.clip, kids } : { kids }); } else if (keep.has(k.c)) out.push({ c: 'cel-line', s: k.s, z: k.z, t: k.t });
    }
    return out;
  };
  return { ...art, kids: walk(art.kids) };
}

/** The small bowel for the cel fill, drawn by rule: LOOPS broad loops in one serpentine across its box, each an even tube of the base tone between two thin ink lines (the fill under it is the banded cel fill: the art takes its shift),
 *  no stipple, no dashes, no shading. The ends of the serpentine lie outside the organ and are cut by it. */
export const BOWEL_LOOPS = 8;
export function paintBowelCel(ctx: Ctx2D, box: readonly [number, number, number, number], t: Tones, setBase: (c: Ctx2D) => void, loops = BOWEL_LOOPS): void {
  const [bx, by, bw, bh] = box, pitch = bh / loops, r = pitch / 2, x0 = bx + r, x1 = bx + bw - r;
  const p = new Path2D();
  for (let k = 0; k < loops; k++) {
    const y = by + pitch * (k + 0.5), ltr = k % 2 === 0;
    if (k === 0) p.moveTo(ltr ? x0 : x1, y);
    p.lineTo(ltr ? x1 : x0, y);
    if (k < loops - 1) p.arc(ltr ? x1 : x0, y + r, r, -Math.PI / 2, Math.PI / 2, !ltr);
  }
  setBase(ctx);
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  const css = (c: Rgb, a: number) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
  const line = 3.4;
  ctx.strokeStyle = css(t.o3, 1); ctx.lineWidth = pitch; ctx.stroke(p);
  ctx.strokeStyle = css(t.o1, 1); ctx.lineWidth = pitch - line; ctx.stroke(p);
}
