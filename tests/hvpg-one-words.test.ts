// The HVPG deck's first four slides keep their named camera shots, but their words are the one copy every deck reads (hp/data/hvpg.copied.ts, with the reviewers' edits), never a second copy
// that an edit can miss: the wedge slide's "in triplicate" sentence (reviewer, 24 Nov) reached only that copy, and the slide read the old text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HVPG_DECK } from '../src/decks/hvpg.ts';
import { DECK as HVPG_2D } from '../src/decks/hp/data/hvpg.copied.ts';

const WORDS = ['kicker', 'title', 'line', 'notes', 'caveat', 'cite', 'vignette'] as const;

test('every slide of the HVPG deck says what the one copy says, the slice\'s four included', () => {
  assert.equal(HVPG_DECK.slides.length, HVPG_2D.slides.length);
  for (const s of HVPG_DECK.slides) {
    const c = HVPG_2D.slides.find((x) => x.id === s.id)!;
    for (const k of WORDS) assert.equal((s as unknown as Record<string, unknown>)[k] ?? null, (c as Record<string, unknown>)[k] ?? null, `${s.id}.${k}`);
  }
  const wedge = HVPG_DECK.slides.find((s) => s.id === 'wedge')!;
  assert.match(wedge.line ?? '', /in triplicate/);
});
