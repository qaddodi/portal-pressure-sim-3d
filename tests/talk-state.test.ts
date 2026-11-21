// R4 (21 Nov review): "is a talk on, which, and where" has ONE answer, `useUi` (deck, stops, pos); state/deck.ts only reads it and the talk ends in one place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { talkOn, talkId, slideIndex, slideCount } from '../src/state/deck.ts';
import { useUi } from '../src/ui/ui-store.ts';
import type { Stop } from '../src/ui/deck/presenter-machine.ts';

const stops = (n: number): Stop[] => [{ kind: 'title' }, ...Array.from({ length: n }, (): Stop => ({ kind: 'check' }))];

test('open, go, close: every answer about the talk agrees at every step', () => {
  const ui = useUi.getState;
  assert.equal(talkOn(), false); assert.equal(talkId(), null); assert.equal(slideCount(), 0);
  ui().openDeck({ id: 'hvpg' } as never);
  assert.equal(talkOn(), true); assert.equal(talkId(), 'hvpg');
  ui().setStops(stops(5));                       // (the title and five slides: slide 0 is the title)
  assert.equal(slideCount(), 5); assert.equal(slideIndex(), 0);
  ui().go(3);
  assert.equal(slideIndex(), 3);
  ui().openDeck({ id: 'other' } as never);       // another talk over this one
  assert.equal(talkId(), 'other');
  ui().openDeck(null);
  assert.equal(talkOn(), false); assert.equal(talkId(), null);
});

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
test('no second store holds it: state/deck.ts creates none, the shell has no mode, and one function ends a talk', () => {
  assert.ok(!/\bcreate\b|zustand/.test(readFileSync('src/state/deck.ts', 'utf8').replace(/\/\/.*$/gm, '')), 'state/deck.ts holds no store');
  const ends: string[] = [], old: string[] = [];
  for (const f of files('src')) {
    const t = readFileSync(f, 'utf8');
    if (f !== 'src/ui/ui-store.ts' && /openDeck\(null\)/.test(t)) ends.push(f);
    if (/\buseDeck\b|useShell(\.getState\(\))?\.mode\b|useShell\(\(s\) => s\.mode|setState\(\{[^}]*mode: '(deck|free)'/.test(t.replace(/\/\/.*$/gm, '')) && !f.includes('tests/')) old.push(f);
  }
  assert.deepEqual(ends, ['src/ui/shell/talk.ts'], 'a talk ends in one place (closeTalk)');
  assert.equal((readFileSync('src/ui/shell/talk.ts', 'utf8').match(/openDeck\(null\)/g) ?? []).length, 1);
  assert.deepEqual(old, [], 'nothing asks the old stores');
});
