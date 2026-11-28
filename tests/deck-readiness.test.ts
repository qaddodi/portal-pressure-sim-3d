// One readiness table for every deck (decks/hp/hooks.ts). A slide needs features (a tool, a procedure, a lens, a view, a card); each feature has one owner and says whether it has landed; a slide is
// wired when every one has. These tests hold the general rules over all 42 decks, so no deck, copy or way of writing a slide can have a need nobody owns, a field nobody classified, or a parity row
// that says something else than the table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { loadSource, SOURCE_IDS } from '../src/decks/source.ts';
import { FEATURES, featureOf, readiness, needsOf } from '../src/decks/hp/hooks.ts';
import { unclassified } from '../src/decks/hp/fields.ts';
import { claims as claimsA } from '../src/parity/b13a.ts';
import { claims as claimsB } from '../src/parity/b13b.ts';
import { claims as claimsC } from '../src/parity/b13c.ts';
import { PROCEDURE_PLAYS } from '../src/scene/procedures/plays.ts';
import { LENS_IDS, SINCE_BASELINE_FED } from '../src/scene/lenses/model.ts';
import { CHARTS } from '../src/ui/charts/registry.ts';
import type { CopiedSlide } from '../src/decks/hp/types.ts';

const BATCHES = new Set(['S1', 'S2', 'S3', 'B3', 'B5', 'B6', 'B7', 'B8', 'B10', 'B11', 'B12', 'B13b']);
const decks = new Map<string, Awaited<ReturnType<typeof loadSource>>>();
for (const id of SOURCE_IDS) decks.set(id, await loadSource(id));
const rows = new Map([...claimsA, ...claimsB, ...claimsC].map((c) => [c.id, c.wired]));

test('every slide of every deck needs only features somebody owns, and each one has landed', () => {
  let n = 0;
  for (const [id, d] of decks) for (const s of d.slides) {
    n++;
    const r = readiness(s);
    assert.deepEqual(r.unowned, [], `${id}/${s.id} needs a feature nobody owns`);
    assert.deepEqual(r.open.map((f) => f.id), [], `${id}/${s.id} waits on a feature`);
    assert.equal(r.wired, true, `${id}/${s.id}`);
  }
  assert.equal(n, 516 + 32);   // (516 slides in the 2D decks, and 32 more since 28 Nov: the slides cut into several, decks/overlay.ts)
});

test('every field of every slide is one the app has a home for', () => {
  for (const [id, d] of decks) for (const s of d.slides) assert.deepEqual(unclassified(s), [], `${id}/${s.id}`);
});

test('a feature has a batch that builds it, words for what it is, and a file that holds it once landed', () => {
  const seen = new Set<string>();
  for (const [, d] of decks) for (const s of d.slides) for (const id of needsOf(s)) seen.add(id);
  for (const id of seen) {
    const f = featureOf(id)!;
    assert.ok(f, id);
    assert.ok(BATCHES.has(f.batch), `${id}: owner ${f.batch} is no batch`);
    assert.ok(f.what.length > 10, id);
    if (f.landed) assert.ok(f.evidence && existsSync(new URL(`../${f.evidence}`, import.meta.url)), `${id}: ${f.evidence} is not there`);
  }
  assert.ok(seen.size >= 20 && seen.size <= 80, `${seen.size} different features`);
  for (const f of FEATURES.values()) assert.equal(f.id, [...FEATURES.entries()].find(([, g]) => g === f)![0]);
});

test('the parity rows say what the table says, for every slide and every deck', () => {
  for (const [id, d] of decks) {
    for (const s of d.slides) {
      const row = rows.get(`slide:${id}/${s.id}`);
      if (row === undefined) continue;   // (the slice's first four HVPG slides are claimed by their own file)
      assert.equal(row, readiness(s).wired, `slide:${id}/${s.id}`);
    }
    const deckRow = rows.get(`deck:${id}`);
    if (deckRow !== undefined) assert.equal(deckRow, d.slides.every((s) => readiness(s).wired), `deck:${id}`);
  }
});

test('what exists today is read from the registries, so a feature that lands there lands here with no line to add', () => {
  for (const l of LENS_IDS) assert.equal(featureOf('lens')!.landed && (l !== 'since' || SINCE_BASELINE_FED), l !== 'since' || SINCE_BASELINE_FED, l);
  for (const c of CHARTS) assert.equal(featureOf(`tool:${c.kind}`)!.landed, c.status === 'done', c.kind);
  for (const k of PROCEDURE_PLAYS) assert.equal(featureOf(`procedure:${k}`)!.landed, true, k);
  assert.equal(featureOf('procedure:not-a-procedure')!.landed, false);
  for (const c of ['route', 'free', 'wedge', 'result', 'blocked']) assert.equal(featureOf(`cath:${c}`)!.landed, true, c);
  assert.equal(featureOf('view:circuit')!.landed, true);
  assert.equal(featureOf('lobule-camera')!.landed, true);
});

test('a need nobody owns, a feature that has not landed, or a field nobody classified shows up instead of reading as wired', () => {
  const base = { id: 'x', kicker: '', title: '', line: '', notes: '', ask: ['', ''] };
  const hologram = readiness({ ...base, tool: { kind: 'hologram' } } as unknown as CopiedSlide);
  assert.deepEqual([hologram.wired, hologram.unowned, hologram.open.map((f) => f.id)], [false, [], ['tool:hologram']], 'a tool kind is owned and has not landed');
  const nowhere = readiness({ ...base, cath: 'nowhere' } as unknown as CopiedSlide);
  assert.deepEqual([nowhere.wired, nowhere.unowned], [false, ['cath:nowhere']], 'a catheter state nobody owns');
  assert.deepEqual(unclassified({ ...base, brandNewField: 1 }), ['brandNewField']);
  assert.equal(featureOf('nothing-like-this'), null);
});
