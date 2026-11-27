// The guideline path card as a frame (tool-path.js modelOf; looks: chart-looks/path.js, host 'path'). The whole chart where the card is wide enough for its leaves, else the small
// map with one reading under it; a score card, a grid and a ladder for the kinds that are not trees (the 2D path-cards.js ops, copied). Each piece asks the 2D look table for
// its stroke, colour, weight and opacity: a piece on the patient's path is `lit` (the branch's own colour, the line thicker, the words whole), the rest is quiet (70%).
import type { ChartCtx } from '../Chart.tsx';
import type { Rgba } from '../colour.ts';
import { look, type Look } from '../looks.ts';
import { scaleFrame, type Frame, type Shape } from '../scene.ts';
import {
  helpersAt, PILL_H, PILL_PAD, ROLE, TOKEN, chipsOf, drawCard, edgesOf, flat, flow, litOf, outcomeOf, pathLayout, pathWords, readParas, headOnlyOn, readingFor, type PathLayout, type PathOpts,
} from './model.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mul = (c: Rgba | undefined, a: number | undefined): Rgba | undefined => (c && a !== undefined && a < 1 ? [c[0], c[1], c[2], c[3] * a] : c);

/** A closed outline of corner points with each corner rounded (path-cards.js roundedPath: at most half of either side), the Q corners cut into segments: [x0, y0, x1, y1, …]. */
export function roundedPts(P: number[][], rad: number): number[] {
  const out: number[] = [], N = 6;
  P.forEach((p1, i) => {
    const p0 = P[(i - 1 + P.length) % P.length]!, p2 = P[(i + 1) % P.length]!;
    const d1 = Math.hypot(p1[0]! - p0[0]!, p1[1]! - p0[1]!), d2 = Math.hypot(p2[0]! - p1[0]!, p2[1]! - p1[1]!), r = Math.min(rad, d1 / 2, d2 / 2);
    const a = [p1[0]! - (p1[0]! - p0[0]!) / d1 * r, p1[1]! - (p1[1]! - p0[1]!) / d1 * r], b = [p1[0]! + (p2[0]! - p1[0]!) / d2 * r, p1[1]! + (p2[1]! - p1[1]!) / d2 * r];
    for (let k = 0; k <= N; k++) { const t = k / N, u = 1 - t; out.push(u * u * a[0]! + 2 * u * t * p1[0]! + t * t * b[0]!, u * u * a[1]! + 2 * u * t * p1[1]! + t * t * b[1]!); }
  });
  return out;
}

export interface PathSpec { of: string; patient: any; opts?: PathOpts }

export function pathFrame(spec: PathSpec, c: ChartCtx): Frame {
  // (the flowchart's words are 12 px at the least ON THE SCREEN: under the card's fit zoom they would shrink with it, so the chart is laid out at the screen's own width and scaled back up by 1 / fit)
  if (c.fit && c.fit > 0 && c.fit < 0.99) { const o = spec.opts; return scaleFrame(pathFrame(o?.room ? { ...spec, opts: { ...o, room: o.room * c.fit } } : spec, { ...c, w: c.w * c.fit, fit: 1 }), 1 / c.fit); }
  const W = Math.max(200, c.w), of = spec.of, patient = spec.patient;
  const L = pathLayout(of, patient, W, spec.opts);
  const memo = new Map<string, Look>();
  const lk = (key: string, on: boolean, tone?: string): Look => {
    const id = `${key}|${on ? 1 : 0}|${tone ?? ''}`;
    let v = memo.get(id);
    if (!v) memo.set(id, v = look(c, { host: 'path' }, key, { lit: on }, tone ? { tone } : {}));
    return v;
  };
  const shapes: Shape[] = [];
  const word = (face: string, x: number, y: number, s: string, on: boolean, tone: string, o: { size?: number; anchor?: 'start' | 'middle' } = {}) => {
    const k = lk(`path.${face}`, on, tone);
    shapes.push({ k: 'text', x, y, s, size: o.size ?? L.roles[face]!.size, weight: k.weight, color: k.fill ?? [0, 0, 0, 1], ...(o.anchor ? { anchor: o.anchor } : {}), ...(k.opacity !== undefined && k.opacity < 1 ? { alpha: k.opacity } : {}), ...(k.halo ? { halo: k.halo } : {}) });
  };
  const pen = (k: Look) => (k.stroke ? { color: mul(k.stroke, k.opacity)!, w: k.width ?? 1, ...(k.dash ? { dash: k.dash } : {}), ...(k.cap ? { cap: k.cap } : {}), ...(k.join ? { join: k.join } : {}) } : undefined);
  const fillOf = (k: Look) => { const f = mul(k.fill, k.opacity); return f && f[3] > 0 ? f : undefined; };
  const rule = (y: number) => { const k = lk('path.rule', false); shapes.push({ k: 'line', x1: 0, y1: y + 0.5, x2: W, y2: y + 0.5, pen: pen(k)! }); };
  const place = (items: { text: string; face: string; x: number; y: number }[], ox: number, ot: number, on: boolean, tone: string) => { for (const i of items) word(i.face, ox + i.x, ot + i.y, i.text, on, tone); };
  const Lit = litOf(of, patient), out = outcomeOf(of, Lit), oy = L.y.pic;

  // the head: the patient's numbers that no tile in the card's header row shows
  if (L.chipsH) place(flow([[{ text: chipsOf(of, patient, L.tiled).join(' · '), face: 'chips' }]], W, { roles: L.roles }).items, 0, L.y.chips, false, 'text');

  if (L.card) {
    for (const o of drawCard(L.spec.algo, W, L.compact, patient, helpersAt(L.fit)).ops as any[]) {
      const tone = o.tone || 'text';
      if (o.k === 't') word(o.face, o.x, o.y + oy, o.text, o.on, tone);
      else if (o.k === 'r') {
        // (an answer to choose from is plain words in a row, no box round it: the owner's ruling L9, 27 Nov, review 3531bdfa A-D16.
        // The 2D card boxed each answer in a rounded outline; the chosen one's colour, full weight and the points beside it say which is lit.
        // The box's room stays in the layout, so the words do not move.)
        if (o.look === 'path.opt') continue;
        const k = lk(o.look, o.on, tone);
        shapes.push({ k: 'rect', x: o.x, y: o.y + oy, w: o.w, h: o.h, r: o.rx, fill: fillOf(k), pen: pen(k) });
      } else if (o.k === 'd') {
        const k = lk(o.look, o.on, tone);
        shapes.push({ k: 'path', pts: roundedPts(o.pts.map((q: number[]) => [q[0], q[1] + oy]), o.rad), closed: true, fill: fillOf(k), pen: pen(k) });
      } else {
        const k = lk(o.look, o.on, tone);
        shapes.push({ k: 'line', x1: o.x1, y1: o.y1 + oy, x2: o.x2, y2: o.y2 + oy, pen: pen(k) ?? { color: [0, 0, 0, 0], w: 0 } });
      }
    }
  } else {
    // the chart or the map: connectors first (grey under, the path over), then the nodes
    const paths = L.compact ? L.map!.paths : L.tree!.paths, dim: Shape[] = [], lit: Shape[] = [];
    for (const e of edgesOf(L.spec.tree)) {
      const on = Lit.has(e.to), k = lk('path.edge', on, TOKEN[e.tone]);
      (on ? lit : dim).push({ k: 'path', pts: paths.get(e.to)!, pen: pen(k)! });
    }
    shapes.push(...dim, ...lit);
    if (L.compact) {
      const kk = L.k!;
      for (const { n } of flat(L.spec.tree)) {
        const p = L.map!.nodes.get(n.id)!, on = Lit.has(n.id), k = lk('path.dot', on, TOKEN[n.tone]);
        if (overLeaf(L.spec.tree, n)) continue;   // (a root over the middle one of an odd row of leaves read as that leaf's marker: Portal vein thrombosis 3, a white dot over Partial for a complete occlusion)
        shapes.push({ k: 'circle', cx: p.x, cy: p.y, r: on ? 5.5 : 4, fill: fillOf(k), pen: pen(k) });
        if (p.words) p.words.forEach((ln, i) => word('word', p.x, p.y + (19 + i * 12.5) * kk, ln, on, TOKEN[n.tone]!, { size: 12 * kk, anchor: 'middle' }));
      }
      rule(L.y.rule1);
      const r = out ? readingFor(of, out, patient) : null;
      if (r) for (const i of flow(readParas(r, headOnlyOn(of, !!spec.opts?.phone)), W, { gap: 4, roles: L.roles }).items) word(i.face, i.x, L.y.read + i.y, i.text, true, TOKEN[r.tone]!);
    } else {
      for (const { n } of flat(L.spec.tree)) {
        const b = L.tree!.boxes.get(n.id)!, on = Lit.has(n.id) || n.id === L.spec.tree.id;
        place(L.tree!.flows.get(n.id)!.items, b.left, oy + L.tree!.tops.get(n.id)!, on, TOKEN[n.tone]!);
      }
    }
  }
  // the foot: the figure's number and, in plain words (no capsule: docs/HUMANIZED-DESIGN.md section 0), the source it comes from
  rule(L.y.rule2);
  const fy = L.y.foot, px = W - L.pillW, py = fy + (L.footH - PILL_H) / 2;
  place(L.foot.items, 0, fy + (L.footH - L.foot.h) / 2, false, 'text');
  word('kick', px + PILL_PAD, py + (PILL_H - ROLE.kick!.lh) / 2 + 12.5, L.spec.kick, false, 'text');
  return { w: W, h: L.H, shapes, label: pathWords(of, patient) };
}

/** The root of a tree whose children are all leaves and odd in number: its dot would stand straight over the middle leaf. */
export const overLeaf = (tree: { id: string; kids?: { id?: string; kids?: unknown[] }[] }, n: { id: string }): boolean => n.id === tree.id && !!tree.kids && tree.kids.length % 2 === 1 && tree.kids.every((k) => !k.kids);
export type { PathLayout };
