// The room the camera frames the Sinusoid and the Lobule in is 2D's own (sinusoid-view.js freeRect, lobule-zoom.js liveFreeInto), from the same inputs, so the lumen's centre lands where 2D's does
// (Mohammad's side-by-side: ~14 px higher in 3D). Pure numbers: the room's centre is the view's centre (camera/room.ts viewOffset).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { figureRoomInputs, lobuleRoom, sinusoidRoom, viewRoom, type FigureRoomInputs } from '../src/ui/shell/room.ts';
import { layoutClass } from '../src/ui/shell/room.ts';
import { pinned2D } from './two-d-pin.ts';

const vpOf = (w: number, h: number) => ({ w, h, safe: { top: 0, right: 0, bottom: 0, left: 0 } });
const SIZES: Array<[number, number]> = [[800, 600], [1024, 768], [1440, 900]];
const centre = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2];

/** 2D's freeRect, evaluated from its own source at the pin when a checkout is there, else written out here (the same sums). */
function twoD(kind: 'sin' | 'lob', W: number, H: number, i: FigureRoomInputs): { l: number; t: number; r: number; b: number } {
  const css: Record<string, number> = { '--top-safe': i.topSafe, '--cmp-h': i.cmpH, '--pz-t': i.pzT, '--pz-b': i.pzB, '--pz-l': i.pzL, '--pz-r': i.pzR, '--bot-occ': i.botOcc, '--dock-occ': i.botOcc, '--right-occ': 0 };
  const cssN = (k: string) => css[k] || 0;
  if (kind === 'sin') {
    const t = cssN('--top-safe') + cssN('--cmp-h') + cssN('--pz-t') + 8 + (cssN('--pz-t') ? 0 : 40);
    const pill = i.presenting ? 0 : (cssN('--bot-occ') || 12 + 8 + 42) + 8;
    const b = H - cssN('--pz-b') - Math.max(34, pill), l = 12 + cssN('--pz-l'), r = W - 12 - cssN('--pz-r');
    return { l: Math.round(l), t: Math.round(t), r: Math.round(Math.max(l + 80, r)), b: Math.round(Math.max(t + 80, b)) };
  }
  const t = cssN('--top-safe') + cssN('--cmp-h') + cssN('--pz-t') + 8, l = 12 + cssN('--pz-l');
  const pzR = cssN('--pz-r') + 12, pzB = cssN('--pz-b') + 8;
  const b0 = H - (cssN('--dock-occ') || cssN('--bot-occ') || 100) - pzB, r0 = W - pzR;
  return { l, t, r: Math.max(l + 80, r0), b: b0 };
}

test('the Sinusoid room is 2D\'s freeRect: centre equal at 800x600, 1024x768, 1440x900, with and without a card, presenting or not', () => {
  for (const [w, h] of SIZES) {
    const vp = vpOf(w, h), base = figureRoomInputs(vp, layoutClass(false));
    for (const cmpH of [0, 56]) for (const card of [false, true]) for (const presenting of [false, true]) {
      const i: FigureRoomInputs = { ...base, cmpH, presenting, pzT: card ? 120 : 0, pzB: card ? 90 : 0, pzL: card ? 20 : 0, pzR: card ? 330 : 0 };
      const f = twoD('sin', w, h, i), room = sinusoidRoom(vp, i);
      assert.deepEqual(centre(room), [(f.l + f.r) / 2, (f.t + f.b) / 2], `${w}x${h} cmp ${cmpH} card ${card} presenting ${presenting}`);
      assert.deepEqual([room.x, room.y, room.x + room.w, room.y + room.h], [f.l, f.t, f.r, f.b]);
    }
  }
});

test('free play on a laptop gives the Sinusoid 2D\'s numbers: 12 px sides, the top bar + 48, the foot (--bot-occ 122) + 8 under it', () => {
  const r = viewRoom('sinusoid', vpOf(1440, 900), 'desktop');
  assert.deepEqual(r, { x: 12, y: 64 + 48, w: 1440 - 24, h: 900 - 130 - 112 });
});

test('the Lobule room is 2D\'s liveFreeInto: centre equal at the same sizes, with and without a card\'s room', () => {
  for (const [w, h] of SIZES) {
    const vp = vpOf(w, h), base = figureRoomInputs(vp, layoutClass(false));
    for (const cmpH of [0, 56]) for (const card of [false, true]) {
      const i: FigureRoomInputs = { ...base, cmpH, pzT: card ? 120 : 0, pzB: card ? 90 : 0, pzL: card ? 20 : 0, pzR: card ? 330 : 0 };
      const f = twoD('lob', w, h, i), room = lobuleRoom(vp, i);
      assert.deepEqual(centre(room), [(f.l + f.r) / 2, (f.t + f.b) / 2], `${w}x${h} cmp ${cmpH} card ${card}`);
    }
  }
});

test('a phone: the thumb bar\'s foot takes the same sum 2D publishes (--bot-occ), the room follows it', () => {
  const vp = { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } };
  const i = figureRoomInputs(vp, layoutClass(true));
  assert.equal(i.topSafe, 47 + 64);
  const r = sinusoidRoom(vp, i);
  assert.equal(r.y, 47 + 64 + 48);
  assert.equal(r.y + r.h, Math.round(844 - (i.botOcc + 8)));
});

test('the other views keep the screen less the bars; the shell hands the camera the view\'s own room', () => {
  const vp = vpOf(1440, 900);
  assert.deepEqual(viewRoom('body', vp, 'desktop'), viewRoom('circuit', vp, 'desktop'));
  const shell = readFileSync(new URL('../src/ui/shell/Shell.tsx', import.meta.url), 'utf8');
  const acts = readFileSync(new URL('../src/ui/shell/view-actions.ts', import.meta.url), 'utf8');
  assert.match(shell, /viewRoom\(useShell\.getState\(\)\.view, vp,/);
  assert.match(acts, /viewRoom\(v, vp, device\)/);
});

test('the 2D source at the pin still says what this copies', { skip: pinned2D('src/ui/sinusoid-view.js').skip }, () => {
  const { repo } = pinned2D('src/ui/sinusoid-view.js');
  const sin = readFileSync(`${repo}/src/ui/sinusoid-view.js`, 'utf8');
  assert.ok(sin.includes("const t = cssN('--top-safe') + cssN('--cmp-h') + cssN('--pz-t') + 8 + (cssN('--pz-t') ? 0 : 40);"));
  assert.ok(sin.includes("const pill = pres ? 0 : (cssN('--bot-occ') || gapPx + 8 + 42) + 8;"));
  assert.ok(sin.includes("const b = H - cssN('--pz-b') - Math.max(34, pill), l = 12 + cssN('--pz-l'), r = W - 12 - cssN('--pz-r');"));
  const lob = readFileSync(`${repo}/src/ui/lobule-zoom.js`, 'utf8');
  assert.ok(lob.includes("let t = cssN('--top-safe') + cssN('--cmp-h') + cssN('--pz-t') + 8, l = 12 + cssN('--pz-l');"));
  assert.ok(lob.includes("const b0 = H - (cssN('--dock-occ') || cssN('--bot-occ') || 100) - pzB, r0 = W - pzR;"));
});
