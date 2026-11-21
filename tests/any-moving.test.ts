import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { anyMoving, lapTimer } from '../src/scene/any-moving';

describe('anyMoving runs every step', () => {
  it('ORs already-computed flags', () => {
    expect(anyMoving(false, true, false)).toBe(true);
    expect(anyMoving(false, false)).toBe(false);
  });
  it('a later step still runs when an earlier one is moving', () => {
    let ran = 0;
    const step = (r: boolean) => { ran++; return r; };
    expect(anyMoving(step(true), step(true), step(false))).toBe(true);
    expect(ran).toBe(3);
  });
  it('lapTimer totals per system', () => {
    let t = 0; const tot: Record<string, number> = {};
    const lap = lapTimer(tot, () => t);
    t = 5; lap('a'); t = 12; lap('b'); t = 14; lap('a');
    expect(tot).toEqual({ a: 7, b: 7 });
  });
  it('the step sites do not chain steps with ||', () => {
    const sc = readFileSync('src/scene/scene.ts', 'utf8');
    const lc = readFileSync('src/scene/labels/controller.ts', 'utf8');
    for (const re of [/stepShadow\(dt\)\s*\|\|/, /\|\|\s*this\.stepCava/, /\|\|\s*this\.feeders\.step/, /\|\|\s*\(this\.circuitSkins/]) expect(sc).not.toMatch(re);
    expect(lc).not.toMatch(/fader\.step\([^)]*\)\s*\|\|/);
  });
});
