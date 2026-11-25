// A capture's JSON says what each card stands at (box, content, how far the content reaches past the box, fit, room), so a clipped card from a phone this build cannot be run on says why (Stiffness 12, Doppler 2, 25 Nov).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardBoxes } from '../src/ui/debug/audit/card-boxes.ts';

const rect = (top: number, h: number) => ({ top, bottom: top + h, height: h, width: 300 });
const el = (r: ReturnType<typeof rect>, extra: Record<string, unknown> = {}) => ({ getBoundingClientRect: () => r, ...extra });

test('a card reports its box, its content and the px its lowest child reaches past the box', () => {
  const kids = [el(rect(10, 100), { tagName: 'DIV', classList: ['a'] }), el(rect(110, 150), { tagName: 'svg', classList: ['pze-plot', 'x'] })];   // the lowest ends at 260, the card at 185
  const inner = el(rect(8, 180), { scrollHeight: 252, querySelectorAll: () => kids });
  const props: Record<string, string> = { '--pz-fit': '0.72', '--pz-room': '259px' };
  const card = el(rect(10, 175), {
    classList: ['dk-card', 'pz-data', 'has-tool'],
    style: { getPropertyValue: (k: string) => props[k] ?? '' },
    querySelector: () => inner,
    querySelectorAll: () => kids,
  });
  const doc = { querySelectorAll: () => [card] } as unknown as Document;
  const [b] = cardBoxes(doc);
  assert.equal(b.card, 'pz-data has-tool');
  assert.equal(b.box, 175);
  assert.equal(b.content, 252);
  assert.equal(b.past, 75);
  assert.equal(b.lowest, 'svg.pze-plot.x');
  assert.equal(b.fit, '0.72');
  assert.equal(b.room, '259px');
});
