import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { HVPG_COPIED } from '../src/decks/hvpg.copied.ts';
import { SOURCE_PATCHES } from '../scripts/source-edits.mjs';

// Project rule: Baveno VIII is the only guideline the talks name on screen. Where it is silent (doses, red wale signs, recanalization rates), the claim stays and its
// source is named in the speaker notes only (scripts/source-edits.mjs, run by every deck generator). Every string of a talk is on screen (title, line, cite, ask, sides,
// checks, objectives, tool words) except the one field `notes`.
const OTHER = /\b(AASLD|EASL|WSACS|ESGE|ESPEN|ACG|AGA|ASGE|ISTH|ACCP|KDIGO|APASL|ACOG|CIRSE|International Ascites Club|Baveno (?:IV|V|VI|VII))\b/;

const DECKS: { id: string; deck: unknown }[] = [{ id: 'hvpg', deck: HVPG_COPIED }];
for (const id of AG_IDS) DECKS.push({ id, deck: await loadAgDeck(id) });
for (const id of HP_IDS) DECKS.push({ id, deck: await loadHpDeck(id) });
for (const id of RW_IDS) DECKS.push({ id, deck: await RW_LOADERS[id]!() });

function walk(v: unknown, at: string, out: { at: string; text: string }[], notes: { at: string; text: string }[]): void {
  if (typeof v === 'string') { out.push({ at, text: v }); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${at}[${i}]`, out, notes)); return; }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'notes' && typeof x === 'string') notes.push({ at: `${at}.notes`, text: x });
      else walk(x, `${at}.${k}`, out, notes);
    }
  }
}

test('no talk names a guideline other than Baveno VIII on screen (speaker notes may)', () => {
  assert.ok(DECKS.length >= 42, `talks (${DECKS.length})`);
  const bad: string[] = [];
  for (const { id, deck } of DECKS) {
    const on: { at: string; text: string }[] = []; walk(deck, id, on, []);
    for (const { at, text } of on) if (OTHER.test(text)) bad.push(`${at}: ${text.slice(0, 120)}`);
  }
  assert.deepEqual(bad, []);
});

test('the sources moved to the notes: the speaker notes still name AASLD, EASL and WSACS where the slides lean on them', () => {
  const notes: { at: string; text: string }[] = [];
  for (const { id, deck } of DECKS) walk(deck, id, [], notes);
  const all = notes.map((n) => n.text).join('\n');
  for (const name of ['AASLD 2024', 'AASLD 2021', 'EASL 2025', 'WSACS']) assert.ok(all.includes(name), `${name} is named in a note`);
  const of = (deck: string, slide: string) => notes.find((n) => n.at.startsWith(`${deck}.slides[`) && n.at.endsWith('.notes') && DECKS.find((d) => d.id === deck) && (DECKS.find((d) => d.id === deck)!.deck as { slides: { id: string; notes: string }[] }).slides.find((s) => s.id === slide)?.notes === n.text)?.text ?? '';
  assert.match(of('stiffness', 'aasld'), /rule of five/);
  assert.match(of('prehepatic', 'anticoag-lumen'), /EASL 2025/);
  assert.match(of('albumin', 'terli'), /AASLD 2021/);
});

test('the two stiffness slides that set AASLD against Baveno VIII are Baveno VIII alone', () => {
  const st = (DECKS.find((d) => d.id === 'stiffness')!.deck as { slides: { id: string; line: string; tool?: { of?: string }; sides?: { who: string }[] }[] }).slides;
  const a = st.find((s) => s.id === 'aasld')!, c = st.find((s) => s.id === 'a3')!;
  assert.equal(a.tool?.of, 'first-visit');
  assert.ok(a.line.includes('Baveno VIII'));
  assert.deepEqual(c.sides!.map((s) => s.who), ['Baveno VIII', 'What decides it']);
});

test('preemptive TIPS HVPG threshold is >=20 mmHg, as Baveno VIII 5.31 and its Fig. 5 have it (the PDF prints the sign as ">−", its glyph for "≥")', () => {
  for (const { id, deck } of DECKS) {
    const on: { at: string; text: string }[] = []; walk(deck, id, on, []);
    for (const { at, text } of on) assert.doesNotMatch(text, /HVPG >\s?20 mmHg|HVPG of >20|HVPG 20 mmHg or more/, `${at}`);
  }
  const t = JSON.stringify(DECKS.find((d) => d.id === 'choose-treatment')!.deck);
  assert.match(t, /an HVPG ≥20 mmHg/);
});

test('every source patch names a talk that exists', () => {
  const ids = new Set(DECKS.map((d) => d.id));
  for (const p of SOURCE_PATCHES) assert.ok(ids.has(p.deck), `${p.deck} ${p.at}`);
});
