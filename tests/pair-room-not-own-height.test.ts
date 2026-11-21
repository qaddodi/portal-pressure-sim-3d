import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLayout, type Need } from '../src/ui/layout/plan.ts';
import { pathLayout, patientOf } from '../src/ui/charts/path/model.ts';

// Mohammad, 21 Nov: on a Mac the algorithm cards showed the iPhone's small map. Root cause: the pair is centred by its own height (pairTop), and the data card's cap (its room, --pz-room,
// which the path card sizes itself against) was measured from that centred top, so it was the card's own height plus half the slack: a card that had drawn the small map had less room,
// which kept it the small map. 2D's cap is the pair's room at its highest (the top margin), whatever the pair's height now.
const macs = [{ w: 1440, h: 900 }, { w: 1512, h: 982 }, { w: 1280, h: 800 }, { w: 1920, h: 1080 }].map((v) => ({ ...v, safe: { top: 0, right: 0, bottom: 0, left: 0 } }));
const pair = (wh: number, dh: number): Need[] => [{ id: 'teach', slot: 'words', h: wh }, { id: 'ladder', slot: 'data', h: dh }];

test('the data card\'s room on a Mac does not depend on the data card\'s own height', () => {
  for (const vp of macs) {
    const a = planLayout(vp, pair(260, 280)), b = planLayout(vp, pair(260, 420));
    assert.equal(a.maxH.data, b.maxH.data, `${vp.w}x${vp.h}: a short card has as much room as a tall one`);
    assert.equal(a.maxH.words, planLayout(vp, pair(260, 280)).maxH.words);
    assert.ok(a.maxH.data >= 280 + 40, `${vp.w}x${vp.h}: the room is more than the card stands in now`);
  }
});

test('the room is the pair\'s room at the top margin: screen less margins, the gap and the words\' card', () => {
  const vp = macs[0]!, p = planLayout(vp, pair(260, 280));
  const top = p.cards[0]!.rect.y, gap = p.cards[1]!.rect.y - (top + 260);
  assert.ok(p.maxH.data >= vp.h - 2 * 40 - gap - 260 - 1, 'at least the screen less two margins');
});

test('a Mac card that has the room draws the whole chart, not the small map', () => {
  // 1440 x 900, a 260 px words card, a 300 px data card: its inner width is 489 - 2 x 29 = 431. The old cap (421) left the Ascites algorithm 331 px (the small map); the room now is the pair's.
  const vp = macs[0]!, p = planLayout(vp, pair(260, 300));
  const room = p.maxH.data - 90;   // the card's padding and header
  const L = pathLayout('ascites', patientOf('ascites', null, null), 431, { room });
  assert.equal(L.compact, false, 'the Ascites algorithm stands whole in a Mac card that has the room');
  assert.equal(pathLayout('ascites', patientOf('ascites', null, null), 431, { room: 332 }).compact, true, 'the same chart in the old, self-referential room was the small map');
});
