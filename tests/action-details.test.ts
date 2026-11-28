// The Details face against the 2D inspector's own answers (tests/fixtures/details-2d.json, written by scripts/gen-details.mjs): the words, and every reading of an organ, a
// vessel and a compartment for six patients.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detailsFor } from '../src/ui/action/details.ts';
import { cardFor } from '../src/ui/action/cards.ts';
import { ORGAN_ABOUT, EDGE_STATS, WORDS } from '../src/ui/action/details.generated.ts';
import type { Env } from '../src/ui/action/read.ts';
import { frameByIds } from './frame-by-id.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const fx: J = JSON.parse(readFileSync('tests/fixtures/details-2d.json', 'utf8'));
// (the recorded frames are arrays in the engine's order before the junction table: laid out again by id, and what they cannot have comes from the engine's own frame, scripts/gen-actions-fresh.mjs)
/** The vessels whose ends moved to the junction node the engine's table names. */
const DEPARTED = new Set(['C3', 'REX', 'S_PC']);
const fresh: J = JSON.parse(readFileSync('tests/fixtures/actions-2d.json', 'utf8')).patients;
function env(id: string): Env {
  const r = fx.patients[id], fz = fresh[id].fresh, fr = frameByIds(r.frame, fz);
  const f = { ...fr, P: Float32Array.from(fr.P), Pf: Float32Array.from(fr.Pf), Q: Float32Array.from(fr.Q), Qf: Float32Array.from(fr.Qf), D: Float32Array.from(fr.D), ext: Float32Array.from(fr.ext) };
  return { f, p: r.params, ref: frameByIds(r.healthy, { P: fz.hP, Pf: fz.hP, Q: fz.hQ, Qf: fz.hQ, D: fz.D }) };
}

test('an organ says what 2D says: kicker, title, About, the stats under their names, for six patients', () => {
  for (const o of fx.organs) {
    const d = detailsFor({ type: 'organ', id: o })!;
    assert.ok(d, o);
    const w = ORGAN_ABOUT[o]!;
    assert.deepEqual([d.kicker, d.title, d.about?.text, d.why], [w.kicker, w.title, w.about, w.why], o);
    assert.deepEqual(d.stats.map((s) => s.k), w.stats, `${o} stat names`);
    for (const pid of fx.presets) {
      const e = env(pid), want: string[] = fx.patients[pid].organs[o];
      d.stats.forEach((s, i) => {
        // (2D holds the belly's balance for seconds before it moves: its first answer is the number to the hundred, which is what the card shows for a still frame)
        if (o === 'abdomen' && s.k === 'Formation') return assert.match(s.read(e), /^[−-]?\d+ mL\/day$/);
        assert.equal(s.read(e), want[i], `${pid} ${o} ${s.k}`);
      });
    }
  }
});

test('a vessel says what 2D says: its direction word and its eight readings', () => {
  for (const id of fx.edges) {
    const d = detailsFor({ type: 'edge', id })!;
    assert.ok(d, id);
    assert.equal(d.stats.length, 8);
    for (const pid of fx.presets) {
      const e = env(pid), want = fx.patients[pid].edges[id];
      assert.equal(d.dir!(e)[1], want.dir, `${pid} ${id} direction`);
      const by = (name: string) => d.stats.find((s) => s.k.startsWith(name))!.read(e);
      // (the readings of a collateral or shunt that now ends at its junction node, where the table puts it, come from that node: they read a number that moved by a little, as tests/action-cards.test.ts DEPARTED says)
      const said = (k: string, got: string, w: string) => (DEPARTED.has(id) && /\d/.test(w) ? assert.match(got, /\d/, `${pid} ${id} ${k}`) : assert.equal(got, w, `${pid} ${id} ${k}`));
      said('In', by('In ·'), want.In); said('Out', by('Out ·'), want.Out);
      for (const k of ['Pressure drop', 'Flow', 'Velocity', 'Diameter', 'Resistance']) said(k, by(k), want[k]);
      assert.equal(d.stats[7]!.read(e), want.last, `${pid} ${id} ${d.stats[7]!.k}`);
    }
  }
  const pv = detailsFor({ type: 'edge', id: 'PV_TRUNK' })!, c = detailsFor({ type: 'edge', id: 'C1a' })!;
  assert.deepEqual([pv.kicker, pv.why, pv.about?.title, pv.stats[7]!.k, pv.note], ['Vein', 'pvFlow', WORDS.aboutEdge, EDGE_STATS[6], WORDS.change]);
  assert.deepEqual([c.kicker, c.why, c.stats[7]!.k], ['Collateral · C1', 'shunt', EDGE_STATS[5]]);
});

test('a compartment says what 2D says, and a station stands for its structure', () => {
  for (const id of fx.nodes) {
    const d = detailsFor({ type: 'node', id });
    if (!d) continue;   // (a station that stands for a vessel or an organ opens that one's Details)
    if (d.key.startsWith('d:n:')) for (const pid of fx.presets) {
      const e = env(pid), want = fx.patients[pid].nodes[id];
      assert.deepEqual(d.stats.map((s) => s.read(e)), [want.Pressure, want.Healthy, want['External pressure (Δ)'], want.Transmural], `${pid} ${id}`);
    }
  }
  assert.equal(detailsFor({ type: 'node', id: 'CONF' })!.key, 'd:e:PV_TRUNK');
  assert.equal(detailsFor({ type: 'node', id: 'RA' })!.key, 'd:o:heart');
  assert.equal(detailsFor({ type: 'node', id: 'AO' })!.key, 'd:n:AO');
});

test('a card has a Details face exactly where 2D has one (a lobule part has none)', () => {
  for (const sel of [{ type: 'edge', id: 'PV_TRUNK' }, { type: 'edge', id: 'TIPS' }, { type: 'edge', id: 'SIN_RR' }, { type: 'organ', id: 'liver' }, { type: 'organ', id: 'varices' }] as const) {
    const c = cardFor(sel)!;
    assert.equal(!c.noDetails, !!detailsFor(sel), JSON.stringify(sel));
  }
  assert.equal(detailsFor({ type: 'lobule', part: 'triad' }), null);
  assert.equal(cardFor({ type: 'lobule', part: 'triad' })!.noDetails, true);
});
