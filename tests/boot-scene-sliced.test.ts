// The scene is built a step per task at boot, never as one task (24 Nov, "a few seconds in it snags, stuck, then plays again": the scene's constructor was ONE task of about a second on a laptop, three to five on a phone, run when
// Stage.tsx was first imported). The work is counted in steps and each step is held to a ceiling; the finished scene is the one the one-shot constructor makes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { CelScene } from '../src/scene/scene.ts';

test('a sliced scene builds nothing until its steps run, in many small steps, each under a ceiling, and ends as the one-shot scene does', () => {
  const sync = new CelScene();
  const s = new CelScene({ sliced: true });
  assert.equal(s.builtAll, false);
  assert.equal(s.vessels.length, 0, 'nothing is built by the constructor');
  const steps: number[] = [];
  for (;;) { const t = performance.now(); const more = s.buildStep(); steps.push(performance.now() - t); if (!more) break; }
  assert.equal(s.builtAll, true);
  assert.ok(steps.length >= 20, `${steps.length} steps (a vessel loop in sixes and each layer after it)`);
  const worst = Math.max(...steps), total = steps.reduce((a, b) => a + b, 0);
  // the biggest step is the Lobule's network (about 150 ms on a laptop, cold); the ceiling fails a step that grows into the whole scene again (it was ~1000 ms, one task)
  assert.ok(worst < 500, `the longest step took ${Math.round(worst)} ms of ${Math.round(total)} ms in all (${steps.map((m) => Math.round(m)).join(' ')})`);
  assert.ok(worst < total / 3, 'no step is a third of the build');
  assert.equal(s.vessels.length, sync.vessels.length);
  assert.equal(s.objects.length, sync.objects.length);
  assert.equal(s.scene.children.length, sync.scene.children.length);
  sync.dispose?.(); s.dispose?.();
});

test('finishSliced awaits between steps; finishNow in the middle builds the rest at once and ends the loop', async () => {
  const s = new CelScene({ sliced: true });
  let gaps = 0;
  await s.finishSliced(async () => { gaps++; if (gaps === 3) s.finishNow(); });
  assert.equal(gaps, 3, 'the loop stopped when the rest was built at once');
  assert.equal(s.builtAll, true); assert.ok(s.vessels.length > 20);
  s.dispose?.();
});

test('the boot builds it sliced and waits for it; the stage wires the scene to the clock at the start, not at import', () => {
  const main = readFileSync('src/main.tsx', 'utf8'), stage = readFileSync('src/scene/Stage.tsx', 'utf8'), api = readFileSync('src/scene/api.ts', 'utf8');
  assert.match(main, /const sceneBuilt = buildSceneSliced\(nextTask\)\.then\(wireScene\)/);
  assert.match(main, /start\(\)\.catch\(/, 'a step that throws gives the cover\'s failure note, never a splash that waits for ever');
  assert.doesNotMatch(stage, /^cel\./m, 'no top-level use of the scene (it would build it whole at import)');
  assert.doesNotMatch(stage, /^clock\.on\(/m);
  assert.match(stage, /export function wireScene\(\)/);
  assert.match(api, /sceneDrained\.count\+\+/);
});
