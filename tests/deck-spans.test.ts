// The Circuit's bracket (slide field `span`, 2D ext-callouts.js V25): every `span` of every copied deck resolves to two stations of the Circuit map, its words' tokens parse and print
// the slide's numbers, the bracket's geometry is the 2D app's, and the figure link carries it to the label layer and clears it with the slide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import type { CopiedDeck } from '../src/decks/hp/types.ts';
import { figurePlan, EMPTY_PLAN } from '../src/ui/deck/figure-plan.ts';
import { figureCalls, EMPTY_CALLS } from '../src/ui/deck/figure-calls.ts';
import { spanOf, spanStrokes, spanY, SPAN_Y, SPAN_TICK } from '../src/scene/labels/span-math.ts';
import { CIRCUIT_NODES, NODE_CIRCUIT } from '../src/scene/circuit/data.copied.ts';
import { tokensOf } from '../src/decks/hp/numbers.ts';
import { CARD_LANDED, readiness } from '../src/decks/hp/hooks.ts';
import { loadSource } from '../src/decks/source.ts';

const decks: CopiedDeck[] = [];
for (const id of AG_IDS) decks.push((await loadAgDeck(id)) as unknown as CopiedDeck);
for (const id of RW_IDS) decks.push((await loadSource(id)) as unknown as CopiedDeck);
for (const id of HP_IDS) decks.push(await loadHpDeck(id));
type Sp = { from: string; to: string; label: string };
const withSpan = decks.flatMap((d) => d.slides.filter((s) => (s as { span?: unknown }).span).map((s) => ({ id: `${d.id}/${s.id}`, s })));
const FP = { ppg: 9.4, pv: 12.3, hvpg: 7.1 };

test('the four Circuit slides carry a span, and nothing else does', () => {
  assert.deepEqual(withSpan.map((x) => x.id).sort(), ['circuit/both', 'circuit/meal', 'circuit/ohm', 'circuit/resist']);
});

test('every span names two stations of the Circuit map at different x, and its label tokens parse', () => {
  for (const { id, s } of withSpan) {
    const list = (s as unknown as { span: Sp[] }).span;
    assert.ok(Array.isArray(list) && list.length > 0, id);
    for (const sp of list) {
      assert.ok(sp.from in CIRCUIT_NODES, `${id}: ${sp.from} is not a station of the Circuit`);
      assert.ok(sp.to in CIRCUIT_NODES, `${id}: ${sp.to} is not a station of the Circuit`);
      assert.ok(spanOf(sp.from, sp.to), `${id}: ${sp.from} and ${sp.to} stand at one x: 2D draws nothing`);
      const toks = tokensOf(sp.label);
      assert.ok(toks.length > 0 && toks.every((t) => t.token.kind === 'value'), `${id}: ${sp.label} names a reading`);
      assert.match(sp.label, /\{[^}]+\}/, `${id}: the label prints a number`);
    }
    const plan = figurePlan(s);
    assert.deepEqual(plan.unresolved, [], id);
    assert.equal(plan.spans.length, list.length, id);
  }
});

test('the calls print the slide\'s own numbers in the bracket\'s words, and keep them until the numbers arrive', () => {
  for (const { id, s } of withSpan) {
    const plan = figurePlan(s);
    const c = figureCalls(plan, { fp: FP as never });
    assert.equal(c.spans.length, plan.spans.length, id);
    for (const sp of c.spans) { assert.doesNotMatch(sp.text, /[{}]/, `${id}: ${sp.text}`); assert.match(sp.text, /PPG 9\.4/, id); }
    const early = figureCalls(plan, {});
    for (const sp of early.spans) assert.doesNotMatch(sp.text, /[{}]/, `${id}: no braces while the state is not in`);
  }
  assert.deepEqual(figureCalls(EMPTY_PLAN).spans, []);
  assert.deepEqual(EMPTY_CALLS.spans, []);
});

test('the bracket is the 2D app\'s: under the lowest lane, from one station\'s x to the other, ticks up toward the circuit', () => {
  const at = spanOf('CONF', 'IVCS', 100)!;
  assert.equal(at.x0, NODE_CIRCUIT.CONF![0]); assert.equal(at.x1, NODE_CIRCUIT.IVCS![0]);
  assert.equal(at.y, SPAN_Y); assert.equal(SPAN_Y, 742); assert.equal(SPAN_TICK, 10);
  assert.equal(spanOf('IVCS', 'CONF')!.x0, at.x0, 'either order');
  assert.equal(spanOf('CONF', 'CONF'), null); assert.equal(spanOf('CONF', 'NOWHERE'), null);
  assert.ok(spanY(1) === 725 + 24 && spanY(0.5) === 725 + 48 && spanY(10) === 742, 'the room under the lowest lane widens when the map is drawn small');
  const [line, a, b] = spanStrokes(at);
  assert.deepEqual(line, [[at.x0, at.y], [at.x1, at.y]]);
  assert.deepEqual(a, [[at.x0, at.y], [at.x0, at.y - 10]]); assert.deepEqual(b, [[at.x1, at.y], [at.x1, at.y - 10]]);
});

test('the layer draws it and the figure link hands it over and clears it', () => {
  const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(src('src/scene/labels/figure-cards.ts'), /paintSpan/);
  assert.match(src('src/ui/deck/figure-link.ts'), /spans: c\.spans/);
  assert.match(src('src/ui/deck/figure-link.ts'), /spans: calls\.spans/);
  assert.match(src('src/scene/labels/LabelLayer.tsx'), /f\.spans/);
  assert.match(src('src/scene/labels/store.ts'), /spans: readonly FigSpan\[\]/);
});

test('the readiness table: the field\'s need is landed, and the four slides wait for nothing else', () => {
  assert.ok('data:spans' in CARD_LANDED);
  for (const { id, s } of withSpan) {
    const r = readiness(s as never);
    assert.deepEqual([...r.unowned, ...r.open.map((f) => f.id)], [], id);
  }
});
