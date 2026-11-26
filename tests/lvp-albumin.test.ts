// The albumin dose that goes with a paracentesis is ONE rule (src/decks/lvp-albumin.ts: 6 to 8 g per liter removed once more than 5 L is removed, optional under that), and
// every place that states a dose agrees with it and with the model: the Tests card's count and dose, its switch tip, and the words of every deck slide whose model drains the
// belly, in every deck that has one (owner, 26 Nov: Albumin 3, titled large-volume paracentesis, read "0.8 L removed"; it now drains 6 L, 36 to 48 g). The litres are the engine's
// own, run in node as the page's worker runs a talk's chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALBUMIN_PER_L, LVP_OVER_L, PER_L_TEXT, lvpAlbumin, lvpAlbuminText } from '../src/decks/lvp-albumin.ts';
import { tapWords, albuminText, albuminTip, tapRemoved, tapDrainL } from '../src/ui/tests/abdomen/model.ts';
import { ALBUMIN } from '../src/decks/ag/albumin.copied.ts';
import { AMEND, LVP_ML, CASE_ALBUMIN, amendAlbumin } from '../src/decks/ag/albumin-amend.ts';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { chainOf } from '../src/decks/hp/numbers.ts';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import type { CopiedDeck } from '../src/decks/hp/types.ts';

type S = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any

test('the rule: 6 to 8 g per liter removed over 5 L, optional at 5 L or less, worked from the litres as printed', () => {
  assert.deepEqual([LVP_OVER_L, ...ALBUMIN_PER_L], [5, 6, 8]);
  assert.equal(PER_L_TEXT, '6 to 8 g');
  for (const L of [0, 0.8, 4.96, 5]) assert.equal(lvpAlbumin(L), null, `${L} L`);
  for (const L of [5.1, 5.9, 6, 7.5, 10]) assert.deepEqual(lvpAlbumin(L), [Math.round(L * 6), Math.round(L * 8)], `${L} L`);
  assert.equal(lvpAlbuminText(6), '36 to 48 g');
  assert.equal(lvpAlbuminText(5.88), '35 to 47 g', 'the dose of the 5.9 L the card prints, not of 5.88');
});

test('the Tests card says the rule: its count\'s dose, its switch and its tip', () => {
  for (const L of [0, 3, 5, 5.1, 6, 6.6, 9.4]) {
    const g = lvpAlbuminText(L);
    assert.equal(tapWords(L).dose, g ? `Albumin ${g} (6 to 8 g per liter)` : 'Albumin optional under 5 L', `${L} L`);
    assert.equal(albuminText(L, false), L > LVP_OVER_L ? 'Advised' : 'Optional');
    assert.equal(albuminText(L, true), `${Math.round(L * ALBUMIN_PER_L[1])} g`, 'the one dose the switch gives is the rule\'s high end');
  }
  assert.equal(tapWords(6).dose, 'Albumin 36 to 48 g (6 to 8 g per liter)');
  assert.match(albuminTip(6, true), /^For >5 L, give albumin \(48 g, 8 g per liter/);
  assert.equal(albuminTip(4, false), 'Albumin 8 g per liter of ascites removed: advised for >5 L, optional for ≤5 L.');
});

test('the card\'s count is the model\'s own litres: held to what the slide drains, and the whole of it once done', () => {
  assert.equal(tapDrainL(6584, 586), 5.998);
  assert.equal(tapDrainL(undefined, 586), 0);
  assert.equal(tapRemoved(0.8, 6, true), 6, 'capture 2274649a: a count that began late still ends at the slide\'s litres');
  assert.equal(tapRemoved(2, 6, false), 2);
  assert.equal(tapRemoved(7.7, 6, false), 6, 'never more than the model takes off');
  assert.equal(tapRemoved(-1, 6, false), 0);
  assert.equal(tapRemoved(3, 0, true), 3, 'no states yet: the fall alone');
});

test('Albumin 3\'s amendments anchor on the copied deck, and are made from the one volume', () => {
  const raw = ALBUMIN as unknown as { slides: S[] }, d = amendAlbumin(ALBUMIN) as unknown as { slides: S[] };
  const at = (x: { slides: S[] }, id: string) => x.slides.find((s) => s.id === id)!;
  for (const w of [AMEND.vignette, AMEND.line, AMEND.notes]) {
    const f = w === AMEND.vignette ? 'vignette' : w === AMEND.line ? 'line' : 'notes';
    assert.ok(at(raw, w.slide)[f].includes(w.from), `${w.slide}.${f}: the copy moved the words the amendment anchors on`);
    assert.ok(at(d, w.slide)[f].includes(w.to), `${w.slide}.${f} amended`);
  }
  assert.equal(at(raw, 'tap').action.kind, 'paracentesis');
  assert.equal(at(d, 'tap').action.mL, LVP_ML);
  assert.deepEqual(at(d, 'ind').ramp.albumin, [2.8, CASE_ALBUMIN]);
  assert.match(at(d, 'tap').line, /^LVP drains 6 L, leaving \{asc\}\. Above 5 L, albumin is recommended at \{6 to 8 g\} per liter removed: 36 to 48 g here\./);
  assert.match(at(d, 'tap').notes, /which is 36 to 48 g after the 6 L drained here;/);
  assert.match(at(d, 'ind').vignette, /serum albumin is 2\.2 g\/dL\./);
  assert.equal(at(raw, 'tap').action.mL, 5100, 'the copy itself is untouched (amend works on a clone)');
});

// ---- every deck's paracentesis, through the engine ----
const loaders: [string, () => Promise<CopiedDeck>][] = [
  ...AG_IDS.map((id): [string, () => Promise<CopiedDeck>] => [id, () => loadAgDeck(id) as Promise<CopiedDeck>]),
  ...HP_IDS.map((id): [string, () => Promise<CopiedDeck>] => [id, () => loadHpDeck(id)]),
  ...RW_IDS.map((id): [string, () => Promise<CopiedDeck>] => [id, RW_LOADERS[id] as () => Promise<CopiedDeck>]),
];
const textOf = (s: S): string => [s.kicker, s.title, s.line, s.notes, ...(Array.isArray(s.ask) ? s.ask : [])].filter((x) => typeof x === 'string').join(' \n ');
/** "N to M g" doses in words, but not the rule itself ("6 to 8 g") nor a per-kilogram or per-day dose. */
const dosesIn = (t: string): string[] => [...t.matchAll(/(\d+) to (\d+) g\b(?![/\w])(?! a day)/g)].map((m) => `${m[1]} to ${m[2]} g`).filter((g) => g !== PER_L_TEXT);

/** The belly (mL) of the state before each paracentesis slide and of the slide's own, as the page's chain computes them. */
async function tapsOf(deck: CopiedDeck): Promise<{ slide: S; before: number; own: number }[]> {
  const slides = deck.slides as unknown as S[], last = slides.reduce((n, s, i) => (s.action?.kind === 'paracentesis' ? i : n), -1);
  if (last < 0) return [];
  const fps: S[] = [];
  const core = createCore((m: { type: string; i?: number; fp?: S }) => { if (m.type === 'seqStep') fps[m.i!] = m.fp!; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: chainOf(deck.slides).slice(0, last + 2), reqId: 1 });
  core.dispose();
  // (fps[0] is the outline's; slide i is fps[i + 1])
  return slides.flatMap((s, i) => (s.action?.kind === 'paracentesis' && i > 0 ? [{ slide: s, before: fps[i]!.asc as number, own: fps[i + 1]!.asc as number }] : []));
}

test('every deck that drains the belly: a "large-volume" tap takes off more than 5 L, and every dose its words give is the rule for the litres the model takes off', async () => {
  let taps = 0;
  for (const [id, load] of loaders) {
    const deck = await load();
    for (const { slide, before, own } of await tapsOf(deck)) {
      const where = `${id}/${slide.id}`, drained = tapDrainL(before, own), t = textOf(slide);
      taps++;
      assert.ok(drained > 0.5, `${where}: the model drained ${drained} L`);
      if (/large-volume|\bLVP\b/i.test(`${slide.kicker} ${slide.title}`)) assert.ok(drained > LVP_OVER_L, `${where} is called large-volume but the model takes off ${drained.toFixed(2)} L`);
      for (const g of dosesIn(t)) {
        // (the words may round the litres they name: "a 6 L paracentesis" for the 5.9 L the model takes off; within 0.15 L)
        const fits = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15].some((e) => lvpAlbuminText(drained + e) === g);
        assert.ok(fits, `${where}: "${g}" is not 6 to 8 g per liter of the ${drained.toFixed(2)} L the model takes off (${lvpAlbuminText(drained) ?? 'optional'})`);
      }
    }
  }
  assert.ok(taps >= 3, `${taps} paracentesis slides checked`);
});

test('Albumin 3 drains the planned 6 L from a belly that holds more, and its words print those litres and that dose', async () => {
  const deck = await loadAgDeck('albumin'), [tap] = await tapsOf(deck as CopiedDeck);
  assert.ok(tap && tap.slide.id === 'tap');
  assert.ok(tap.before > LVP_ML + 300, `the belly holds ${Math.round(tap.before)} mL before the tap, more than the ${LVP_ML} mL it drains`);
  const drained = tapDrainL(tap.before, tap.own);
  assert.ok(Math.abs(drained * 1000 - LVP_ML) < 50, `the model takes off ${Math.round(drained * 1000)} mL`);
  assert.equal(tapWords(drained).removed, '6.0 L removed');
  assert.equal(tapWords(drained).dose, 'Albumin 36 to 48 g (6 to 8 g per liter)');
  assert.ok(tap.slide.line.includes(`drains ${LVP_ML / 1000} L`) && tap.slide.line.includes(`${lvpAlbuminText(drained)} here`));
});

test('every dose a deck names "after N L" anywhere (its slides and its quick check) is the rule for N', async () => {
  let n = 0;
  for (const [id, load] of loaders) {
    const deck = await load() as unknown as S, texts = [...(deck.slides as S[]).map(textOf), ...((deck.checks ?? []) as string[][]).flat()];
    for (const t of texts) {
      for (const m of t.matchAll(/(\d+) to (\d+) g\b((?:(?!\d+ to \d+ g)[^.;])*?)\bafter (?:the |a |an )?(\d+(?:\.\d+)?) L\b/g)) {
        const g = `${m[1]} to ${m[2]} g`;
        if (g === PER_L_TEXT) continue;
        n++;
        const N = Number(m[4]), want = N >= LVP_OVER_L ? `${Math.round(N * 6)} to ${Math.round(N * 8)} g` : null;
        assert.equal(g, want, `${id}: "${m[0]}"`);
      }
    }
  }
  assert.ok(n >= 2, `${n} doses checked`);
});
