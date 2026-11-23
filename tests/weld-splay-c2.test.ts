// The bent network's courses stay smooth (Mohammad, 23 Nov 2026, the SOS slide: sinusoids kinked inside the ring).
// Root cause 1 (cross-links): a bent host moves each T's junction by up to ten radii and the branch followed it over only six, so a cross-link's first samples were kicked sideways. The ease now takes at
// least SPLAY_CARRY_SLOPE lengths of the shift (and SPLAY_CARRY_MIN_SHARE of the branch), fades with a C2 curve and never reaches the branch's other end.
// Root cause 2 (sinusoids): where two merge at a shallow V, each arm was re-drawn from J to Q as a cubic, nearly straight, which erased the course's wiggle on J..Q and met the path at Q wherever the wiggle
// happened to be (a turn of -5 degrees per sample after +1.3 at the SOS ring's course 108). The cubic stays near J (the skins' seams see the same arms); a C2 quintic tail lands on the path at the wiggle's inflection.
// The kink of a course is the turn's departure from its neighbours' trend, and a bent course may not exceed its own unbent self by more than a degree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { SPLAY_CARRY_MAX, SPLAY_CARRY_MIN_SHARE, SPLAY_CARRY_R, SPLAY_CARRY_SLOPE, SPLAY_JOIN_EXT, SPLAY_JOIN_U0 } from '../src/scene/lobule/weld-splay.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { weldRequest } from '../src/scene/micro3d/lobule3d.ts';
import { planWelds } from '../src/scene/lobule/welds.ts';

/** A course's kink, degrees: the most the turn at a sample departs from the mean of its neighbours' turns (a smooth wiggle scores low however strong it is; a curvature jump scores high). */
export function kink(pts: readonly (readonly number[])[]): number {
  const t: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = [pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!], b = [pts[i + 1]![0]! - pts[i]![0]!, pts[i + 1]![1]! - pts[i]![1]!];
    t.push((Math.atan2(a[0]! * b[1]! - a[1]! * b[0]!, a[0]! * b[0]! + a[1]! * b[1]!) * 180) / Math.PI);
  }
  let m = 0; for (let i = 1; i < t.length - 1; i++) m = Math.max(m, Math.abs(t[i]! - (t[i - 1]! + t[i + 1]!) / 2));
  return m;
}
const KINDS = new Set(['s0', 's1', 's2', 'an', 'in', 'tw']);

test('no course of the bent net kinks more than a degree beyond its own unbent self (dozens did before; the worst gained 5.6 degrees, an 140: 0.01 to 5.65)', () => {
  const bent = buildLobule(7), flat = buildLobule(7, { bend: false });
  assert.equal(bent.courses.length, flat.courses.length);
  let n = 0, worst = 0;
  for (const c of bent.courses) {
    if (!KINDS.has(c.kind)) continue;
    n++;
    const k1 = kink(c.pts), k0 = kink(flat.courses[c.id]!.pts);
    worst = Math.max(worst, k1 - k0);
    assert.ok(k1 <= Math.max(k0 + 1, 1), `${c.kind}${c.id}: kink ${k1.toFixed(2)} (unbent ${k0.toFixed(2)})`);
  }
  assert.ok(n > 100, `courses ${n}`);
  assert.ok(worst < 1, `worst gain ${worst.toFixed(2)}`);
});

test('the SOS ring\'s sinusoid (course 108) swings into its wiggle with no step: kink at most one degree', () => {
  const c = buildLobule(7).courses[108]!;
  assert.ok(KINDS.has(c.kind), c.kind);
  assert.ok(kink(c.pts) <= 1, `${kink(c.pts).toFixed(2)}`);
});

test('the junction skins are all kept: at least 210, and every skipped junction is one of the six that were skipped before the tail', () => {
  const req = weldRequest(new LobuleView(createShared()).net);
  const plan = planWelds(req.courses, { avoid: req.avoid, splay: false });
  const BASELINE = ['T(tw150.1>s030)', 'T(tw151.1>s038)', 'T(tw153.1>s054)', 'T(tw155.1>s070)', 'Y(s050.1+s051.1+s188.0)', 'T(tw152.1>s046)'];
  assert.ok(plan.skins.length >= 210, `skins ${plan.skins.length}`);
  for (const s of plan.skipped) assert.ok(BASELINE.includes(s.node), `a new skip: ${s.node} (${s.why})`);
});

test('the tail and the carry ease keep their constants and their form (source)', () => {
  assert.ok(SPLAY_CARRY_SLOPE >= 4 && SPLAY_CARRY_MAX < 1 && SPLAY_CARRY_R === 6 && SPLAY_CARRY_MIN_SHARE === 0.3 && SPLAY_JOIN_U0 === 0.5 && SPLAY_JOIN_EXT === 8);
  const src = readFileSync(new URL('../src/scene/lobule/weld-splay.ts', import.meta.url), 'utf8');
  assert.match(src, /SPLAY_CARRY_SLOPE \* hyp\(dl\[0\], dl\[1\], dl\[2\]\), SPLAY_CARRY_MIN_SHARE \* total/, 'the ease takes lengths of the shift and a floor share');
  assert.match(src, /SPLAY_CARRY_MAX \* total/);
  assert.match(src, /1 - smoother\(run \/ reach\)/, 'a C2 fade');
  assert.match(src, /b5 \* PB\[c\]/, 'the quintic tail');
  assert.match(src, /reachMax \* 1\.3/, 'the crossing test covers the tail');
});
