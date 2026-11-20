// The guideline path card as data: where every node, connector, word and rule of a flowchart (or of its small map, a score card, a grid, a ladder) stands in a box of a
// given width. Lifted from the 2D app's tool-path.js (its pure half: slots, treeBoxes, treePlace, mapPlace, flow, nodeParas, treeLeadExtra, mapBodyOf and layout, line for line)
// and text-gl.js layoutParagraph (the line breaking), with the page, the SVG model and the scaling-to-fit taken out. The algorithms themselves (path-data.generated.js,
// algos/*.generated.js) and the score card, grid and ladder layouts (path-cards.generated.js) are copied from 2D by scripts/copy-chart-path.mjs.
// Pure functions of (width, phone, patient): a unit test lays any of them out without a page.
import { measure } from '../measure.ts';
import { PATHS, mapWordsOf, knownOf, OUTCOMES, WORST, isLive, litOf, outcomeOf, readingFor, chipsOf, patientFor } from './path-data.generated.js';
import { CARD_WIDE_MIN, cardCompact, isCardKind, layout as cardLayout, drawCard } from './path-cards.generated.js';
import { shown as shownOf } from '../fmt.ts';

export { PATHS, knownOf, litOf, outcomeOf, readingFor, chipsOf, patientFor, isLive, isCardKind, drawCard, WORST, OUTCOMES, CARD_WIDE_MIN };

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Node = { id: string; t: string; r?: string; s?: string; tone: string; kids?: Node[]; act?: boolean };
export type Spec = { tree: Node; algo: any; kick: string; foot: string; label: string; short: string; kind: string };
export type Role = { weight: number; size: number; lh: number };

export const COL_MIN = 104, NODE_MAX = 140, NODE_MAX_E3 = 176, E3_LEAVES = 3, ROOT_MAX = 330, GAP_Y = 20, MAP_UNIT = 66, GAP = 10;
export const PILL_H = 22, PILL_PAD = 10;
export const TOKEN: Record<string, string> = { n: 'text', ok: 'ok', warn: 'caution', bad: 'danger', acc: 'accent' };
/** The type of each kind of words: weight, size and line height in px (the look that draws it is path.<role>). The 2D table, except that the phone grid's answers (ctc, csc) are 12 px here, not 11: data words are never under 12 px in this app. */
export const ROLE: Record<string, Role> = {
  kick: { weight: 600, size: 12, lh: 16 }, chips: { weight: 500, size: 13, lh: 18 }, foot: { weight: 400, size: 12, lh: 16 },
  t: { weight: 400, size: 12, lh: 15 }, r: { weight: 600, size: 13, lh: 16 }, s: { weight: 400, size: 12, lh: 15 }, st: { weight: 500, size: 12, lh: 15 },
  rh: { weight: 600, size: 21, lh: 26 }, rs: { weight: 500, size: 12, lh: 26 }, rp: { weight: 400, size: 14, lh: 20 },
  rn: { weight: 600, size: 13, lh: 17 }, rd: { weight: 400, size: 12, lh: 16 }, op: { weight: 600, size: 12, lh: 16 }, pt: { weight: 600, size: 12, lh: 16 }, zl: { weight: 500, size: 12, lh: 14 },
  gh: { weight: 500, size: 12, lh: 16 }, gr: { weight: 600, size: 12, lh: 16 }, gs: { weight: 400, size: 12, lh: 14 }, ct: { weight: 600, size: 12, lh: 16 }, ctc: { weight: 600, size: 12, lh: 14 }, cs: { weight: 400, size: 12, lh: 14 }, csc: { weight: 400, size: 12, lh: 14 },
  sn: { weight: 500, size: 12, lh: 14 }, yo: { weight: 600, size: 12, lh: 14 }, sw: { weight: 600, size: 12, lh: 16 }, bk: { weight: 400, size: 12, lh: 16 }, bb: { weight: 600, size: 12, lh: 16 },
};

// ── line breaking (text-gl.js layoutParagraph: a greedy fill at the break opportunities of UAX #14, the part the cards use) ──
const CLS: Record<string, string> = { ' ': 'SP', ' ': 'GL', '⁠': 'GL', '̄': 'CM', '(': 'OP', '[': 'OP', '{': 'OP', ')': 'CP', ']': 'CP', '}': 'CP', '!': 'EX', '?': 'EX',
  ',': 'IS', '.': 'IS', ';': 'IS', ':': 'IS', '/': 'SY', '-': 'HY', '–': 'BA', '­': 'BA', '—': 'B2', '"': 'QU', '\'': 'QU', '“': 'QU',
  '”': 'QU', '‘': 'QU', '’': 'QU', '−': 'PR', '+': 'PR', '$': 'PR', '±': 'PR', '°': 'PO', '%': 'PO' };
const brClass = (c: string) => CLS[c] || (c >= '0' && c <= '9' ? 'NU' : 'AL');
/** Whether a line may break between character a and the character b that follows it (z: the one before a). */
export function mayBreak(a: string, b: string, z = ''): boolean {
  const x = brClass(a), y = brClass(b);
  if (x === 'SY' && brClass(z) === 'NU') return false;
  if (x === 'SP') return y !== 'SP' && y !== 'EX' && y !== 'CP' && y !== 'IS' && y !== 'SY' && y !== 'CM';
  if (y === 'SP' || y === 'GL' || x === 'GL' || y === 'CM' || y === 'EX' || y === 'CP' || y === 'IS' || y === 'SY' || y === 'QU' || x === 'QU' || x === 'OP') return false;
  if (x === 'B2' || y === 'B2') return true;
  if (x === 'HY') return y !== 'NU';
  if (x === 'BA') return true;
  if (x === 'SY') return y !== 'NU';
  return false;
}
interface Run { text: string; weight: number; size: number }
interface Line { w: number; runs: { run: number; text: string; x: number; w: number }[] }
/** Runs laid out in a column of `width`, broken as the browser breaks them (a greedy fill). */
export function layoutParagraph(runs: Run[], width: number): { lines: Line[] } {
  const cells: { ch: string; run: number; w: number }[] = [];
  runs.forEach((r, ri) => { for (const ch of String(r.text)) cells.push({ ch, run: ri, w: measure(ch, r.size, r.weight) }); });
  const n = cells.length, ok = new Uint8Array(n + 1), pre = new Float64Array(n + 1);
  for (let b = 1; b < n; b++) ok[b] = mayBreak(cells[b - 1]!.ch, cells[b]!.ch, b > 1 ? cells[b - 2]!.ch : '') ? 1 : 0;
  for (let k = 0; k < n; k++) pre[k + 1] = pre[k]! + cells[k]!.w;
  const fit = (s0: number, e: number) => { let t = e; while (t > s0 && cells[t - 1]!.ch === ' ') t--; return pre[t]! - pre[s0]!; };
  const spans: { start: number; end: number }[] = [];
  let start = 0;
  while (start < n) {
    let end = -1;
    for (let b = start + 1; b <= n; b++) {
      if (b < n && !ok[b]) continue;
      if (fit(start, b) <= width + 0.01) end = b; else { if (end < 0) end = b; break; }
    }
    if (end < 0) end = n;
    spans.push({ start, end });
    start = end;
    while (start < n && cells[start]!.ch === ' ') start++;
  }
  return { lines: spans.map(({ start: s0, end }) => {
    let e = end; while (e > s0 && cells[e - 1]!.ch === ' ') e--;
    const parts: Line['runs'] = []; let x = 0;
    for (let k = s0; k < e; k++) {
      const c = cells[k]!, last = parts[parts.length - 1];
      if (last && last.run === c.run) { last.text += c.ch; last.w += c.w; } else parts.push({ run: c.run, text: c.ch, x, w: c.w });
      x += c.w;
    }
    return { w: x, runs: parts };
  }) };
}

/** A word's width in the role's type (what 2D's textWidth gives from the outlines; here Inter's advances, measure.ts). */
export const textWidth = (text: string, o: { weight?: number; size?: number } = {}) => measure(text, o.size ?? 12, o.weight ?? 400);

// ── the tree (tool-path.js) ──
export const flat = (tree: Node) => { const out: { n: Node; d: number }[] = []; (function w(n: Node, d: number) { out.push({ n, d }); (n.kids || []).forEach((k) => w(k, d + 1)); })(tree, 0); return out; };
export function slots(tree: Node) {
  const at = new Map<string, { x: number; d: number }>(); let n = 0, maxd = 0;
  (function w(node: Node, d: number) {
    maxd = Math.max(maxd, d);
    if (!node.kids) { at.set(node.id, { x: n + 0.5, d }); n++; return; }
    node.kids.forEach((k) => w(k, d + 1));
    at.set(node.id, { x: (at.get(node.kids[0]!.id)!.x + at.get(node.kids[node.kids.length - 1]!.id)!.x) / 2, d });
  })(tree, 0);
  return { at, n, maxd };
}
export interface Edge { from: string; to: string; tone: string }
export const edgesOf = (tree: Node) => { const out: Edge[] = []; (function w(n: Node) { (n.kids || []).forEach((k) => { out.push({ from: n.id, to: k.id, tone: k.tone }); w(k); }); })(tree); return out; };
/** A connector (2D: an SVG path): down from the parent, along, down into the child, the corners rounded (each Q cut into CORNER segments). Points [x0, y0, x1, y1, …]. */
const CORNER = 6;
export function ortho(x1: number, y1: number, x2: number, y2: number): number[] {
  const ym = y1 + (y2 - y1) / 2;
  if (Math.abs(x1 - x2) < 1) return [x1, y1, x1, y2];
  const r = Math.min(8, Math.abs(x2 - x1) / 2, (y2 - y1) / 2), d = x2 > x1 ? 1 : -1;
  const out = [x1, y1, x1, ym - r];
  const quad = (ax: number, ay: number, cx: number, cy: number, bx: number, by: number) => { for (let k = 1; k <= CORNER; k++) { const t = k / CORNER, u = 1 - t; out.push(u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by); } };
  quad(x1, ym - r, x1, ym, x1 + d * r, ym);
  out.push(x2 - d * r, ym);
  quad(x2 - d * r, ym, x2, ym, x2, ym + r);
  out.push(x2, y2);
  return out;
}
export const wideFor = (tree: Node, W: number) => W >= slots(tree).n * COL_MIN;
export const mapFor = (tree: Node, W: number, phone: boolean) => !!phone || !wideFor(tree, W);
export const mapType = (W: number) => (W >= 560 ? 14 : 12);
export interface Box { left: number; w: number; cx: number; d: number }
export function treeBoxes(tree: Node, W: number) {
  const { at, n } = slots(tree), slot = W / n;
  const nw = Math.min(n <= E3_LEAVES ? NODE_MAX_E3 : NODE_MAX, slot - 10);
  const out = new Map<string, Box>();
  for (const { n: node, d } of flat(tree)) {
    const w = node.id === tree.id ? Math.min(W - 8, ROOT_MAX) : nw;
    const left = Math.max(0, Math.min(W - w, at.get(node.id)!.x * slot - w / 2));
    out.set(node.id, { left, w, cx: left + w / 2, d });
  }
  return out;
}
export function treePlace(tree: Node, boxes: Map<string, Box>, heights: Map<string, number>, oy = 0) {
  const rows: number[] = []; let maxd = 0;
  for (const { n, d } of flat(tree)) { rows[d] = Math.max(rows[d] || 0, heights.get(n.id) || 0); maxd = Math.max(maxd, d); }
  const topOf: number[] = []; let y = 0;
  for (let d = 0; d <= maxd; d++) { topOf[d] = y; y += (rows[d] || 0) + GAP_Y; }
  const tops = new Map<string, number>(), paths = new Map<string, number[]>();
  for (const { n, d } of flat(tree)) tops.set(n.id, topOf[d]!);
  for (const e of edgesOf(tree)) {
    const a = boxes.get(e.from)!, b = boxes.get(e.to)!;
    paths.set(e.to, ortho(a.cx, oy + tops.get(e.from)! + (heights.get(e.from) || 0) + 3, b.cx, oy + tops.get(e.to)! - 3));
  }
  return { tops, paths, H: Math.max(0, y - GAP_Y) };
}
export function mapPlace(tree: Node, W: number, k = 1, oy = 0, wordsOf: (id: string) => string[] | null = () => null, tight = false) {
  const { at, n, maxd } = slots(tree), pad = W < 330 ? 34 : 38, nodes = new Map<string, { x: number; y: number; words: string[] | null }>(), paths = new Map<string, number[]>();
  const unit = tight && k === 1 ? 50 : maxd >= 3 && k === 1 ? 56 : MAP_UNIT;
  const X = (id: string) => (n > 1 ? pad + ((at.get(id)!.x - 0.5) / (n - 1)) * (W - 2 * pad) : W / 2), Y = (id: string) => oy + 12 + at.get(id)!.d * unit;
  for (const { n: node } of flat(tree)) nodes.set(node.id, { x: X(node.id), y: Y(node.id), words: wordsOf(node.id) });
  for (const e of edgesOf(tree)) {
    const a = nodes.get(e.from)!, b = nodes.get(e.to)!;
    const y0 = a.y + (a.words ? (8 + a.words.length * 12.5) * k : 0);
    paths.set(e.to, [a.x, y0, a.x, y0 + 12, b.x, y0 + 12, b.x, b.y]);
  }
  return { nodes, paths, H: 12 + maxd * unit + 44 * k };
}

// ── paragraphs ──
export interface Item { text: string; face: string; x: number; y: number }
export interface ParaRun { text: string; face: string }
/** Paragraphs of runs laid out in a column: → { items (y the baseline), h }. gap: px after a paragraph (a number, or a function of its index). */
export function flow(paras: ParaRun[][], width: number, { align = 'left', gap = 0 }: { align?: 'left' | 'center'; gap?: number | ((pi: number) => number) } = {}) {
  const items: Item[] = [], gapOf = typeof gap === 'function' ? gap : () => gap;
  let y = 0, last = 0;
  paras.forEach((runs, pi) => {
    if (!runs.length) return;
    const { lines } = layoutParagraph(runs.map((r) => ({ text: r.text, weight: ROLE[r.face]!.weight, size: ROLE[r.face]!.size })), width * 0.97);
    for (const ln of lines) {
      const parts = ln.runs.map((p) => { const face = runs[p.run]!.face, R = ROLE[face]!; return { text: p.text, face, w: textWidth(p.text, { weight: R.weight, size: R.size }) }; });
      const total = parts.reduce((s, p) => s + p.w, 0), lh = Math.max(...parts.map((p) => ROLE[p.face]!.lh));
      let x = align === 'center' ? Math.max(0, (width - total) / 2) : 0;
      for (const p of parts) {
        const R = ROLE[p.face]!;
        items.push({ text: p.text, face: p.face, x, y: y + (lh - R.size * 1.21) / 2 + R.size * 0.97 });
        x += p.w;
      }
      y += lh;
    }
    last = gapOf(pi);
    y += last;
  });
  return { items, h: items.length ? y - last : 0 };
}
export function nodeParas(n: Node, isRoot: boolean): ParaRun[][] {
  const lead = (isRoot || !n.r) ? [{ text: n.t, face: 'r' }] : [{ text: n.t, face: 't' }];
  const out = [lead];
  if (n.r) out.push([{ text: n.r, face: 'r' }]);
  if (n.s) out.push([{ text: n.s, face: 's' }]);
  return out;
}
const nodeGap = (paras: ParaRun[][], extra = 0) => (pi: number) => (paras.length > 1 && pi === 0 && paras[0]![0]!.face === 't' ? 1 + extra : 2);
/** The room each node's condition needs added under it so that the verdicts of one row stand on one line: id → px. */
export function treeLeadExtra(tree: Node, boxes: Map<string, Box>, parasOf: (id: string) => ParaRun[][], leadH: (paras: ParaRun[][], w: number) => number) {
  const own = new Map<string, { h: number; d: number }>(), rowMax: number[] = [];
  for (const { n, d } of flat(tree)) {
    const paras = parasOf(n.id);
    if (!(paras.length > 1 && paras[0]![0]!.face === 't')) continue;
    const h = leadH(paras, boxes.get(n.id)!.w);
    own.set(n.id, { h, d }); rowMax[d] = Math.max(rowMax[d] || 0, h);
  }
  const out = new Map<string, number>();
  for (const [id, { h, d }] of own) out.set(id, Math.max(0, rowMax[d]! - h));
  return out;
}
export const readParas = (r: { head: string; why: string; next: string }): ParaRun[][] => [[{ text: r.head, face: 'rh' }], [{ text: `${r.why} ${r.next}`, face: 'rp' }]];
/** What path-cards.generated.js lays a score card, grid or ladder out with. Kept one object: the card layouts memoise their lines against it. */
export const CARD_HELPERS = { flow, ROLE, textWidth, readParas, TOKEN, svg: null as unknown };

export function mapBodyOf(of: string, spec: Spec, patient: any, Wv: number, W = Wv, oy = 0, tight = false) {
  const k = mapType(W) / 12, worst = (WORST as any)[of], map = mapPlace(spec.tree, Wv, k, oy, (id) => mapWordsOf(of, id), tight);
  const own = isLive(of) ? null : outcomeOf(of, litOf(of, patient));
  const rd = (key: string, p: any) => flow(readParas(readingFor(of, key, p)), Wv, { gap: 4 }).h;
  const readH = own ? rd(own, patient) : Math.max(...(OUTCOMES as any)[of].flatMap((key: string) => [patient, worst].map((p) => rd(key, p))));
  return { k, map, readH, H: map.H + GAP + 12 + readH };
}

// ── the whole card ──
export interface PathOpts {
  /** the page is the phone layout (a phone held upright, or an iPad held upright): the small map */
  phone?: boolean;
  /** the readings the card's header row already shows as tiles (tile keys: 'lsm', 'plt', …), left out of the patient's numbers */
  tiled?: ReadonlySet<string>;
  /** the room the card has for its picture, px: when the picture is taller, its rows stand closer first (2D's tight layout, 6 px rows) */
  room?: number;
}
export interface PathLayout {
  of: string; spec: Spec; W: number; compact: boolean; card: boolean; tight: boolean; H: number;
  y: { chips: number; pic: number; rule1: number; read: number; rule2: number; foot: number };
  tiled: ReadonlySet<string>; chipsH: number;
  cardL?: { kind: string; W: number; compact: boolean; H: number };
  k?: number; map?: ReturnType<typeof mapPlace>; readH?: number;
  tree?: { tops: Map<string, number>; paths: Map<string, number[]>; H: number; boxes: Map<string, Box>; flows: Map<string, ReturnType<typeof flow>> };
  foot: ReturnType<typeof flow>; pillW: number; footH: number;
}

/** Everything that does not change with the patient (tool-path.js layout): the columns, the nodes' words and their heights, the rooms reserved, the total height. */
export function pathLayout(ofIn: string, patientIn: any, W: number, o: PathOpts = {}, tight = false, small = false): PathLayout {
  const of = knownOf(ofIn), spec = (PATHS as any)[of] as Spec, card = isCardKind(spec.kind), phone = !!o.phone, tiled = o.tiled ?? new Set<string>();
  const G = tight ? 6 : GAP, R1 = tight ? 8 : 12, R2 = tight ? 4 : 7;
  const compact = small || (card ? cardCompact(W, phone) : mapFor(spec.tree, W, phone));
  const worst = (WORST as any)[of], base = patientIn || worst;
  const L = { of, spec, W, compact, card, tight, y: {} as PathLayout['y'], tiled } as PathLayout;
  let y = 0;
  const chipsH = (p: any) => (chipsOf(of, p, tiled).length ? flow([[{ text: chipsOf(of, p, tiled).join(' · '), face: 'chips' }]], W).h : 0);
  L.chipsH = card ? chipsH(base) : isLive(of) ? Math.max(chipsH(base), chipsH(worst)) : chipsH(base);
  L.y.chips = y; if (L.chipsH) y += L.chipsH + G;
  L.y.pic = y;
  L.y.rule1 = L.y.read = 0;
  if (card) {
    L.cardL = cardLayout(spec.algo, W, compact, base, CARD_HELPERS, true);
    y += L.cardL!.H + G;
  } else if (compact) {
    const B = mapBodyOf(of, spec, base, W, W, y, tight);
    L.k = B.k; L.map = B.map;
    y += L.map.H + G;
    L.y.rule1 = y; y += R1;
    L.y.read = y;
    L.readH = B.readH;
    y += L.readH + G;
  } else {
    const boxes = treeBoxes(spec.tree, W), heights = new Map<string, number>(), fl = new Map<string, ReturnType<typeof flow>>();
    const byId = new Map(flat(spec.tree).map(({ n }) => [n.id, n]));
    // (results stand level: each row's conditions take the room of the tallest, the rest of the node's words under it)
    const lead = treeLeadExtra(spec.tree, boxes, (id) => nodeParas(byId.get(id)!, id === spec.tree.id), (paras, w) => flow([paras[0]!], w, { align: 'center' }).h);
    for (const [id, b] of boxes) {
      const paras = nodeParas(byId.get(id)!, id === spec.tree.id), f = flow(paras, b.w, { align: 'center', gap: nodeGap(paras, lead.get(id) || 0) });
      fl.set(id, f); heights.set(id, f.h);
    }
    L.tree = { ...treePlace(spec.tree, boxes, heights, y), boxes, flows: fl };
    y += L.tree.H + G;
  }
  L.y.rule2 = y; y += R2;
  L.y.foot = y;
  L.foot = flow([[{ text: spec.foot, face: 'foot' }]], W);
  L.pillW = Math.ceil(textWidth(spec.kick, { weight: ROLE.kick!.weight, size: ROLE.kick!.size })) + 2 * PILL_PAD;
  L.footH = Math.max(L.foot.h, PILL_H);
  y += L.footH;
  L.H = Math.ceil(y);
  // (the data card's real room asks for it, as 2D's tool-path.js layout does: the rows stand closer first, at full size; a card that has a real room never draws its words under 12 px,
  // so what still stands past it gives way to the small map, whose own rows are tight too. A phone's small map keeps its rows: it is the figure's last form.)
  if (o.room && o.room > 0 && L.H > o.room && (!compact || !phone)) {
    if (!tight) return pathLayout(ofIn, patientIn, W, o, true, small);
    // (2D takes the small map whatever its height; here it is taken only where it is shorter, so the room never makes the picture stand further past it than the chart did)
    if (!compact) { const m = pathLayout(ofIn, patientIn, W, o, true, true); if (m.H < L.H) return m; }
  }
  return L;
}

/** The patient a slide's tool names: the slide's own facts, over which the live model's readings go where it has them (fp: the tiles' keys). */
export const patientOf = (of: string, patient: unknown, fp?: Readonly<Record<string, number | null | undefined>> | null) => patientFor({ of, patient }, fp ?? null, shownOf);

/** What a screen reader hears of the card: the algorithm's name, the patient's numbers, the verdict and its why. */
export function pathWords(of: string, patient: any): string {
  const spec = (PATHS as any)[knownOf(of)] as Spec, Lit = litOf(of, patient), out = outcomeOf(of, Lit), r = out ? readingFor(of, out, patient) : null;
  const said = `${chipsOf(of, patient).join(', ')}${r ? `. ${r.head}. ${r.why} ${r.next}` : ''}`.replace(/^\. /, '').trim();
  return isCardKind(spec.kind) ? `${spec.label}. ${said}` : `${spec.label}, the patient's path lit. ${said}`;
}
