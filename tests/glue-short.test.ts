// Audit af1c51a0 (iPhone, Treatment 2 case card): "...furosemide. A" ended a line and "surveillance EGD shows" began the next. A one-letter word stands with its next word, on every case card of every talk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { glueShort } from '../src/ui/text/glue-short.ts';

test('a one-letter word is joined to the word after it', () => {
  assert.equal(glueShort('controlled on furosemide. A surveillance EGD shows'), 'controlled on furosemide. A surveillance EGD shows');
  assert.equal(glueShort('A 58-year-old woman'), 'A 58-year-old woman');
  assert.equal(glueShort('she has a mild fever and I think'), 'she has a mild fever and I think');
  assert.equal(glueShort('(A tube) and class A.'), '(A tube) and class A.', 'a letter before a stop is left alone');
  assert.equal(glueShort('Always a lot'), 'Always a lot', 'only a whole one-letter word');
  assert.equal(glueShort(null), '');
});
test('the case card glues its text and its question', () => {
  const src = readFileSync('src/ui/cards/CaseCard.tsx', 'utf8');
  assert.match(src, /const text = glueShort\(pageOf\(sentences\(c\.text\), pages, page\)\.join\(' '\)\);/);
  assert.match(src, /\{glueShort\(slide\.caseQ\)\}/);
});
