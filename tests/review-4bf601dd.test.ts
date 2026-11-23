// Capture 4bf601dd review (23 Nov 2026): a slide's words never print "…" while its state is baked; a trial's follow-up is not said twice; the fit line's value starts in lower case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitWords } from '../src/ui/charts/trial/model.ts';
import { readingsOf } from '../src/decks/hp/readings-of.ts';

test('the fit line says "this patient: albumin 3.6 g/dL", not "Albumin"', () => {
  const w = fitWords({ verdict: 'no', rows: [{ state: 'no', rule: 'Serum albumin <3.0 g/dL', value: 'Albumin 3.6 g/dL' }] } as never);
  assert.equal(w, 'Does not fit: serum albumin <3.0 g/dL (this patient: albumin 3.6 g/dL)');
});

test('a slide whose state is in (live or baked) prints its own numbers, never the live figure\'s headline ones (Ten years 12 "recurred to …", Cause treated 8 "HVPG of 11.1" against 14.3)', () => {
  const live = { whvp: 16, fhvp: 5, hvpg: 11.1, ivc: 4.6, ra: 4.1, pv: 17.7 };
  assert.equal(readingsOf({ hvpg: 14.3, varix: 5.9 }, live).hvpg, 14.3);
  assert.equal(readingsOf({ hvpg: 14.3, varix: 5.9 }, live).varix, 5.9);
  assert.equal(readingsOf(undefined, live).hvpg, 11.1);
});
