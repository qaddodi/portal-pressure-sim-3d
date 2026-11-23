// Prehepatic review 2 (23 Nov 2026): the quick check leaves the figure as the LAST slide left it. lastCath used to scan back for the last slide with ANY catheter, so a deck whose
// last slides have none (portal vein thrombosis: the wedge is slide 3, the table is last) brought the wedged catheter and its FHVP / WHVP / HVPG labels back on the check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDeck } from '../src/decks/hp/deck.ts';
import { DECK } from '../src/decks/hp/data/prehepatic.copied.ts';
import type { Deck } from '../src/decks/schema.ts';
import { stopsOf, cathPlace, catheterAt, lastCath } from '../src/ui/deck/presenter-machine.ts';

const checkAt = (stops: ReturnType<typeof stopsOf>) => ({ stop: stops.length - 1, beat: 0 });

test('a talk whose last slide has no catheter shows none on the check, though an earlier slide wedged one', () => {
  const d = toDeck(DECK);
  assert.ok(d.slides.some((s) => s.cath === 'result'), 'the talk wedges a catheter early');
  assert.equal(d.slides.at(-1)!.cath, undefined, 'and its last slide has none');
  const stops = stopsOf(d);
  assert.equal(stops.at(-1)!.kind, 'check');
  assert.equal(lastCath(stops), undefined);
  assert.equal(cathPlace(stops, checkAt(stops)), null);
  assert.deepEqual(catheterAt(stops, checkAt(stops)), { advance: 0, balloon: 0 });
});

test('a talk whose last slide keeps the result keeps it on the check', () => {
  const d = toDeck(DECK);
  const last = { ...d.slides.at(-1)!, cath: 'result' as const };
  const stops = stopsOf({ ...d, slides: [...d.slides.slice(0, -1), last] } as Deck);
  assert.equal(lastCath(stops), 'result');
  assert.deepEqual(catheterAt(stops, checkAt(stops)), { advance: 1, balloon: 1 });
});
