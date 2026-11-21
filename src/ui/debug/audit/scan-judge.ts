// ?audit, the generic judges over the page scan (scan.ts): the same questions asked of every visible thing, so what nobody thought of is judged like what somebody did. Pure.
import { contrast } from '../contrast.ts';
import { WORDS_MIN_PX, CONTRAST_TEXT } from '../limits.ts';
import type { AuditFinding, Box } from './judge.ts';
import type { RawScan, ScanItem } from './scan.ts';

/** Every check the audit runs, by id: the report lists them so a gap is visible (and the ones it cannot do are named under GAPS). */
export const CHECKS: { id: string; what: string }[] = [
  { id: 'clipped', what: 'any text, chart, picture or button cut by a clipping ancestor (overflow hidden, paint containment, an svg\'s own edge)' },
  { id: 'off-screen', what: 'anything partly past the edge of the screen' },
  { id: 'text-overlap', what: 'any two visible runs of words standing over each other' },
  { id: 'covered-by', what: 'anything covered by another painted element, found by asking the page what is on top at five points of it (elementFromPoint)' },
  { id: 'small-text', what: `any lettering under ${WORDS_MIN_PX} px as drawn (every ancestor's transform and zoom included; 0.3 px of rounding allowed)` },
  { id: 'low-contrast', what: `text against the solid background behind it, under ${CONTRAST_TEXT}:1 (3:1 for large text); skipped where the figure or an image is behind` },
  { id: 'zero-size', what: 'pictures or charts that are in the page but have no size inside a box that has, and anything with a NaN size (words with no box are collapsed on purpose and are not judged)' },
  { id: 'broken-image', what: 'images that did not load' },
  { id: 'chart-clipped', what: 'a chart or plot whose picture runs past its card (named by the card\'s title)' },
  { id: 'spill / covered / off-screen (cards)', what: 'words and pills past their card, off screen or under the footer, dock or presenter bar' },
  { id: 'fit, edge, label rules', what: 'the app\'s own screen rules (card fit, edge cut-off, labels overlapping, labels under cards, title and words sizes)' },
  { id: 'fade-instant / fade-slow', what: 'every card and label fade measured: under 70 ms is a snap, over 1.6 s drags' },
  { id: 'flash, card-pop, card-size-snap, label-slide, card-empty', what: 'the motion rules over the sampler\'s 33 ms rows' },
  { id: 'generic-pop / generic-snap', what: 'any element whose opacity, place or size jumped in a frame or two with no animation or transition running (a mutation ledger over the whole page)' },
  { id: 'anim-too-fast', what: 'every CSS animation and transition recorded (property, planned length, easing, how it ended); under 70 ms on a visible property is flagged' },
  { id: 'stall, low-fps, slow-load, unsettled', what: 'frames a second, frame gaps over 25 and 50 ms, time to settle, a page that never stopped' },
  { id: 'console', what: 'console errors and warnings, window errors, rejected promises, with the step they came in' },
];

/** What no check here can see. */
export const GAPS: string[] = [
  'Pixels: colour after blending, whether it looks right, the figure\'s own picture (the 3D canvas is one picture to the page).',
  'Text drawn into the figure\'s canvas (the GPU labels\' atlas) is not in the page, so no check reads it.',
  'Contrast is judged only where a solid background sits behind the text; over the figure or an image it is not.',
  '"Covered" sees only elements that take clicks or paint something; a transparent overlay that eats clicks is not a cover.',
  'Animations the app drives from its own clock (tweens) are seen through the 33 ms rows and the mutation ledger, not as CSS animations.',
  'A thing that is wrong in a state the walk never opens (a hover, a pinned label, a Settings toggle) is not reached.',
];

/** A text line's rect is the font's whole content area (about 1.2 em): the letters are inside it, so a clip or a neighbour that touches only the outer 12% each way is not touching words. */
export const GLYPH_INSET = 0.12;
/** One box per line of a run of words (a paragraph's single box is the union of its lines, and a number standing in the next line's gap is not over the words), each trimmed to where the letters are; boxes with no size or a NaN are dropped. */
export function lineBoxes(rects: readonly { left: number; top: number; right: number; bottom: number }[]): Box[] {
  const out: Box[] = [];
  for (const r of rects) {
    const h = (r.bottom - r.top) * GLYPH_INSET, b: Box = [r.left, r.top + h, r.right, r.bottom - h].map((v) => Math.round(v * 10) / 10) as Box;
    if (b.every(Number.isFinite) && b[2] - b[0] > 0 && b[3] - b[1] > 0) out.push(b);
  }
  return out;
}

const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const inter = (a: Box, b: Box) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const px = (v: number) => `${Math.round(v)} px`;
const SLACK = 2, CAP = 14;

/** How far a box runs past a clip box, per side. */
function past(b: Box, c: Box): { side: string; by: number }[] {
  return ([['left', c[0] - b[0]], ['top', c[1] - b[1]], ['right', b[2] - c[2]], ['bottom', b[3] - c[3]]] as [string, number][]).filter(([, v]) => v > SLACK).map(([side, by]) => ({ side, by }));
}

export function judgeScan(s: RawScan): AuditFinding[] {
  const out: AuditFinding[] = [], screen: Box = [0, 0, s.vw, s.vh];
  const add = (kind: string, sev: AuditFinding['sev'], what: string, where: string, n: { [k: string]: number }) => { n[kind] = (n[kind] ?? 0) + 1; if (n[kind]! <= CAP) out.push({ kind, sev, what, where }); };
  const n: { [k: string]: number } = {};
  const label = (i: ScanItem) => (i.kind === 'text' ? `"${i.what}"` : i.what);

  for (const i of s.items) {
    // clipped by an ancestor: part of it is hidden and part is shown (wholly hidden is a collapsed thing, not a cut one); a scroller hides by design
    if (i.clip && !i.scrolls && inter(i.box, i.clip) > 0) {
      const p = past(i.box, i.clip);
      if (p.length) add('clipped', 'fail', `${label(i)} is cut off by its container: ${p.map((x) => `${px(x.by)} at the ${x.side}`).join(', ')} hidden${i.by ? ` (in ${i.by})` : ''}`, i.what, n);
    }
    const sp = past(i.box, screen);
    if (!i.scrolls && sp.length && inter(i.box, screen) > 0) add('off-screen', 'fail', `${label(i)} runs past the screen: ${sp.map((x) => `${px(x.by)} at the ${x.side}`).join(', ')}${i.by ? ` (in ${i.by})` : ''}`, i.what, n);
    if (i.kind === 'text' && i.px != null) {
      if (i.px < WORDS_MIN_PX - 0.3) add('small-text', 'warn', `${label(i)} is drawn at ${i.px} px (under ${WORDS_MIN_PX})`, i.what, n);
      if (i.fg && i.bg) {
        try {
          const large = i.px >= 24 || (i.bold && i.px >= 18.66), need = large ? 3 : CONTRAST_TEXT;
          const fgA = Number(/,\s*([\d.]+)\)$/.exec(i.fg)?.[1] ?? 1) * Math.min(1, i.opacity);
          const fg = i.fg.replace(/,\s*[\d.]+\)$/, `, ${fgA})`);
          const r = contrast(fg, i.bg);
          if (r < need) add('low-contrast', 'warn', `${label(i)} is ${r}:1 on its background (needs ${need})`, i.what, n);
        } catch { /* a colour this cannot read: not judged */ }
      }
    }
  }

  // two runs of words standing over each other (not the same words twice: that is a halo or a duplicate for the outline)
  const texts = s.items.filter((i) => i.kind === 'text' && area(i.box) >= 36);
  texts.sort((a, b) => a.box[0] - b.box[0]);
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!, b = texts[j]!;
      if (b.box[0] >= a.box[2]) break;
      if (a.what === b.what) continue;
      if (!!a.modal !== !!b.modal) continue;   // (a sheet over the page is not words over words: what it hides is not read)
      const o = inter(a.box, b.box) / Math.min(area(a.box), area(b.box));
      if (o > 0.2) add('text-overlap', 'fail', `${label(a)} and ${label(b)} overlap by ${Math.round(o * 100)}% of the smaller`, `${a.what} | ${b.what}`, n);
    }
  }
  for (const c of s.covered) add('covered-by', 'fail', `${c.what} is covered by ${c.by} (${c.points} of 5 points)`, c.what, n);
  for (const z of s.zero) add('zero-size', 'warn', `${z.what}: ${z.why}`, z.what, n);
  for (const b of s.broken) add('broken-image', 'fail', `${b.what} did not load`, b.what, n);
  for (const [k, v] of Object.entries(n)) if (v > CAP) out.push({ kind: k, sev: 'note', what: `${v - CAP} more ${k} findings on this step were not listed (${v} in all)`, where: '' });
  return out;
}
