// Pressures at two stations of the circuit are a fall in pressure, and the pressure ladder (the profile chart, Gut to heart) draws it; tiles beside each other do not (owner, 27 Nov,
// Presinusoidal portal hypertension 3, "show the ladder of pressure instead of the tiles"). decks/overlay/ladder.ts holds the one rule for every deck. This pins the rule, not the slides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_IDS, loadSource } from '../src/decks/source.ts';
import { HP_LOADERS } from '../src/decks/hp/raw.ts';
import { AG_LOADERS } from '../src/decks/ag/raw.ts';
import { RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { LADDER_SITES, amendLadder, showsLadder } from '../src/decks/overlay/ladder.ts';
import { controlsOf } from '../src/decks/controls.ts';
import { headKeys, toolOnly } from '../src/ui/deck/from2d/card-tiles.js';
import type { CopiedDeck, CopiedSlide } from '../src/decks/hp/types.ts';

const RAW: Record<string, () => Promise<unknown>> = { ...AG_LOADERS, ...HP_LOADERS, ...RW_LOADERS };
const rawOf = async (id: string) => (await RAW[id]!()) as CopiedDeck;
/** Every slide the rule takes over, as "deck/slide". */
const taken = async (): Promise<string[]> => {
  const out: string[] = [];
  for (const id of SOURCE_IDS) for (const s of (await rawOf(id)).slides) if (showsLadder(s)) out.push(`${id}/${s.id}`);
  return out;
};

test('every slide the rule takes over carries the pressure ladder, and no tile that the ladder prints twice', async () => {
  const got = await taken();
  assert.ok(got.includes('ncph/tract'), 'the slide the owner asked about is one of them');
  for (const key of got) {
    const [d, id] = key.split('/') as [string, string];
    const was = (await rawOf(d)).slides.find((s) => s.id === id)!, now = (await loadSource(d)).slides.find((s) => s.id === id)!;
    assert.equal(now.tool?.kind, 'profile', `${key}: the ladder`);
    assert.ok(LADDER_SITES.includes(String(now.site)), `${key}: a slide about an intrahepatic site`);
    for (const k of (now.tiles as string[] | undefined) ?? []) assert.ok(!['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'int', 'cv', 'hvpg', 'ppg', 'eus'].includes(k), `${key}: tile ${k} is a station's reading, which the ladder prints`);
    // (everything else of the slide is as it was: its words, its camera, its controls, its key readings)
    const { tiles: _t, data: _d, tool: _l, ...restNow } = now as Record<string, unknown>, { tiles: _t2, data: _d2, ...restWas } = was as Record<string, unknown>;
    assert.deepEqual(restNow, restWas, `${key}: only its data card changed`);
    assert.deepEqual(controlsOf(now), controlsOf(was), `${key}: its controls (the what-if slider) are the same`);
  }
});

test('the sinusoid\'s own pressure, which the ladder does not print (its Intra-sinusoidal station is the wedged one), stays in the card\'s header: the number the words cite is on screen', async () => {
  const s = (await loadSource('ncph')).slides.find((x) => x.id === 'tract')! as CopiedSlide;
  assert.deepEqual(s.tiles, ['sin']);
  assert.equal(toolOnly(s), true);
  assert.deepEqual(headKeys(s, false), ['sin']);
  assert.deepEqual(s.key, ['pv'], 'the portal pressure is still the key reading');
  assert.ok(controlsOf(s)?.whatIf?.paths?.length, 'the slider still moves the patient, and the ladder reads the pressed state like every other number (ui/talk/shown-state.ts)');
});

test('what the rule leaves alone: two readings at one station, a gradient, an instrument, a chart, no site', () => {
  const base = { id: 'x', data: 'tiles', site: 'presin', tiles: ['pv', 'sin'] } as unknown as CopiedSlide;
  assert.equal(showsLadder(base), true);
  assert.equal(showsLadder({ ...base, tiles: ['whvp', 'sin'] }), false, 'the WHVP and the sinusoid are one station: the slide is about the two numbers side by side');
  assert.equal(showsLadder({ ...base, tiles: ['pv', 'hvpg'] }), false, 'a gradient is a bracket, not a station');
  assert.equal(showsLadder({ ...base, tiles: ['pv'] }), false, 'one reading is not a fall');
  assert.equal(showsLadder({ ...base, tool: { kind: 'fibroscan' } }), false);
  assert.equal(showsLadder({ ...base, visual: 'table' }), false);
  assert.equal(showsLadder({ ...base, lapse: { from: 'a', to: 'b' } }), false);
  assert.equal(showsLadder({ ...base, site: 'cardiac' }), false);
  assert.equal(showsLadder({ ...base, site: undefined }), false);
});

test('laid on twice it changes nothing, and a deck with nothing to change comes back as it is', async () => {
  for (const id of SOURCE_IDS) {
    const c = await rawOf(id), once = amendLadder(c);
    assert.deepEqual(amendLadder(once), once, id);
    if (!c.slides.some(showsLadder)) assert.equal(once, c, `${id}: the same object`);
  }
});
