import type { Vector3 } from 'three';
// How the FibroScan probe turns to keep itself on the screen and clear of the cards: stage-scan.js scanTurn, scanBody, scanHead and scanClear, in the 2D app's own numbers, on the screen's pixels.
// (They are closures inside 2D's stage and cannot be copied by script; every number below is read from there: the body's corners 92 px back along the axis and 13 px either side, the body proper 76 px
// back and 13.8 either side, the screen edge 8 px, the top edge 4 px, the turn from 45 up to 80 degrees and down to 10, in steps of 5.) Pure: node judges all of it.
import type { Box } from './screen.ts';

export const SCAN_EDGE = 8;
const rad = (d: number): number => (d * Math.PI) / 180;

/** The probe's body (its four corners, 92 px back along it and 13 px either side of the tip's line) turned to `deg`, on the screen. */
export function scanBody(tx: number, y: number, deg: number, out: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }): Box {
  const a = rad(deg), c = Math.cos(a), sn = Math.sin(a);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 4; i++) {
    const u = i & 1 ? -2 : -92, v = i & 2 ? 13 : -13, px = tx + u * c - v * sn, py = y + u * sn + v * c;
    if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  out.x0 = x0; out.y0 = y0; out.x1 = x1; out.y1 = y1;
  return out;
}

const leftOk = (tx: number, d: number): boolean => tx - 92 * Math.cos(rad(d)) - 13 * Math.sin(rad(d)) >= SCAN_EDGE;
const topOk = (y: number, d: number): boolean => y - 76 * Math.sin(rad(d)) - 13.8 * Math.cos(rad(d)) >= 4;
const bodyLeftOk = (tx: number, d: number): boolean => tx - 76 * Math.cos(rad(d)) - 13.8 * Math.sin(rad(d)) >= 4;   // (only the body must stay on screen; the cable is a short stub)

/** Whether the body, turned for the organ, is clear of every card. */
function clear(cards: readonly Box[], tx: number, y: number, d: number, spleen: boolean): boolean {
  if (!cards.length) return true;
  const q = scanBody(tx, y, spleen ? 180 - d : d);
  for (const b of cards) if (b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0) return false;
  return true;
}

/**
 * The probe's tilt below the level at a tip (screen px): 45 degrees, steeper (up to 80) where the body would run off the left edge, flatter (down to 10) where it would run off the top, and, where a slide's
 * card comes within one margin of its body, the nearest angle that is clear of every card (the larger of two as far away). `spleen`: the probe stands on the organ's right (the same tilt from the other side:
 * the tests are made against the stage's right edge, by the tip's distance from it). `cards`: only when a slide is presenting (2D scanCards); `w`: the stage's width.
 */
export function scanTilt(tx: number, y: number, spleen: boolean, w: number, cards: readonly Box[]): number {
  const edge = (ok: (x: number, d: number) => boolean, x: number, d: number): boolean => (spleen ? ok(w - x, d) : ok(x, d));
  let deg = 45;
  while (deg < 80 && !edge(leftOk, tx, deg)) deg += 5;
  if (edge(leftOk, tx, deg)) while (deg > 10 && !topOk(y, deg) && edge(bodyLeftOk, tx, deg - 5)) deg -= 5;
  if (!clear(cards, tx, y, deg, spleen)) {
    let best = -1, bestD = Infinity;
    for (let d = 10; d <= 80; d += 5) {
      if (d === deg || !edge(bodyLeftOk, tx, d) || !topOk(y, d) || !clear(cards, tx, y, d, spleen)) continue;
      const gap = Math.abs(d - deg);
      if (gap < bestD || (gap === bestD && d > best)) { bestD = gap; best = d; }
    }
    if (best >= 0) deg = best;
  }
  return deg;
}

/** The probe's turn on the screen (degrees clockwise from along +x, y down): the liver's `deg`, the spleen's 180 - deg. */
export const scanTurnOf = (deg: number, spleen: boolean): number => (spleen ? 180 - deg : deg);

/** Whether a card covers the probe's body (its head and cable fade out, the waves stay: scanHead). */
export function headCovered(tx: number, y: number, turn: number, cards: readonly Box[]): boolean {
  const q = scanBody(tx, y, turn);
  for (const r of cards) if (r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0) return true;
  return false;
}

/** Where an organ's silhouette is on the line through `anchor` along `aim` (the probe's inward direction), written into `out` (scene units); false when the organ has none there (the scene's: organ-edge.ts). */
export type OrganEdge = (organ: 'liver' | 'spleen', anchor: Vector3, aim: Vector3, out: Vector3) => boolean;
