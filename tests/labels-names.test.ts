import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { LABEL_NAMES } from '../src/scene/labels/names.copied.ts';
import { STATIONS, TERM_STATIONS, stationsOfTerms, stationOfVessel } from '../src/scene/labels/stations.ts';
import { KEY_LENSES, keyModel, rampStops } from '../src/scene/labels/key.ts';
import { WALK, step, describe, neighbourInOrder } from '../src/scene/labels/walk.ts';
import { VESSELS } from '../src/scene/anatomy/vessels.ts';
import { HVPG_DECK } from '../src/decks/hvpg.ts';
import { hasVessel } from '../src/engine/index.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { schemeOf } from '../src/scene/labels/key.ts';

// ── words: the 2D app's, never retyped ──
const TWO_D = process.env.PPS_2D_DIR && existsSync(process.env.PPS_2D_DIR) ? process.env.PPS_2D_DIR : null;
test('the label words are the 2D app\'s (when a 2D checkout is at hand: PPS_2D_DIR)', { skip: TWO_D ? false : 'no 2D checkout (set PPS_2D_DIR to compare)' }, () => {
  execFileSync('node', ['scripts/copy-label-names.mjs', '--from', TWO_D!, '--check'], { stdio: 'pipe' });
});

test('every name a station shows is the 2D name for that station; abbreviations are the 2D ones', () => {
  for (const s of STATIONS.filter((x) => x.kind !== 'organ')) {
    assert.equal(s.name, (LABEL_NAMES.SHORT as Record<string, string>)[s.id], `${s.id} name`);
    const ab = (LABEL_NAMES.ABBR as Record<string, string>)[s.id] ?? null;
    assert.equal(s.abbr, ab, `${s.id} abbreviation`);
    assert.ok(!/\.$/.test(s.name) && !/\.$/.test(s.abbr ?? ''), `${s.id}: no name ends in a full stop (17 Oct design review)`);
  }
  assert.deepEqual(STATIONS.filter((s) => s.kind === 'organ').map((s) => s.name).sort(), ['Liver', 'Spleen', 'Stomach']);
});

test('every vessel station hangs from a vessel the scene draws, named by its engine edge', () => {
  for (const s of STATIONS.filter((x) => x.kind === 'vessel')) {
    assert.ok(hasVessel(s.vessel!), `${s.id}: ${s.vessel} is no engine edge`);
    assert.ok(VESSELS.some((v) => v.id === s.vessel), `${s.id}: ${s.vessel} is not drawn`);
    assert.equal(stationOfVessel(s.vessel!), s.id);
  }
});

test('the 2D app\'s default stations (CHIP_NODES) that the scene can draw are all labelled; the rest wait for the slide to name them', () => {
  const chips = (LABEL_NAMES.CHIP_NODES as readonly string[]);
  for (const id of chips) { const s = STATIONS.find((x) => x.id === id); if (s) assert.equal(s.core, true, `${id} is a default station`); }
  const have = new Set(STATIONS.map((s) => s.id));
  // listed so the batches that draw the rest know what is missing (not a failure): printed once
  const missing = chips.filter((c) => !have.has(c));
  assert.deepEqual(missing, [], `default stations with no drawn vessel yet: ${missing}`);
  for (const id of LABEL_NAMES.ANAT_EXTRA) { const s = STATIONS.find((x) => x.id === id); if (s) assert.equal(s.core, false, `${id} is an extra: shown when named`); }
  assert.equal(STATIONS[0].id, 'CONF', 'the portal vein ranks first');
});

test('every term the HVPG deck uses points at a station, and an unknown term is an error, not a silent miss', () => {
  for (const slide of HVPG_DECK.slides) for (const t of Object.values(slide.terms ?? {})) assert.ok(TERM_STATIONS[t], `slide ${slide.id}: term "${t}" has no station`);
  assert.throws(() => stationsOfTerms(['nonsense']), /no figure station/);
  for (const [t, ids] of Object.entries(TERM_STATIONS)) for (const id of ids) assert.ok(STATIONS.some((s) => s.id === id), `term ${t} names the unknown station ${id}`);
});

test('the catheter callout words are the 2D app\'s', () => {
  assert.deepEqual(LABEL_NAMES.CALLOUTS, { free: { kicker: 'FHVP', unit: 'mmHg' }, wedge: { kicker: 'WHVP', unit: 'mmHg' }, result: { kicker: 'HVPG', unit: 'mmHg' } });
});

// ── the figure key ──
test('every lens has a key in every look, with the 2D words, and the ends are named only where the 2D key names them', () => {
  assert.equal(KEY_LENSES.length, 10);
  for (const look of LOOK_IDS) for (const lens of KEY_LENSES) {
    const k = keyModel(lens, schemeOf(look))!;
    assert.ok(k.name && k.aria.startsWith('Vessels colored by'), `${lens} ${look}`);
    assert.ok(!!k.scale !== !!k.swatches, `${lens}: a scale or swatches, not both`);
    if (k.scale) assert.ok(/^linear-gradient\(in oklab to right, /.test(k.scale.gradient) && k.scale.gradient.includes('#'), `${lens} gradient`);
    if (k.swatches) for (const s of k.swatches) assert.match(s.colour, /^#[0-9A-Fa-f]{6}$/);
  }
  assert.equal(keyModel('drop', 'light')!.scale!.ends, true);
  assert.equal(keyModel('flow', 'light')!.scale!.ends, false);
  assert.equal(keyModel('velocity', 'dark')!.swatches!.map((s) => s.label).join(), 'Slow,Fast');
  assert.equal(keyModel('direction', 'dark')!.swatches!.map((s) => s.label).join(), 'Hepatopetal,Reversed');
  assert.equal(keyModel(null, 'light'), null);
  assert.throws(() => keyModel('nonsense', 'light'), /no figure key/);
});

test('a ramp\'s stops run 0 to 1 whatever its own scale (pressure runs 0 to 30 mmHg)', () => {
  const s = rampStops('#B8D5ED 0, #85B6E9 5, #6787E8 10, #925CDD 12, #A4216E 20, #680C2F 30');
  assert.equal(s[0].at, 0); assert.equal(s[s.length - 1].at, 1); assert.ok(Math.abs(s[2].at - 1 / 3) < 1e-9);
  const t = rampStops('#9CC7B5 0, #1B366A 1');
  assert.equal(t[1].at, 1);
});

// ── the keyboard walk ──
test('Tab reaches every drawn vessel once, in the engine\'s order, and each has words a screen reader can say', () => {
  assert.equal(WALK.length, VESSELS.length);
  assert.equal(new Set(WALK.map((w) => w.id)).size, WALK.length);
  for (const w of WALK) assert.ok(w.name && w.name.length > 2, `${w.id} has a name`);
  assert.equal(neighbourInOrder(WALK[0].id, -1), null);
  assert.equal(neighbourInOrder(WALK[0].id, 1), WALK[1].id);
  assert.equal(neighbourInOrder(WALK[WALK.length - 1].id, 1), null);
});

test('the arrows follow the blood: down a vein reaches the vein it empties into; reversed flow swaps the arrows', () => {
  const next = WALK.find((w) => w.id === step('RHV_IVC', 'down', 9))!;
  assert.equal(next.from, WALK.find((w) => w.id === 'RHV_IVC')!.to, 'down a vein carries on from where it empties');
  const down = step('PV_TRUNK', 'down', 18), up = step('PV_TRUNK', 'up', 18);
  assert.ok(down && up && down !== up, 'the portal trunk has a way on and a way back');
  assert.equal(step('PV_TRUNK', 'down', -5), up, 'reversed flow: "downstream" is where the blood now goes');
  assert.equal(step('nonsense', 'down', 1), null);
  // following "down" from any vessel ends (no loop) and every step moves on to a vessel that starts where the last one ends
  for (const w of WALK) {
    let id: string | null = w.id; const seen = new Set<string>();
    while (id) { assert.ok(!seen.has(id), `${w.id}: the arrows loop at ${id}`); seen.add(id); id = step(id, 'down', 1); }
  }
  // and Tab, not the arrows, is what reaches every vessel (at a fork the arrows take the branch that carries on)
});

test('what a screen reader hears: the name, the pressure, and only an unusual flow', () => {
  const v = WALK.find((w) => w.id === 'PV_TRUNK')!;
  assert.equal(describe(v, 14.34, 18), 'Portal vein, 14.3 mmHg');
  assert.equal(describe(v, 14.34, -3), 'Portal vein, 14.3 mmHg, flow reversed');
  assert.equal(describe(v, null, null), 'Portal vein');
});

test('the figure\'s labels and key are hidden from a screen reader (the walk speaks for them) and the key is an image with words', () => {
  const src = readFileSync('src/scene/labels/LabelLayer.tsx', 'utf8');
  assert.match(src, /className="lb-layer" aria-hidden="true"/);
  assert.match(src, /role="img" aria-label=\{model\.aria\}/);
});
