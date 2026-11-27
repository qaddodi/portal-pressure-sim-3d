// The right column on a wide screen (coordinator, 27 Nov, from the owner's Mac report: History opened beside Tests stood behind it and Treat went away; History and Treat would not
// stand together). The rule: up to two panels side by side, any two, when both fit and leave the figure 400 px; the one opened first keeps the right edge and the next stands left of
// it with one gap; a third puts away the one opened longest ago. For every pair and order on four wide screens the boxes never overlap, each is wholly on the screen, and the zoom
// pill's reach and the figure's room count both.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deviceClass, type Rect, type Viewport } from '../src/ui/layout/device.ts';
import { testsPlace } from '../src/ui/tests/place.ts';
import { putsAway, type SlotPanel } from '../src/ui/surface/slots.ts';
import { columnSteps, columnWidth, fitsTogether, FIGURE_MIN, panelBand, panelPlace, placedBox, stdWidth, steppedPlace, PANEL_STD } from '../src/ui/surface/panel-place.ts';
import { panelFree, panelReach, figureRoom, PANEL_AIR, type PanelBox } from '../src/ui/surface/room.ts';
import { freeRoom, layoutClass } from '../src/ui/shell/room.ts';

const vpOf = (w: number, h: number): Viewport => ({ w, h, safe: { top: 0, right: 0, bottom: 0, left: 0 } });
const SCREENS = [[1180, 820], [1366, 1024], [1440, 900], [1920, 1080]] as const;
const RIGHT = ['tests', 'treat', 'history', 'compare', 'why'] as const satisfies readonly SlotPanel[];

/** Opens the panels in turn as the wire does: each joins the order at the end and puts away what the table says. */
function openInTurn(vp: Viewport, ids: readonly SlotPanel[]): SlotPanel[] {
  const d = deviceClass(vp.w, vp.h), testsW = testsPlace(vp, d).rect.w;
  const fits = (col: readonly SlotPanel[]) => fitsTogether(vp, d, col.map((p) => columnWidth(p, vp, d, testsW)));
  let order: SlotPanel[] = [];
  for (const p of ids) { const away = putsAway(p, order, 'float', fits); order = [...order.filter((q) => !away.includes(q)), p]; }
  return order;
}

/** Each open panel's box where the shell stands it (Tests by its own rule, the rest by the panel rule), stepped by the column. */
function boxes(vp: Viewport, order: readonly SlotPanel[]): Record<string, Rect> {
  const d = deviceClass(vp.w, vp.h), base = testsPlace(vp, d), gap = panelBand(vp, d).gap;
  const steps = columnSteps(order, (p) => columnWidth(p, vp, d, base.rect.w), gap), out: Record<string, Rect> = {};
  for (const p of order) {
    const step = steps[p] ?? 0;
    out[p] = p === 'tests' ? steppedPlace(base, step).rect : placedBox(panelPlace(p, vp, d, { step }), 480);
  }
  return out;
}
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const [w, h] of SCREENS) {
  const vp = vpOf(w, h), d = deviceClass(w, h);
  test(`${w} x ${h}: any two right-hand panels in either order never overlap, stand on the screen, and the reach and the figure's room count both`, () => {
    assert.equal(d, 'desktop');
    for (const a of RIGHT) for (const b of RIGHT) {
      if (a === b) continue;
      const order = openInTurn(vp, [a, b]), bx = boxes(vp, order), list = order.map((p) => bx[p]!);
      const both = order.length === 2;
      assert.equal(order[order.length - 1], b, 'the newest is always up');
      if (!both) assert.ok(!fitsTogether(vp, d, [a, b].map((p) => columnWidth(p, vp, d))), `${a} then ${b}: one went only because the two do not fit`);
      for (const r of list) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h, `${a} then ${b}: on the screen (${JSON.stringify(r)})`);
      if (both) {
        assert.ok(!overlap(list[0]!, list[1]!), `${a} then ${b}: no overlap`);
        assert.ok(list[0]!.x > list[1]!.x, 'the first keeps the right edge, the next stands left of it');
        assert.equal(list[0]!.x - (list[1]!.x + list[1]!.w), panelBand(vp, d).gap, 'one gap between them');
        assert.ok(Math.min(...list.map((r) => r.x)) >= FIGURE_MIN, 'the figure keeps its 400 px');
      }
      const pb: PanelBox[] = list.map((rect) => ({ rect, side: 'right' }));
      const left = Math.min(...list.map((r) => r.x));
      assert.equal(panelReach(w, pb), w - left, 'the zoom pill steps aside by the farthest one');
      const room = freeRoom(vp, layoutClass(false)), free = panelFree(room, pb);
      assert.ok(free.x + free.w <= left - PANEL_AIR + 0.5, 'the figure\'s room ends before both');
      const fr = figureRoom(room, pb);
      assert.equal(fr.w, room.w); assert.ok(Math.abs(fr.x + fr.w / 2 - (free.x + free.w / 2)) < 0.5, 'panned to the middle of what both leave, never squeezed');
    }
  });
  test(`${w} x ${h}: a third puts away the one opened longest ago, and the rest glide right to fill`, () => {
    const order = openInTurn(vp, ['treat', 'history', 'tests']);
    assert.ok(!order.includes('treat'), 'Treat, opened first, went');
    // (an iPad on its side holds one: each newer one replaced the one before)
    if (w < 1366) { assert.deepEqual(order, ['tests']); return; }
    const bx = boxes(vp, order);
    assert.equal(bx.history!.x + bx.history!.w, w - panelBand(vp, d).gap, 'History, now the oldest, keeps the right edge');
  });
}

test('the standard width is 420 px on every wide screen, the CSS token says the same, and two standard panels fit from 1366 px', () => {
  for (const [w] of SCREENS) assert.equal(stdWidth(w), PANEL_STD);
  assert.equal(fitsTogether(vpOf(1180, 820), 'desktop', [420, 420]), false, 'an iPad on its side holds one');
  assert.equal(fitsTogether(vpOf(1366, 1024), 'desktop', [420, 420]), true);
  assert.equal(fitsTogether(vpOf(1440, 900), 'desktop', [testsPlace(vpOf(1440, 900), 'desktop').rect.w, 420]), true, 'Treat beside Tests on a Mac');
  assert.equal(fitsTogether(vpOf(1440, 900), 'desktop', [500, 420], true), false, 'with the left column up the figure would keep too little');
});
