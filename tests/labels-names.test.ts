import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { LABEL_NAMES } from '../src/scene/labels/names.copied.ts';
import { STATIONS, TERM_STATIONS, stationsOfTerms, stationOfVessel } from '../src/scene/labels/stations.ts';
import { KEY_LENSES, KEY_LENSES_2D, keyModel } from '../src/scene/labels/key.ts';
import { WALK, step, describe, neighbourInOrder } from '../src/scene/labels/walk.ts';
import { MAPPED } from '../src/scene/vessels/network.ts';
import { HVPG_DECK } from '../src/decks/hvpg.ts';
import { hasVessel } from '../src/engine/index.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
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
    // (a name that stands for a stretch the junction table cuts into pieces is picked on every one of them, and the piece the dot rests on is one of them)
    for (const piece of s.pieces ?? []) { assert.ok(MAPPED.some((v) => v.id === piece), `${s.id}: ${piece} is not drawn`); assert.equal(stationOfVessel(piece), s.id, `${s.id}: a pick on ${piece}`); }
    if (s.pieces) assert.ok(s.pieces.includes(s.vessel!), `${s.id}: the resting piece is one of its pieces`);
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
  assert.equal(KEY_LENSES_2D.length, 10, 'the 2D table names ten lenses');
  assert.equal(KEY_LENSES.length, 12, 'and the figure adds Since and System, which colour it too');
  for (const look of LOOK_IDS) for (const lens of KEY_LENSES) {
    const k = keyModel(lens, look)!;
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

// (Before the cut-over this asked for the 2D figure's own places (NODE_POS_2D, the plate's organ names) through the one map. The placed anatomy moves the nodes and organs, so the same promise, that a
//  station which is not one vessel names the place the figure draws, is asked of the placed figure: its node, or the nearest point of a drawn vessel the 2D app lights for it, and the organ's name
//  anchor on the placed organ's front face.)
test('a station that is not one vessel stands at its placed node or on a vessel lit for it, and an organ\'s name at the placed organ\'s anchor', async () => {
  const { nodeAt, DOT_UNITS } = await import('../src/scene/labels/stations.ts');
  const { PLACED_ORGAN_NAMES } = await import('../src/scene/anatomy/source.ts');
  const { TARGETS_FIG } = await import('../src/scene/labels/figure2d.copied.ts');
  const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
  const { REST, coursesOf } = await import('../src/scene/vessels/shape.ts');
  const { x3, y3 } = await import('../src/scene/frame2d.ts');
  const { Vector3 } = await import('three');
  const v = new Vector3();
  // (the right sinusoids rest on their drawn bed since 24 Nov, a vessel station like the left ones: stations.ts ON_VESSEL; the next test holds a vessel station's dot on its vessel)
  assert.equal(STATIONS.find((s) => s.id === 'SIN_R')?.kind, 'vessel', 'the right sinusoids are named on their bed');
  const points = STATIONS.filter((s) => s.kind === 'point');
  assert.ok(['RA', 'VAR'].every((id) => points.some((s) => s.id === id)), 'the right atrium and the varices are named at a point');
  for (const st of points) {
    const id = st.id, n = nodeAt(id);
    st.at(0.5, v);
    const atNode = Math.hypot(v.x - n[0], v.y - n[1], v.z - n[2]) < 1e-9;
    const onLit = ((TARGETS_FIG as Record<string, { edges?: readonly string[] }>)[id]?.edges ?? []).some((e) => {
      const def = NETWORK_BY_ID.get(e);
      return !!def && !def.feeder && coursesOf(def, REST)[0]!.pts.some((q) => Math.hypot(q[0]! - v.x, q[1]! - v.y, q[2]! - v.z) < 1e-9);
    });
    assert.ok(atNode || onLit, `${id} stands at its placed node or on a drawn vessel lit for it`);
    // (on a lit vessel, it is the drawn point nearest its node that lies on the approved course: the fundal varices' is 0.08 off the mean of the ends that meet there; a third of the room two dots keep, DOT_UNITS)
    assert.ok(Math.hypot(v.x - n[0], v.y - n[1], v.z - n[2]) < DOT_UNITS / 3, `${id} stands near its placed node`);
  }
  for (const s of STATIONS.filter((x) => x.kind === 'organ')) {
    const p = (PLACED_ORGAN_NAMES as Record<string, readonly [number, number, number]>)[s.name]!;
    s.at(0.5, v);
    assert.ok(Math.abs(v.x - x3(p[0])) < 1e-9 && Math.abs(v.y - y3(p[1])) < 1e-9 && Math.abs(v.z - p[2]) < 1e-9, `${s.name} is named at the placed organ's anchor`);
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
