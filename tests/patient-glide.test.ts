// A new patient glides on the display side only: the model's numbers (the frame, the target) are the new patient's at once; what is drawn travels to them (owner, 20 Nov).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { VesselData, EDGE_COUNT, PATIENT_EASE_MS } from '../src/engine/vessel-data.ts';
import { useSwitching, switchBegins, switchLands, switchEnds, SWITCH_WINDOW_MS } from '../src/ui/patients/switching.ts';

const frame = (p: number, q: number, d: number, jump: boolean) => ({ Pf: new Float32Array(64).fill(p), Qf: new Float32Array(EDGE_COUNT).fill(q), D: new Float32Array(EDGE_COUNT).fill(d), jump }) as never;

test('the first frame lands at once, a jump frame glides from the old numbers to the new, a plain frame lands at once', () => {
  const v = new VesselData();
  assert.ok(v.update(frame(10, 2, 8, false), 1, 0)); assert.equal(v.data[0], 10); assert.equal(v.easing, false);
  assert.ok(v.update(frame(20, 6, 12, true), 2, 1000));
  assert.ok(v.easing && v.fresh, 'a jump starts a glide');
  assert.equal(v.data[0], 10, 'nothing has moved at the start of the glide');
  v.update(null, 2, 1000 + PATIENT_EASE_MS / 2);
  assert.ok(v.data[0]! > 10 && v.data[0]! < 20 && !v.fresh, 'half way, between the two patients');
  assert.ok(v.data[2]! > 8 && v.data[2]! < 12, 'width glides too');
  v.update(null, 2, 1000 + PATIENT_EASE_MS);
  assert.equal(v.data[0], 20); assert.equal(v.easing, false, 'it lands exactly on the model\'s number');
  v.update(frame(21, 6, 12, false), 3, 3000);
  assert.equal(v.data[0], 21, 'a live frame is not eased');
});

test('a frame that arrives during the glide changes where it is going, not where it is', () => {
  const v = new VesselData();
  v.update(frame(10, 0, 8, false), 1, 0); v.update(frame(20, 0, 8, true), 2, 100);
  v.update(frame(30, 0, 8, false), 3, 100 + PATIENT_EASE_MS / 2);
  v.update(null, 3, 100 + PATIENT_EASE_MS);
  assert.equal(v.data[0], 30);
});

test('the switching window opens at the load and closes a moment after it lands', async () => {
  switchBegins(); assert.equal(useSwitching.getState().on, true);
  switchLands(); assert.equal(useSwitching.getState().on, true); assert.ok(SWITCH_WINDOW_MS > 400);
  switchEnds(); assert.equal(useSwitching.getState().on, false);
});

test('the wiring: the lens colours, stents, bands and tamponade ease on a jump; the tiles roll while a patient is switching', () => {
  const sc = readFileSync('src/scene/scene.ts', 'utf8');
  assert.match(sc, /lens\.onFrame\(f, !!f\?\.jump && this\.sawFrame/);
  assert.ok(!/f\.jump \|\| !this\.sawFrame/.test(sc), 'no stent, band or tamponade snaps on a jump');
  assert.match(readFileSync('src/scene/lenses/field.ts', 'utf8'), /onFrame\(frame: FrameLike \| null, jump = false/);
  assert.match(readFileSync('src/ui/shell/PlayBar.tsx', 'utf8'), /switching && shown != null \? <Roll/);
  assert.match(readFileSync('src/ui/patients/index.ts', 'utf8'), /switchBegins\(\)[\s\S]*switchLands\(\)/);
  assert.match(readFileSync('src/scene/Stage.tsx', 'utf8'), /vesselData\.easing\) clock\.invalidate/);
});
