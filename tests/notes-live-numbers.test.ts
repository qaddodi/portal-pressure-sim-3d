// P-20 (production review, 28 Nov 2026; owner chose option A): the speaker notes read the model through the same braces as the slide's words ({hvpg}, {asc}, {hvpg@high}),
// so an engine retune moves the notes with the card. This test holds the rule on every slide of every talk:
//   1. every brace of a note is a reading, a cut-off or a typed number, and prints a value at its slide (no "…" for a reading the slide does not have);
//   2. a note holds no hand-typed quantity (mmHg, L, L/min, cm/s, kPa, mm, a platelet count) unless it is a guideline threshold the words below spot by their grammar
//      ("under 12 mmHg", "from about 10 mmHg", "1 to 5 mmHg", "a covered 8 mm stent") or it is on tests/notes-numbers-allowed.json with its reason.
// The list may only shrink (an entry whose number is gone from the note must leave it), and every entry names why it is not the model's: a guideline, a trial result, a
// normal value, a setting of the slide, a point read off the slide's own chart, or a difference of two readings. Convert a model number with a patch in
// scripts/notes-tokens-28nov-edits.mjs (the notes are patched like every other copied word), never by listing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copiedDecks } from './helpers-deck-chain.ts';
import { ensureChartsBaked } from './baked-decks.ts';
import { bakedById } from '../src/ui/charts/baked/store.ts';
import { plainText, tokensOf, VALUE_PENDING, type Fp } from '../src/ui/text/tokens.ts';

ensureChartsBaked();

/** A quantity of the model: a number with one of these units, or a platelet count (a thousands group). */
const QUANTITY = /(?<![\d.,])([−-]?\d[\d,]*(?:\.\d+)?)\s?(mmHg|L\/min|cm\/s|kPa|mm|L)(?![\w/])|(?<![\d.,])(\d{1,3}(?:,\d{3})+)(?:\/µL)?/g;
/** What stands before a threshold: a comparison, "from", "above", "up to", the first of a range, "between 5 and", "the line at". */
const BEFORE = /(?:under|below|above|over|from|beyond|exceed(?:s|ed)?|reach(?:es|ed)?|crosses?|passes|at or above|at least|more than|less than|up to|than|[<>≥≤]|\d(?:[\d.,]*) (?:to|and|or)|between [\d.,]+|(?:line|threshold|cut-?offs?|reference|rule|limit|criterion|criteria) (?:at|of)|exactly|within)\s+(?:about |around |roughly |near )?$|[<>≥≤]$/i;
/** What follows one: "or more", the start of a range, a rule word, a device size ("an 8 mm stent"). */
const AFTER = /^\s?(?:or more|or less|or higher|or lower|or above|or below|to [−-]?\d|rule|line|reference|threshold|cut-?offs?|mark|stents?|conduit|waist|variceal reference|–|per )/i;

const ALLOWED_WHY = ['guideline', 'trial', 'normal', 'setting', 'curve', 'derived'] as const;
const allowed: Record<string, string> = JSON.parse(readFileSync(new URL('./notes-numbers-allowed.json', import.meta.url), 'utf8'));

const decks = await copiedDecks();
const fpOf = (deckId: string, i: number): Fp | null => (bakedById(deckId)?.states[i]?.fp as Fp | undefined) ?? null;

test('every brace of a note is a reading or a typed number and prints a value at its slide', () => {
  const bad: string[] = [];
  for (const d of decks) {
    const byId = new Map((d.slides as { id: string }[]).map((s, i) => [s.id, i]));
    const fpAt = (id: string): Fp | null => { const j = byId.get(id); return j == null ? null : fpOf(d.id, j); };
    (d.slides as { id: string; notes?: string }[]).forEach((s, i) => {
      const notes = s.notes ?? '';
      if (!tokensOf(notes).length) return;
      if (!fpOf(d.id, i)) { bad.push(`${d.id}/${s.id}: no baked numbers to read the notes against`); return; }
      const out = plainText(notes, fpOf(d.id, i), fpAt);
      if (out.includes(VALUE_PENDING)) bad.push(`${d.id}/${s.id}: a reading in the notes is not known at this slide: ${tokensOf(notes).map((t) => t.raw).join(' ')}`);
      if (/[{}]/.test(out)) bad.push(`${d.id}/${s.id}: a brace is left in the notes`);
    });
  }
  assert.deepEqual(bad, []);
});

test('a note holds no hand-typed model number: a quantity is a token, a threshold, or listed with its reason', () => {
  const found = new Set<string>();
  for (const d of decks) for (const s of d.slides as { id: string; notes?: string }[]) {
    // (the braces are filled in at print time; what is typed outside them is what this test judges)
    const t = (s.notes ?? '').replace(/\{[^}]*\}/g, '§');
    for (const m of t.matchAll(QUANTITY)) {
      const before = t.slice(Math.max(0, m.index! - 28), m.index!), after = t.slice(m.index! + m[0].length, m.index! + m[0].length + 24);
      if (BEFORE.test(before) || AFTER.test(after)) continue;
      found.add(`${d.id}/${s.id} | ${m[0].trim()}`);
    }
  }
  const typed = [...found];
  assert.deepEqual(typed.filter((e) => !(e in allowed)), [], 'these notes type a number the model gives: write its token ({hvpg}, {asc}, {hvpg@slide-id}) with a patch in scripts/notes-tokens-28nov-edits.mjs; list it in tests/notes-numbers-allowed.json only if it is not the model\'s, with the reason');
  assert.deepEqual(Object.keys(allowed).filter((e) => !found.has(e)), [], 'these entries are gone from the notes: take them off tests/notes-numbers-allowed.json (the list only shrinks)');
  assert.deepEqual(Object.entries(allowed).filter(([, why]) => !(ALLOWED_WHY as readonly string[]).includes(why)).map(([e]) => e), [], `every entry says why: ${ALLOWED_WHY.join(', ')}`);
});
