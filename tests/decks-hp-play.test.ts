import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import { toDeck, eqParts } from '../src/decks/hp/deck.ts';
import { validateDeck } from '../src/decks/schema.ts';
import { parseLine } from '../src/ui/text/line.ts';
import { lazyDecks, loadBuiltin, builtinDeck } from '../src/decks/registry.ts';
import { HVPG_DECK } from '../src/decks/hvpg.ts';
import { namedBy } from '../src/scene/labels/deck-link.ts';

const played = await Promise.all(HP_IDS.filter((id) => id !== 'hvpg').map(async (id) => toDeck(await loadHpDeck(id))));

test('every ported deck is a valid deck, and every line, case and check of it parses', () => {
  for (const d of [...played, HVPG_DECK]) {
    assert.deepEqual(validateDeck(d), [], d.id);
    assert.equal(d.numbers, 'states', d.id);
    for (const s of d.slides) for (const t of [s.line, s.vignette ?? '']) assert.doesNotThrow(() => parseLine(t), `${d.id}/${s.id}`);
    for (const [q, a] of d.checks) assert.doesNotThrow(() => { parseLine(q); parseLine(a); }, d.id);
  }
});

test('every ported slide carries its own scene, and the labels link can name its stations without an error', () => {
  for (const d of played) for (const s of d.slides) {
    assert.ok(s.scene, `${d.id}/${s.id} has a scene`);
    assert.doesNotThrow(() => namedBy(s), `${d.id}/${s.id}`);
  }
});

test('the HVPG deck has all 13 slides; the slice\'s four keep their plates and the other nine are planned from the 2D deck', () => {
  assert.equal(HVPG_DECK.slides.length, 13);
  assert.deepEqual(HVPG_DECK.slides.filter((s) => s.shot).map((s) => s.id), ['route', 'free', 'wedge', 'hvpg']);
  assert.ok(HVPG_DECK.slides.filter((s) => !s.shot).every((s) => s.scene));
  assert.equal(HVPG_DECK.slides.find((s) => s.id === 'wedge-sinusoid')!.cath, 'wedge', 'the sinusoid dive keeps the catheter where the wedge left it');
});

test('equations come over as parts, with their subscripts, tones and legend', () => {
  assert.deepEqual(eqParts('<mi>HVPG</mi><mo>=</mo><mi class="eq-wedge">WHVP</mi><mo>−</mo><mi class="eq-hv">FHVP</mi>').map((p) => `${p.text}${p.tone ? ':' + p.tone : ''}`), ['HVPG', '=', 'WHVP:wedge', '−', 'FHVP:free']);
  assert.deepEqual(eqParts('<mi>PPG</mi><mo>=</mo><msub class="eq-pv"><mi>P</mi><mtext>portal vein</mtext></msub>')[2], { tag: 'mi', text: 'P', sub: 'portal vein', tone: 'pv' });
  const withLegend = played.flatMap((d) => d.slides).filter((s) => s.eqLegend);
  assert.ok(withLegend.length > 0 && withLegend.every((s) => s.eq));
});

test('the other eleven decks are in the registry and open when asked, and the tiles slides carry their spec', async () => {
  const ids = lazyDecks().map((d) => d.id);
  for (const id of HP_IDS.filter((x) => x !== 'hvpg')) assert.ok(ids.includes(id), id);
  const d = (await loadBuiltin('kidney'))!;
  assert.equal(builtinDeck('kidney'), d);
  const t = d.slides.find((s) => s.tiles)!;
  assert.deepEqual([t.tiles!.deck, t.tiles!.slide], ['kidney', t.id]);
  assert.equal(lazyDecks().find((x) => x.id === 'kidney')!.slides, d.slides.length);
});

test('a fraction in a 2D equation stays a fraction (parallel resistances read 1/R, never R)', async () => {
  const [lhs, eq, rhs] = eqParts('<mfrac><mrow><mn>1</mn></mrow><mrow><msub><mi>R</mi><mtext>total</mtext></msub></mrow></mfrac><mo>=</mo><mfrac><mrow><mn>1</mn></mrow><mrow><msub class="eq-wedge"><mi>R</mi><mtext>liver</mtext></msub></mrow></mfrac><mo>+</mo><mfrac><mrow><mn>1</mn></mrow><mrow><msub><mi>R</mi><mtext>collaterals</mtext></msub></mrow></mfrac>');
  assert.equal(lhs!.tag, 'mfrac');
  assert.deepEqual(lhs!.num, [{ tag: 'mn', text: '1' }]);
  assert.deepEqual(lhs!.den, [{ tag: 'mi', text: 'R', sub: 'total' }]);
  assert.equal(eq!.text, '=');
  assert.equal(rhs!.den![0]!.tone, 'wedge');
  const sigma = eqParts('<mi>σ</mi><mo>=</mo><mfrac><mrow><mi>P</mi><mo>⋅</mo><mi>r</mi></mrow><mrow><mi>w</mi></mrow></mfrac>');
  assert.equal(sigma[2]!.num!.length, 3);
  // the Circuit deck's parallel slide, as it plays: 1/R on both sides
  const circuit = await loadBuiltin('circuit');
  const par = circuit!.slides.find((x) => x.id === 'parallel')!;
  assert.equal(par.eq!.filter((p) => p.tag === 'mfrac').length, 2 + 1);
});
