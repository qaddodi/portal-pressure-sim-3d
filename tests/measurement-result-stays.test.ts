// Mohammad, 25 Nov, the HVPG deck's EUS-PPG slide: "after the EUS-PPG is measured, the scope comes out but the PPG-EUS calculation stays on the screen until we go to the next slide; it shouldn't disappear
// alone, and the camera shouldn't pan back". Root cause: a talk's measurement ended with its run (ui/deck/procs-link.ts onEnd): the 2D spec's labels take the result away as the scope or the catheter comes
// out, and the end sent the camera to the slide's own shot. Now a measurement that played through keeps its result cards, where they were read, and the camera where it is, until the slide is left.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { READS, specOf } from '../src/scene/procedures/copied/proc-anim.js';
import { resultAt, runCards } from '../src/scene/labels/proc-cards.ts';
import { useLabels } from '../src/scene/labels/store.ts';

type Spec = { T: { end: number }; steps: unknown[]; measure?: boolean };
const KINDS = ['eus', 'hvpgcath', 'irivc', 'irpv', 'tipsgrad'];
const frame = { P: new Float64Array(64).map((_, i) => 4 + i * 0.37), Q: new Float64Array(64), metrics: { fhvp: 6, whvp: 17, hvpg: 11, pv: 21.4, ivc: 5.2, ppg: 16.2 } };

/** A run to its end, the tip moving on every step of it (it leaves for good once the result is read), cards kept or not. */
function play(kind: string, keep: boolean, until?: number) {
  const spec = specOf(kind) as Spec, rd = (READS as Record<string, Record<string, number>>)[kind]!;
  for (const k in rd) rd[k] = NaN;
  let at = 0;
  const run = runCards(kind, { capture: true, quiet: true, keep, points: (tip, ahead) => { tip.set(at, 1, 0); ahead.set(at, 2, 0); return true; } });
  let atResult: { text: string; tip: number } | null = null;
  for (let t = 0; t <= (until ?? spec.T.end); t += 50) {
    at = t / 100;
    run.frame(t, frame);
    const p = useLabels.getState().proc;
    if (!atResult && t >= resultAt(kind) && p?.kinds.length) { const v = new Vector3(); p.points(v, new Vector3()); atResult = { text: JSON.stringify(p.text), tip: v.x }; }
  }
  return { run, atResult };
}

for (const kind of KINDS) {
  test(`${kind}: every measurement is a kind the talk holds the result of`, () => assert.ok((specOf(kind) as Spec).measure));

  test(`${kind}: the result read stays on the figure, where it was read, to the end of the run`, () => {
    useLabels.getState().set({ proc: null, quiet: false });
    const { run, atResult } = play(kind, true);
    const p = useLabels.getState().proc;
    assert.ok(atResult, 'a result stood once it was read');
    assert.ok(p && p.kinds.length > 0, 'its cards are still up at the end of the run');
    assert.equal(JSON.stringify(p.text), atResult.text, 'with the numbers they were read with');
    const v = new Vector3(); assert.ok(p.points(v, new Vector3()));
    assert.equal(v.x, atResult.tip, 'pointing where it was read, not following the tip out');
    run.rest();
    assert.equal(useLabels.getState().quiet, false, 'the figure\'s names come back');
    assert.ok(useLabels.getState().proc, 'and the reading stays');
    run.end();
    assert.equal(useLabels.getState().proc, null, 'the slide being left takes it away');
  });

  test(`${kind}: without keep (the Tests cards) the 2D spec still takes the result away with the scope`, () => {
    useLabels.getState().set({ proc: null, quiet: false });
    const { run } = play(kind, false);
    const p = useLabels.getState().proc;
    assert.ok(!p || p.kinds.length === 0, `${kind}: the cards went`);
    run.end();
  });

  test(`${kind}: going back before the result takes it off as ever`, () => {
    useLabels.getState().set({ proc: null, quiet: false });
    const spec = specOf(kind) as Spec, rd = (READS as Record<string, Record<string, number>>)[kind]!;
    for (const k in rd) rd[k] = NaN;
    const run = runCards(kind, { capture: true, keep: true, points: () => true });
    for (let t = 0; t <= spec.T.end; t += 50) run.frame(t, frame);
    for (let t = spec.T.end; t >= 0; t -= 50) run.frame(t, frame);
    const p = useLabels.getState().proc;
    assert.ok(!p || p.kinds.length === 0, `${kind}: nothing stands before the run's first reading`);
    run.end();
  });
}

test('the talk\'s run keeps a played-through measurement\'s cards and camera, and a slide\'s leaving takes the cards off', () => {
  const src = readFileSync(new URL('../src/ui/deck/procs-link.ts', import.meta.url), 'utf8');
  assert.match(src, /runCards\(kind, \{ capture: true, quiet: kind !== 'hvpgcath', keep: true \}\)/);
  assert.match(src, /const stays = done && !rewound && !!\(sp as \{ measure\?: boolean \}\)\.measure && !!cards;/);
  assert.match(src, /if \(stays\) cards\?\.rest\(\); else endCards\(\);/);
  assert.match(src, /if \(v && !stays\) sceneApi\.goTo\(v\.shot, room\(\)\);/, 'the camera is not sent home');
  assert.match(src, /gen\+\+;\s*endCards\(\);/, 'stopPlay (the slide being left) ends the cards');
});
