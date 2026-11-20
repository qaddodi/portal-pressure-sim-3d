// The streaks move WITH the blood, the way the chevron heads of the same stream point and move, at a speed that is the stream's (the engine's velocity), and turn round when the flow does (Mohammad, 20 Nov: "streaks are
// flowing opposite to flow and velocity"). One convention at every site: the streak pattern's phase is `along - flow * sp` (sp above 0) and the heads' lattice stands at `flow + j P`, so both are carried by the SAME stream
// distance with the same sign; the heads point toward sign(velocity). Pinned in the JS twin, in the stream's own numbers, and in the text of every shader that draws them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STREAK, STREAK_FIELD_GLSL, streakAlong } from '../src/scene/blood/streak-glsl.ts';
import { DUST_GLSL } from '../src/scene/blood/dust-glsl.ts';
import { advanceStreamAt } from '../src/scene/blood/blood.copied.js';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { MICRO_FS } from '../src/scene/micro3d/cel3d.ts';

type S = { D: number; vd: number; vm?: number; sgn?: number };
function run(mean: number, rev: boolean, steps = 80): { D0: number; D1: number; vd: number; st: S } {
  const st: S = { D: 0, vd: 0 };
  const opts = { dt: 0.05, bt: 0, speed: 1, large: false, rev };
  const adv = advanceStreamAt as unknown as (s: S, means: number[], nows: number[], k: number, o: typeof opts) => S;
  for (let i = 0; i < 40; i++) adv(st, [mean], [mean], 0, opts);   // settle
  const D0 = st.D;
  for (let i = 0; i < steps; i++) adv(st, [mean], [mean], 0, opts);
  return { D0, D1: st.D, vd: st.vd, st };
}
const wrapDelta = (a: number, b: number): number => { const P = 8 * 256 * 28 * 4; let d = b - a; if (d > P / 2) d -= P; if (d < -P / 2) d += P; return d; };

test('the stream\'s distance runs the way the blood does: forward on a forward flow, back on a reversed one, and the heads point that way', () => {
  for (const [mean, rev, sign] of [[10, false, 1], [-10, true, -1], [3, false, 1], [-3, true, -1]] as const) {
    const r = run(mean, rev), dD = wrapDelta(r.D0, r.D1);
    assert.equal(Math.sign(r.vd), sign, `velocity ${mean} (reversed ${rev}): display speed ${r.vd}`);
    assert.equal(Math.sign(dD), sign, `velocity ${mean}: distance ran ${dD}`);
    // the heads (vessels/shaders.ts chevOne: dir = sign(vd)) point the way the distance runs; the streaks' phase moves by the same distance
    const dir = r.vd !== 0 ? Math.sign(r.vd) : (rev ? -1 : 1);
    assert.equal(dir, sign);
    for (const sp of [0.15, 0.6, 1, 1.4, 1.9]) assert.equal(Math.sign(streakAlong(0, r.D1, sp) - streakAlong(0, r.D0, sp)), sign, `lane pace ${sp}`);
  }
});

test('a streak of any lane and any pace moves with the flow and never against it; the pace is above 0 always', () => {
  assert.equal(streakAlong(5, 0, 1), 5, 'a standing stream: it stands');
  for (const flow of [1, 10, 100]) for (let sp = 0.1; sp < 2.2; sp += 0.3) {
    assert.ok(streakAlong(5, flow, sp) > streakAlong(5, 0, sp), 'forward flow, forward streak');
    assert.ok(streakAlong(5, -flow, sp) < streakAlong(5, 0, sp), 'reversed flow, reversed streak');
  }
  // (the paces: WALL_SPEED of the middle's at the wall, +-SPEED_JITTER on top: none under 0, so the sign is the flow's)
  assert.ok(STREAK.WALL_SPEED * (1 - STREAK.SPEED_JITTER) > 0);
});

test('every shader that draws streaks uses the stream\'s own sign, the heads\' sign: no minus, no mirrored coordinate', () => {
  // the field: the phase is along - flow * sp, the pace positive
  assert.match(STREAK_FIELD_GLSL, /float x = along - flow \* sp \+ period \* streakHash\(idx \* 1\.7 \+ 9\.1\);/);
  assert.match(STREAK_FIELD_GLSL, /float sp = \(lanes > 1\.5 \? mix\(1\.0, streakLaneSpeed\(\(idx - h\) \/ h, h\), profile\) : 1\.0\) \* streakPace\(/);
  assert.match(STREAK_FIELD_GLSL, /float streakPace\(float seed\) \{ return 1\.0 \+ 0\.25 \* \(2\.0 \* seed - 1\.0\); \}/);
  assert.match(STREAK_FIELD_GLSL, /if \(dir < 0\.0\) t = 1\.0 - t;/);   // (the mark's shape only: it is the same both ways, and the drift is in x)
  // the Anatomy and the Circuit: the streak rides the stream's distance D (texel x) with the arc s, exactly where the heads' lattice is placed (Dm + j P along se = s)
  // (the tubes draw the dust now: the same phase, the arc minus the stream's distance times a positive pace; texel w is the stream's distance, capped in speed)
  assert.match(VESSEL_FS, /dustField\(across, sD, 0\.0, 1\.0, smS\.w, /);   // (its own: A 0, B 1)
  assert.match(VESSEL_FS, /dustField\(across, sD, chD\.y, chD\.z, texelFetch\(streamTex, ivec2\(rootIx, 0\), 0\)\.w, /);   // (the chain's: the chevrons' A and B along the root's distance)
  assert.match(DUST_GLSL, /float xs = \(se - flowFig \* sp\) \/ Pf \+ 0\.37 \* fk;/);
  assert.match(DUST_GLSL, /float ae = \(\(jj \+ 0\.1 \+ 0\.8 \* h1 - 0\.37 \* fk\) \* Pf \+ flowFig \* sp - A0\) \/ Bs;/);
  assert.match(VESSEL_FS, /float j = floor\(\(se - Dm\) \/ P \+ 0\.5\);/);
  assert.match(VESSEL_FS, /float dir = vd != 0\.0 \? sign\(vd\) : \(rv > 0\.5 \? -1\.0 : 1\.0\);/);
  assert.match(VESSEL_FS, /chevHead\(dir \* x, /);
  // the 3D lobule's and sinusoid's tubes: the streak's phase is uFlowT (the heads' too: x = vArc - uFlowT - j P), both along the tube's arc
  assert.match(MICRO_FS, /float j = floor\(\(vArc - uFlowT\) \/ P \+ 0\.5\), x = vArc - uFlowT - j \* P;/);
  assert.match(MICRO_FS, /return streakField\(vAcross, vArc \* s, uFlowT \* s, 1\.0, 1\.0, 1\.0\) \* uFlowStreak;/);
  // the sinusoid's streaked parts: the field's flow is the stream's run (uFlow), the heads' lattice stands at vP.x - uFlow and points toward sign(uFlow)
  assert.match(MICRO_FS, /streakField\(vAux, vP\.x, uFlow, uHalf, uProfile, uStreakDir\)/);
  assert.match(MICRO_FS, /chevLattice\(vP\.x - uFlow, vAux, 6\.0, max\(fwidth\(vP\.x\), 1e-5\), dir\)/);
  assert.match(MICRO_FS, /float dir = uFlow >= 0\.0 \? 1\.0 : -1\.0;/);
});
