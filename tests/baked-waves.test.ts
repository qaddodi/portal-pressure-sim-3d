// The summary tables' Doppler traces are worked out at build time (baked/make.ts) and in the card's first drawing (table-rows.ts bakedRows): no worker, no wait, the whole window of beats and breaths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgDeck } from '../src/decks/ag/index.ts';
import { bakedById, trustBaked } from '../src/ui/charts/baked/store.ts';
import { WAVE_SECS, waveScale } from '../src/ui/talk/table-wave.ts';

test('the Doppler deck\'s summary table is baked with a trace per row, WAVE_SECS long, each with its own scale', async () => {
  assert.ok(trustBaked(await loadAgDeck('doppler') as never), 'the deck has its baked file (npm test bakes it)');
  const b = bakedById('doppler')!;
  const w = b.waves.summary!;
  assert.equal(w.length, 6, 'a trace for each row');
  for (const t of w) { assert.ok(t, 'every row has a trace'); assert.ok(t!.t.length > 150 && t!.t.length === t!.v.length); assert.ok(Math.abs(t!.t[t!.t.length - 1]! - WAVE_SECS) < 0.1, 'the window is WAVE_SECS'); }
  const [healthy, , thrombosis, , heart] = w;
  const span = (t: { v: number[] }) => Math.max(...t.v) - Math.min(...t.v);
  assert.ok(span(healthy!) > 8, 'a healthy portal vein breathes: its range is more than a line');
  assert.equal(span(thrombosis!), 0, 'no signal is a flat line');
  assert.equal(waveScale(thrombosis!), 20);
  assert.ok(Math.min(...heart!.v) < 0 && Math.max(...heart!.v) > 15, 'right heart failure pulses and reverses');
});
