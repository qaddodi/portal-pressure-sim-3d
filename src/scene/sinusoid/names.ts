// The sinusoid's names, as the 2D app lays them out (sinusoid-view.js: layoutEnds, layoutTags, layoutTall, region, leader; fen-place.js through fen-place.copied.js). Pure: no DOM, no GPU.
// The caller (the label layer) gives the plane's place on the screen (where its centre is, how many px a micrometre is, which way it runs), the free room the cards leave, a way to measure a name
// in px, and the readings; it gets back each name's centre, its box, the leader to what it names and the µm it names. Names are always LEVEL (a portrait screen runs the sinusoid top to
// bottom, the names still read across), and a tap takes the name's own card (`explainHit`, 2D's label-explain.js hitLabel, with the card's one line `SV_NOTE`).
// What this does not do (2D's `declutter`: names that still overlap at a large text size step apart): left to the label layer.
import { boxGap } from '../labels/geometry.ts';
import { type Pore, CELL, KUP_HALF, SEED, UM, calloutPore, canaliculusAt, cellAt, cellOf } from './layout.ts';
import { placeFenDisse } from './fen-place.copied.js';
import { calloutOf } from './legend.ts';

export type NameKey = 'in' | 'out' | 'sin' | 'fen' | 'hsc' | 'disse' | 'lymph' | 'hep' | 'kup' | 'bc' | 'alb';

/** The one line a tap on a name adds (2D: SV_NOTE), and what each name is called in a slide's terms (SV_TARGET: `sinusoid:<target>`). */
export const SV_NOTE: Readonly<Partial<Record<NameKey, string>>> = {
  fen: 'pores: plasma passes to the space of Disse', disse: 'perisinusoidal space between the endothelium and the hepatocytes', lymph: 'drains filtered fluid and protein',
  hep: 'hepatocytes: uptake and metabolism of plasma solutes', hsc: 'stores vitamin A; deposits collagen when activated', kup: 'resident macrophage of the sinusoid',
  sin: 'blood from the portal tract and the hepatic artery mixes here', in: 'blood arrives from the portal venule', out: 'blood leaves to the central vein',
  bc: 'sealed channel between hepatocytes: bile drains to the portal tract, against the blood',
  alb: 'albumin: the main protein of plasma, it holds water in the vessel',
};
export const SV_TARGET: Readonly<Partial<Record<NameKey, string>>> = {
  bc: 'canaliculus', fen: 'fenestrae', hsc: 'stellate', kup: 'kupffer', hep: 'hepatocyte', sin: 'lumen', in: 'in', out: 'out', alb: 'protein',
};
export const END_NAMES = ['Portal venule', 'Central vein'] as const;
/** The name a tap on a part of the plane takes, as 2D's slides call it: `sinusoid:<target>` (disse, lymph keep their own names). */
export const targetOf = (key: NameKey): string => `sinusoid:${SV_TARGET[key] ?? key}`;

/** The geometry of the plane the names stand on (the widths 2D's shader draws), in µm. */
export interface NameGeom {
  xs: number; xk: number; pores: readonly (readonly Pore[])[];
  halfW(x: number): number; wallIn(x: number): number; hepIn(x: number): number; disseW(x: number): number;
}
export interface Rect { l: number; t: number; r: number; b: number }
export interface NamesInput {
  portrait: boolean;
  /** The stage's size (px). */
  W: number; H: number;
  /** Where the plane's centre is on screen (px) and how many px a micrometre is. */
  C: readonly [number, number]; k: number;
  /** The free room the cards leave (px) and the top inset the names keep under (px). */
  free: Rect; insTop: number;
  /** The screen's visible left and right (px: the stage less its safe areas) and the boxes drawn over the figure (the cards, the presenter bar).
   *  On a wide screen the ends' names stand at the visible ends of the vessel along its own band, whatever the free room's shape
   *  (it keeps clear of a bar in the corner at the foot, which the vessel's band never meets). Absent: the free room's own sides. */
  edge?: { l: number; r: number };
  walls?: readonly { x: number; y: number; w: number; h: number }[];
  /**
   * The protein particle the Protein callout points at now (µm along, µm across with y down as the shader has it), or absent before any is out: the callout's box stands still in
   * the plate and its leader is laid to this place; the layer then follows the particle each frame and hands on to another one when it has gone (protein-pick.ts).
   */
  protein?: { x: number; y: number } | null;
  g: NameGeom;
  /** The stellate cell's state (0 quiescent .. 1 activated). */
  act: number;
  /** The readings, as 2D writes them ("22.4~mmHg"; "16%~open"; "0.5~L/day· Protein 91%"). Empty before the model is in. */
  text: { inValue: string; outValue: string; sin: string; fen: string; lymph: string; lymphTall: string };
  /** The terms a slide lights now (`sinusoid:canaliculus` names a canaliculus on a tall screen). */
  lit?: ReadonlySet<string>;
  /** A name's size in px: its capitals and its readings, as the label layer sets them. */
  /** `inline`: the name and its readings on one line (a tall screen whose room is too short to stack the names, 2D has no such room): the layer sets the caption so, then measures it. */
  measure(key: NameKey, name: string, value: string, inline?: boolean): readonly [number, number];
}
export interface NamePlacement {
  key: NameKey; name: string; value: string;
  /** What it names (µm along, µm across, y down as the shader has it). */
  x: number; y: number;
  /** Its box's centre and size on screen (px). */
  cx: number; cy: number; w: number; hh: number;
  end: boolean;
  /** Set on one line (name, then readings) because the room is short. */
  inline?: boolean;
  /** The thin leader from its box to what it names (px), or null when it stands on it. */
  leader: { x1: number; y1: number; x2: number; y2: number; tx: number; ty: number } | null;
}

/** The central vein's arrow, from its name to its tip (px, names.css .sv-end-arrow plus its gap). */
const ARROW_PX = 36;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 2D's rule for when a name gets a leader: past LEAD_ON px from what it names, kept until it comes within LEAD_OFF (label-place.js). */
export const LEAD_ON = 12, LEAD_OFF = 8;
/** The least a name stands from the screen's side edges (px): the same 12 the figure's names keep (solver VIEW_INSET 8 plus the leader's ring). */
export const EDGE = 12;
/** Air between a card or bar and an end's name standing against it (px, plan.ts GAP: the room the figure is given keeps the same). */
export const WALL_GAP = 16;
/** Air between the portal venule's name (with its arrow) and the central vein's when the vessel is short (px). */
export const END_GAP = 8;

/** The visible ends of the vessel's band `y0..y1` (px across the screen), as far as a name may stand:
 *  the screen's sides less the same margin the free room keeps, held back by every box that crosses the band (the cards on its left, a bar on its right).
 *  A name that stands at one end is then at the vessel's visible end, whatever the free room the camera was framed in. */
export function vesselReach(cx: number, y0: number, y1: number, edge: { l: number; r: number }, walls: NamesInput['walls']): { l: number; r: number } {
  let l = edge.l + 2 * EDGE, r = edge.r - EDGE;
  for (const b of walls ?? []) {
    if (!(b.w > 0 && b.h > 0) || b.y >= y1 || b.y + b.h <= y0) continue;
    if (b.x + b.w / 2 < cx) l = Math.max(l, b.x + b.w + WALL_GAP + 2 * EDGE); else r = Math.min(r, b.x - WALL_GAP - EDGE);
  }
  return { l, r };
}

/** Lays the names out for a screen. Wide: across the screen (2D layoutTags); tall: top to bottom, every name level (2D layoutTall). */
export function layoutNames(inp: NamesInput): NamePlacement[] {
  const { portrait: V, g, k, C, W, free: fe0 } = inp;
  // where a name may stand: the free room less EDGE px at both sides, so no name touches the screen's edge (a name at its widest, "Fenestrae 100% open" or HEPATOCYTE on a phone, was held 4 px from it);
  // the tissue's own geometry below keeps the room as it is
  const fe = { ...fe0, l: fe0.l + EDGE, r: fe0.r - EDGE };
  const feGeom = fe0;
  // a tall screen whose room is too short to stack the ends' names and the sinusoid's (each a name over its readings, plus the arrows) puts name and readings on one line (Mohammad, 23 Nov: "tighter labels";
  // Ascites 9 on an iPhone with both cards up: Portal venule, Central vein and Sinusoid printed over each other in 176 px)
  const INLINE: ReadonlySet<NameKey> = new Set<NameKey>(['in', 'out', 'sin', 'fen', 'lymph']);
  const stacked = V ? ([['in', END_NAMES[0], inp.text.inValue], ['out', END_NAMES[1], inp.text.outValue], ['sin', 'Sinusoid', inp.text.sin]] as const).reduce((a, [key, name, value]) => a + inp.measure(key, name, value)[1], 0) : 0;
  const tight = V && fe.b - fe.t < stacked + 2 * 48 + 24;
  const meas = (key: NameKey, name: string, value: string): { w: number; hh: number; inl: boolean } => { const inl = tight && INLINE.has(key); const [w, hh] = inp.measure(key, name, value, inl); return { w, hh, inl }; };
  const out: NamePlacement[] = [];
  const by: Partial<Record<NameKey, NamePlacement>> = {};
  const ang = V ? Math.PI / 2 : 0, ca = Math.cos(ang), sa = Math.sin(ang);
  const toScreen = (x: number, y: number): [number, number] => [C[0] + k * (x * ca - y * sa), C[1] + k * (x * sa + y * ca)];
  // the stretch of sinusoid in the free room, µm along it (2D: VW.fr)
  const along = (X: number, Y: number) => ((X - C[0]) * ca + (Y - C[1]) * sa) / k;
  const f0 = along(feGeom.l, feGeom.t), f1 = along(feGeom.r, feGeom.b), fr: [number, number] = [Math.min(f0, f1), Math.max(f0, f1)];
  const pickTags = (u: number) => lerp(fr[0] + 8, fr[1] - 8, u);
  const awayX = (x: number, from: number, d: number) => (Math.abs(x - from) < d ? from + (x < from ? -d : d) : x);
  const endBox: ({ u: number; x0: number; x1: number; y0: number; y1: number } | null)[] = [null, null];

  const region = (key: NameKey, name: string, value: string, x: number, y: number, o: { along?: boolean; side?: number } = {}): NamePlacement => {
    const alongName = !!o.along, side = o.side ?? 0;
    const { w, hh, inl } = meas(key, name, value);
    const a = alongName && !V ? ang : 0;
    const across = alongName ? hh : Math.abs(w * Math.sin(ang)) + Math.abs(hh * Math.cos(ang));
    const yc = y + side * (across / 2) / k;
    const sc = toScreen(x, yc);
    let cx = sc[0];
    let cy = sc[1];
    const cx0 = cx;
    // a name stays inside the free room whatever the scale puts under it (a wide stretch at a large scale throws the plates' names past the room's top and foot: the leader still reaches what it names)
    // (a tall screen too: its names stand along the vessel, and one past the room's foot stood half under the story card, "Kupffer cell", Ascites 9.2, build 572259fd)
    if (!V || !alongName) cy = clamp(cy, Math.min(fe.t + hh / 2 + 4, (fe.t + fe.b) / 2), Math.max(fe.b - hh / 2 - 4, (fe.t + fe.b) / 2));
    if (!alongName) cx = clamp(cx, Math.min(Math.max(w / 2 + EDGE, fe.l + w / 2), W / 2), Math.max(Math.min(W - w / 2 - EDGE, fe.r - w / 2), W / 2));   // a level name stays on screen and in the free room
    if (!V) {
      // across the screen every name is level: it steps clear of the ends' names and stays in the free room
      for (const b of endBox) if (b && cy + hh / 2 > b.y0 - 4 && cy - hh / 2 < b.y1 + 4) cx = b.u ? Math.min(cx, b.x0 - 14 - w / 2) : Math.max(cx, b.x1 + 14 + w / 2);
      cx = clamp(cx, Math.min(fe.l + w / 2 + 4, W / 2), Math.max(fe.r - w / 2 - 4, W / 2));
    }
    void a;
    const P: NamePlacement = { key, name, value, x: x + (V ? 0 : (cx - cx0) / k), y, cx, cy, w, hh, end: false, leader: null, ...(inl ? { inline: true } : {}) };
    out.push(P); by[key] = P;
    return P;
  };
  const half = (R: NamePlacement, alongName = false) => (alongName ? R.w : Math.abs(R.w * Math.cos(ang)) + Math.abs(R.hh * Math.sin(ang))) / 2 / k;
  /** 2D leader(): from the name's box to what it names, none when the name already sits on it (gap under LEAD_ON, kept to LEAD_OFF). */
  const aim = new Map<NameKey, [number, number]>();
  const leader = (R: NamePlacement, x: number, y: number, had = false) => {
    aim.set(R.key, [x, y]);
    const [tx, ty] = toScreen(x, y);
    const vert = Math.abs(tx - R.cx) < R.w / 2 - 2 && Math.abs(ty - R.cy) > R.hh / 2 + 6;
    const sx = vert ? tx : R.cx + Math.sign(tx - R.cx) * (R.w / 2 + 3), sy = vert ? R.cy + Math.sign(ty - R.cy) * (R.hh / 2 + 3) : clamp(ty, R.cy - R.hh / 2 + 4, R.cy + R.hh / 2 - 4);
    const gap = boxGap({ x0: R.cx - R.w / 2, x1: R.cx + R.w / 2, y0: R.cy - R.hh / 2, y1: R.cy + R.hh / 2 }, tx, ty);
    const on = (gap > LEAD_ON || (had && gap >= LEAD_OFF)) && (vert || Math.sign(tx - R.cx) === Math.sign(tx - sx));
    R.leader = on ? { x1: sx, y1: sy, x2: tx, y2: ty, tx: x, ty: y } : null;
  };

  /** 2D's declutter, here for every size: names that still overlap (a large text size, a small room, a card open) step apart, the later one moving the least way that clears every other and keeps it
   *  in the free room; the ends stay where their arrows are. A name that has moved gets its leader again from what it names. */
  const settle = (all: NamePlacement[]): NamePlacement[] => {
    // a name whose tissue is off the free room (panned or zoomed away) would be held over some other tissue (a plate's name in the lumen, over the Kupffer cell; Mohammad, 20 Nov 2026): it stands
    // aside until what it names is back on screen (the label layer fades it out). What it names: its leader's end where it has one, else its own place
    const list = V ? all : all.filter((n) => {
      if (n.end) return true;
      const t = aim.get(n.key) ?? [n.x, n.y], [, ty] = toScreen(t[0], t[1]);
      return ty >= fe.t - 2 && ty <= fe.b + 2;
    });
    const GAP = 4, bx = (n: NamePlacement) => ({ x0: n.cx - n.w / 2, x1: n.cx + n.w / 2, y0: n.cy - n.hh / 2, y1: n.cy + n.hh / 2 });
    const hits = (a: NamePlacement, cx: number, cy: number, b: NamePlacement) => cx - a.w / 2 < b.cx + b.w / 2 + GAP && cx + a.w / 2 > b.cx - b.w / 2 - GAP && cy - a.hh / 2 < b.cy + b.hh / 2 + GAP && cy + a.hh / 2 > b.cy - b.hh / 2 - GAP;
    const inside = (a: NamePlacement, cx: number, cy: number) => cx - a.w / 2 >= fe.l - 0.5 && cx + a.w / 2 <= fe.r + 0.5 && cy - a.hh / 2 >= fe.t - 0.5 && cy + a.hh / 2 <= fe.b + 0.5;
    const moved = new Set<NamePlacement>();
    for (let pass = 0; pass < 3; pass++) {
      let any = false;
      for (let i = 0; i < list.length; i++) {
        const a = list[i]!;
        if (a.end) continue;
        const clash = list.filter((b) => b !== a && hits(a, a.cx, a.cy, b));
        if (!clash.length) continue;
        let best: [number, number] | null = null, bd = Infinity;
        for (const b of clash) {
          const bb = bx(b);
          for (const [cx, cy] of [[bb.x0 - GAP - a.w / 2, a.cy], [bb.x1 + GAP + a.w / 2, a.cy], [a.cx, bb.y0 - GAP - a.hh / 2], [a.cx, bb.y1 + GAP + a.hh / 2]] as const) {
            if (!inside(a, cx, cy) || list.some((o) => o !== a && hits(a, cx, cy, o))) continue;
            const d = Math.hypot(cx - a.cx, cy - a.cy);
            if (d < bd) { bd = d; best = [cx, cy]; }
          }
        }
        if (best) { a.cx = best[0]; a.cy = best[1]; moved.add(a); any = true; }
      }
      if (!any) break;
    }
    for (const a of moved) { const t = aim.get(a.key); if (t) leader(a, t[0], t[1], !!a.leader); }
    return list;
  };

  // ── the ends: the portal venule above (left of) the vessel, the central vein below (right of) it, each with its arrow outside the name (2D layoutEnds) ──
  const band: [number, number] = [0, 0];
  const A = tight ? 36 : 22 + 26;
  // The wide screen's rule, in one place (Mohammad, 24 Nov "move the central vein label to the right", 25 Nov "still short of the end", 26 Nov "way on the right"):
  //   1. each end's name stands at its own visible end of the vessel (reach), the portal venule at the left one and the central vein at the right one, its arrow beyond it, so the two are always
  //      in that order and never on one another (END_GAP between them is a hard floor, whatever else gives way);
  //   2. the Kupffer cell is fixed in the tissue and may stand near that end (a phone on its side, a card up): the name still stands at the end, lifted over the cell's arms when the lumen has
  //      room for that, else stepped left of the cell if the room between the two ends allows, and only then left over the arms. It never steps left of the cell into the portal venule
  //      (it did: "Portal ver|Central vein", iPhone on its side, Circulation 6, 25 Nov).
  const cell = V ? null : (() => {
    const hw = g.halfW(g.xk);
    return { l: C[0] + k * (g.xk - KUP_HALF) - 8, r: C[0] + k * (g.xk + KUP_HALF) + 8, y0: C[1] + k * (hw - 4.2), top: C[1] - k * hw };
  })();
  const endsLift = (() => {
    if (V || !cell) return 0;
    const o = meas('out', END_NAMES[1], inp.text.outValue), y = C[1] - o.hh / 2;
    const reach = inp.edge ? vesselReach(C[0], y - 4, y + o.hh + 4, inp.edge, inp.walls) : null;
    const x = (reach ? reach.r : feGeom.r) - o.w - A;
    if (!(cell.l < x + o.w + ARROW_PX && cell.r > x)) return 0;
    const lift = y + o.hh - (cell.y0 - 4);
    return lift > 0 && C[1] - lift >= cell.top ? lift : 0;
  })();
  for (let u = 0; u < 2; u++) {
    const key: NameKey = u ? 'out' : 'in', name = END_NAMES[u]!, value = u ? inp.text.outValue : inp.text.inValue;
    const { w, hh, inl } = meas(key, name, value);
    let x: number, y: number;
    if (V) { x = C[0] - w / 2; y = u ? fe.b - hh - A : fe.t + A; } else {
      y = C[1] - hh / 2 - endsLift;
      const reach = inp.edge ? vesselReach(C[0], y - 4, y + hh + 4, inp.edge, inp.walls) : null;
      x = u ? (reach ? reach.r : feGeom.r) - w - A : (reach ? reach.l : fe.l) + 8 + A;
      if (u && cell && cell.l < x + w + ARROW_PX && cell.r > x && !(y + hh <= cell.y0 - 4)) {
        // (still over the cell's arms at the end: left of the cell if it clears the portal venule's name and arrow, else it stays at the end)
        const left = cell.l - ARROW_PX - w, floor = (endBox[0] ? endBox[0].x1 : -Infinity) + END_GAP;
        if (left >= floor) x = left;
      }
      // the floor: never on the portal venule's name, whatever room is left
      if (u && endBox[0]) x = Math.max(x, endBox[0].x1 + END_GAP);
    }
    const P: NamePlacement = { key, name, value, x: 0, y: 0, cx: x + w / 2, cy: y + hh / 2, w, hh, end: true, leader: null, ...(inl ? { inline: true } : {}) };
    out.push(P); by[key] = P;
    if (!V) endBox[u] = { u, x0: u ? x : x - A, x1: u ? x + w + A : x + w, y0: y, y1: y + hh };
    if (V) band[u] = u ? y - 6 : y + hh + 6;
  }
  if (V) band[0] = Math.max(band[0], inp.insTop + 12 + 8);

  const m = inp.text;
  /** Where Protein's leader lands: the particle the layer follows, or, before one is out, a place in the lumen on the callout's side (the layer re-aims it every frame). */
  const proteinAt = (x: number, side: number): [number, number] => (inp.protein ? [inp.protein.x, inp.protein.y] : [x, side * g.halfW(x) * 0.4]);
  const midTall = (x: number) => g.hepIn(x) + Math.min(UM.hep * 0.5, (W / 2 / k - g.hepIn(x)) * 0.5);   // the middle of the plate's part on screen
  const disX = (x: number) => g.wallIn(x) + g.disseW(x) * 0.5;
  const fenAt = (x: number) => calloutPore(g.pores[0]!, x, fr[0] + 3, fr[1] - 3, SEED.nucUp);
  const stellate = inp.act > 0.5;

  if (V) {
    // a portrait screen: every part is named in the plate beside it, never on it (the lumen too: the Sinusoid is a callout with its leader into the lumen, and so is the Protein,
    // Mohammad 26 Nov), the stellate cell's side (right) and the Kupffer cell's side (left) each in its own column, spaced down the screen between the ends' names,
    // each tied to what it names by a thin leader
    const u0 = Math.max(fr[0], (band[0] - C[1]) / k), u1 = Math.min(fr[1], (band[1] - C[1]) / k);
    const pick = (u: number) => lerp(u0, u1, u);
    let x = pick(0.08);
    const xp = fenAt(x);
    leader(region('fen', 'Fenestrae', m.fen, x, -midTall(x)), xp, -(g.halfW(xp) + UM.endo * 0.5));
    x = clamp(g.xs, pick(0.3), pick(0.62));
    leader(region('hsc', stellate ? 'Activated\nstellate cell' : 'Stellate\ncell', '', x, -midTall(x)), g.xs, -(disX(g.xs) + 0.6));
    region('hep', 'Hepatocyte', '', pick(0.92), -midTall(pick(0.92)));
    // the Sinusoid in the right column, between the stellate cell's name and the hepatocyte's, its leader across the plate into the lumen
    x = pick(0.78);
    leader(region('sin', 'Sinusoid', m.sin, x, -midTall(x)), x, -g.halfW(x) * 0.3);
    // the Protein in the left column, in the gap between the Space of Disse's name and the lymph's, its leader to the particle
    x = pick(0.27);
    { const [px, py] = proteinAt(x, 1); leader(region('alb', calloutOf('alb')!.word, '', x, midTall(x)), px, py); }
    x = pick(0.08);
    leader(region('disse', 'Space of\nDisse', '', x, midTall(x)), x, disX(x));
    x = pick(0.46);
    leader(region('lymph', 'Lymph', m.lymphTall, x, midTall(x)), x + 2, disX(x + 2));
    // the Kupffer cell's name in the plate beside it (the lumen is narrower than its name), a short leader across the lining to its body
    { const kx = g.xk, ky = g.halfW(kx) - 2.5 * clamp(g.halfW(kx) / 5.2, 0.6, 1); leader(region('kup', 'Kupffer\ncell', '', kx, midTall(kx)), kx, ky); }
    // no free place for a seventh name: the canaliculus is named only while a slide points at it, where its name leaves the widest gap in its column, inside the band between the ends' names
    if (inp.lit?.has('sinusoid:canaliculus')) {
      const hb = 40;
      let best: { xe: number; sg: number; sd: number; al: number } | null = null, bs = -Infinity;
      for (const sg of [-1, 1]) {
        const sd = sg < 0 ? SEED.plateUp : SEED.plateDn, used = sg < 0 ? [by.fen, by.hsc, by.hep] : [by.disse, by.lymph, by.kup];
        for (let j = Math.floor(u0 / CELL) - 1; j <= Math.ceil(u1 / CELL) + 1; j++) {
          const xe = canaliculusAt(j, sd);
          for (const al of [-3.4, 3.4]) {
            const sy = toScreen(xe + al, sg * midTall(xe))[1];
            if (sy - hb / 2 < band[0] || sy + hb / 2 > band[1]) continue;
            let sc = Infinity;
            for (const R of used) if (R) sc = Math.min(sc, Math.abs(sy - R.cy) - (hb + R.hh) / 2);
            if (sc > bs) { bs = sc; best = { xe, sg, sd, al }; }
          }
        }
      }
      if (best) {
        const yd = best.sg * (g.hepIn(best.xe) + UM.hep * 0.5);
        leader(region('bc', 'Bile\ncanaliculus', '', best.xe + best.al, best.sg * midTall(best.xe)), best.xe, yd + best.sg * 1.4);
      }
    }
    return settle(out);
  }

  // ── across the screen (2D layoutTags) ──
  // the Kupffer cell on one line just above it, clear of its highest process, in the lumen, never over its body
  const kupTop = g.halfW(g.xk) - 6.6 * clamp(g.halfW(g.xk) / 5.2, 0.6, 1);
  // (a name that has had to step aside, for an end's name or the room's edge, is tied to the cell by a leader)
  leader(region('kup', 'Kupffer cell', '', g.xk, kupTop - 0.8, { along: true, side: -1 }), g.xk, kupTop);
  // the stellate cell named just beyond its body; the fenestrae in the same plate well clear of it (120 px), with a short callout straight down to an open fenestra, clear of the stellate
  // cell's name, of the Space of Disse's and of the callout's own line (fen-place.js)
  const hs = region('hsc', stellate ? 'Activated stellate cell' : 'Stellate cell', '', g.xs, -(g.hepIn(g.xs) + 1), { side: -1 });
  const fp = 16 / k, hsHalf = hs.w / 2 / k, hsx = hs.x, hshalf = half(hs);
  const fenR = (xp: number, dx: number) => region('fen', 'Fenestrae', m.fen, xp + dx, -(g.hepIn(xp) + 1), { side: -1 });
  const disseR = (x: number) => region('disse', 'Space of Disse', '', x, -(g.wallIn(x) + g.disseW(x) * 0.5), { along: true });
  const lymphR = (x: number) => region('lymph', 'Lymph', m.lymph, x, g.hepIn(x) + 1.2, { side: 1 });
  const hepR = (x: number) => region('hep', 'Hepatocyte', '', x, g.hepIn(x) + UM.hep * (hepNv < 0.5 ? 0.78 : 0.22));
  let hepNv = 0.5;
  // (the probe regions below are measured only: they are taken back out of the list)
  const probe = <T,>(fn: () => T): T => { const n = out.length; const r = fn(); out.length = n; return r; };
  const fenW = probe(() => fenR(0, 0).w), disseW0 = probe(() => disseR(0).w);
  const spot = placeFenDisse({ pores: g.pores[0], nsd: SEED.nucUp, lo: (feGeom.l - C[0] + 6) / k, hi: (feGeom.r - C[0] - 6) / k, hs: [g.xs - hsHalf, g.xs + hsHalf], fh: fenW / 2 / k, dh: disseW0 / 2 / k, fp: 16 / k, xs: g.xs, far: 120 / k }) as { xp: number; xc: number; xq: number | null } | null;
  let xp: number, rf: NamePlacement, xq = spot ? spot.xq : null;
  if (spot) { xp = spot.xp; rf = fenR(xp, spot.xc - xp); } else {
    xp = fenAt(pickTags(0.6)); rf = fenR(xp, 0);
    if (Math.abs(rf.x - hsx) - half(rf) - hshalf < fp * 2) { out.pop(); xp = fenAt(hsx + hshalf + half(rf) + fp * 2); rf = fenR(xp, 0); }
  }
  leader(rf, xp, -(g.halfW(xp) + UM.endo * 0.5));
  if (xq != null) disseR(xq);
  else {
    xq = awayX(pickTags(0.86), g.xs, 40);
    const rq = disseR(xq);
    if (xq - half(rq) < rf.x + half(rf) + fp && xq + half(rq) > xp - fp) {
      out.pop();
      xq = rf.x + half(rf) + half(rq) + fp;
      if (xq + half(rq) > fr[1]) xq = xp - fp - half(rq);
      disseR(xq);
    }
  }
  const xd = pickTags(0.2);
  let ly = lymphR(xd);
  // a hepatocyte named on itself, clear of its nucleus
  const xh = pickTags(0.6), hc = cellAt(xh, SEED.plateDn);
  hepNv = hc.nv;
  const pad = 16 / k;
  let hl = hepR((hc.x0 + hc.x1) / 2);
  if (Math.abs(hl.x - ly.x) - half(hl) - half(ly) < pad) {
    const d = hl.x < ly.x ? -1 : 1;
    out.splice(out.indexOf(hl), 1);
    hl = hepR(clamp(ly.x + d * (half(ly) + half(hl) + pad), hc.x0 + half(hl), hc.x1 - half(hl)));
    if (Math.abs(hl.x - ly.x) - half(hl) - half(ly) < pad) { out.splice(out.indexOf(ly), 1); ly = lymphR(hl.x - d * (half(hl) + half(ly) + pad)); }
  }
  leader(ly, ly.x, g.wallIn(ly.x) + g.disseW(ly.x) * 0.5);
  // a bile canaliculus named in the far plate, just beyond it, with a short leader to it
  {
    const x = pickTags(0.8), sg = 1, sd = SEED.plateDn, xe = canaliculusAt(Math.round(x / CELL), sd), yd = sg * (g.hepIn(xe) + UM.hep * 0.5);
    leader(region('bc', 'Bile canaliculus', '', xe, yd + sg * 3, { side: 1 }), xe, yd + sg * 1.4);
  }
  // the Sinusoid and the Protein are callouts like every other name (Mohammad, 26 Nov: "callout the sinusoid somewhere with a leader" and "move the protein legend to be a
  // callout"): each stands in a plate, never on the lumen it names, in the stretch the plate's other names and its nuclei leave widest, and its leader goes into the lumen.
  // The Sinusoid keeps its reading (the pressure) with it.
  const lumenName = (
    key: NameKey, name: string, value: string, sign: number, depth: number, seed: number,
    mates: readonly (NamePlacement | undefined)[], aimOf: (x: number) => [number, number],
  ) => {
    const sz = probe(() => region(key, name, value, 0, 0)), wHalf = sz.w / 2 / k;
    const lo = pickTags(0.04), hi = pickTags(0.96);
    const obst: { x: number; half: number }[] = [];
    for (const R of mates) if (R) obst.push({ x: R.x, half: half(R) });
    // (the ends' names stand in the lumen at its ends: a leader never runs through one)
    for (const b of endBox) if (b) obst.push({ x: ((b.x0 + b.x1) / 2 - C[0]) / k, half: (b.x1 - b.x0) / 2 / k + 1 });
    for (let j = Math.floor(lo / CELL) - 1; j <= Math.ceil(hi / CELL) + 1; j++) { const c = cellOf(j, seed); obst.push({ x: c.x0 + (c.x1 - c.x0) * c.nu, half: c.nr }); }
    let bx = (lo + hi) / 2, bs = -Infinity;
    for (let x = lo; x <= hi; x += 0.5) {
      let sc = Infinity;
      for (const o of obst) sc = Math.min(sc, Math.abs(x - o.x) - o.half - wHalf);
      // (clear by 2 µm is clear enough: past that the nearer-the-middle place wins, so the name does not run to the room's side)
      sc = Math.min(sc, 2) - 0.002 * Math.abs(x - (lo + hi) / 2);
      if (sc > bs) { bs = sc; bx = x; }
    }
    const [ax, ay] = aimOf(bx);
    leader(region(key, name, value, bx, sign * (g.hepIn(bx) + depth)), ax, ay);
  };
  lumenName('sin', 'Sinusoid', m.sin, -1, 6, SEED.plateUp, [hs, rf, by.disse, by.kup], (x) => [x, -g.halfW(x) * 0.3]);
  lumenName('alb', calloutOf('alb')!.word, '', 1, 9.5, SEED.plateDn, [hl, ly, by.bc], (x) => proteinAt(x, 1));
  return settle(out);
}

/** A tap at (x, y) (px): the key of the explainable name drawn there, or null (2D explainHit: label-explain.js hitLabel with 8 px of slop, the names that have a note, the canaliculus only while it is named). */
export function explainHit(names: readonly NamePlacement[], x: number, y: number, slop = 8): { key: NameKey; target: string } | null {
  let best: NamePlacement | null = null, bd = Infinity;
  for (const n of names) {
    if (!SV_NOTE[n.key]) continue;
    if (x < n.cx - n.w / 2 - slop || x > n.cx + n.w / 2 + slop || y < n.cy - n.hh / 2 - slop || y > n.cy + n.hh / 2 + slop) continue;
    const d = Math.hypot(x - n.cx, y - n.cy);
    if (d < bd) { best = n; bd = d; }
  }
  return best ? { key: best.key, target: targetOf(best.key) } : null;
}
