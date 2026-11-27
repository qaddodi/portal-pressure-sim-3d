// C12 (owner, 27 Nov 2026): a constricted pericardium is not "Triphasic" (the normal hepatic vein's word); the word follows the patient's own pericardial parameter, never a slide's name. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hepaticWords, W_PATTERN, W_NOTE, CONSTRICTED_FROM } from '../src/ui/tests/doppler/constriction.ts';
import { Engine } from '../src/engine/hales/portal/engine.js';
import * as host from '../src/engine/hales/host/worker-core.js';
import { PORTAL_PHASIC_PI } from '../src/ui/tests/doppler/phasic-cut.js';

const it = { dir: 'Toward the heart', sev: 'ok', pattern: 'Triphasic', note: 'Normal: the atrial a-wave briefly reverses flow each beat' };

test('a constricted pericardium turns a hepatic vein\'s "Triphasic" into its own word, with its own note', () => {
  const r = hepaticWords(it, 'hepatic', { pericardial: 0.8 });
  assert.equal(r.pattern, W_PATTERN);
  assert.equal(r.note, W_NOTE);
  assert.equal(r.dir, it.dir, 'nothing else about the reading changes');
  assert.equal(hepaticWords(it, 'hepatic', { pericardial: CONSTRICTED_FROM }).pattern, W_PATTERN);
});

test('everything else reads as it did: no constriction, another vessel, another pattern, no parameters', () => {
  assert.equal(hepaticWords(it, 'hepatic', { pericardial: 0.1 }), it);
  assert.equal(hepaticWords(it, 'hepatic', { pericardial: 0 }), it);
  assert.equal(hepaticWords(it, 'hepatic', null), it);
  assert.equal(hepaticWords(it, 'portal', { pericardial: 0.9 }), it);
  const mono = { ...it, pattern: 'Monophasic' };
  assert.equal(hepaticWords(mono, 'hepatic', { pericardial: 0.9 }), mono);
});

test('the model reads in the Doppler pane through the same word (the wiring is in model.ts)', () => {
  assert.match(readFileSync(new URL('../src/ui/tests/doppler/model.ts', import.meta.url), 'utf8'), /hepaticWords\(rd\.interpret\(r, gf, rd\.SEEN\), p\.kind, paramsNow\(\)\)/);
});

// 21.2 (a CSPH portal trace): the reviewer saw it drawn strongly pulsatile. The model's csph vein is flat: monophasic, never "Pulsatile" and never reversing.
test('the model\'s cirrhotic portal vein (CSPH) is monophasic, with no reversal (the trace 21.2 draws)', () => {
  const e = new Engine() as Engine & { pi: { value: number } };
  const g = e.loadPresetSteps('cirr-comp', {});
  while (!g.next().done);
  (host as unknown as { atBedside(e: unknown): void }).atBedside(e);
  let last = e.pi.value; const pis: number[] = [];
  for (let i = 0; i < 2000; i++) { e.step(0.008); if (e.pi.value !== last) { last = e.pi.value; pis.push(last); } }
  pis.sort((a, b) => a - b);
  assert.ok(pis.length > 3);
  assert.ok(pis[pis.length >> 1]! <= PORTAL_PHASIC_PI, 'monophasic: under the shared portal cut');
});
