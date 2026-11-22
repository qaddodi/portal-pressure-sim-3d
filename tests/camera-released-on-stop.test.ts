// A run that is stopped gives the camera back (owner, 21 Nov, iPhone: EUS-PPG opened, Tests card closed before the scope came, the camera stayed on the EUS framing and sprang back to it).
// Root cause: runners released the camera only in `onEnd`, which a stopped run never reaches. `stop()` now calls the run's `onStop`; every runner in the Tests gives the camera back from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createShared } from '../src/scene/materials/cel.ts';
import { ProcedureLayer } from '../src/scene/procedures/layer.ts';
import { sceneApi } from '../src/scene/api.ts';
import { releaseCamera } from '../src/ui/tests/cam-release.ts';
import { useShell } from '../src/ui/shell/store.ts';

test('stop() calls onStop once, after the run is gone; a run that ends by itself calls onEnd and never onStop', () => {
  for (const kind of ['eus', 'hvpgcath', 'irivc', 'tips']) {
    const pr = new ProcedureLayer(createShared());
    const log: string[] = [];
    pr.play(kind, 0, { onEnd: () => log.push('end'), onStop: () => { log.push(pr.playing ? 'stop-while-playing' : 'stop'); pr.stop(); } });   // (a runner that stops again from its onStop must not loop)
    pr.stop();
    assert.deepEqual(log, ['stop'], `${kind}: stopped in its first frame`);
    // stopped later, at any phase of its own time
    for (const at of [0.1, 0.4, 0.8]) {
      const p2 = new ProcedureLayer(createShared()), l2: string[] = [];
      p2.play(kind, 0, { onEnd: () => l2.push('end'), onStop: () => l2.push('stop') });
      p2.update(1);   // (the first frame)
      const spec = p2.playing!; assert.equal(spec.kind, kind);
      p2.seek(kind, 1000 * at); p2.stop();
      assert.ok(l2.length <= 1 && l2[0] !== 'end', `${kind} at ${at}: ${l2}`);
    }
  }
  const pr = new ProcedureLayer(createShared()), log: string[] = [];
  pr.play('eus', 0, { to: 50, onEnd: () => log.push('end'), onStop: () => log.push('stop') });
  for (let t = 0; t <= 400; t += 16) pr.update(t);
  pr.stop();
  assert.deepEqual(log, ['end'], 'it ran out: onEnd only, and a later stop() has nothing to give back');
});

test('releaseCamera ends the follow and eases the camera home on the body; in another view only the follow ends', () => {
  const calls: string[] = [];
  const save = { follow: sceneApi.follow, goTo: sceneApi.goTo };
  sceneApi.follow = (p) => { calls.push(p ? 'follow' : 'unfollow'); };
  sceneApi.goTo = (shot, _room, ms) => { calls.push(`goTo:${String(shot)}:${ms ?? 'default'}`); };
  try {
    useShell.setState({ view: 'anatomic' });
    releaseCamera();
    assert.deepEqual(calls, ['unfollow', 'goTo:play:default'], 'eased home (a goTo, with the default glide), not a snap');
    calls.length = 0;
    useShell.setState({ view: 'lobule' });
    releaseCamera();
    assert.deepEqual(calls, ['unfollow'], 'a view change moved the camera itself: nothing fights it');
  } finally { sceneApi.follow = save.follow; sceneApi.goTo = save.goTo; useShell.setState({ view: 'anatomic' }); }
});

/** Every runner of the Tests that plays a procedure on the figure and claims the camera passes `onStop`, so no exit path (close, new patient, another control's stop) leaves the framing behind. */
test('every procedure.play in the Tests has an onStop (EUS-PPG, HVPG, Watch row, PPG by IR)', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []; });
  let n = 0;
  for (const file of walk('src/ui/tests')) {
    const src = readFileSync(file, 'utf8');
    for (let at = src.indexOf('sceneApi.procedure.play('); at >= 0; at = src.indexOf('sceneApi.procedure.play(', at + 1)) {
      let depth = 0, end = at + 'sceneApi.procedure.play'.length;
      for (; end < src.length; end++) { const c = src[end]; if (c === '(') depth++; else if (c === ')' && --depth === 0) break; }
      const call = src.slice(at, end + 1); n++;
      assert.match(call, /onStop/, `${file}: a play without onStop: ${call.slice(0, 90)}`);
    }
  }
  assert.ok(n >= 5, `found the runners' plays (${n})`);
});
