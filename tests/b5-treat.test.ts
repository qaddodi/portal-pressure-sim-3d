// B5 on the Treat card: the eleven procedure tiles reach the figure (claims derived from the card's own table), the tamponade tube has its marker bands and its traction arrow (stage-balloon.js),
// and the Paracentesis tile opens the Ascites instrument as 2D's select() does.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CelScene } from '../src/scene/scene.ts';
import { claims } from '../src/parity/b5.ts';
import { procedures } from '../src/ui/treat/orders.ts';
import { selectStructure, useSelection } from '../src/ui/action/selection.ts';
import { useTests } from '../src/ui/tests/store.ts';
import { PULL, pullArrow } from '../src/scene/procedures/copied/balloon-gas.js';

const inventory = JSON.parse(readFileSync('parity/inventory.json', 'utf8')) as { rows: { id: string; batch: string }[] };

test('every B5 Treat row is claimed once, from the card\'s own tiles, and all eleven are wired', () => {
  const rows = inventory.rows.filter((r) => r.id.startsWith('treat:procedure/'));
  assert.equal(rows.length, 11);
  assert.deepEqual(claims.map((c) => c.id).sort(), rows.map((r) => r.id).sort());
  assert.ok(claims.every((c) => c.wired), 'each tile\'s result is drawn by code that is in the app');
  // a tile of the card with a row is the one claimed (the labels are the tiles' labels)
  const labels = new Set(procedures().map((p) => `treat:procedure/${p.label}`));
  for (const c of claims) assert.ok(labels.has(c.id), c.id);
});

test('the tamponade tube has two platinum marker bands at the esophageal balloon\'s ends and a traction arrow that eases in with the pull', () => {
  const s = new CelScene();
  const t = s.procs.tamponade;
  assert.equal(t.objects.length, 7);
  t.want(true, false); t.snap();
  assert.equal(t.state.gas, 1);
  assert.ok(t.marks[0].group.visible && t.marks[1].group.visible, 'both bands on a tube that is in');
  assert.ok(t.pull > 0.99 && t.pullLine.group.visible && t.pullHead.group.visible, 'the tube is drawn up: the arrow shows');
  // the bands are short rings (a unit of the 2D figure's length) on the tube, so they are inside its box
  t.tube.toonMesh.geometry.computeBoundingBox();
  const box = t.tube.toonMesh.geometry.boundingBox!.clone().expandByScalar(0.01);
  for (const m of t.marks) {
    const pos = m.toonMesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { assert.ok(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))); assert.ok(box.containsPoint({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) } as never), 'a band is on the tube'); }
  }
  // the arrow is the 2D one: up the esophagus's side from 152 to 124
  const a = pullArrow() as { line: number[][]; head: number[][] };
  assert.equal(a.line[0]![1], PULL.from); assert.equal(a.head[0]![1], PULL.to);
  // let down: no pull, no arrow; out: nothing of the tube
  t.want(false, false);
  for (let i = 0; i < 40; i++) t.update(16);
  assert.ok(t.state.gas < 1);
  for (let i = 0; i < 400; i++) t.update(16);
  assert.equal(t.state.adv, 0);
  assert.equal(t.pull, 0);
  assert.ok(![...t.marks, t.pullLine, t.pullHead].some((o) => o.group.visible));
  s.dispose();
});

test('the traction runs in the second half of the gastric balloon\'s filling (stage-balloon.js: (gas - 0.45) / 0.55), and it lets down faster than it fills', () => {
  const s = new CelScene();
  const t = s.procs.tamponade;
  t.want(true, false);
  let first = -1;
  for (let i = 0; i < 400 && first < 0; i++) { t.update(16); if (t.pull > 0.01) first = t.state.gas; }
  assert.ok(first >= 0.45, `the pull starts after 0.45 of the filling, not at ${first}`);
  let up = 0, down = 0;
  { const u = new CelScene().procs.tamponade; u.want(true, false); u.snap(); u.want(false, false); while (u.state.adv > 0 && down < 2000) { u.update(16); down++; } }
  { const u = new CelScene().procs.tamponade; u.want(true, false); while (u.state.gas < 1 && up < 2000) { u.update(16); up++; } }
  assert.ok(down < up, `let down in ${down} frames, filled in ${up}`);
  s.dispose();
});

beforeEach(() => { useSelection.setState({ sel: null }); useTests.setState({ open: false }); });
test('Paracentesis selects the abdomen, which has no card: it opens the Ascites instrument and leaves nothing selected', () => {
  const picked: unknown[] = [];
  const env = { say: () => {}, select: (x: unknown) => { picked.push(x); selectStructure(x as never); }, action: () => {} };
  procedures().find((p) => p.id === 'paracentesis')!.run(env);
  assert.equal(useSelection.getState().sel, null);
  assert.equal(useTests.getState().open, true);
  assert.equal(useTests.getState().pane, 'abdomen');
  // any other organ is still a selection
  selectStructure({ type: 'organ', id: 'spleen' });
  assert.deepEqual(useSelection.getState().sel, { type: 'organ', id: 'spleen' });
});
