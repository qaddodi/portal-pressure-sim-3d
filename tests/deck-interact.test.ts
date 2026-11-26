// A slide that asks the room something before it shows the answer (src/decks/interact.ts): one field, one card, one rule. The general rules: every kind of ask is checked in plain words, a deck of
// your own can use it like any other field, the card draws the question and the answer in one place (so the card never changes size when the room commits), and a wrong choice can send the room back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { interactProblems, wasRight, COMMIT_KINDS, type Interact } from '../src/decks/interact.ts';
import { authorDeck } from '../src/decks/author.ts';
import { toDeck } from '../src/decks/hp/deck.ts';
import { caseOf } from '../src/decks/schema.ts';
import { OVERLAY } from '../src/decks/overlay.ts';
import { loadSource, SOURCE_IDS } from '../src/decks/source.ts';
import { stopsOf, goto, next, back } from '../src/ui/deck/presenter-machine.ts';

const choose: Interact = { prompt: 'Which of these raises the pressure?', commit: { kind: 'choose', options: [{ text: 'A', why: 'No: a falls.' }, { text: 'B', right: true, why: 'Yes: b raises it.' }] }, back: 'a' };
const think: Interact = { prompt: 'What is the gradient?', commit: { kind: 'think' }, reveal: 'It is the difference.' };
const predict: Interact = { prompt: 'Guess the HVPG.', commit: { kind: 'predict', reading: 'hvpg', min: 0, max: 30, unit: 'mmHg' }, reveal: 'Now see what the model gives.' };

test('every kind of ask has one rule that says in plain words what is wrong', () => {
  assert.deepEqual(COMMIT_KINDS, ['think', 'choose', 'predict']);
  for (const i of [choose, think, predict]) assert.deepEqual(interactProblems(i, ['a', 'b']), []);
  const has = (x: unknown, re: RegExp, ids: string[] = ['a']) => assert.ok(interactProblems(x, ids).some((p) => re.test(p)), `${JSON.stringify(x).slice(0, 80)} → ${re}`);
  has(null, /interact is/);
  has({ ...think, prompt: ' ' }, /prompt/);
  has({ prompt: 'q', commit: { kind: 'shout' } }, /commit/);
  has({ prompt: 'q', commit: { kind: 'choose', options: [{ text: 'a', why: 'w', right: true }] } }, /two to four/);
  has({ prompt: 'q', commit: { kind: 'choose', options: [{ text: 'a', why: 'w' }, { text: 'b', why: 'w' }] } }, /exactly one option is right/);
  has({ prompt: 'q', commit: { kind: 'choose', options: [{ text: 'a', why: '', right: true }, { text: 'b', why: 'w' }] } }, /why/);
  has({ ...choose, back: 'nowhere' }, /does not have/);
  has({ ...think, back: 'a' }, /never wrong/);
  has({ prompt: 'q', commit: { kind: 'predict', reading: 'bogus', min: 0, max: 1 } }, /reading/);
  has({ prompt: 'q', commit: { kind: 'predict', reading: 'pv', min: 5, max: 5 } }, /minimum below/);
});

test('whether the room was right: a choice by its flag, a guess within the tolerance, a thought always', () => {
  assert.equal(wasRight(think.commit, null), true);
  assert.equal(wasRight(choose.commit, 1), true);
  assert.equal(wasRight(choose.commit, 0), false);
  assert.equal(wasRight(predict.commit, 12, 13), true);
  assert.equal(wasRight(predict.commit, 5, 13), false);
  assert.equal(wasRight({ kind: 'predict', reading: 'hvpg', min: 0, max: 30, tolerance: 1 }, 12, 13.5), false);
});

test('a deck of your own can ask: the slide keeps the question, the first card is "Your turn", and a bad ask is named and left out', () => {
  const { deck, notices } = authorDeck('my-i', 'Mine', { slides: [{ id: 'a', title: 'A', line: 'a' }, { id: 'b', title: 'B', line: 'b', interact: choose }, { id: 'c', title: 'C', line: 'c', interact: { ...choose, back: 'zzz' } }] });
  const d = toDeck(deck);
  assert.deepEqual(d.slides[1]!.interact, choose);
  assert.equal(caseOf(d.slides[1]!)?.kicker, 'Your turn');
  assert.ok(!d.slides[2]!.interact && notices.some((n) => /zzz/.test(n) && /Slide 3/.test(n)));
  // the card is a beat of its own, met going forward and never on the way back, like a case
  const stops = stopsOf(d);
  assert.equal(stops[2]!.kind === 'slide' && stops[2]!.beats, 2);
  assert.deepEqual(goto(stops, 2, { case: true }), { stop: 2, beat: 0 });
  assert.deepEqual(next(stops, { stop: 2, beat: 0 }), { stop: 2, beat: 1 });
  assert.deepEqual(back(stops, { stop: 3, beat: 0 }), { stop: 2, beat: 1 });
});

test('every ask in a built-in deck can be played, and says which slide to go back to only if the deck has it', async () => {
  for (const [key, o] of Object.entries(OVERLAY)) {
    if (!o.interact) continue;
    const deck = await loadSource(key.split('/')[0]!);
    assert.deepEqual(interactProblems(o.interact, deck.slides.map((s) => s.id)), [], key);
  }
  assert.ok(SOURCE_IDS.length > 0);
});

// ---- the card, rendered for real (no browser: Vite's own transform loads the components, react-dom/server renders them; a store read on the server returns its first state, so the live one is asked for) ----
import React from 'react';
import { createServer, type Plugin } from 'vite';

// (cards enter the stack in a layout effect, which a server render does not run, so `useStack` hands the wanted card over on the first render, as tests/card-layer-mounts.test.ts does)
const stackNow: Plugin = {
  name: 'stack-now', enforce: 'pre',
  load(id) {
    if (!id.split('?')[0]!.endsWith('/src/ui/cards/useStack.ts')) return undefined;
    return "import { reconcile } from './stack.ts';\nexport function useStack(wanted) { return { entries: reconcile([], wanted ? { key: wanted.key, id: wanted.id } : null), gone() {} }; }";
  },
};

const slide = () => toDeck(authorDeck('my-r', 'Mine', { slides: [{ id: 'a', title: 'A', line: 'a' }, { id: 'b', title: 'B', line: 'b', interact: choose }] }).deck);

test('the card draws the question and what it says after in the same place, so it never changes size when the room commits; a wrong choice says why and offers the way back', { timeout: 120_000 }, async () => {
  const live = React.useSyncExternalStore;
  (React as { useSyncExternalStore: typeof live }).useSyncExternalStore = (sub, get) => live(sub, get, get);
  const server = await createServer({ configFile: false, root: new URL('..', import.meta.url).pathname, logLevel: 'error', appType: 'custom', plugins: [stackNow], server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
  try {
    const { InteractControls } = await server.ssrLoadModule('/src/ui/cards/InteractControls.tsx');
    const { useInteract } = await server.ssrLoadModule('/src/ui/deck/interact-state.ts');
    const { CardLayer } = await server.ssrLoadModule('/src/ui/cards/CardLayer.tsx');
    const { useUi } = await server.ssrLoadModule('/src/ui/ui-store.ts');
    const d = slide();
    const markup = (s: { answer: number | null; committed: boolean }) => {
      useInteract.setState({ key: `${d.id}/b`, ...s });
      return renderToStaticMarkup(createElement(InteractControls, { slide: d.slides[1], deck: d }));
    };
    const before = markup({ answer: null, committed: false }), wrong = markup({ answer: 0, committed: true }), ok = markup({ answer: 1, committed: true });
    for (const html of [before, wrong, ok]) { assert.match(html, /pz-int-ask/); assert.match(html, /pz-int-said/); assert.equal((html.match(/pz-int-stack/g) ?? []).length, 1); }
    assert.match(before, /pz-int-said"[^>]*aria-hidden="true"/, 'before: the answer is there but hidden');
    assert.match(wrong, /pz-int-ask"[^>]*aria-hidden="true"/, 'after: the buttons are there but hidden');
    assert.match(wrong, /Not quite\. No: a falls\./);
    assert.match(wrong, /Back to “A”/);
    assert.match(ok, /Right\. Yes: b raises it\./);
    assert.doesNotMatch(ok, /Back to/);
    // and it is on the slide's first card in the layer the presenter draws
    const stops = stopsOf(d);
    useUi.getState().setViewport({ w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } });
    useUi.getState().setStops(stops);
    useUi.setState({ pos: { stop: 2, beat: 0 } });
    const layer = renderToString(createElement(CardLayer, { deck: d }));
    assert.match(layer, /data-card="case"/);
    assert.match(layer, /pz-int/);
    assert.match(layer, /Which of these raises the pressure\?/);
  } finally { await server.close(); }
});
