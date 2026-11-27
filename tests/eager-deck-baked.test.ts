// A talk that is in memory from the start (registry.ts `registerDeck`) must lay its baked chart data in before it opens, as every lazy talk does in its `load`. The HVPG talk did not (27 Nov, iPhone layout-check):
// its summary table's numbers were worked out live after the card was measured, and the card grew 42 px and cut its legend. The general rule: no built-in talk opens without its baked data when it has a file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { builtinDecks, deckIsReady, deckReady, loadBuiltin } from '../src/decks/registry.ts';
import { bakedById, chartsFile, forgetBaked } from '../src/ui/charts/baked/store.ts';
import { ensureChartsBaked } from './baked-decks.ts';

ensureChartsBaked();

const eager = builtinDecks().map((d) => d.id);
const hasFile = (id: string) => existsSync(new URL(`../public/${chartsFile(id)}`, import.meta.url));

test('every talk in memory from the start has a step that lays its baked data in, and it is not ready until that step has run', async (t) => {
  assert.ok(eager.includes('hvpg'), 'the HVPG talk is one of them');
  for (const id of eager) {
    if (!hasFile(id)) { t.diagnostic(`${id}: no baked file here, skipped`); continue; }
    forgetBaked();
    assert.equal(deckIsReady(id), false, `${id} is not ready before its baked data is laid in`);
    await deckReady(id);
    assert.equal(deckIsReady(id), true, `${id} is ready once it is`);
    assert.ok(bakedById(id), `${id}'s baked chart data is trusted after it is made ready (else its tables and charts are worked out live and its cards grow)`);
  }
});

test('a lazy talk is ready on loading and has its data too (the rule is the same for both ways in)', async () => {
  const d = await loadBuiltin('treatment');
  assert.ok(d && deckIsReady('treatment'));
  if (hasFile('treatment')) assert.ok(bakedById('treatment'));
});
