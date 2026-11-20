// A tap on a station's label opens the structure it stands for (2D: stage-label-layer.js blockEl, actions.js NODE_SEL), the varices' and the fundus' labels are the way to their cards,
// the hepatic arteriole is a tap target of its own in the lobule, and the Details face keeps its head and scrolls what is under it (2D's .ad-scroll).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Vector3 } from 'three';
import { labelNodeAt, HIT_ALPHA } from '../src/scene/labels/hit.ts';
import { LabelController, type LabelDeps, type Draw } from '../src/scene/labels/controller.ts';
import { STATIONS } from '../src/scene/labels/stations.ts';
import { labelHit } from '../src/ui/action/label-tap.ts';
import { tapSelect } from '../src/ui/action/tap-select.ts';
import { useSelection } from '../src/ui/action/selection.ts';
import { cardFor } from '../src/ui/action/cards.ts';
import { reachable, labelReaches, structureRows } from '../src/ui/action/structures.ts';
import { lobuleSelAt, onArteriole, ARTERIOLES, ARTERIOLE_REACH } from '../src/ui/action/tap-map.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { claims } from '../src/parity/b9x.ts';

const draw = (id: string, x: number, y: number, o: Partial<Draw> = {}): Draw => ({ id, kind: 'station', alpha: 1, mix: 1, ringAlpha: 1, x, y, w: 60, h: 20, form: 0, value: '', dot: null, rev: false, pad: { x: 0, y: 0 }, leader: null, ...o } as Draw);

test('a label is hit inside its box (with a finger\'s slack), the topmost first; a faded label, an organ\'s name and the key are not buttons', () => {
  const out = [draw('VAR', 100, 100), draw('RA', 130, 100)];
  assert.equal(labelNodeAt(out, 110, 110), 'VAR');
  assert.equal(labelNodeAt(out, 140, 110), 'RA', 'the one drawn last is on top where two overlap');
  assert.equal(labelNodeAt(out, 96, 96), 'VAR', 'slack');
  assert.equal(labelNodeAt(out, 80, 110), null);
  assert.equal(labelNodeAt([draw('VAR', 100, 100, { alpha: HIT_ALPHA - 0.01 })], 110, 110), null, 'fading out');
  assert.equal(labelNodeAt([draw('organ:liver', 100, 100)], 110, 110), null, 'an organ\'s name');
  assert.equal(labelNodeAt([draw('key', 100, 100, { kind: 'key' })], 110, 110), null, 'the key');
});

test('a station label stands for the structure 2D\'s NODE_SEL says, and every station with a node has a card', () => {
  assert.deepEqual(labelHit('CONF'), { type: 'edge', id: 'PV_TRUNK' });
  assert.deepEqual(labelHit('SIN_R'), { type: 'edge', id: 'SIN_RR' });
  assert.deepEqual(labelHit('VAR'), { type: 'organ', id: 'varices' });
  assert.deepEqual(labelHit('GV'), { type: 'organ', id: 'gastric' });
  assert.deepEqual(labelHit('RA'), { type: 'organ', id: 'heart' });
  assert.equal(labelHit('nowhere'), null);
  for (const s of STATIONS) if (s.kind !== 'organ' && s.node) { const h = labelHit(s.node); assert.ok(h && cardFor(h), `${s.id}`); }
});

test('the varices\' and the fundus\' cards open from their labels, and a second tap lets go', () => {
  const io = { picked: null as string | null, pick: (id: string | null) => { io.picked = id; }, body: true };
  useSelection.setState({ sel: null });
  tapSelect(labelHit('GV'), io);
  assert.deepEqual(useSelection.getState().sel, { type: 'organ', id: 'gastric' });
  assert.equal(cardFor(useSelection.getState().sel)!.title, 'Fundal varices');
  tapSelect(labelHit('GV'), io);
  assert.equal(useSelection.getState().sel, null);
  tapSelect(labelHit('VAR'), io);
  assert.equal(cardFor(useSelection.getState().sel)!.title, 'Esophageal varices');
  useSelection.setState({ sel: null });
});

test('the structure rows: the label is the figure\'s way to the varices and the fundus, and the claims follow it', () => {
  for (const id of ['varices', 'gastric']) { assert.equal(labelReaches({ type: 'organ', id }), true, id); assert.equal(reachable({ type: 'organ', id }), true, id); }
  assert.equal(labelReaches({ type: 'organ', id: 'spleen' }), false, 'no spleen station: its mesh is the way');
  const byId = new Map(claims.map((c) => [c.id, c.wired]));
  for (const k of ['organ-varices', 'organ-gastric', 'organ-varices-details', 'organ-gastric-details', 'lobule-artery', 'lobule-artery-details#2']) assert.equal(byId.get(`card:structure/${k}`), true, k);
  // not drawn on the body (the vessels' and the circuit's threads own them): present, not wired
  for (const k of ['valve', 'shunt-crossing', 'valve-details#2']) assert.equal(byId.get(`card:structure/${k}`), false, k);
});

test('a lobule part\'s "-details" specimen is its card (2D: the name is plain text, a tap on it does nothing), claimed as far as the card is reached', () => {
  const rows = structureRows().filter((r) => r.id.startsWith('lobule-'));
  assert.equal(rows.length, 8);
  for (const r of rows) {
    assert.deepEqual([r.card, r.details, r.plain], [true, false, true], r.id);
    for (const sfx of ['', '#2']) assert.equal(byId(`card:structure/${r.id}-details${sfx}`), r.reach, `${r.id}${sfx}`);
  }
  const ac = readFileSync('src/ui/action/ActionCard.tsx', 'utf8');
  assert.match(ac, /hasDetails = !!card && !card\.noDetails/, 'no Details button on a card that says noDetails');
  function byId(id: string) { return claims.find((c) => c.id === id)?.wired; }
});

test('the hepatic arteriole is picked by where the tap fell, at the triads\' own arterioles, before the triad', () => {
  const net = buildLobule();
  assert.equal(ARTERIOLES.length, net.triads.length);
  net.triads.forEach((t, i) => { assert.ok(Math.hypot(t.ha[0] - ARTERIOLES[i]![0], t.ha[1] - ARTERIOLES[i]![1]) < 1e-9, `triad ${i}`); });
  for (const t of net.triads) {
    assert.deepEqual(lobuleSelAt('portal-tracts', t.ha[0], t.ha[1]), { type: 'lobule', part: 'ha' });
    assert.deepEqual(lobuleSelAt('cords', t.ha[0] + ARTERIOLE_REACH / 2, t.ha[1]), { type: 'lobule', part: 'ha' }, 'the plate beside it');
    assert.deepEqual(lobuleSelAt('portal-tracts', t.x * 0.995, t.y * 0.995), { type: 'lobule', part: 'triad' }, 'the middle of the tract is the triad');
    assert.equal(onArteriole(t.bd[0], t.bd[1]), false, 'not the ductule');
    assert.equal(onArteriole(t.lv[0], t.lv[1]), false, 'not the lymphatic');
  }
  assert.equal(reachable({ type: 'lobule', part: 'ha' }), true);
  assert.ok(cardFor({ type: 'lobule', part: 'ha' }));
});

test('the label layer gates the varices as 2D does: VAR only with varices, GV (the fundus) only with its own', () => {
  const vp = { w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  let on = { VAR: false, GV: false };
  const deps = { now: () => 0, project: (_p: Vector3, o: { x: number; y: number }) => o, vp: () => vp, reversed: () => false, pressure: () => null, measure: (t: string, s: number) => t.length * s * 0.56, present: (id: 'VAR' | 'GV') => on[id] } as unknown as LabelDeps;
  const ctl = new LabelController(deps);
  const ids = () => ctl.active().map((m) => m.id);
  assert.ok(!ids().includes('VAR') && !ids().includes('GV'));
  on = { VAR: true, GV: false };
  assert.ok(ids().includes('VAR') && !ids().includes('GV'));
  on = { VAR: true, GV: true };
  assert.ok(ids().includes('VAR') && ids().includes('GV'));
  assert.ok(!new LabelController({ ...deps, present: undefined } as unknown as LabelDeps).active().some((m) => m.id === 'GV'), 'with no answer GV stays out and VAR as it was');
});

test('the Details face keeps its head and scrolls what is under it, never sideways, scrollbar hidden (2D .ad-scroll); the face itself does not scroll', () => {
  const css = readFileSync('src/ui/action/action.css', 'utf8');
  const rule = (sel: string) => css.split('\n').find((l) => l.startsWith(`${sel} {`)) ?? '';
  assert.match(rule('.ad-scroll'), /overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; touch-action: pan-y/);
  assert.match(rule('.ac-details'), /overflow: hidden/);
  const face = readFileSync('src/ui/action/DetailsFace.tsx', 'utf8');
  assert.ok(face.indexOf('ac-dhead') < face.indexOf('ad-scroll'), 'the head is above the scroller');
});
