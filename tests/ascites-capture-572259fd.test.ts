// Ascites capture 572259fd: an empty refilling belly's balance breaks inside the ring ("Refilling 3,900 mL/da" ran out of it), and a stopped counter ("14 days later") uses proportional digits ("1 4").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rateText } from '../src/ui/tests/abdomen/model.ts';

const css3 = (f: string) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('the refilling balance joins its number and unit, so it breaks only after "Refilling"', () => {
  assert.equal(rateText(3900, false), 'Refilling 3,900 mL/day');
  assert.equal(rateText(3900, true), '3,900 mL/day');
  assert.equal(rateText(0, false), 'Steady');
  assert.match(css3('css3d-over-2d.css'), /\.ab-rate\[data-refill\]\s*\{[^}]*white-space:\s*normal/);
});

test('a stopped time-lapse counter is set in proportional digits', () => {
  assert.match(css3('css3d-over-2d.css'), /\.pz-lapse\.done\s*\{[^}]*proportional-nums/);
});

test('the capture waits for the engine\'s morph (a paracentesis slide\'s gauge read 5.9 on every step until it ended)', () => {
  assert.match(readFileSync(new URL('../src/ui/debug/audit/capture-all.ts', import.meta.url), 'utf8'), /latest\.frame\?\.morphing\) return 'the model is morphing'/);
});

test('an equation sign keeps its own air on both sides (SAAG minus touched "Albumin serum", slide 7)', () => {
  assert.match(readFileSync(new URL('../src/ui/cards/TeachingCard.tsx', import.meta.url), 'utf8'), /form="infix" lspace="0\.25em" rspace="0\.25em"/);
});
