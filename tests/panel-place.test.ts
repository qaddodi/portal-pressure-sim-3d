// The panel shell's place rule on a wide screen (menu unification, stage 2: surface/panel-place.ts). For five float screens, a Mac's, a big monitor's, an iPad held sideways
// (two sizes) and an iPhone held sideways: each panel's column comes from the surface table, Treat, History, Compare and Why are the right column's standard 420 px (38 % of a
// phone held sideways), Tests keeps its own wide tier (tests/place.ts, 500 to 600 px), the left column is M.sideCardW, every panel stands under the top bar and over the foot,
// and a step moves the box left by exactly the step, never up or down.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deviceClass, type Viewport } from '../src/ui/layout/device.ts';
import { surfaceModeOf } from '../src/ui/surface/mode.ts';
import { SURFACES, type PanelId } from '../src/ui/surface/kinds.ts';
import { panelBand, panelPlace, placedBox, stdWidth, PANEL_STD, PANEL_TOP_GAP, TALL } from '../src/ui/surface/panel-place.ts';
import { testsPlace } from '../src/ui/tests/place.ts';
import { topBarH, layoutClass } from '../src/ui/shell/room.ts';
import { M } from '../src/ui/shell/metrics.ts';

const vpOf = (w: number, h: number): Viewport => ({ w, h, safe: { top: 0, right: 0, bottom: 0, left: 0 } });
const SCREENS = [[1180, 820], [1366, 1024], [1440, 900], [1920, 1080], [844, 390]] as const;
const IDS: readonly PanelId[] = ['tests', 'treat', 'history', 'compare', 'why', 'action', 'timeline'];

test('every screen here is float mode (the shell places its panels)', () => {
  for (const [w, h] of SCREENS) assert.equal(surfaceModeOf(w, h), 'float', `${w}x${h}`);
});

test('the column is the surface table\'s, and the widths: 420 standard, Tests\' wide tier, the left column\'s M.sideCardW', () => {
  for (const [w, h] of SCREENS) {
    const vp = vpOf(w, h), d = deviceClass(w, h), at = `${w}x${h}`;
    for (const id of IDS) assert.equal(panelPlace(id, vp, d).column, SURFACES[id].column, `${at} ${id}: its column`);
    for (const id of ['treat', 'history', 'compare', 'why'] as const) {
      const p = panelPlace(id, vp, d);
      assert.equal(p.rect.w, stdWidth(w), `${at} ${id}: the standard width`);
      if (w >= 1180) assert.equal(p.rect.w, PANEL_STD, `${at} ${id}: 420 px on a wide screen`);
    }
    if (w === 844) assert.equal(panelPlace('history', vp, d).rect.w, Math.round(844 * 0.38), 'held sideways: 38 % of the screen');
    const t = panelPlace('tests', vp, d);
    assert.deepEqual(t.rect, testsPlace(vp, d).rect, `${at}: Tests stands where its own rule puts it`);
    if (w >= 1366) assert.ok(t.rect.w >= 500 && t.rect.w <= 600, `${at}: Tests' wide tier (${t.rect.w})`);
    assert.equal(panelPlace('action', vp, d).rect.w, M.sideCardW, `${at}: the left column is ${M.sideCardW} px`);
  }
});

test('every panel stands under the top bar and over the foot, inside the screen; the right column ends at the band\'s right edge; History is tall', () => {
  for (const [w, h] of SCREENS) {
    const vp = vpOf(w, h), d = deviceClass(w, h), b = panelBand(vp, d), at = `${w}x${h}`;
    assert.equal(b.top, topBarH(vp, layoutClass(false)) + PANEL_TOP_GAP, `${at}: the band starts ${PANEL_TOP_GAP} px under the top bar`);
    for (const id of IDS.filter((i) => i !== 'tests')) {
      const p = panelPlace(id, vp, d), r = placedBox(p, 200);
      assert.equal(p.rect.y, b.top, `${at} ${id}: under the bar`);
      assert.ok(r.y + r.h <= b.bottom + 0.5, `${at} ${id}: over the foot`);
      assert.ok(r.x >= 0 && r.x + r.w <= w + 0.5, `${at} ${id}: on the screen`);
      if (SURFACES[id].column === 'right') assert.equal(p.rect.x + p.rect.w, b.right, `${at} ${id}: at the right edge`);
      if (SURFACES[id].column === 'left') assert.equal(p.rect.x, b.left, `${at} ${id}: at the left edge`);
      assert.equal(p.tall, TALL.has(id) || SURFACES[id].column === 'full', `${at} ${id}: tall or fitted`);
      if (p.tall) assert.equal(r.h, p.maxH, `${at} ${id}: a tall panel is as tall as the room`);
      else assert.equal(r.h, Math.min(200, p.maxH), `${at} ${id}: a fitted panel takes its content's height`);
    }
    assert.ok(panelPlace('action', vp, d).maxH <= 500, `${at}: the action card's cap`);
  }
});

test('the step aside: a box moves left by exactly its step, never up or down, and the oldest has none', () => {
  for (const [w, h] of SCREENS) {
    const vp = vpOf(w, h), d = deviceClass(w, h);
    for (const id of ['treat', 'history', 'compare', 'why'] as const) {
      const at0 = placedBox(panelPlace(id, vp, d), 300), step = 432, at1 = placedBox(panelPlace(id, vp, d, { step }), 300);
      assert.equal(at0.x - at1.x, step, `${w}x${h} ${id}`);
      assert.deepEqual([at1.y, at1.w, at1.h], [at0.y, at0.w, at0.h]);
    }
    assert.equal(panelPlace('action', vp, d, { step: 100 }).step, 0, 'the left column never steps');
  }
});
