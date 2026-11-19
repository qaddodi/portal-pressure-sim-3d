// Every engine action lands in History under the 2D app's own label (main.js doAction), and the Treat wiring names changes with activeInterventions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actionLabel } from '../src/ui/action/send.ts';

test('an action has the 2D History label', () => {
  assert.equal(actionLabel({ kind: 'infuse', fluid: 'crystalloid' }), '1 L crystalloid');
  assert.equal(actionLabel({ kind: 'infuse', fluid: 'prbc' }), '1 unit PRBC');
  assert.equal(actionLabel({ kind: 'infuse', fluid: 'albumin' }), 'Albumin infusion');
  assert.equal(actionLabel({ kind: 'band' }), 'Band ligation');
  assert.equal(actionLabel({ kind: 'paracentesis', mL: 5000, albumin: true }), 'Paracentesis 5.0 L + albumin');
  assert.equal(actionLabel({ kind: 'paracentesis', mL: 2500, albumin: false }), 'Paracentesis 2.5 L');
  assert.equal(actionLabel({ kind: 'hemorrhage', mL: 500 }), 'Hemorrhage 500 mL');
  assert.equal(actionLabel({ kind: 'probe', id: 'x' }), '');
});

test('both ways to send an action go through sendAction, and the app wires the timeline to the params', () => {
  for (const f of ['src/ui/treat/env.ts', 'src/ui/action/act.ts']) {
    const s = readFileSync(f, 'utf8');
    assert.match(s, /sendAction/, f);
    assert.doesNotMatch(s, /type: 'action'/, `${f} must not send actions around History`);
  }
  const boot = readFileSync('src/ui/action/boot.ts', 'utf8');
  assert.match(boot, /setInterventionLabels\(/);
  assert.match(boot, /timeline\.noteChange\(/);
});
