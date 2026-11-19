// Reaching a structure's card: a tap on the figure, the keyboard walk, the number keys, the Doppler button's probe, and the structure rows the parity page counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardFor, type Act, type Verb } from '../src/ui/action/cards.ts';
import { detailsFor } from '../src/ui/action/details.ts';
import { STRUCTURES, structureRows, reachable } from '../src/ui/action/structures.ts';
import { lobuleSelAt, organSelOf, zoneAt, LOBULE_TAP, ORGAN_TAP } from '../src/ui/action/tap-map.ts';
import { WALK_ORGANS } from '../src/ui/action/walk-organs.ts';
import { decideKey } from '../src/ui/keys/keymap.ts';
import { claims } from '../src/parity/b9x.ts';

const inv: { rows: { id: string }[] } = JSON.parse(readFileSync('parity/inventory.json', 'utf8'));
const ids = new Set(inv.rows.map((r) => r.id));

test('every vessel card\'s Doppler button shows the pane and lets go of the card (the probe goes to the card\'s vessel in the Tests handler: tests/b11-orders.test.ts)', () => {
  for (const id of ['PV_TRUNK', 'C1a', 'TIPS', 'S_PC', 'A_HEP', 'SV_CONF']) {
    const d = cardFor({ type: 'edge', id })!.verbs.find((v: Verb) => v.type === 'button' && v.id === 'doppler') as Extract<Verb, { type: 'button' }> | undefined;
    assert.ok(d, id);
    const calls: string[] = [];
    d.run({ feature: (f) => calls.push(`feature ${f}`), select: (s) => calls.push(`select ${s === null ? 'null' : '?'}`), update() {}, action() {} } as Act);
    assert.deepEqual(calls, ['feature doppler', 'select null'], id);
  }
});

test('the structure kinds are the inventory\'s 62 (each listed twice), every one has a card, and the Details face is where 2D has one', () => {
  const gallery = inv.rows.filter((r) => r.id.startsWith('card:structure/') && !r.id.endsWith('#2')).map((r) => r.id.slice('card:structure/'.length));
  assert.equal(gallery.length, 62);
  assert.deepEqual(gallery.filter((g) => !g.endsWith('-details')), STRUCTURES.map((s) => s.id), 'the kinds, in the gallery\'s order');
  for (const s of STRUCTURES) {
    const c = cardFor(s.sel);
    assert.ok(c, s.id);
    assert.equal(!!detailsFor(s.sel), !c.noDetails, `${s.id} details`);
  }
  assert.deepEqual(structureRows().filter((r) => !r.details).map((r) => r.id), STRUCTURES.filter((s) => s.sel.type === 'lobule').map((s) => s.id));
});

test('the claims name only inventory rows, each once, and wired means the figure reaches it', () => {
  const seen = new Set<string>();
  for (const c of claims) { assert.ok(ids.has(c.id), c.id); assert.ok(!seen.has(c.id), `${c.id} twice`); seen.add(c.id); }
  const byId = new Map(claims.map((c) => [c.id, c.wired]));
  assert.equal(byId.get('card:structure/portal-vein'), true);
  assert.equal(byId.get('card:structure/portal-vein-details#2'), true);
  assert.equal(byId.get('card:structure/organ-liver'), true);
  assert.equal(byId.get('card:structure/lobule-triad'), true);
  // not reachable: the valved lower-limb veins and a custom shunt are not drawn on the body (the varices' and the fundus' cards open from their station's label, the arteriole from a tap on it: tests/action-labels.test.ts)
  for (const k of ['valve', 'shunt-crossing']) assert.equal(byId.get(`card:structure/${k}`), false, k);
  for (const k of ['← → ↑ ↓', 'Shift ← →']) assert.equal(byId.get(`shortcut:Reach and act/${k}`), true, k);   // (Click, 1 – 9 and Tab · Enter are claimed by b1.ts)
  // the lobule parts have no Details face in 2D: the gallery's "-details" specimen is the card itself, claimed with the card
  assert.equal(byId.get('card:structure/lobule-triad-details'), true);
  assert.equal(reachable({ type: 'organ', id: 'varices' }), true, 'by its station\'s label');
});

test('a tap on an organ or a lobule part opens the card 2D opens', () => {
  assert.deepEqual(organSelOf('heart-ra'), { type: 'organ', id: 'heart' });
  assert.deepEqual(organSelOf('spleen'), { type: 'organ', id: 'spleen' });
  assert.equal(organSelOf('kidney-l'), null); assert.equal(organSelOf(null), null);
  for (const id of Object.values(ORGAN_TAP)) assert.ok(cardFor({ type: 'organ', id }), id);
  assert.deepEqual([zoneAt(0.9, 0), zoneAt(0.5, 0), zoneAt(0.1, 0.1)], [1, 2, 3]);
  assert.deepEqual(lobuleSelAt('cords', 0.5, 0), { type: 'lobule', zone: 2 });
  assert.deepEqual(lobuleSelAt('central-vein', 0, 0), { type: 'lobule', part: 'cv' });
  assert.equal(lobuleSelAt('field', 0, 0), null);
  assert.equal(lobuleSelAt('sinusoids', 2, 2), null, 'off the tissue');
  for (const card of Object.values(LOBULE_TAP)) if (card !== 'zone') assert.ok(cardFor({ type: 'lobule', part: card }), card);
});

test('the keyboard walk ends on the organs 2D\'s does, and the number keys are the open card\'s', () => {
  assert.deepEqual(WALK_ORGANS.map((o) => o.name), ['Right heart', 'Liver', 'Spleen']);
  for (const o of WALK_ORGANS) assert.ok(cardFor(o.sel), o.id);
  const ctx = { target: 'page', searchOpen: false, sheetOpen: false, talk: false, keysOn: true } as const;
  assert.deepEqual(decideKey({ key: '3' }, { ...ctx, cardOpen: true }), { type: 'card-verb', n: 3 });
  assert.equal(decideKey({ key: '3' }, { ...ctx, cardOpen: false }), null, 'with no card open a number is nobody\'s');
});
