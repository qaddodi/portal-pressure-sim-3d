// 21 Nov, review of "Collaterals and varices": the STOMACH name stood behind the presenter bar and the left gastric vein's name on the deck's title. Root cause: the plan keeps the figure's room
// clear of the bar (plan.ts; the deck's title stands inside the words card since the BarPlace had no title of its own, c9c09d9f, so it is one of the cards' own rects), but the store published only words, data and strip, and each label layer listed those three itself. One list now (`talkRects`), bar and title in it.
// Also: a first value on a time-lapse chart never stands on its own ring while a clear place exists (plot/labels.ts had no place left of or centred on the ring).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useUi, talkRects } from '../src/ui/ui-store.ts';
import { placeStarts } from '../src/ui/charts/plot/labels.ts';

const r = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

test('the presenter bar is published and are blockers with the cards', () => {
  const ui = useUi.getState();
  ui.openDeck({ id: 'x' } as never);
  ui.publishPlan({ cards: [{ slot: 'words', rect: r(20, 120, 360, 300) }], strip: null, free: r(380, 0, 520, 800), docked: false, bar: { edge: 'foot', rect: r(900, 740, 300, 48) } } as never);
  const b = useUi.getState().boxes;
  assert.equal(b.bars.length, 1);
  assert.deepEqual(talkRects(b), [r(20, 120, 360, 300), r(900, 740, 300, 48)]);
  useUi.getState().openDeck(null);
  assert.deepEqual(talkRects(useUi.getState().boxes), []);
});

test('no label layer lists the cards by hand any more', () => {
  for (const f of ['scene/labels/LabelLayer.tsx', 'scene/circuit/CircuitCaptions.tsx', 'scene/lobule/LobuleCaptions.tsx', 'scene/devices/probes/cards.ts']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.ok(!/\[\s*b\.words,\s*b\.data,\s*b\.strip\s*\]/.test(src), `${f} reads the talk's boxes through talkRects`);
  }
});

test('a first value finds the clear place left of its ring when everything from the ring rightward is taken', () => {
  const f = 12, own: [number, number, number][] = [[200, 100, 4]];
  // (everything right of the ring is walled in, e.g. by the lines and the axis numbers: only a place left of the ring is clear)
  const [p] = placeStarts({ f, area: [3, 400, 3, 200], texts: ['11.1 mmHg'], own, circles: own, lines: [], rects: [[197, 400, 3, 200]], width: () => 56 });
  const [x0, x1, y0, y1] = p!.box;
  assert.ok(x1 < 197, `the value stands wholly left of the walled-in part (box x ${x0.toFixed(0)}-${x1.toFixed(0)})`);
});
