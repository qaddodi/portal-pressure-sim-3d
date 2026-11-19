// The charts' GPU drawer in a fake browser (no GL in node): every chart of a page must get its picture however many there are. The first version made a WebGL context per
// chart; a browser keeps about 16 and drops the oldest silently, so the first charts of the ?charts gallery drew their words and none of their shapes (19 Nov 2026).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ChartGL, resetSharedGL, sharedClients } from '../src/ui/charts/gl.ts';
import { tessellate } from '../src/ui/charts/geometry.ts';
import type { Frame } from '../src/ui/charts/scene.ts';

const CONTEXT_CAP = 16;
interface World { webgl: number; drawn: Map<unknown, number>; lostDedicated: number; offscreen: FakeOffscreen | null }
let world: World;

/** A WebGL2 context that records what is drawn: every method is a no-op, drawArrays is counted. */
function fakeGL(owner: object, w: World) {
  return new Proxy({}, {
    get(_t, k: string) {
      if (k === 'drawArrays') return (_m: number, _f: number, n: number) => { w.drawn.set(owner, (w.drawn.get(owner) ?? 0) + n); };
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
      if (k === 'getAttribLocation') return () => 0;
      if (k === 'getExtension') return () => ({ loseContext() { /* */ } });
      return () => ({});
    },
  });
}
class Emitter { private fns = new Map<string, ((e: unknown) => void)[]>(); addEventListener(t: string, f: (e: unknown) => void) { this.fns.set(t, [...(this.fns.get(t) ?? []), f]); } fire(t: string) { for (const f of this.fns.get(t) ?? []) f({ preventDefault() { /* */ } }); } }
class FakeOffscreen extends Emitter {
  width = 1; height = 1; ctx: object | null = null;
  constructor() { super(); world.offscreen = this; }
  getContext(kind: string) { if (kind !== 'webgl2') return null; world.webgl++; return (this.ctx ??= fakeGL(this, world)); }
  transferToImageBitmap() { return { w: this.width, h: this.height }; }
}
class FakeCanvas extends Emitter {
  width = 300; height = 150; shown: { w: number; h: number } | null = null; own: object | null = null; dead = false;
  static live: FakeCanvas[] = [];
  getContext(kind: string) {
    if (kind === 'bitmaprenderer') return { transferFromImageBitmap: (b: { w: number; h: number }) => { this.shown = b; this.width = b.w; this.height = b.h; } };
    if (kind !== 'webgl2') return null;
    // a dedicated context: a browser keeps CONTEXT_CAP and loses the oldest silently
    world.webgl++;
    FakeCanvas.live.push(this);
    if (FakeCanvas.live.length > CONTEXT_CAP) { const old = FakeCanvas.live.shift()!; old.dead = true; world.lostDedicated++; old.fire('webglcontextlost'); }
    return (this.own ??= fakeGL(this, world));
  }
}
const frame: Frame = { w: 200, h: 80, label: '', shapes: [{ k: 'rect', x: 0, y: 0, w: 200, h: 80, r: 10, fill: [0.1, 0.1, 0.1, 0.1] }, { k: 'line', x1: 0, y1: 40, x2: 200, y2: 40, pen: { color: [0, 0, 0, 1], w: 2 } }] };
const mesh = tessellate(frame);

beforeEach(() => {
  world = { webgl: 0, drawn: new Map(), lostDedicated: 0, offscreen: null };
  FakeCanvas.live = [];
  resetSharedGL();
  (globalThis as Record<string, unknown>).OffscreenCanvas = FakeOffscreen;
});

test('forty charts on one page all get their picture, from one GPU context', () => {
  const charts = Array.from({ length: 40 }, () => { const c = new FakeCanvas(); const g = new ChartGL(c as unknown as HTMLCanvasElement); g.size(200, 80, 2); g.draw(mesh); return { c, g }; });
  assert.equal(world.webgl, 1, 'one WebGL context for all the charts');
  assert.equal(sharedClients(), 40);
  for (const { c, g } of charts) { assert.ok(g.shared && g.ok); assert.deepEqual(c.shown, { w: 400, h: 160 }, 'the chart shows a picture of its own size at 2x'); }
  assert.ok((world.drawn.get(world.offscreen) ?? 0) >= 40 * mesh.verts.length / 6, 'every mesh was drawn');
});

test('when the shared context is lost and comes back, every chart draws its last picture again', () => {
  const charts = Array.from({ length: 5 }, () => { const c = new FakeCanvas(); const g = new ChartGL(c as unknown as HTMLCanvasElement); g.size(200, 80, 1); g.draw(mesh); return { c, g }; });
  const off = world.offscreen!, before = world.drawn.get(off)!;
  off.fire('webglcontextlost');
  charts.forEach(({ c }) => { c.shown = null; });
  charts[0]!.g.draw(mesh);
  assert.equal(world.drawn.get(off), before, 'nothing is drawn into a lost context');
  off.fire('webglcontextrestored');
  for (const { c } of charts) assert.deepEqual(c.shown, { w: 200, h: 80 }, 'each chart shows its picture again');
});

test('a chart that is let go leaves the shared drawer, and its canvas is not resized before it draws (no blank flash)', () => {
  const c = new FakeCanvas(), g = new ChartGL(c as unknown as HTMLCanvasElement);
  g.size(200, 80, 1); g.draw(mesh);
  g.size(300, 120, 1);
  assert.deepEqual(c.shown, { w: 200, h: 80 }, 'still the old picture until the next draw');
  g.dispose();
  assert.equal(sharedClients(), 0);
});

test('a browser with no WebGL2 on an OffscreenCanvas falls back to a context per chart, and says so', () => {
  delete (globalThis as Record<string, unknown>).OffscreenCanvas;
  resetSharedGL();
  const c = new FakeCanvas(), g = new ChartGL(c as unknown as HTMLCanvasElement);
  g.size(200, 80, 1); g.draw(mesh);
  assert.equal(g.shared, false);
  assert.ok(g.ok);
  assert.ok((world.drawn.get(c) ?? 0) > 0);
});
