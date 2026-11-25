// Every card and strip the planner places lies inside the screen, on every kind of screen, whatever height the data card measures; and the strip button keeps its width against the 2D phone rule
// that shrank it to a 2 px stub (the grey bar at the top left of fibrosis and spleen stiffness, 22 Nov: a data card too tall for a phone shows as a strip).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLayout } from '../src/ui/layout/plan.ts';

const SCREENS = [
  { n: 'iPhone', w: 393, h: 852, safe: { top: 59, bottom: 34, left: 0, right: 0 } },
  { n: 'iPhone SE', w: 375, h: 667, safe: { top: 20, bottom: 0, left: 0, right: 0 } },
  { n: 'iPhone side', w: 852, h: 393, safe: { top: 0, bottom: 21, left: 59, right: 59 } },
  { n: 'iPad up', w: 820, h: 1180, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'iPad side', w: 1180, h: 820, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'Mac', w: 1440, h: 900, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
];

test('every placed card and strip lies inside the screen, for any data height, docked or not', () => {
  for (const vp of SCREENS) for (const dock of [false, true]) for (const active of ['words', 'data'] as const) for (const dh of [0, 120, 260, 400, 600, 900]) for (const wh of [150, 330, 520]) {
    const needs = [{ id: 'teach', slot: 'words', h: wh }, { id: 'ladder', slot: 'data', h: dh }] as { id: string; slot: 'words' | 'data'; h: number }[];
    let p = planLayout(vp as never, needs as never, active, 0, dock);
    // (a card is never taller than the room its plan gives it: it pages or fits first, as the card layer does; the room of each follows the other's height, so twice)
    for (let k = 0; k < 2; k++) { for (const n of needs) if (n.h) n.h = Math.min(n.h, Math.max(60, p.maxH[n.slot] || n.h)); p = planLayout(vp as never, needs as never, active, 0, dock); }
    const boxes = [...p.cards.map((c) => c.rect), ...(p.strip ? [p.strip.rect] : []), ...(p.tucked ? [p.tucked] : [])];
    for (const r of boxes) {
      const at = `${vp.n} dock=${dock} ${active} data ${dh} words ${wh}: ${JSON.stringify(r)}`;
      assert.ok(r.x >= 0 && r.x + r.w <= vp.w + 0.5 && r.w > 0, `off screen sideways: ${at}`);
      // (a phone on its side: the instrument bleeds off the foot by design, only its top edge is on the screen; docs/approved/landscape-phone.md)
      const bleeds = p.sideways && r === p.cards.find((c) => c.slot === 'data')?.rect;
      assert.ok(r.y >= 0 && (r.y + r.h <= vp.h + 0.5 || p.overflow.length > 0 || bleeds), `off screen vertically: ${at}`);
      if (bleeds) assert.ok(r.y < vp.h - 30, `the bleeding card shows its edge: ${at}`);
    }
  }
});

test('the strip keeps its full width against the 2D phone rule (width: auto !important)', () => {
  const css = readFileSync(new URL('../src/ui/deck-ui.css', import.meta.url), 'utf8');
  assert.match(css, /\.deck-ui\.pz \.dk-strip\.pz-shade \{[^}]*width: 100% !important/);
  assert.match(readFileSync(new URL('../src/ui/styles/app-05-presenter-cards.css', import.meta.url), 'utf8'), /\.pz-shade\.stack \{[^}]*width: auto !important/);
});
