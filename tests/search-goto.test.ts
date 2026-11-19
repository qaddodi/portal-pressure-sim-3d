// The search's Go to group: every entry of the 2D inventory is listed, and choosing one selects the structure as 2D's palette does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/strings.generated.ts';
import { GO_TO, goTo } from '../src/ui/search/goto.ts';
import { isWiredCommand } from '../src/ui/search/wired.ts';
import { useSelection } from '../src/ui/action/selection.ts';
import { useTests } from '../src/ui/tests/store.ts';
import { claims } from '../src/parity/b6.ts';

const rows = UI.search.commands.filter((c) => c.group === 'Go to');

test('every Go to entry of the 2D palette selects something here', () => {
  assert.equal(rows.length, 49);
  assert.deepEqual(rows.filter((c) => !GO_TO.has(c.title)).map((c) => c.title), []);
  for (const c of rows) assert.ok(isWiredCommand('Go to', c.title));
  assert.equal(claims.length, 49);
  assert.ok(claims.every((c) => c.wired && c.id.startsWith('search:Go to/')));
});
test('choosing a vessel selects it, an organ selects the organ, the abdomen opens the Ascites instrument', () => {
  assert.ok(goTo('Portal vein'));
  assert.deepEqual(useSelection.getState().sel, GO_TO.get('Portal vein'));
  assert.equal(useSelection.getState().sel?.type, 'edge');
  assert.ok(goTo('Spleen'));
  assert.deepEqual(useSelection.getState().sel, { type: 'organ', id: 'spleen' });
  assert.ok(goTo('Ascites'));
  assert.equal(useSelection.getState().sel, null);
  assert.equal(useTests.getState().pane, 'abdomen');
  assert.equal(goTo('Nowhere'), false);
});
