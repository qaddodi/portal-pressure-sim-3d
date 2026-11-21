// Review #4, #10, #14: one discrete HVPG phase for the words, one owner of the figure's procedure layer, and no empty interval when the Tests card opens or the talk's cards change.
// Pure parts run; the wiring is read from the source (no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claim, useOwner, blockerOf, ownerNote } from '../src/ui/tests/owner.ts';

const src = (p: string) => readFileSync(new URL(`../src/ui/${p}`, import.meta.url), 'utf8');

test('owner: one claim at a time, never taken from a running owner, released by its own id', () => {
  claim('ir', 'HVPG, free');
  assert.equal(useOwner.getState().owner?.id, 'ir');
  claim('eus', 'EUS-PPG, step 1');
  assert.equal(useOwner.getState().owner?.id, 'ir', 'EUS cannot take it while IR runs');
  assert.equal(blockerOf(useOwner.getState().owner, 'eus')?.id, 'ir');
  assert.equal(blockerOf(useOwner.getState().owner, 'ir'), null);
  assert.match(ownerNote(useOwner.getState().owner!), /IR is running on the figure \(HVPG, free\)/);
  claim('eus', null);
  assert.equal(useOwner.getState().owner?.id, 'ir', 'another runner finishing does not release it');
  claim('ir', 'HVPG, wedge');
  assert.equal(useOwner.getState().owner?.phase, 'HVPG, wedge');
  claim('ir', null);
  assert.equal(useOwner.getState().owner, null);
});

test('#4: the HVPG words stand on a phase published at each boundary, not read off the run clock at render', () => {
  const run = src('tests/ir/run.ts');
  assert.ok(run.includes('export const phase = (): Ph => R.ph'), 'the pane reads the published phase');
  assert.ok(run.includes('function syncPhase()') && run.includes('if (stage !== R.stage) { R.stage = stage; bump(); }'), 'a boundary bumps once');
  for (const at of ['startHvpg', 'stepHvpg', 'resetHvpg']) {
    const body = run.slice(run.indexOf(`function ${at}`)); assert.ok(body.slice(0, body.indexOf('\n}\n')).includes('syncPhase()'), `${at} publishes the phase`);
  }
  assert.ok(src('tests/ir/sources.ts').includes('phaseAt()'), 'the tracing keeps the exact clock');
  assert.ok(src('tests/ir/ir.css') !== '' && src('tests/tests.css').includes('.hvpg-bar .btn.primary:disabled'), 'the busy label has its own treatment');
});

test('#10: both starters are disabled by the owner before activation, and say why; the no-op cleanup is gone', () => {
  assert.ok(src('tests/endo/EusPpg.tsx').includes("useBlocker('eus')") && src('tests/endo/EusPpg.tsx').includes('disabled={run || !!other}'));
  assert.ok(src('tests/ir/IrPane.tsx').includes("useBlocker('ir')") && src('tests/ir/IrPane.tsx').includes('isBusy = busy() || !!other'));
  assert.ok(src('tests/ir/IrPane.tsx').includes('<OwnerNote me="ir" />') && src('tests/endo/EusPpg.tsx').includes('<OwnerNote me="eus" />'));
  assert.ok(!src('tests/ir/IrPane.tsx').includes('what plays goes on: the figure shows it */'), 'the empty unmount effect is deleted');
  assert.ok(src('tests/ir/run.ts').includes("claim('ir'") && src('tests/endo/eus-run.ts').includes("claim('eus'"), 'both runners publish their phase');
});

test('#14: a cold open and a warm swap make the one sequence; a leaving card waits for the cards that replace it', () => {
  const swap = src('tests/dock/swap.ts');
  assert.ok(swap.includes('setCold(true)') && swap.includes("clock.on('tags'") && swap.includes('COLD_MAX'), 'cold open: code in, two frames, then the card shows');
  assert.ok(src('tests/TestsLayer.tsx').includes('data-cold') && src('tests/tests.css').includes('[data-cold="true"]'));
  const cf = src('cards/CardFrame.tsx');
  assert.ok(cf.includes("else if (phase === 'out' && leave)") && cf.includes('const leave = out && (go !== false || late)') && cf.includes('HOLD_OUT_MS'), 'the old card holds until the new can come in, never past HOLD_OUT_MS');
});
