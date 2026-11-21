// The audit's renderer and stall instruments (code review 21 Nov, #4 #5 #6 #9 #10): pure, so Node reads them in a second.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundBy, readStats, frameBegin, frameEnd, renderStats, memoryClimb, type InfoLike } from '../src/debug/render-stats.ts';
import { createClock } from '../src/clock/frame.ts';
import { fadeEpisodes, fadeFindings, stallWindows } from '../src/ui/debug/audit/judge.ts';
import { judgeStep, runAudit, type Reads, type Step } from '../src/ui/debug/audit/run.ts';
import { renderText, groupFindings, lags, transitionOf, type Bundle, type RowGpu } from '../src/ui/debug/audit/report.ts';
import { speedOf, scaleTime, scaleTimers, sampleRealMs, speedAnimations, MAX_SPEED } from '../src/ui/debug/audit/speed.ts';
import { perfReport } from '../src/ui/perf/report.ts';
import type { Sample } from '../src/ui/debug/watch/motion-rules.ts';

const info = (): InfoLike & { resets: number } => ({ render: { calls: 120, triangles: 90000, lines: 4, points: 0 }, memory: { geometries: 55, textures: 9 }, programs: [1, 2, 3], autoReset: true, resets: 0, reset() { this.resets++; this.render.calls = 0; } });
const gpu = (over: Partial<RowGpu> = {}): RowGpu => ({ calls: 100, triangles: 5e5, programs: 30, geometries: 80, textures: 12, skinRebuilds: 0, boundCpu: 0, boundGpu: 0, slow: [], ...over });
const card = (alphas: number[]): Sample[] => alphas.map((a, i) => ({ t: i * 33, K: [['teach', 16, 100, 300, 200, a]], W: [1], L: [], c: null }));

test('gl.info: read per whole frame (autoReset off, reset by hand), never the last draw call only', () => {
  const i = info(); frameBegin(i);
  assert.equal(i.autoReset, false); assert.equal(i.resets, 1);
  i.render.calls = 77; frameEnd(i);
  assert.deepEqual(renderStats(), { calls: 77, triangles: 90000, lines: 4, points: 0, programs: 3, geometries: 55, textures: 9 });
  assert.equal(readStats({ ...i, programs: null }).programs, 0);
});

test('bound by: long gap after short work is the GPU or compositor; long work is the scripts; a quiet frame is neither', () => {
  assert.equal(boundBy(3, 40), 'gpu/compositor'); assert.equal(boundBy(25, 26), 'cpu'); assert.equal(boundBy(12, 14), null); assert.equal(boundBy(2, 16), null);
});

test('the clock tags each slow frame with what it waited on, counts the two, and asks the probe for the renderer numbers', () => {
  let t = 0, cb: ((n: number) => void) | null = null;
  const c = createClock({ raf: (f) => { cb = f; return 1; }, cancel: () => undefined, now: () => t });
  c.setProbe(() => ({ calls: 9 }));
  const h = c.hold('x');
  t = 100; cb!(t);                    // first frame
  t = 160; cb!(t);                    // 60 ms gap, work 0: gpu/compositor
  const s = c.stats();
  assert.equal(s.boundGpu, 1); assert.equal(s.boundCpu, 0);
  assert.equal(s.slow[0]!.bound, 'gpu/compositor'); assert.deepEqual(s.slow[0]!.gl, { calls: 9 });
  c.resetStats(); assert.equal(c.stats().boundGpu, 0); h.release();
});

test('?perf shows the renderer line, the skin rebuilds and what slow frames waited on', () => {
  const slow = [{ frame: 3, at: 1, ms: 4, gap: 60, phases: { engine: 0, tween: 0, camera: 0, render: 4, tags: 0 }, tags: ['patient-glide'], bound: 'gpu/compositor' as const, gl: { calls: 50, triangles: 1000 } }];
  const txt = perfReport({ framesDrawn: 10, windowFrames: 10, p50: 1, p95: 2, max: 4, slow, awake: false, holds: [], boundCpu: 0, boundGpu: 1 }, { ua: 'x', dpr: 2, size: '1x1', look: 'light', hash: 'h', gl: readStats(info()), skin: { rebuilds: 3, worstMs: 12 } });
  assert.match(txt, /renderer, last frame: 120 draw calls · 90000 triangles/); assert.match(txt, /junction skins: 3 rebuilds/);
  assert.match(txt, /GPU or compositor 1/); assert.match(txt, /waited on gpu\/compositor · 50 calls/);
});

test('leak check: counts that climb past the baseline are a finding, steady counts are not, short runs say nothing', () => {
  const steady = Array.from({ length: 20 }, () => ({ geometries: 80, textures: 12 }));
  assert.equal(memoryClimb(steady), null);
  const leak = steady.map((r, i) => ({ geometries: 80 + i * 5, textures: 12 }));
  assert.ok(memoryClimb(leak)!.geometries > 30);
  assert.equal(memoryClimb(steady.slice(0, 3)), null);
  // views built the first time they are shown stay built: a step up that does not go on climbing is not a leak (the iPhone run: 126 geometries at step 27, 189 at step 165, 255 at the end)
  const lazy = Array.from({ length: 100 }, (_, i) => ({ geometries: 60 + (i > 5 ? 60 : 0) + (i > 40 ? 60 : 0) + (i > 70 ? 8 : 0), textures: 12 }));
  assert.equal(memoryClimb(lazy), null);
  const flags = async () => {
    const steps: Step[] = Array.from({ length: 8 }, (_, i) => ({ group: 'g', id: `s${i}`, label: `s${i}`, run: () => undefined }));
    let n = 0;
    const d = await runAudit(steps, { size: { id: 't', w: 1, h: 1, dpr: 1 }, mark: () => 0, settle: async () => ({ settled: true, ms: 0 }), now: () => 0, quietMs: 0, read: () => ({ samples: [], gaps: [], work: { p95: 0, max: 0 }, layout: null, problems: [], console: [], hidden: false, gpu: gpu({ geometries: 80 + 20 * n++ }) }) });
    return d.rows[7]!.flags.map((f) => f.kind);
  };
  return flags().then((k) => assert.ok(k.includes('gpu-memory-climb')));
});

test('fade under stall (#9): a snap with a stall at the same time is a warning that names the stall, not a missing ease', () => {
  const snap = fadeEpisodes(card([0, 0, 1, 1]));
  assert.equal(fadeFindings(snap)[0]!.kind, 'fade-instant');   // (no stall: still a failure)
  const st = stallWindows(card([0, 0, 1, 1]), [{ t: 90, ms: 120 }]);
  const f = fadeFindings(snap, st);
  assert.equal(f[0]!.kind, 'fade-under-stall'); assert.equal(f[0]!.sev, 'warn'); assert.match(f[0]!.what, /stalled 120 ms/);
  const far = stallWindows(card([0, 0, 1, 1]), [{ t: 5000, ms: 120 }]);
  assert.equal(fadeFindings(snap, far)[0]!.kind, 'fade-instant');   // (a stall elsewhere does not excuse it)
  const holes: Sample[] = [{ t: 0, K: [['teach', 0, 0, 9, 9, 0]], W: [1], L: [], c: null }, { t: 20, K: [['teach', 0, 0, 9, 9, 1]], W: [1], L: [], c: null }, { t: 300, K: [['teach', 0, 0, 9, 9, 1]], W: [1], L: [], c: null }];
  assert.equal(stallWindows(holes).length, 1);   // (a hole in the sampler's own rows is a stall too)
});

test('judgeStep: a slow step names its slowest frame; GPU-bound slow frames at low fps raise gpu-bound', () => {
  const reads: Reads = { samples: card([1, 1]), gaps: Array.from({ length: 20 }, () => 60), work: { p95: 3, max: 4 }, layout: null, problems: [], console: [], hidden: false,
    gpu: gpu({ boundGpu: 12, boundCpu: 1, slow: [{ ms: 3, gap: 90, bound: 'gpu/compositor', tags: ['card-in', 'camera'] }] }) };
  const row = judgeStep({ group: 'Talk', id: 'x', label: 'x', run: () => undefined }, 'x', reads, 500, true);
  assert.ok(row.flags.some((f) => f.kind === 'gpu-bound'));
  assert.match(row.flags.find((f) => f.kind === 'stall')!.where, /waited on gpu\/compositor, asked by card-in\/camera/);
  assert.equal(row.gpu!.boundGpu, 12);
});

test('report: GPU-bound section, renderer line and per-step gl column; a speed run drops the frame-based findings and says so', () => {
  const reads: Reads = { samples: card([1, 1]), gaps: Array.from({ length: 20 }, () => 60), work: { p95: 3, max: 4 }, layout: null, problems: [], console: [], hidden: false, gpu: gpu({ boundGpu: 12, boundCpu: 1 }) };
  const row = judgeStep({ group: 'Talk', id: 'x', label: 'outline (opening the talk)', run: () => undefined }, 'outline (opening the talk)', reads, 500, true);
  const b: Bundle = { build: 'b', device: 'd', at: 'now', depth: 'quick', framed: false, parts: [{ size: { id: 'iphone', w: 390, h: 844, dpr: 3 }, ms: 1000, depth: 'quick', stopped: false, rows: [row], console: [], notes: [] }], failed: [] };
  const t = renderText(b);
  assert.match(t, /WAITED ON THE GPU OR THE COMPOSITOR/); assert.match(t, /gpu\/compositor 12, cpu 1/); assert.match(t, /TALK OPENS/); assert.match(t, /noglass=1/);
  assert.match(t, /iphone RENDERER/); assert.match(t, /gl 100 calls 500000 tris/);
  assert.ok(groupFindings(b).some((g) => g.kind === 'gpu-bound'));
  const fast = { ...b, speed: 4 };
  assert.ok(!groupFindings(fast).some((g) => ['gpu-bound', 'stall', 'low-fps'].includes(g.kind)));
  assert.match(renderText(fast), /SPEED RUN x4/);
});

test('speed (#10): parsed and capped; scaled time runs N times faster and restores; CSS animations are sped up once', () => {
  assert.equal(speedOf(null), 1); assert.equal(speedOf('abc'), 1); assert.equal(speedOf('0.5'), 1); assert.equal(speedOf('4'), 4); assert.equal(speedOf('50'), MAX_SPEED); assert.equal(speedOf('10'), 10);
  let real = 1000; const perf = { now: () => real };
  const s = scaleTime(4, perf);
  const a = perf.now(); real += 100; assert.equal(perf.now() - a, 400);
  s.restore(); assert.equal(perf.now(), real);
  const same = scaleTime(1, perf); assert.equal(perf.now(), real); same.restore();
  const anims = [{ playbackRate: 1, calls: 0, updatePlaybackRate(r: number) { this.playbackRate = r; this.calls++; } }, { playbackRate: 4, calls: 0, updatePlaybackRate() { this.calls++; } }];
  speedAnimations({ getAnimations: () => anims }, 4); speedAnimations({ getAnimations: () => anims }, 4);
  assert.deepEqual(anims.map((x) => x.calls), [1, 0]);
});

test('speed 10: timers scale with the clock, the sampler never ticks faster than 8 ms, and above 4x the frame-limited findings are dropped and named', () => {
  const seen: (number | undefined)[] = []; const g = { setTimeout: ((fn: unknown, ms?: number) => { seen.push(ms); return 0; }) as (...a: never[]) => unknown };
  const orig = g.setTimeout, t = scaleTimers(10, g);
  (g.setTimeout as unknown as (f: () => void, ms: number) => void)(() => undefined, 950); t.restore();
  assert.deepEqual(seen, [95]); assert.equal(g.setTimeout, orig);
  assert.equal(sampleRealMs(33, 1), 33); assert.equal(sampleRealMs(33, 4), 8.25); assert.equal(sampleRealMs(33, 10), 8);
  const row = judgeStep({ group: 'g', id: 'x', label: 'x', run: () => undefined }, 'x', { samples: card([0, 0, 1, 1]), gaps: [], work: { p95: 0, max: 0 }, layout: null, problems: [], console: [], hidden: false }, 100, true);
  const b = (speed: number): Bundle => ({ build: 'b', device: 'd', at: 'n', depth: 'quick', framed: false, speed, parts: [{ size: { id: 'iphone', w: 1, h: 1, dpr: 1 }, ms: 1, depth: 'quick', stopped: false, rows: [row], console: [], notes: [] }], failed: [] });
  assert.ok(groupFindings(b(4)).some((x) => x.kind === 'fade-instant'));
  assert.ok(!groupFindings(b(10)).some((x) => x.kind === 'fade-instant'));
  assert.match(renderText(b(10)), /ABOVE 4x/); assert.doesNotMatch(renderText(b(4)), /ABOVE 4x/);
});

test('LAGS: steps under 30 fps or with a gap over 100 ms, worst first, with the talk, stop and the transition; at the top of the report', () => {
  const mk = (label: string, group: string, fps: number, worst: number, gaps = 15): ReturnType<typeof judgeStep> => judgeStep({ group, id: label, label, run: () => undefined }, label, { samples: card([1, 1]), gaps: Array.from({ length: gaps }, (_, i) => (i === 0 ? worst : 1000 / fps)), work: { p95: 3, max: 4 }, layout: null, problems: [], console: [], hidden: false, gpu: gpu({ slow: [{ ms: 5, gap: worst, bound: 'gpu/compositor', tags: ['card-in'] }] }) }, 100, true);
  const rows = [mk('stop 6 of 20', 'HVPG', 60, 20), mk('stop 7 of 20', 'HVPG', 16, 135), mk('leave the talk', 'HVPG', 55, 160), mk('stop 8 of 20', 'HVPG', 59, 18)];
  const b: Bundle = { build: 'b', device: 'd', at: 'n', depth: 'full', framed: false, parts: [{ size: { id: 'iphone', w: 1, h: 1, dpr: 1 }, ms: 1, depth: 'full', stopped: false, rows, console: [], notes: [] }], failed: [] };
  const l = lags(b);
  assert.equal(l.length, 2); assert.match(l[0]!.where, /stop 7 of 20/); assert.match(l[0]!.transition, /from stop 6 to stop 7/); assert.match(l[0]!.cause, /gpu\/compositor/);   // (16 fps with a 135 ms gap outranks a lone 160 ms gap at 55 fps)
  assert.match(l[1]!.where, /leave the talk/); assert.match(l[1]!.transition, /LEAVING/);
  assert.equal(transitionOf(rows, 0), 'ENTERING stop 6');
  const t = renderText(b); assert.ok(t.indexOf('LAGS') < t.indexOf('FAILING') || !t.includes('FAILING')); assert.ok(t.indexOf('LAGS') < t.indexOf('FINDINGS BY KIND') || !t.includes('FINDINGS BY KIND'));
  assert.match(renderText({ ...b, speed: 4 }), /LAGS[^\n]*\nnot available/);
});

test('zero stalls: any frame gap over 50 ms fails (never a warning), is counted in the headline and listed under LAGS; a speed run leaves it out', () => {
  const one = judgeStep({ group: 'HVPG', id: 'a', label: 'stop 3 of 9', run: () => undefined }, 'stop 3 of 9', { samples: card([1, 1]), gaps: [16, 16, 16, 16, 60, 16], work: { p95: 3, max: 4 }, layout: null, problems: [], console: [], hidden: false }, 100, true);
  assert.equal(one.flags.find((f) => f.kind === 'stall')!.sev, 'fail');
  const b: Bundle = { build: 'b', device: 'd', at: 'n', depth: 'full', framed: false, parts: [{ size: { id: 'iphone', w: 1, h: 1, dpr: 1 }, ms: 1, depth: 'full', stopped: false, rows: [one], console: [], notes: [] }], failed: [] };
  assert.equal(lags(b).length, 1);
  assert.match(renderText(b), /STALLS: 1 frame gap over 50 ms in 1 step/);
  assert.match(renderText({ ...b, speed: 4 }), /STALLS: not measured/);
});
