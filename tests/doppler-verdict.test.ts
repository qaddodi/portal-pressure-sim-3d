// B13 (capture 0bc14020, 26 Nov 2026): the Doppler's verdict never disagrees with its own flag, and a portal vein's phasicity is classed over the whole window.
// The root was two judgments of one speed (the gauge's amber flag on the speed shown, the verdict on the raw 3 s mean, the portal vein's words never asking for "fast"), and a class read
// from the one beat nearest the window's mean. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SampleFeed } from '../src/ui/tests/feed.ts';
import { DopplerModel } from '../src/ui/tests/doppler/model.ts';
import { PROBES } from '../src/ui/tests/doppler/copied/doppler-tables.copied.js';
import { useDopplerProbe } from '../src/ui/tests/doppler/probe-state.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { patchVerdict } from '../scripts/doppler-verdict-patch.mjs';
import * as PHASIC from '../src/ui/tests/doppler/phasic-cut.js';

const EN = (EDGES as unknown[]).length;
/** A frame with no stent in (a TIPS or DIPS in lifts the main portal vein's range to "30 and up"). */
function frame() {
  const D = new Float32Array(EN).fill(12);
  for (const id of ['TIPS', 'DIPS']) D[(EDGES as { id: string }[]).findIndex((e) => e.id === id)] = 0;
  return { clock: 'hemo', running: true, speed: 1, settling: false, D, Q: new Float32Array(EN), metrics: {} };
}
/** A record at 50 samples a second, a beat every 0.8 s: mean + amp(beat) * a beat's shape. */
function record(rec: SampleFeed, probe: string, t0: number, secs: number, mean: number, amp: number | ((beat: number) => number)) {
  const n = Math.round(secs * 50), t: number[] = [], vel: number[] = [], ph: number[] = [];
  for (let i = 0; i < n; i++) {
    const tt = t0 + i / 50, p = (tt / 0.8) % 1, a = typeof amp === 'number' ? amp : amp(Math.floor(tt / 0.8));
    t.push(tt); ph.push(p); vel.push(mean + a * Math.sin(2 * Math.PI * p));
  }
  rec.adopt({ jump: false, probe, samples: { t, vel, ph } } as never);
}
function read(probe: string, mean: number, amp: number | ((beat: number) => number), secs = 8) {
  const rec = new SampleFeed();
  useDopplerProbe.setState({ probe, gate: null });
  record(rec, probe, 0, secs, mean, amp);
  const m = new DopplerModel();
  m.ingest(frame(), rec);
  return m.report();
}

test('a speed above the usual range is flagged and the verdict is not normal: the main portal vein at 47 cm/s (the capture)', () => {
  const r = read('PV_TRUNK', 47 * 0.57, 3);
  assert.ok(Math.abs(Number(r.vel) - 47) < 4, `the speed shown: ${r.vel}`);
  assert.ok(r.gauge?.out, 'amber above "Usual 15 to 40"');
  assert.notEqual(r.sev, 'ok');
  assert.doesNotMatch(r.note, /^Normal/);
  assert.match(r.note, /fast/);
  const inside = read('PV_TRUNK', 18, 3);
  assert.ok(inside.gauge && !inside.gauge.out && inside.sev === 'ok' && /^Normal/.test(inside.note), 'inside the range it stays normal');
});

test('the rule is general: wherever the gauge flags a speed, the verdict is not "ok" and does not say "Normal", for every vessel with a usual range and a spread of speeds', () => {
  let flagged = 0, quiet = 0;
  for (const p of PROBES as { id: string; kind: string; normal: number[] | null }[]) {
    if (!p.normal || p.kind === 'tips') continue;
    for (const mean of [2, 5, 9, 14, 20, 30, 45, 70, 110, 200]) {
      for (const amp of [0.5, mean * 0.2, mean * 0.6]) {
        const r = read(p.id, mean, amp, 6);
        if (r.acquiring) continue;
        if (r.gauge?.out) {
          flagged++;
          assert.notEqual(r.sev, 'ok', `${p.id} at ${mean} ± ${amp}: ${r.dir}, ${r.vel} cm/s is flagged but the tone is ok`);
          assert.doesNotMatch(r.note, /^Normal/, `${p.id} at ${mean}: "${r.note}" beside a flagged speed`);
        } else quiet++;
      }
    }
  }
  assert.ok(flagged > 40 && quiet > 40, `both sides were exercised: ${flagged} flagged, ${quiet} in range`);
});

test('the gauge\'s flag is the verdict\'s own judgment, not a second one (the pane reads interpret\'s out)', () => {
  const model = readFileSync(new URL('../src/ui/tests/doppler/model.ts', import.meta.url), 'utf8');
  assert.match(model, /const out = it\.out as boolean/);
  assert.doesNotMatch(model, /\(mean < n0 \|\| mean > n1\)/, 'no second range test in the pane');
});

test('a portal vein\'s phasicity class is the same wherever the window ends (the median beat of the whole window, not the one nearest its mean)', () => {
  // one beat in four is damped (0.10) among beats that read Phasic (0.29): a 3 s window holds only two or three whole beats, so one pick or an average of two flipped with where it ended
  const amp = (beat: number) => (beat % 4 === 3 ? 1 : 3);
  const classes = new Set<string>();
  for (let end = 6; end < 10; end += 0.2) classes.add(read('PV_TRUNK', 18, amp, end).pattern);
  assert.equal(classes.size, 1, `one class over every window end, got ${[...classes].join(', ')}`);
  assert.equal([...classes][0], 'Phasic', 'the typical beat of the window swings');
  const damped = new Set<string>();
  for (let end = 6; end < 10; end += 0.2) damped.add(read('PV_TRUNK', 18, (b) => (b % 4 === 3 ? 3 : 1), end).pattern);
  assert.deepEqual([...damped], ['Monophasic'], 'and where most beats are damped, the window reads damped');
});

test('a fresh copy from 2D keeps the departures (the kept file is the patch applied, and applying it twice is refused)', () => {
  const kept = readFileSync(new URL('../src/ui/tests/doppler/copied/doppler-reading.copied.js', import.meta.url), 'utf8');
  assert.match(kept, /const judged = \(o, m, normal, p\)/);
  assert.match(kept, /BEAT_PICK\.pi = windowPi\(/);
  assert.throws(() => patchVerdict(kept), /not where the verdict departure expects it/, 'the patch finds its places once, in 2D\'s text only');
  assert.match(readFileSync(new URL('../scripts/copy-b11-doppler.mjs', import.meta.url), 'utf8'), /patchVerdict\(body\)/);
});

test('the Pulsatility tile and the phasicity class are one number: the tile reads what the class is cut from, so near the cut they cannot disagree', () => {
  const { PORTAL_PHASIC_PI } = PHASIC;
  let sawBoth = new Set<string>();
  for (const damped of [0, 1, 2, 3]) {
    for (const mean of [14, 18, 26]) {
      const r = read('PV_TRUNK', mean, (b) => (b % 4 < damped ? 1 : 3), 9 + damped * 0.3);
      const tile = Number(r.tiles.find((t) => t.k === 'Pulsatility')!.v);
      const cls = r.pattern;
      // the tile is printed to two places: compare against the cut with that rounding
      const expect = tile > 0.5 ? 'Pulsatile' : tile > PORTAL_PHASIC_PI + 0.005 ? 'Phasic' : tile < PORTAL_PHASIC_PI - 0.005 ? 'Monophasic' : cls;
      assert.equal(cls, expect, `mean ${mean}, ${damped} damped beats in four: tile ${tile} beside "${cls}"`);
      sawBoth.add(cls);
    }
  }
  assert.ok(sawBoth.has('Phasic') && sawBoth.has('Monophasic'), 'both classes were exercised');
});
