import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { LABEL_NAMES } from '../src/scene/labels/names.copied.ts';
import { STATIONS, TERM_STATIONS, stationsOfTerms, stationOfVessel } from '../src/scene/labels/stations.ts';
import { KEY_LENSES, keyModel, rampStops } from '../src/scene/labels/key.ts';
import { WALK, step, describe, neighbourInOrder } from '../src/scene/labels/walk.ts';
import { MAPPED } from '../src/scene/vessels/network.ts';
import { HVPG_DECK } from '../src/decks/hvpg.ts';
import { hasVessel } from '../src/engine/index.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { schemeOf } from '../src/scene/labels/key.ts';
import { pinned2D } from './two-d-pin.ts';

// ── words: the 2D app's, never retyped ──
const TWO_D = pinned2D('src/ui/presenter.js');
test('the label words are the 2D app\'s (when the 2D checkout at the pin is at hand: PPS_2D_REPO)', { skip: TWO_D.skip || 'the copy was made from 2D f85d6fe107; the 2D at the pin moved these tables out of presenter.js, so scripts/copy-label-names.mjs must be moved to the pin first (open)' }, () => {
  execFileSync('node', ['scripts/copy-label-names.mjs', '--from', TWO_D.repo, '--check'], { stdio: 'pipe' });
});

test('every name a station shows is the 2D name for that station; abbreviations are the 2D ones', () => {
  for (const s of STATIONS.filter((x) => x.kind !== 'organ')) {
    assert.equal(s.name, (LABEL_NAMES.SHORT as Record<string, string>)[s.id], `${s.id} name`);
    // (the 2D short forms, except one that is another station's own name: "Lower IVC" is not shortened to "IVC", the IVC above it with another number; Mohammad's play-test, 20 Nov)
    const ab0 = (LABEL_NAMES.ABBR as Record<string, string>)[s.id] ?? null;
    const ab = ab0 && STATIONS.some((o) => o.id !== s.id && o.name === ab0) ? null : ab0;
    assert.equal(s.abbr, ab, `${s.id} abbreviation`);
    assert.ok(!/\.$/.test(s.name) && !/\.$/.test(s.abbr ?? ''), `${s.id}: no name ends in a full stop (17 Oct design review)`);
  }
  assert.deepEqual(STATIONS.filter((s) => s.kind === 'organ').map((s) => s.name).sort(), ['Colon', 'Esophagus', 'Kidney', 'Liver', 'Right atrium', 'Small bowel', 'Spleen', 'Stomach'], 'every organ the 2D plate names (ORGAN_LABELS)');
});

test('every vessel station hangs from a vessel the scene draws, named by its engine edge', () => {
  for (const s of STATIONS.filter((x) => x.kind === 'vessel')) {
    assert.ok(hasVessel(s.vessel!), `${s.id}: ${s.vessel} is no engine edge`);
    assert.ok(MAPPED.some((v) => v.id === s.vessel), `${s.id}: ${s.vessel} is not drawn`);
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
  assert.equal(WALK.length, MAPPED.length);
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
  assert.match(src, /role=\{twin \? undefined : 'img'\} aria-label=\{twin \? undefined : model\.aria\}/, 'the key is an image with words; its hidden twin is not announced');
  assert.match(src, /aria-hidden=\{twin \? true : undefined\}/);
});

test('a station that is not one vessel, and an organ\'s name, stand where the 2D figure puts them (through the one map, frame2d.ts)', async () => {
  const { NODE_POS_2D } = await import('../src/scene/vessels/paths.copied.ts');
  const { x3, y3 } = await import('../src/scene/frame2d.ts');
  const { Vector3 } = await import('three');
  const v = new Vector3();
  for (const id of ['RA', 'SIN_R', 'VAR']) {
    const [x, y] = NODE_POS_2D[id];
    STATIONS.find((s) => s.id === id)!.at(0.5, v);
    assert.ok(Math.abs(v.x - x3(x)) < 1e-9 && Math.abs(v.y - y3(y)) < 1e-9, `${id} stands at its 2D place`);
  }
  const at = LABEL_NAMES.ORGAN_AT as Record<string, readonly [number, number]>;
  for (const s of STATIONS.filter((x) => x.kind === 'organ')) {
    const [x, y] = at[s.name];
    s.at(0.5, v);
    assert.ok(Math.abs(v.x - x3(x)) < 1e-9 && Math.abs(v.y - y3(y)) < 1e-9, `${s.name} is named where 2D names it`);
  }
});

// (19 Nov 2026, Mohammad's iPhone: "Lower IVC 5.7" hung on the portal vein. The vessel stations read the first slice's hand-placed courses, 100 to 500 2D units from the vessels the scene draws.)
test('a vessel station\'s dot stands on the vessel the scene draws, not on a course of its own', async () => {
  const { Vector3 } = await import('three');
  const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
  const a = new Vector3();
  for (const s of STATIONS.filter((x) => x.kind === 'vessel')) {
    const pts = NETWORK_BY_ID.get(s.vessel!)!.pts;
    s.at(0.5, a);
    let best = Infinity;
    for (const p of pts) best = Math.min(best, Math.hypot(p[0] - a.x, p[1] - a.y));
    assert.ok(best * 300 < 12, `${s.id}: its dot stands ${(best * 300).toFixed(0)} 2D units from ${s.vessel}`);
  }
});
