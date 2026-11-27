// The one room channel (menu unification, stage 2: surface/room.ts usePanelRoom). Every open float panel's box is in it, published by the panel shell (wire.ts usePanelShell,
// Tests by its own layer), and the figure's room is the screen minus all of them: History, Compare, Why, Treat and Tests at the right, the action card at the left. The figure
// is panned into what they leave, never zoomed (figureRoom keeps the room's size), and the names read the same boxes (chrome-claims.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deviceClass, type Rect, type Viewport } from '../src/ui/layout/device.ts';
import { testsPlace } from '../src/ui/tests/place.ts';
import { columnSteps, columnWidth, panelBand, panelPlace, placedBox, steppedPlace } from '../src/ui/surface/panel-place.ts';
import { publishPanel, usePanelRoom, openBoxes, panelFree, figureRoom, PANEL_AIR } from '../src/ui/surface/room.ts';
import { freeRoom, layoutClass } from '../src/ui/shell/room.ts';
import type { PanelId } from '../src/ui/surface/kinds.ts';

const vpOf = (w: number, h: number): Viewport => ({ w, h, safe: { top: 0, right: 0, bottom: 0, left: 0 } });
const read = (p: string) => readFileSync(p, 'utf8');
const SETS: readonly (readonly PanelId[])[] = [['history'], ['compare'], ['why'], ['treat'], ['tests'], ['action'], ['tests', 'treat'], ['treat', 'history'], ['history', 'compare'],
  ['compare', 'why'], ['action', 'history'], ['action', 'tests'], ['action', 'treat']];

/** Publishes each panel's box as the shell stands it (right-hand panels stepped by the column, oldest first). */
function publish(vp: Viewport, ids: readonly PanelId[]): Record<string, Rect> {
  const d = deviceClass(vp.w, vp.h), base = testsPlace(vp, d), gap = panelBand(vp, d).gap, out: Record<string, Rect> = {};
  const steps = columnSteps(ids, (p) => columnWidth(p, vp, d, base.rect.w), gap);
  usePanelRoom.setState({ boxes: {} });
  for (const id of ids) {
    const step = steps[id] ?? 0;
    const rect = id === 'tests' ? steppedPlace(base, step).rect : placedBox(panelPlace(id, vp, d, { step }), 360);
    out[id] = rect;
    publishPanel(id, { rect, side: id === 'action' ? 'left' : 'right' });
  }
  return out;
}

for (const [w, h] of [[1440, 900], [1920, 1080], [1366, 1024]] as const) {
  test(`${w} x ${h}: every open panel is in the channel and the figure's room is the screen minus all of them, at the room's own size`, () => {
    const vp = vpOf(w, h), room = freeRoom(vp, layoutClass(false));
    for (const ids of SETS) {
      const boxes = publish(vp, ids), open = openBoxes(), at = `${w}x${h} ${ids.join('+')}`;
      assert.equal(open.length, ids.length, `${at}: one box each`);
      for (const id of ids) assert.deepEqual(usePanelRoom.getState().boxes[id]?.rect, boxes[id], `${at}: ${id} is in the channel`);
      const free = panelFree(room, open), right = ids.filter((i) => i !== 'action').map((i) => boxes[i]!.x), left = ids.includes('action') ? boxes.action! : null;
      if (right.length) assert.ok(free.x + free.w <= Math.min(...right) - PANEL_AIR + 0.5, `${at}: the room ends before every right-hand panel`);
      if (left) assert.ok(free.x >= left.x + left.w + PANEL_AIR - 0.5, `${at}: the room starts after the action card`);
      const fig = figureRoom(room, open);
      assert.deepEqual([fig.w, fig.h], [room.w, room.h], `${at}: panned, never zoomed`);
      assert.ok(Math.abs(fig.x + fig.w / 2 - (free.x + free.w / 2)) < 0.5, `${at}: centred in what the panels leave`);
      publishPanel(ids[0]!, null);
      assert.equal(openBoxes().length, ids.length - 1, `${at}: a closed panel leaves the channel`);
    }
    usePanelRoom.setState({ boxes: {} });
  });
}

test('every panel publishes through the shell or its own layer, and the figure, the names and the pill read the one channel', () => {
  const wire = read('src/ui/surface/wire.ts');
  assert.match(wire, /publishPanel\(id, rect && place \? \{ rect, side: place\.column === 'left' \? 'left' : 'right' \} : null\)/, 'the shell publishes a float panel\'s box');
  for (const [f, id] of [['src/ui/treat/TreatCard.tsx', 'treat'], ['src/ui/action/ActionCard.tsx', 'action']] as const) assert.match(read(f), new RegExp(`usePanelShell\\('${id}', open, ref, true\\)`), `${id}`);
  for (const [f, id] of [['src/ui/history/HistorySheet.tsx', 'history'], ['src/ui/compare/DifferencesSheet.tsx', 'compare'], ['src/ui/why/WhySheet.tsx', 'why']] as const) assert.match(read(f), new RegExp(`<ShellPanel id="${id}"`));
  assert.match(read('src/ui/tests/TestsLayer.tsx'), /publishPanel\('tests', up \?/);
  assert.match(read('src/ui/shell/Shell.tsx'), /figureRoom\(base, boxesOf\(panels\), caseCut, actionH\)/, 'the camera\'s room');
  assert.match(read('src/ui/shell/Shell.tsx'), /panelReach\(vp\.w, boxesOf\(s\.boxes\)\)/, 'the zoom pill\'s reach');
  assert.match(read('src/scene/labels/chrome-claims.ts'), /panels/, 'the names\' walls');
});
