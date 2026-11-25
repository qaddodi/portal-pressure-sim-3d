// The Trials pane is 2D's markup under 2D's stylesheet, not a second look of its own (20 Nov 2026, play-test: the 3D list showed small-caps fold heads with a right chevron and no chips, round-cornered
// rows and a different rules list). Root cause: TrialsPane.tsx built its own nodes and trials.css overrode styles/tests-card.css for the same class names. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pane = read('src/ui/trials/TrialsPane.tsx'), mine = read('src/ui/trials/trials.css'), theirs = read('src/ui/styles/tests-card.css');

test('every node class 2D\'s trials-pane.js builds is built here, and 2D\'s stylesheet has its rule', () => {
  for (const c of ['tr-l1', 'tr-nm', 'tr-rs', 'tr-vs', 'tr-l2', 'tr-why', 'tr-pips', 'tr-fold', 'tr-fh', 'tr-ft', 'tr-fc', 'tr-fn', 'tr-chev', 'tr-chips', 'tr-chip', 'tr-fb', 'tr-items', 'tr-exp', 'tr-rules', 'tr-rule', 'tr-rsep', 'tr-lab', 'tr-src']) {
    assert.ok(pane.includes(c), `TrialsPane.tsx builds .${c}`);
    if (c !== 'tr-ft' && c !== 'tr-fn') assert.ok(new RegExp(`\\.${c}\\b`).test(theirs), `2D's tests-card.css styles .${c}`);   // (those two are script hooks in 2D)
  }
  assert.match(pane, /role="heading" aria-level=\{3\}/, 'the section title is 2D\'s heading div');
});

test('the not-this-patient fold keeps its chips under its head whether it is open or shut (2D), and a chip opens the fold', () => {
  assert.match(pane, /className="tr-chips"[\s\S]*?<Fold className="tr-fb"/, 'the chips are outside the fold');
  assert.match(pane, /setFolds\(\(f\) => \(\{ \.\.\.f, no: true \}\)\)/, 'a chip opens the fold');
  assert.doesNotMatch(pane, /chips\.length > 1/, 'no extra condition 2D does not have');
});

test('a fold eases open and shut (2D foldHidden) instead of mounting and unmounting', () => {
  assert.match(pane, /function Fold\(/);
  assert.match(pane, /\.animate\(still \? /);
  assert.doesNotMatch(pane, /\{fold && \(/, 'the old pop');
});

test('trials.css does not restyle 2D\'s rows, folds, chips or rules (the second stylesheet that won over 2D\'s)', () => {
  for (const sel of ['.tr-fh', '.tr-chips', '.tr-row', '.tr-grp', '.tr-rules', '.tr-sec', '.tr-item', '.tr-mark', '.tr-name']) {
    assert.ok(!mine.includes(`${sel} {`) && !mine.includes(`${sel},`), `trials.css has no rule for ${sel}`);
  }
});
