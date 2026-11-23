// (tight room, 23 Nov 2026) The sinusoid's names in the room the camera really frames it in (Mohammad's Mac play-test: the Kupffer cell's name printed over the portal venule's reading at the left edge; Fenestrae, Bile
// canaliculus and Hepatocyte jammed against the screen edge and clipped). Root cause: the layer read the cards' plan (`boxes.free`), which free play never publishes (an empty rect), so every
// name was clamped into a zero-width room at the left edge. It now reads the figure's own room (cel.rig.targetRoom) through `namesFree`, 2D's freeRect margins. Pure numbers: no DOM, no GPU.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { NAMES_SIDE, NAMES_TOP, namesFree, readings } from '../src/scene/sinusoid/captions.ts';
import { type NameKey, type NamePlacement } from '../src/scene/sinusoid/names.ts';
import { isPortrait, restScale } from '../src/scene/sinusoid/portrait.ts';
import { acrossUm } from '../src/scene/sinusoid/portrait.ts';
import { freeRoom } from '../src/ui/shell/room.ts';
import { deviceClass, type Rect } from '../src/ui/layout/device.ts';
import { layoutClass } from '../src/ui/shell/room.ts';
import { M } from '../src/ui/shell/metrics.ts';
import type { SinusoidTargets } from '../src/scene/lobule/model.ts';

const targets = (o: Partial<SinusoidTargets> = {}): SinusoidTargets => ({ por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1, ...o });
/** A name's size in px as the label type sets it (about 8 px a capital, 16 a line, 2D's padding). */
const measure = (_k: NameKey, name: string, value: string): [number, number] => {
  const lines = [...name.split('\n'), ...(value ? value.split(' · ') : [])];
  return [Math.max(...lines.map((l) => l.replace('~', ' ').length)) * 8 + 16, lines.length * 16 + 8];
};
const TEXT = readings({ P1: 17.2, P2: 10, P3: 3.9, lymph: 0.5, lyProt: 0.91 }, 1);


const hits = (a: NamePlacement, b: NamePlacement) => { const p = box0(a), q = box0(b); return p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1; };
const box0 = (n: NamePlacement) => ({ x0: n.cx - n.w / 2, x1: n.cx + n.w / 2, y0: n.cy - n.hh / 2, y1: n.cy + n.hh / 2 });
/** A caption's size as the stylesheet sets it: a name over its readings (a line of 18 and 34 px for the reading), or on one line when `inline`. */
const real = (_k: NameKey, name: string, value: string, inline = false): [number, number] => {
  const w = (s: string) => s.length * 9 + 16, vals = value ? value.split(' · ') : [], names = name.split('\n');
  if (inline) return [Math.max(...names.map(w)) + (vals.length ? 6 + Math.max(...vals.map((v) => v.length * 9)) : 0), 26];
  return [Math.max(...[...names, ...vals].map(w)), names.length * 18 + vals.length * 34 + 8];
};
test('a tall screen with both cards up: the ends and the sinusoid stand on one line each and none on another (Ascites 9, iPhone 440 x 736, capture 4bf601dd)', () => {
  for (const h of [176, 200, 240]) {
    const W = 440, H = 736, room = { x: 0, y: 274, w: W, h };
    const v = new SinusoidView(createShared()); v.setVisible(true); v.snapTargets(targets()); v.update(0); v.setPortrait(true);
    const free = namesFree(room, { w: W, h: H }), k = restScale(room.w), C: [number, number] = [room.x + room.w / 2, room.y + room.h / 2];
    const names = v.names({ W, H, C, k, free, insTop: 56, text: TEXT, lit: new Set(), measure: real });
    const three = names.filter((n) => n.end || n.key === 'sin');
    for (let i = 0; i < three.length; i++) for (let j = i + 1; j < three.length; j++) assert.ok(!hits(three[i]!, three[j]!), `${h}: ${three[i]!.name} on ${three[j]!.name}`);
    if (h <= 200) assert.ok(three.every((n) => n.inline), `${h}: short room, one line each`);
  }
  // a room with space keeps the two-line names
  const room = { x: 0, y: 100, w: 440, h: 500 }, v = new SinusoidView(createShared()); v.setVisible(true); v.snapTargets(targets()); v.update(0); v.setPortrait(true);
  const names = v.names({ W: 440, H: 736, C: [220, 350], k: restScale(440), free: namesFree(room, { w: 440, h: 736 }), insTop: 56, text: TEXT, lit: new Set(), measure: real });
  assert.ok(names.every((n) => !n.inline));
});
