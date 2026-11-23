// Plan 31c gate: the collagen atlas is memory-neutral. One atlas resident at rest (<= 44.7 MB), two only while a look crossfades (<= 89.4 MB), one again the frame the crossfade ends, and no bitmap or canvas
// stays open after its upload. Counted on real three Textures with a fake renderer that "uploads" a texture (calls onUpdate, as three does) and counts the live ones through their dispose events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Texture } from 'three';
import { CollagenAtlas, atlasBytes } from '../src/scene/lobule/collagen-atlas.ts';
import { ATLAS_W } from '../src/scene/lobule/collagen-paint.ts';
import { PLATE_PX } from '../src/scene/lobule/plate.ts';

const W = PLATE_PX * ATLAS_W, H = PLATE_PX, MB = 1e6, ONE = atlasBytes(W, H);
class FakeBitmap { open = true; width = W; height = H; close() { this.open = false; } }
class FakeCanvas { width = W; height = H; }
/** A renderer's frame: every texture that needs an upload is uploaded (its image is still there), then onUpdate runs. Tracks the live ones. */
function gpu() {
  const live = new Map<Texture, number>();
  const frame = (...ts: (Texture | null)[]) => {
    for (const t of ts) {
      if (!t || live.has(t) || t.image === null) continue;
      const img = t.image as { width: number; height: number }; live.set(t, atlasBytes(img.width, img.height));
      t.addEventListener('dispose', () => live.delete(t));
      t.onUpdate?.(t as never);
    }
  };
  return { frame, bytes: () => [...live.values()].reduce((a, b) => a + b, 0), count: () => live.size };
}

test('one atlas is 44.7 MB on the GPU (4096 x 2048 RGBA with mips)', () => {
  assert.equal(W, 4096); assert.equal(H, 2048);
  assert.ok(Math.abs(ONE / MB - 44.7) < 0.1, `${ONE / MB}`);
});

test('Plan 31c: steady state one atlas, a crossfade two, one again the frame it ends; no bitmap stays open; no spare', () => {
  const g = gpu(), a = new CollagenAtlas();
  let peak = 0;
  const bmps: FakeBitmap[] = [];
  const look = (b: FakeBitmap) => { bmps.push(b); a.stageBitmap(b as never); g.frame(a.now, a.next); peak = Math.max(peak, g.bytes()); assert.equal(b.open, false, 'closed after its upload'); assert.ok(a.crossing); };
  // the first look: painted on the page, shown at once
  a.setCanvas(new FakeCanvas()); g.frame(a.now, a.next);
  assert.equal(g.bytes(), ONE); assert.equal(g.count(), 1);
  for (let n = 0; n < 6; n++) {
    look(new FakeBitmap());
    assert.ok(g.bytes() <= 2 * ONE && g.bytes() / MB <= 89.4 + 0.1, `crossfade ${g.bytes() / MB}`);
    a.commit(); g.frame(a.now, a.next);
    assert.ok(g.bytes() <= ONE, `steady ${g.bytes() / MB} MB`); assert.equal(g.count(), 1);
  }
  console.log(`# collagen atlas GPU: steady ${(g.bytes() / MB).toFixed(1)} MB (was 89.4 resident at f51302b0, two 22.4 at 86c20270's size), crossfade peak ${(peak / MB).toFixed(1)} MB; open bitmaps ${bmps.filter((b) => b.open).length}`);
  assert.equal(bmps.filter((b) => b.open).length, 0);
  assert.ok(peak <= 2 * ONE);
  a.dispose(); assert.equal(g.bytes(), 0);
});

test('Plan 31c: a canvas painted on the page is shrunk to nothing after its upload; a lost context drops the atlas for a repaint', () => {
  const g = gpu(), a = new CollagenAtlas(), cv = new FakeCanvas();
  a.setCanvas(cv); assert.equal(cv.width, W); g.frame(a.now);
  assert.deepEqual([cv.width, cv.height], [1, 1], 'the 32 MB canvas is let go');
  const b = new FakeBitmap(); a.stageBitmap(b as never); a.reset();
  assert.equal(a.now, null); assert.equal(a.next, null); assert.equal(g.bytes(), 0, 'both atlases disposed');
  g.frame(a.now);
  a.setCanvas(new FakeCanvas()); g.frame(a.now); assert.equal(g.bytes(), ONE);
});

test('Plan 31c: the lobule scene keeps no spare atlas, no resident collagen canvas, and hands a lost context to the atlas; the worker drops its canvas after each paint', async () => {
  const { readFileSync } = await import('node:fs');
  const l3 = readFileSync('src/scene/micro3d/lobule3d.ts', 'utf8'), wk = readFileSync('src/scene/lobule/plate-worker.ts', 'utf8'), st = readFileSync('src/scene/Stage.tsx', 'utf8');
  assert.doesNotMatch(l3, /collSpare|collFront|collTex|collCanvas\b/);
  assert.match(l3, /contextRestored\(\)/); assert.match(st, /rewarm\.current = \(\) => \{\s*cel\.contextRestored\(\);/); assert.match(readFileSync('src/scene/scene.ts', 'utf8'), /this\.micro\?\.lobule\.contextRestored\(\)/);
  assert.doesNotMatch(wk, /cCanvas \?\?=/); assert.match(wk, /cCanvas = null/);
});
