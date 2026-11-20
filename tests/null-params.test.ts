// Compare blanked the app: "Cannot read properties of null (reading 'cirrhosis')" (walk of 20 Nov, issue 1). Frames carry `params` only when they changed, so reading `frame.params` gives nothing on most
// frames, and the Compare card's "Now" line handed that null to the Changes list. The list answers "nothing changed" for settings it does not know, and the card reads the patient's own settings.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { activeInterventions, treatCount } from '../src/ui/action/changes.ts';
import { activeLabels } from '../src/ui/compare/labels.ts';

test('unknown settings are no changes, not a crash', () => {
  assert.deepEqual(activeInterventions(null), []);
  assert.deepEqual(activeInterventions(undefined), []);
  assert.equal(treatCount(null), 0);
  assert.deepEqual(activeLabels(null), []);
  assert.deepEqual(activeLabels(undefined), []);
});
test('the Compare card names the patient\'s settings, not a frame that mostly carries none; the search offers nothing it cannot judge', () => {
  const c = readFileSync('src/ui/compare/CompareUi.tsx', 'utf8');
  assert.match(c, /activeLabels\(f\?\.params \?\? patient\.params\)/);
  assert.doesNotMatch(c, /f\?\.params \?\? null/);
  assert.match(readFileSync('src/ui/treat/palette-orders.ts', 'utf8'), /const p = currentParams\(\); return !!p && c\.when\(p\)/);
});
