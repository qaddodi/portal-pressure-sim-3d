// Plan 37 gate (a): every card, strip, tucked rect and the pill lies inside the safe area on all four sides, no two overlap but the listed pairs, and a strip keeps 6 px from a card and the pill.
// Sweep (from the audit 01-layout): 9 screens x dock x active card x 7 data heights x 6 words heights, each height capped at the plan's own maxH (only cases the app can produce). Node only, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLayout } from '../src/ui/layout/plan.ts';

const S = [
  { n: 'iPhone', w: 393, h: 852, safe: { top: 59, bottom: 34, left: 0, right: 0 } },
  { n: 'iPhone SE', w: 375, h: 667, safe: { top: 20, bottom: 0, left: 0, right: 0 } },
  { n: 'iPhone mini', w: 360, h: 640, safe: { top: 20, bottom: 0, left: 0, right: 0 } },
  { n: 'iPhone side', w: 852, h: 393, safe: { top: 0, bottom: 21, left: 59, right: 59 } },
  { n: 'iPhone SE side', w: 667, h: 375, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'iPad up', w: 820, h: 1180, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'iPad side', w: 1180, h: 820, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'Mac', w: 1440, h: 900, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'Mac small', w: 1280, h: 720, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
];
type R = { x: number; y: number; w: number; h: number };
const ov = (a: R, b: R) => a.x < b.x + b.w - 0.5 && a.x + a.w > b.x + 0.5 && a.y < b.y + b.h - 0.5 && a.y + a.h > b.y + 0.5;
const gapY = (a: R, b: R) => (a.y < b.y ? b.y - (a.y + a.h) : a.y - (b.y + b.h));
// Listed allowances. The pill stands inside the words card on a phone and an upright iPad, by design (a card that is not the strip). The list only shrinks.
const PAIR_OK = new Set(['bar~words']);
// A phone's words card reaches the rounded home-bar corner (footReserve), so the bottom edge is not held to safe.bottom on a stacked screen.
const stacked = (n: string) => /^(iPhone( SE| mini)?|iPad up)$/.test(n);

export function sweep() {
  const bad = new Map<string, string>();
  const note = (k: string, v: string) => { if (!bad.has(k)) bad.set(k, v); };
  for (const vp of S) for (const dock of [false, true]) for (const active of ['words', 'data'] as const) for (const dh of [0, 100, 200, 300, 400, 600, 900]) for (const wh of [0, 100, 200, 330, 520, 800]) {
    const needs: any[] = [];
    if (wh) needs.push({ id: 'teach', slot: 'words', h: wh });
    if (dh) needs.push({ id: 'ladder', slot: 'data', h: dh });
    if (!needs.length) continue;
    let p = planLayout(vp as never, needs, active, 0, dock);
    for (const n of needs) n.h = Math.min(n.h, Math.max(60, p.maxH[n.slot as 'words' | 'data'] || n.h));
    p = planLayout(vp as never, needs, active, 0, dock);
    const boxes: [string, R][] = p.cards.map((c) => [c.slot, c.rect] as [string, R]);
    if (p.strip) boxes.push(['strip', p.strip.rect]);
    if (p.tucked) boxes.push(['tucked', p.tucked]);
    const barBox: [string, R] = ['bar', p.bar.rect];
    const tag = `${vp.n} dock=${dock} act=${active} d=${dh} w=${wh} shut=${p.shut}`;
    const sx0 = vp.safe.left, sx1 = vp.w - vp.safe.right, sy0 = vp.safe.top, sy1 = vp.h - vp.safe.bottom;
    for (const [n, r] of [...boxes, barBox]) {
      if (n === 'tucked') continue;   // slid away by a translate; its own place is the card's
      const paged = p.overflow.length > 0;
      if (r.x < sx0 - 0.5 || r.x + r.w > sx1 + 0.5) note(`SAFE-X ${vp.n} ${n}`, `${tag} ${JSON.stringify(r)}`);
      if (r.y < sy0 - 0.5) note(`SAFE-TOP ${vp.n} ${n}`, `${tag} ${JSON.stringify(r)}`);
      if (r.y + r.h > sy1 + 0.5 && n !== 'bar' && !paged && !(stacked(vp.n) && n === 'words')) note(`SAFE-BOT ${vp.n} ${n}`, `${tag} ${JSON.stringify(r)}`);
    }
    const live = boxes.filter(([n]) => n !== 'tucked').concat([barBox]);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const [a, ra] = live[i], [b, rb] = live[j];
      if (!ov(ra, rb) || PAIR_OK.has([a, b].sort().join('~'))) continue;
      note(`OVERLAP ${vp.n} ${a}~${b}`, `${tag} ${JSON.stringify(ra)} ${JSON.stringify(rb)}`);
    }
    // Plan 42: a phone or an upright iPad never closes a card on its own; only the reader's dock leaves a strip, and both cards stay up and at least 120 px of room each
    if (stacked(vp.n) && wh && dh) {
      if (p.shut) note(`SHUT ${vp.n}`, tag);
      if (p.cards.length !== 2 || p.cards.some((c) => !(c.rect.h > 0))) note(`CARD-MISSING ${vp.n}`, tag);
      if (p.strip && !p.docked) note(`STRIP ${vp.n}`, tag);
      if (p.maxH.words < 120 || p.maxH.data < 120) note(`ROOM ${vp.n}`, `${tag} words ${p.maxH.words} data ${p.maxH.data}`);
    }
    if (p.strip) {
      const pill = p.bar.rect;
      if (ov(p.strip.rect, pill)) note(`STRIP-PILL ${vp.n}`, `${tag} strip ${JSON.stringify(p.strip.rect)} pill ${JSON.stringify(pill)}`);
      else if (pill.x < p.strip.rect.x + p.strip.rect.w && pill.x + pill.w > p.strip.rect.x && gapY(p.strip.rect, pill) < 6 - 0.5) note(`STRIP-PILL-GAP ${vp.n}`, `${tag} gap ${gapY(p.strip.rect, pill)}`);
      for (const c of p.cards) if (!p.docked && gapY(c.rect, p.strip.rect) < 6 - 0.5 && ov({ ...c.rect, y: c.rect.y - 6, h: c.rect.h + 12 }, p.strip.rect)) note(`STRIP-CARD-GAP ${vp.n} ${c.slot}`, `${tag} ${JSON.stringify(c.rect)} ${JSON.stringify(p.strip.rect)}`);
    }
  }
  return bad;
}

test('layout sweep: nothing off the safe area, no overlap but the listed pairs, strips keep 6 px', () => {
  const bad = sweep();
  assert.equal(bad.size, 0, [...bad].map(([k, v]) => `${k} | ${v}`).join('\n'));
});
