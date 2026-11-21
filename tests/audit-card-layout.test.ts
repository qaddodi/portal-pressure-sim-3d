// The audit's 21 Nov report (?audit v2), the findings that were the app's: the profile chart past its card's foot, the summary table's blood pressure cell; and the two that were the audit's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heldToRoom, layoutHeight } from '../src/ui/charts/profile/model.ts';
import { roleOf } from '../src/ui/debug/screen/raw.ts';
import { cardSeries, cardSizeSnap, type Sample } from '../src/ui/debug/watch/motion-rules.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the profile chart is never taller than the room its data card leaves it (2D --pz-room, never under 11 em): the Mac case slides had it 88 to 141 px past the card', () => {
  const f = 12, own = layoutHeight(430, f, 'wide', false, 9)!;
  assert.equal(heldToRoom(own, undefined, f), own, 'no room measured: the height as it is');
  assert.equal(heldToRoom(own, 0, f), own, 'a stacked card has no room');
  assert.equal(heldToRoom(undefined, 200, f), undefined, 'a stacked card has no height of its own');
  assert.equal(heldToRoom(own, own + 50, f), own, 'room to spare: unchanged');
  assert.equal(heldToRoom(own, 200.7, f), 200, 'less room: the room');
  assert.equal(heldToRoom(own, 60, f), 11 * f, 'never under 11 em');
});

test('the profile card is handed the room, and holds its height to it', () => {
  assert.match(src('src/ui/talk/ToolCardBody.tsx'), /<ProfileCard [^>]*room=\{room\}/);
  const pc = src('src/ui/charts/profile/ProfileCard.tsx');
  assert.match(pc, /heldToRoom\(layoutHeight\(/);
  assert.match(pc, /deps=\{\[[^\]]*\broom\b/);
});

test('the summary table\'s blood pressure cell wears 2D\'s .bp (it wraps at its space), in the reference cell and the arrow cell (presenter-question.js summaryTable)', () => {
  const t = src('src/ui/cards/TableCard.tsx');
  assert.match(t, /c\.k === 'map' \? 'num ref bp' : 'num ref'/);
  assert.match(t, /num dir\$\{c\.k === 'map' \? ' bp' : ''\}/);
  assert.match(src('src/ui/css2d/app-04-presenter.css'), /td\.num\.bp \{ white-space: normal/);
});

// a minimal element for roleOf: its own classes and its ancestors', matched against the selector lists roleOf asks for (.class, [class*="x"], tag)
const el = (classes: string[], ancestors: { classes: string[]; tag?: string }[] = [], tag = 'span') => {
  const chain = [{ classes, tag }, ...ancestors];
  const hit = (n: { classes: string[]; tag?: string }, sel: string) => sel.split(',').map((x) => x.trim()).some((s) => (s.startsWith('.') ? n.classes.includes(s.slice(1)) : s.startsWith('[class*="') ? n.classes.some((c) => c.includes(s.slice(9, -2))) : n.tag === s));
  return { classList: { contains: (c: string) => classes.includes(c) }, closest: (sel: string) => chain.find((n) => hit(n, sel)) ?? null } as unknown as Element;
};

test('the words\' size is the paragraph\'s: a figure\'s step marker (.pz-step, 2D\'s max(12px, .68em) circle) inside the words is not "the words shrank to fit" (the two slides with {#1} in the line)', () => {
  const line = { classes: ['pz-line'] };
  assert.equal(roleOf(el([], [line])), 'body');
  assert.equal(roleOf(el(['pz-step'], [line])), 'other');
  assert.equal(roleOf(el(['pz-pill'], [line])), 'other');
  assert.match(src('src/ui/css2d/app-04-presenter.css'), /\.pz-step \{[^}]*font-size: max\(12px, \.68em\)/);
});

test('a card leaving and the one coming in are two series, so the swap of one for the other is not a card that "snapped" in height', () => {
  assert.equal(cardSeries('teach', 'in'), 'teach'); assert.equal(cardSeries('teach', undefined), 'teach'); assert.equal(cardSeries('teach', 'out'), 'teach~out');
  // 328 px old card and 304 px new card, alternately read as `teach` (what the report saw), then as two series
  const row = (t: number, id: string, h: number): Sample => ({ t, K: [[id, 0, 0, 300, h, 1]], W: [1], L: [], c: null });
  const mixed: Sample[] = [row(0, 'teach', 328), row(33, 'teach', 328), row(66, 'teach', 328), row(99, 'teach', 304), row(132, 'teach', 304), row(165, 'teach', 304)];
  assert.equal(cardSizeSnap({ samples: mixed } as never).length, 1, 'one series reads the swap as a snap');
  const apart: Sample[] = [row(0, 'teach~out', 328), row(33, 'teach~out', 328), row(66, 'teach~out', 328), row(99, 'teach', 304), row(132, 'teach', 304), row(165, 'teach', 304)];
  assert.equal(cardSizeSnap({ samples: apart } as never).length, 0);
});
