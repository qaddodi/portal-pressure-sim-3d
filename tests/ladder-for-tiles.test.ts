// Two or more pressures from one patient are a fall along the circuit, and the pressure ladder (the profile chart, Gut to heart) draws it; tiles beside each other do not (owner,
// 27 Nov, Presinusoidal portal hypertension 3, "show the ladder of pressure instead of the tiles"; then "a slide that shows two or more pressures, at any site, gets the ladder").
// decks/overlay/ladder.ts holds the one rule for every deck. This pins the rule, not the slides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_IDS, loadSource } from '../src/decks/source.ts';
import { HP_LOADERS } from '../src/decks/hp/raw.ts';
import { AG_LOADERS } from '../src/decks/ag/raw.ts';
import { RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { amendLadder, showsLadder } from '../src/decks/overlay/ladder.ts';
import { amendControls } from '../src/decks/overlay/controls.ts';
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

/** The readings the ladder prints (its stations' and its brackets'), and the pressures (those, plus the sinusoid's own), written out here, apart from the rule's own tables. */
const PRINTS = ['int', 'pv', 'whvp', 'cv', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg', 'eus'];
const PRESSURES = [...PRINTS, 'sin'];
/** The rule in words: tiles alone, two or more pressures, any site; the one exception is two readings at one station (the WHVP and the sinusoid). */
const spec = (s: CopiedSlide): boolean => {
  const t = (s.tiles as string[] | undefined) ?? [];
  if (s.data !== 'tiles' || s.tool || s.visual || s.table || s.lapse || s.procedure || s.scopeTile || s.hvpgResp) return false;
  return t.filter((k) => PRESSURES.includes(k)).length >= 2 && !(t.includes('whvp') && t.includes('sin'));
};

test('one rule for every deck: every slide whose card is two or more pressures alone gets the ladder, at any site, and no other slide changes its card', async () => {
  for (const id of SOURCE_IDS) {
    const deck = await rawOf(id), laid = amendLadder(deck).slides, now = (await loadSource(id)).slides;
    deck.slides.forEach((was, i) => {
      const key = `${id}/${was.id}`, s = now.find((x) => x.id === was.id)!;
      assert.equal(showsLadder(was), spec(was), `${key}: the rule reads as its words say`);
      if (spec(was)) assert.equal(s.tool?.kind, 'profile', `${key}: the ladder`);
      else assert.equal(laid[i], was, `${key}: not the rule's, so the rule leaves it as it is`);
      // (a slide with its own instrument or time-lapse is never taken over)
      if (was.tool || was.lapse) assert.equal(showsLadder(was), false, `${key}: has its own instrument or time-lapse`);
    });
  }
  const got = await taken();
  for (const k of ['two-lesions/base', 'two-lesions/together', 'two-lesions/measure', 'treatment/schisto', 'day/fluid', 'lobule/cirr', 'lobule/cong', 'tips-candidacy/heart', 'circuit/resist']) {
    assert.ok(got.includes(k), `${k}: two or more pressures, so the ladder`);
  }
  assert.ok(!got.includes('hvpg/wedge-sinusoid'), 'the WHVP beside the sinusoid keeps its tiles');
});

test('every slide the rule takes over carries the pressure ladder, and no tile that the ladder prints twice', async () => {
  const got = await taken();
  assert.ok(got.includes('ncph/tract'), 'the slide the owner asked about is one of them');
  for (const key of got) {
    const [d, id] = key.split('/') as [string, string];
    // (the slide before the rule: the copy with the controls' changes laid on, decks/overlay/controls.ts, which come first)
    const was = amendControls(await rawOf(d)).slides.find((s) => s.id === id)!, now = (await loadSource(d)).slides.find((s) => s.id === id)!;
    assert.equal(now.tool?.kind, 'profile', `${key}: the ladder`);
    for (const k of (now.tiles as string[] | undefined) ?? []) assert.ok(!PRINTS.includes(k), `${key}: tile ${k} is a reading the ladder prints`);
    // (every tile that is not one the ladder prints stays, in its order: the flow, the sinusoid's own pressure)
    assert.deepEqual(now.tiles ?? [], (was.tiles as string[]).filter((k) => !PRINTS.includes(k)), `${key}: the header keeps the tiles the ladder does not print`);
    // (everything else of the slide is as it was: its words, its camera, its controls, its key readings; a 3D field the slide overlay adds, its frame, stands beside them)
    for (const [k, v] of Object.entries(was)) if (!['tiles', 'data'].includes(k)) assert.deepEqual((now as Record<string, unknown>)[k], v, `${key}: only its data card changed (${k})`);
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

test('what the rule takes and what it leaves alone: any site, a gradient counts, one station twice does not, an instrument, a chart', () => {
  const base = { id: 'x', data: 'tiles', site: 'presin', tiles: ['pv', 'sin'] } as unknown as CopiedSlide;
  assert.equal(showsLadder(base), true);
  for (const site of ['pre', 'presin', 'sin', 'postsin', 'post', 'cardiac', undefined]) assert.equal(showsLadder({ ...base, site }), true, `site ${site}: any site`);
  assert.equal(showsLadder({ ...base, tiles: ['pv', 'hvpg'] }), true, 'a gradient is a pressure the ladder draws as a bracket');
  assert.equal(showsLadder({ ...base, tiles: ['hvpg', 'ppg'] }), true, 'two brackets');
  assert.equal(showsLadder({ ...base, tiles: ['sin', 'hvpg'] }), true, 'the sinusoid and a bracket: a bracket stands at no one station');
  assert.equal(showsLadder({ ...base, tiles: ['pvFlow', 'hvpg', 'ppg'] }), true, 'a flow beside two pressures');
  assert.equal(showsLadder({ ...base, tiles: ['whvp', 'sin'] }), false, 'the WHVP and the sinusoid are one station: the slide is about the two numbers side by side');
  assert.equal(showsLadder({ ...base, tiles: ['pv'] }), false, 'one reading is not a fall');
  assert.equal(showsLadder({ ...base, tiles: ['pv', 'plt', 'asc'] }), false, 'one pressure and two other readings');
  assert.equal(showsLadder({ ...base, tool: { kind: 'fibroscan' } }), false);
  assert.equal(showsLadder({ ...base, visual: 'table' }), false);
  assert.equal(showsLadder({ ...base, lapse: { from: 'a', to: 'b' } }), false);
  const eus = amendLadder({ id: 'd', slides: [{ ...base, tiles: ['hvpg', 'eus'] }] } as unknown as CopiedDeck).slides[0]!;
  assert.deepEqual(eus.tool, { kind: 'profile', spans: ['hvpg', 'eus', 'ppg'] }, 'an EUS-PPG tile asks the ladder for its bracket');
  const flow = amendLadder({ id: 'd', slides: [{ ...base, tiles: ['pvFlow', 'hvpg', 'ppg'] }] } as unknown as CopiedDeck).slides[0]!;
  assert.deepEqual([flow.data, flow.tiles], ['tiles', ['pvFlow']], 'the flow stays a header tile');
});

test('laid on twice it changes nothing, and a deck with nothing to change comes back as it is', async () => {
  for (const id of SOURCE_IDS) {
    const c = await rawOf(id), once = amendLadder(c);
    assert.deepEqual(amendLadder(once), once, id);
    if (!c.slides.some(showsLadder)) assert.equal(once, c, `${id}: the same object`);
  }
});
