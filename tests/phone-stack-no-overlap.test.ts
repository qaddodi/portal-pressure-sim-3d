// Stiffness 12 page 2 (capture 572259fd): a words card taller than the column left the instrument card standing over it. The stack never places two cards on each other, whatever the words need.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planLayout, CARD_GAP } from '../src/ui/layout/plan.ts';

const vp = { w: 440, h: 894, safe: { top: 59, bottom: 34, left: 0, right: 0 } };
for (const [wh, dh] of [[645, 240], [700, 300], [560, 245], [300, 245]] as const) {
  test(`phone stack: words ${wh} and data ${dh} never overlap`, () => {
    const p = planLayout(vp as never, [{ id: 'teach', slot: 'words', h: wh }, { id: 'tests', slot: 'data', h: dh }] as never);
    const w = p.cards.find((c) => c.slot === 'words')!.rect, d = p.cards.find((c) => c.slot === 'data')!.rect;
    assert.ok(d.y + d.h + CARD_GAP <= w.y + 0.5, `data ends ${d.y + d.h}, words start ${w.y}`);
    assert.ok(w.y + w.h <= vp.h, 'words stay on the screen');
    assert.ok(d.y >= 0, 'data stays on the screen');
    if (wh + dh > 600) assert.ok(p.overflow.includes('teach') || w.h >= wh, 'a words card cut short says so');
  });
}
