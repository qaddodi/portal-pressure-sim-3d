// The capture waits for the Anatomy/Circuit change to land too (a case's stop after a Circuit stop was taken part-way, 26 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { circuitChangeWaiting } from '../src/ui/debug/audit/settle-circuit.ts';

test('a Circuit change under way is waited for; one that has landed is not', () => {
  assert.match(circuitChangeWaiting({ moving: true }), /Circuit change/);
  assert.equal(circuitChangeWaiting({ moving: false }), '');
});
test('the settle check asks it, in the slide pass and the case pass alike (both use arriving)', () => {
  const src = readFileSync('src/ui/debug/audit/capture-settle.ts', 'utf8');
  assert.ok(src.includes('circuitChangeWaiting(cel.circuit)'));
});
