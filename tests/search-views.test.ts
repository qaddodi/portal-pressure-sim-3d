// The search's View group is generated from the app's one list of views (VIEWS in src/ui/shell/views.ts), not hand-listed.
// Owner, 26 Nov: "/ search menu doesn't have sinusoid view to quickly jump to it".
// Root cause: the View rows came only from the 2D inventory (Anatomy, Circuit, Lobule; it stops at the lobule) and commands.ts / wired.ts each hand-listed those three titles,
// so a view the 3D app has and 2D's palette does not (the sinusoid) was never offered. Now every view of VIEWS is a row, found by its name, wired, and goes there.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VIEWS, viewCommandTitle, VIEW_WORDS } from '../src/ui/shell/views.ts';
import { isWiredCommand } from '../src/ui/search/wired.ts';
import { search } from '../src/ui/search/match.ts';
import { defaultParams } from '../src/engine/hales/portal/scenario.js';

test('every view of the app is a wired command, whatever the 2D inventory lists, and has words to find it', async () => {
  assert.ok(VIEWS.some((v) => v.id === 'sinusoid'));
  assert.deepEqual(Object.keys(VIEW_WORDS).sort(), VIEWS.map((v) => v.id).sort());
  const { buildCommands, work } = await import('../src/ui/search/commands.ts');
  (await import('../src/engine/store.ts')).setParams(defaultParams());
  const cmds = buildCommands(() => undefined);
  const missing = VIEWS.filter((v) => !cmds.some((c) => c.group === 'View' && c.title === viewCommandTitle(v.id) && c.wired)).map((v) => v.id);
  assert.deepEqual(missing, [], 'a view missing from the search');
  for (const v of VIEWS) { assert.ok(isWiredCommand('View', viewCommandTitle(v.id))); assert.ok(work('View', viewCommandTitle(v.id))); }
  assert.equal(cmds.filter((c) => c.group === 'View' && c.title === 'Sinusoid view').length, 1);
});

test('typing a view name finds it first, and choosing it goes there (the sinusoid from anywhere)', async () => {
  const { buildCommands } = await import('../src/ui/search/commands.ts');
  const { useShell } = await import('../src/ui/shell/store.ts');
  (await import('../src/engine/store.ts')).setParams(defaultParams());
  const cmds = buildCommands(() => undefined);
  for (const v of VIEWS) {
    assert.equal(search(cmds, v.label, ['View'])[0]?.c.title, viewCommandTitle(v.id), `"${v.label}" finds the ${v.label} view first`);
    const part = v.label.toLowerCase().slice(0, 4);
    assert.ok(search(cmds, part, ['View'], 5).some((h) => h.c.title === viewCommandTitle(v.id)), `"${part}" offers the ${v.label} view`);
    cmds.find((c) => c.group === 'View' && c.title === viewCommandTitle(v.id))!.run(null);
    assert.equal(useShell.getState().view, v.id);
  }
});
