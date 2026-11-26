// What a slide asks of the model is something the engine can do, for every deck whoever copied it: the patient exists, each action is one the engine host applies, and each reading in the tiles
// is a tile or one of the derived readings a card works out itself (decks/hp/hooks.ts CARD_LANDED names the file that does).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSource, SOURCE_IDS } from '../src/decks/source.ts';
import { CARD_LANDED } from '../src/decks/hp/hooks.ts';
import { TILE } from '../src/ui/charts/tiles.generated.ts';
import { UI } from '../src/ui/strings.generated.ts';

/** The action kinds the decks use. */
const ACTION_KINDS = ['infuse', 'hemorrhage', 'retain', 'band', 'paracentesis', 'valsalva', 'strain', 'rupture', 'stopBleed'] as const;
const PRESET_IDS = new Set((UI.presets as readonly { id: string }[]).map((p) => p.id));
const DERIVED = new Set(Object.keys(CARD_LANDED).filter((k) => k.startsWith('reading:')).map((k) => k.slice('reading:'.length)));
const decks = new Map<string, Awaited<ReturnType<typeof loadSource>>>();
for (const id of SOURCE_IDS) decks.set(id, await loadSource(id));

test('the action kinds the decks use are the ones the engine host applies', () => {
  const host = readFileSync(new URL('../src/engine/hales/host/worker-core.js', import.meta.url), 'utf8');
  for (const k of ACTION_KINDS) assert.ok(host.includes(`case '${k}'`), `the host has no action "${k}"`);
  for (const [id, d] of decks) for (const s of d.slides) {
    const list = s.action == null ? [] : Array.isArray(s.action) ? s.action : [s.action];
    for (const a of list as { kind: string }[]) assert.ok((ACTION_KINDS as readonly string[]).includes(a.kind), `${id}/${s.id}: ${a.kind}`);
  }
});

test('every slide that loads a patient names one the app has, and every reading it shows is a tile or a derived reading with a card', () => {
  for (const [id, d] of decks) for (const s of d.slides) {
    const where = `${id}/${s.id}`;
    if (s.preset) assert.ok(PRESET_IDS.has(s.preset), `${where}: no patient "${s.preset}"`);
    // (`key` lists the readings a chart highlights, which may be ones no tile shows: the shift chart's `svr` and `spl`)
    for (const t of s.tiles ?? []) assert.ok(TILE[t] || DERIVED.has(t), `${where}: "${t}" is neither a tile nor a derived reading with a card`);
  }
});
