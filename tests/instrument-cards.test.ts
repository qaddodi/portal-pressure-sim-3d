// A data card of tiles alone is a choice, never a leftover (owner, 27 Nov, reports/instrument-card-opportunities.md, rule R5). decks/overlay/instruments.ts gives listed slides an
// instrument another slide already uses for the same claim, and names every slide still on tiles: KEEP_TILES (the facts are the point) or PENDING (why not yet). This pins both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_IDS, loadSource } from '../src/decks/source.ts';
import { INSTRUMENT_CARDS, KEEP_TILES, PENDING, amendInstruments, printedBy } from '../src/decks/overlay/instruments.ts';
import { copiedDecks } from './helpers-deck-chain.ts';
import { controlsOf } from '../src/decks/controls.ts';
import type { CopiedDeck, CopiedSlide } from '../src/decks/hp/types.ts';

/** The slide's data card is tiles and nothing else: no instrument or chart, no visual, no table, no time-lapse (after every overlay and the 2D slide-instrument pass). */
const tilesOnly = (s: CopiedSlide): boolean => s.data === 'tiles' && !s.tool && !s.visual && !s.table && !s.lapse;
const slidesNow = async (): Promise<Map<string, CopiedSlide>> => {
  const out = new Map<string, CopiedSlide>();
  for (const d of await copiedDecks()) for (const s of d.slides) out.set(`${d.id}/${s.id}`, s);
  return out;
};

test('R5: every slide whose card is tiles alone is on KEEP_TILES or PENDING, with a reason, and each listed slide is still on tiles', async () => {
  const all = await slidesNow();
  const bare = [...all].filter(([, s]) => tilesOnly(s)).map(([k]) => k);
  const listed = (k: string) => k in KEEP_TILES || k in PENDING;
  assert.deepEqual(bare.filter((k) => !listed(k)), [],
    'these slides show tiles alone: give them an instrument (decks/overlay/instruments.ts INSTRUMENT_CARDS), or put them on KEEP_TILES or PENDING with a reason');
  for (const k of [...Object.keys(KEEP_TILES), ...Object.keys(PENDING)]) {
    assert.ok(all.has(k), `${k} is listed and no deck has that slide`);
    assert.ok(tilesOnly(all.get(k)!), `${k} no longer shows tiles alone: take it off its list`);
    assert.ok(!(k in KEEP_TILES && k in PENDING), `${k} is on both lists`);
    assert.ok(String(KEEP_TILES[k] ?? PENDING[k]).trim().length > 0, `${k} has no reason`);
  }
});

test('every listed slide carries its instrument, keeps every tile the instrument does not print, and nothing else of it changed', async () => {
  const all = await slidesNow();
  for (const [key, tool] of Object.entries(INSTRUMENT_CARDS)) {
    const now = all.get(key);
    assert.ok(now, `${key}: the slide exists`);
    assert.deepEqual(now!.tool, tool, `${key}: its instrument`);
    const printed = printedBy(tool);
    for (const k of (now!.tiles as string[] | undefined) ?? []) assert.ok(!printed.has(k), `${key}: tile ${k} repeats a number the ${String(tool.kind)} prints`);
    assert.ok(!now!.tiles || now!.data === 'tiles', `${key}: header tiles`);
  }
});

test('the instrument goes on the slide as the 2D copy wrote it otherwise: words, camera, controls and key readings unchanged; laid on twice it changes nothing', async () => {
  const { AG_LOADERS } = await import('../src/decks/ag/raw.ts');
  const { HP_LOADERS } = await import('../src/decks/hp/raw.ts');
  const { RW_LOADERS } = await import('../src/decks/rw/copied/index.ts');
  const { withOverlay } = await import('../src/decks/overlay.ts');
  const RAW: Record<string, () => Promise<unknown>> = { ...AG_LOADERS, ...HP_LOADERS, ...RW_LOADERS };
  for (const id of SOURCE_IDS) {
    const mine = Object.keys(INSTRUMENT_CARDS).filter((k) => k.startsWith(`${id}/`));
    const loaded = await loadSource(id);
    assert.deepEqual(amendInstruments(loaded), loaded, `${id}: laid on twice`);
    if (!mine.length) continue;
    // (the deck with every overlay but this one, so only this one's change is compared)
    const c = (await RAW[id]!()) as CopiedDeck, without = withOverlay({ ...c, slides: c.slides.map((s) => (mine.includes(`${id}/${s.id}`) ? { ...s, tool: { kind: '__skip' } } : s)) } as CopiedDeck);
    for (const key of mine) {
      const sid = key.slice(id.length + 1);
      const was = without.slides.find((s) => s.id === sid)! as Record<string, unknown>, now = loaded.slides.find((s) => s.id === sid)! as Record<string, unknown>;
      const { tiles: _t, data: _d, tool: _l, ...restNow } = now, { tiles: _t2, data: _d2, tool: _l2, ...restWas } = was;
      assert.deepEqual(restNow, restWas, `${key}: only its data card changed`);
      assert.deepEqual(controlsOf(now as CopiedSlide)?.compare?.opts.length ?? 0, controlsOf(was as CopiedSlide)?.compare?.opts.length ?? 0, `${key}: its buttons are the same`);
    }
  }
});

test('each reused tool is one another slide already gives (kind and options), so the card is one the app already draws and fits', async () => {
  const owned = new Set<string>();
  for (const d of await copiedDecks()) for (const s of d.slides) if (s.tool && !(`${d.id}/${s.id}` in INSTRUMENT_CARDS)) owned.add(`${String(s.tool.kind)}:${Object.keys(s.tool).sort().join(',')}`);
  for (const [key, tool] of Object.entries(INSTRUMENT_CARDS)) {
    // (circuit/ohm is circuit/relation's curve without its second line; two-lesions/varices is masld/still's plane with the trail cause-treated/year2-plane draws)
    const sig = `${String(tool.kind)}:${Object.keys(tool).sort().join(',')}`;
    if (key === 'circuit/ohm' || key === 'two-lesions/varices') continue;
    assert.ok(owned.has(sig), `${key}: no other slide uses a ${sig}`);
  }
});

test('the owner\'s slide (Portal vein thrombosis 13): the ladder with the partial clot before carvedilol faint, the heart rate in the header, the portal pressure printed', async () => {
  const s = (await slidesNow()).get('prehepatic/carv')!;
  assert.deepEqual(s.tool, { kind: 'profile', from: 'gradients', fromLabel: 'Before' });
  assert.deepEqual(s.tiles, ['hr']);
  assert.ok(printedBy(s.tool).has('pv'), 'the {pv} the line cites is a station the ladder prints');
});
