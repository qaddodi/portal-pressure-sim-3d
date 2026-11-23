// The bent network's cross-links no longer kink where a host's bend carries them (Mohammad, 23 Nov 2026, the SOS slide: sinusoids kinked inside the ring). Root cause found here: a bent host moves each T's junction
// by up to ten radii and the branch followed it over only six, so a cross-link's first samples were kicked sideways (turns of 75 and 60 degrees in a few samples, 118 degrees at an 143). The ease now takes at least
// SPLAY_CARRY_SLOPE lengths of the shift, fades with a C2 curve and never reaches the branch's other end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { SPLAY_CARRY_MAX, SPLAY_CARRY_R, SPLAY_CARRY_SLOPE } from '../src/scene/lobule/weld-splay.ts';

/** The most the turn per sample changes between neighbouring samples along a course, degrees (signed turns). */
function maxJump(pts: readonly (readonly number[])[]): number {
  const t: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = [pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!], b = [pts[i + 1]![0]! - pts[i]![0]!, pts[i + 1]![1]! - pts[i]![1]!];
    t.push((Math.atan2(a[0]! * b[1]! - a[1]! * b[0]!, a[0]! * b[0]! + a[1]! * b[1]!) * 180) / Math.PI);
  }
  let m = 0; for (let i = 1; i < t.length; i++) m = Math.max(m, Math.abs(t[i]! - t[i - 1]!));
  return m;
}

test('every cross-link, inlet and twig of the net turns smoothly: no jump of the turn per sample over 8 degrees (118.6 at an 143 before)', () => {
  const net = buildLobule(7);
  let n = 0;
  for (const c of net.courses) {
    if (c.kind !== 'an' && c.kind !== 'in' && c.kind !== 'tw') continue;
    n++;
    assert.ok(maxJump(c.pts) <= 8, `${c.kind}${c.id}: ${maxJump(c.pts).toFixed(1)} degrees`);
  }
  assert.ok(n > 40, `courses ${n}`);
});

test('the carry ease is long enough to turn gently and stays off the branch\'s other end (source and constants)', () => {
  assert.ok(SPLAY_CARRY_SLOPE >= 4 && SPLAY_CARRY_MAX < 1 && SPLAY_CARRY_R === 6);
  const src = readFileSync(new URL('../src/scene/lobule/weld-splay.ts', import.meta.url), 'utf8');
  assert.match(src, /SPLAY_CARRY_SLOPE \* hyp\(dl\[0\], dl\[1\], dl\[2\]\)/, 'the ease takes lengths of the shift');
  assert.match(src, /SPLAY_CARRY_MAX \* total/);
  assert.match(src, /1 - smoother\(run \/ reach\)/, 'a C2 fade');
});
