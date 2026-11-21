import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Mohammad, 21 Nov 2026 (review findings 6 and 17): wording the 3D app keeps on purpose where it departs from the 2D copies (Baveno VIII 1.14 to 1.16, 7.4).
// The deck files are generated; a re-copy from 2D would undo these edits, and this test then fails.
const DECKS = ['src/decks/hvpg.copied.ts', 'src/decks/hp/data/hvpg.copied.ts', 'src/decks/hp/data/outflow.copied.ts', 'src/decks/ag/circulation.copied.ts',
  'src/decks/rw/copied/recompensation.ts', 'src/decks/rw/copied/ten-years.ts'];
const text = (f: string) => readFileSync(f, 'utf8');

test('an LSM >=25 kPa is never taught as a general CSPH rule-in: each mention carries its scope or a pointer to the stiffness pathway', () => {
  for (const f of DECKS) {
    for (const [i, line] of text(f).split('\n').entries()) {
      if (!/≥ ?25 kPa/.test(line) || /\{>=25 kPa\}/.test(line) || /non-obese MASLD|MASLD \(BMI <30|BMI ≥30/.test(line)) continue;
      if (/LSM <15 kPa|<15 kPa with|SSM <25|CSPH may|rule[sd]? out/.test(line.replace(/≥ ?25 kPa/g, ''))) { /* the line also holds a rule-out; check the rule-in clause only */ }
      for (const m of line.matchAll(/.{0,140}≥ ?25 kPa.{0,220}/g)) {
        assert.match(m[0], /viral or alcohol|BMI <30|stiffness pathway|non-obese/, `${f}:${i + 1} states 25 kPa without its scope: ${m[0]}`);
      }
    }
  }
});

test('the HVPG range between normal and CSPH is continuous (>5 to <10), never the integer "6 to 9"', () => {
  for (const f of DECKS) assert.doesNotMatch(text(f), /\b6 to 9 mmHg|6[–-]9 mmHg/, f);
  for (const f of ['src/decks/hvpg.copied.ts', 'src/decks/hp/data/hvpg.copied.ts', 'src/decks/ag/circulation.copied.ts']) assert.match(text(f), />5 to <10 mmHg/, f);
});

test('the HVPG slide notes carry the scoped rule-in in both generated copies', () => {
  for (const f of ['src/decks/hvpg.copied.ts', 'src/decks/hp/data/hvpg.copied.ts']) {
    assert.match(text(f), /an LSM ≥25 kPa rules in CSPH only in viral or alcohol-related cACLD and in MASLD-related cACLD with a BMI <30; for other etiologies or a BMI ≥30 follow the stiffness pathway/, f);
  }
});

test('the recompensation quick checks match the teaching slide and Baveno VIII 7.4: Child-Pugh A5 or A6, >6 months tied to cause, ascites and HE, bleeding only if it was the event', () => {
  const t = text('src/decks/rw/copied/recompensation.ts');
  assert.doesNotMatch(t, /liver function back to Child–Pugh A\.|rebleeding for >6/);
  for (const needle of ['all three for >6 consecutive months', 'if bleeding was the decompensating event', 'Child–Pugh A5 or A6']) {
    assert.ok(t.split(needle).length - 1 >= 2, `${needle} appears in the check answers and the summary`);
  }
  const slide = /Baveno VIII requires all of:[^"]*/.exec(t)![0];
  assert.match(slide, /the cause, the ascites and the HE criteria each for >6 consecutive months/);
  assert.match(slide, /Child–Pugh A5 or A6/);
});
