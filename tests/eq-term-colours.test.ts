// Owner, 27 Nov 2026 (the EUS-PPG slide): "P left portal vein should be coloured pink like the callout. Fix these colouring issues everywhere."
// The rule: an equation term that names a station wears that station's series colour (the one the callout, the chart and the tile wear: ruling L13, one colour per number), in every
// deck, on every formula, in every look. Root cause: the deck reader (hp/deck.ts eqParts) kept only the classes eq-wedge and eq-hv, so a portal-vein or IVC term printed plain
// (the EUS-PPG's, though written with eq-pv) and two PPG formulas were written with no class at all. Now eq-tone.ts decides by what the term names; this judges it over every deck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { eqParts } from '../src/decks/hp/deck.ts';
import { EQ_TONES, eqToneOfClass, eqClassOf } from '../src/decks/eq-tone.ts';
import { seriesToken } from '../src/ui/text/series-tone.ts';
import type { EqPart, Slide } from '../src/decks/schema.ts';

/** What a term's words name, and the reading whose series colour the callout for it wears. Written here on purpose, not read from eq-tone.ts: the test judges that module. */
const NAMES: [RegExp, string][] = [
  [/portal vein/i, 'pv'], [/hepatic vein/i, 'fhvp'], [/^WHVP$/, 'whvp'], [/^FHVP$/, 'fhvp'], [/^IVC$/, 'ivc'],
];
const termsOf = (ps: readonly EqPart[]): EqPart[] => ps.flatMap((p) => (p.tag === 'mfrac' ? termsOf([...(p.num ?? []), ...(p.den ?? [])]) : [p]));
const decks = await Promise.all(UI.decks.map(async ({ id }) => (await loadBuiltin(id))!));
const eqs = decks.flatMap((d) => d.slides.filter((s: Slide) => s.eq).map((s: Slide) => ({ at: `${d.id}/${s.id}`, parts: termsOf(s.eq!) })));

test('every term of every deck\'s formulas that names a station wears that station\'s series colour', () => {
  let named = 0;
  for (const { at, parts } of eqs) {
    for (const p of parts) {
      if (p.tag !== 'mi') continue;
      const name = p.sub ?? p.text;
      const hit = NAMES.find(([re]) => re.test(name));
      if (!hit) continue;
      const want = seriesToken(hit[1]);
      assert.ok(want, `${hit[1]} has a series colour`);
      assert.ok(p.tone, `${at}: "${p.text} ${p.sub ?? ''}" names ${hit[1]} and has no colour`);
      assert.equal(EQ_TONES[p.tone!].token, want, `${at}: "${name}" is ${EQ_TONES[p.tone!].token}, the callout's is ${want}`);
      named++;
    }
  }
  assert.ok(named >= 14, `${named} station terms checked`);
});

test('the EUS-PPG slide: the left portal vein term is pink, the left hepatic vein term blue (the screenshot)', () => {
  const s = decks.flatMap((d) => d.slides).find((x: Slide) => x.eq?.some((p) => p.sub === 'left portal vein'))!;
  const [pv, hv] = s.eq!.filter((p) => p.sub);
  assert.deepEqual([pv!.sub, pv!.tone, eqClassOf(pv!.tone)], ['left portal vein', 'pv', 'eq-pv']);
  assert.deepEqual([hv!.sub, hv!.tone, eqClassOf(hv!.tone)], ['left hepatic vein', 'free', 'eq-hv']);
});

test('a term written with no class still takes its station\'s colour, and a class never overrides what a term names', () => {
  const [, , pv, , ivc] = eqParts('<mi>PPG</mi><mo>=</mo><msub><mi>P</mi><mtext>portal vein</mtext></msub><mo>−</mo><msub><mi>P</mi><mtext>IVC</mtext></msub>');
  assert.equal(pv!.tone, 'pv'); assert.equal(ivc!.tone, 'ivc');
  const [, , wrong] = eqParts('<mi>X</mi><mo>=</mo><msub class="eq-hv"><mi>P</mi><mtext>left portal vein</mtext></msub>');
  assert.equal(wrong!.tone, 'pv', 'the words win over a wrong class');
  const [, , plain] = eqParts('<mi>SAAG</mi><mo>=</mo><msub><mi>Albumin</mi><mtext>serum</mtext></msub>');
  assert.equal(plain!.tone, undefined, 'a term naming no station stays plain');
  assert.equal(eqParts('<mi>HVPG</mi><mo>=</mo><mi class="eq-wedge">WHVP</mi><mo>−</mo><mi class="eq-hv">FHVP</mi>').map((p) => p.tone).join(), ',,wedge,,free');
});

test('the card draws every tone: each has a class, the class has a rule in the ink of the same series token, and the card asks eq-tone.ts for it', () => {
  const css = readFileSync('src/ui/styles/app-04-presenter.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [tone, d] of Object.entries(EQ_TONES)) {
    assert.match(css, new RegExp(`\\.pz-eq \\.${d.cls} \\{ color: var\\(${d.token}-ink\\); \\}`), `${tone}: .${d.cls}`);
    assert.equal(eqToneOfClass(d.cls), tone);
  }
  const card = readFileSync('src/ui/cards/TeachingCard.tsx', 'utf8');
  assert.match(card, /const eqClass = \(p: EqPart\) => eqClassOf\(p\.tone\);/);
  assert.doesNotMatch(card, /p\.tone === 'wedge'/);
});

test('a formula printed outside the card\'s MathML wears the same colours: the EUS caption, the PPG caption and the ladder\'s sum', async () => {
  const { captionSegs } = await import('../src/ui/tests/endo/eus-words.ts');
  const segs = captionSegs('hold', -1, { pv: 14.2, hv: 4.1, ppg: 10.1 });
  const tone = (s: string) => segs.find((x) => x.s === s)?.tone;
  assert.deepEqual(['LPV', '14.2', 'LHV', '4.1'].map(tone), ['pv', 'pv', 'free', 'free'], 'EUS-PPG = LPV − LHV = 14.2 − 4.1: each term and its number in its callout\'s colour');
  assert.equal(segs.map((x) => x.s).join('').match(/EUS-PPG = LPV − LHV = 14\.2 − 4\.1 = 10\.1 mmHg\./)?.length, 1, 'the words are unchanged');
  const { toneWords } = await import('../src/decks/eq-tone.ts');
  assert.deepEqual(toneWords('PPG = PV − IVC').map((x) => x.tone ?? '-'), ['-', 'pv', '-', 'ivc']);
  // (the stations a caption names take the tone of the series colour, as the card's terms do)
  for (const [w, r] of [['PV', 'pv'], ['LPV', 'pv'], ['LHV', 'fhvp'], ['HV', 'fhvp'], ['IVC', 'ivc'], ['WHVP', 'whvp'], ['FHVP', 'fhvp']] as const) {
    const t = toneWords(w)[0]!.tone;
    assert.ok(t && EQ_TONES[t].token === seriesToken(r), `${w} wears ${r}'s colour`);
  }
  const css = readFileSync('src/ui/styles/app-04-presenter.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const d of Object.values(EQ_TONES)) assert.match(css, new RegExp(`\\.eq-line \\.${d.cls} \\{ color: var\\(${d.token}-ink\\); \\}`), `.eq-line .${d.cls}`);
  assert.match(readFileSync('src/ui/cards/LadderCard.tsx', 'utf8'), /HVPG = <span className="eq-wedge">\{gap\.whvp\}<\/span> − <span className="eq-hv">\{gap\.fhvp\}<\/span>/);
  assert.match(readFileSync('src/ui/tests/ir/IrPane.tsx', 'utf8'), /hvpg-caption eq-line[^\n]*<Toned segs=\{ppgSegs\}/);
  assert.match(readFileSync('src/ui/tests/endo/EusPpg.tsx', 'utf8'), /hvpg-caption eq-line[^\n]*<Toned segs=\{captionSegs/);
});
