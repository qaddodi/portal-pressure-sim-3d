// A fresh Doppler probe must appear while the view drifts a little under it (owner lead, 21 Nov: the gentle tilt, a laptop's pointer or a phone's motion sensor, moves the figure every frame in free play).
// Root cause: the probe's "wait to see its place hold still for 200 ms" (2D createProbeMind, `sig`) was keyed on the plate's map to 0.01, the gate's place to 4 px and the turn to 5 degrees, so any drift
// restarted the wait every search and a probe not yet shown never came in. What has to hold still is the PLACE it would take (side, end, size), not the view's numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { DopplerProbe } from '../src/scene/devices/probes/doppler-probe.ts';
import type { ScreenEnv } from '../src/scene/devices/probes/screen.ts';

const cards = [{ x0: 1, y0: 57, x1: 399, y1: 336 }, { x0: 1, y0: 592, x1: 399, y1: 852 }, { x0: -1, y0: -1, x1: 394, y1: 103 }, { x0: -1, y0: 818, x1: 394, y1: 853 }];
/** A phone's stage with the RHV in its free band; `wobble(t)` is the tilt: the figure's plane turns a hair and shifts a px or two every frame. */
const env = (wobble: () => { s: number; dx: number; dy: number }): ScreenEnv => ({
  project: (p: Vector3, out) => { const w = wobble(); out.x = 370 + p.x * 660 * w.s + w.dx; out.y = 1235 - p.y * 660 * w.s + w.dy; return out; },
  size: () => ({ w: 393, h: 852 }), cards: () => cards, avoid: () => [], moving: () => false, presenting: () => false,
});

function shownAfter(ms: number, drift: boolean): number {
  const d = new DopplerProbe(createShared());
  let now = 0, k = 0;
  const e = env(() => drift ? { s: 1 + 0.004 * Math.sin(k * 0.37), dx: 3 * Math.sin(k * 0.21), dy: 2.5 * Math.cos(k * 0.29) } : { s: 1, dx: 0, dy: 0 });
  for (let t = 0; t < ms; t += 16) { k++; now += 16; d.update(16, true, 'RHV_IVC', null, e, now); }
  const s = d.shown; d.dispose(); return s;
}

test('on a still view the probe comes in', () => assert.equal(shownAfter(3000, false), 1));
test('on a view that drifts every frame (the tilt) the probe still comes in', () => assert.ok(shownAfter(3000, true) > 0.9, 'shown'));
