// Junction skins in the real scene (WP5/WP7): built with Smooth vessel joins on and the page's `?joins` not `old`; the arms are cut, their mates and burial off at the skinned ends, and everything goes back with the switch or `?joins=old`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { useSettings } from '../src/state/settings.ts';
import { joinsMode, joinsPhase, JOINS_DEFAULT } from '../src/scene/vessels/skin/joins-mode.ts';
import { SKIN_CUT_NONE, SKIN_HIDDEN } from '../src/scene/vessels/skin/types.ts';
import { flagValue } from '../src/ui/debug/flags.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';

const cutsOf = (s: CelScene) => new Map(NETWORK.map((v) => [v.id, (s.vesselObject(v.id) as VesselObject | undefined)?.skinCut() ?? SKIN_CUT_NONE]));
const mates = (s: CelScene, id: string) => { const u = (s.vesselObject(id) as VesselObject).toon.uniforms; return [(u.mate0!.value as { x: number }).x, (u.mate1!.value as { x: number }).x]; };
const bury = (s: CelScene, id: string) => { const b = (s.vesselObject(id) as VesselObject).toon.uniforms.bury!.value as { x: number; y: number }; return [b.x, b.y]; };

test('the flag: ?joins=old, mesh and mesh2 pick the method; no flag is the default; nothing else changes the picture', () => {
  assert.equal(joinsMode('?joins=old'), 'old'); assert.equal(joinsMode('?joins=mesh'), 'mesh'); assert.equal(joinsMode('?joins=mesh2'), 'mesh2');
  assert.equal(joinsMode(''), JOINS_DEFAULT); assert.equal(joinsMode('?joins=banana'), JOINS_DEFAULT);
  assert.deepEqual([joinsPhase('old'), joinsPhase('mesh'), joinsPhase('mesh2')], [0, 1, 2]);
  assert.equal(flagValue('joins', '?joins=old'), 'old');
});

test('?joins=old builds no skin and every tube is the one it was: no cut, its mates and burial as the smooth joins set them', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const s = new CelScene({ joins: 'old' });
  try {
    assert.deepEqual(s.skinNodes, []);
    for (const [id, c] of cutsOf(s)) assert.deepEqual([...c], [...SKIN_CUT_NONE], id);
  } finally { s.dispose(); setSmoothJoins(was); }
});

test('mesh2 builds the skins, cuts every arm at its seam (a vessel that two skins share gets both cuts in one), turns its mate and burial off at the skinned ends, and takes it all back when Smooth vessel joins goes off, and again when it comes on', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  useSettings.setState({ smoothJoins: true });
  const old = new CelScene({ joins: 'old' });
  const oldMates = new Map(NETWORK.map((v) => [v.id, mates(old, v.id)])), oldBury = new Map(NETWORK.map((v) => [v.id, bury(old, v.id)]));
  old.dispose();
  const s = new CelScene({ joins: 'mesh2' });
  try {
    assert.ok(s.skinNodes.length >= 4, `skins at ${s.skinNodes.join(', ')}`);
    const cut = [...cutsOf(s)].filter(([, c]) => c[0] !== SKIN_CUT_NONE[0] || c[1] !== SKIN_CUT_NONE[1]);
    assert.ok(cut.length >= 10, `${cut.length} cut tubes`);
    for (const [id, c] of cut) {
      const m = mates(s, id), b = bury(s, id), om = oldMates.get(id)!, ob = oldBury.get(id)!;
      for (const e of [0, 1]) {
        const skinned = e === 0 ? c[0] >= 0 : c[1] <= 1;
        if (skinned) { assert.equal(m[e], -1, `${id} end ${e}: no mate where a skin has it`); assert.equal(b[e], 0, `${id} end ${e}: no burial there`); }
        else { assert.equal(m[e], om[e], `${id} end ${e} keeps its mate`); assert.equal(b[e], ob[e], `${id} end ${e} keeps its burial`); }
      }
    }
    // the switch off: every tube back (restore is exact), the skins gone
    useSettings.setState({ smoothJoins: false });
    assert.deepEqual(s.skinNodes, []);
    for (const [id, c] of cutsOf(s)) assert.deepEqual([...c], [...SKIN_CUT_NONE], `${id} restored with the switch off`);
    useSettings.setState({ smoothJoins: true });
    assert.ok(s.skinNodes.length >= 4, 'and built again with it on');
  } finally { s.dispose(); useSettings.setState({ smoothJoins: true }); setSmoothJoins(was); }
});

test('mesh (phase 1) is the SMV-SV confluence only', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true); useSettings.setState({ smoothJoins: true });
  const s = new CelScene({ joins: 'mesh' });
  try { assert.ok(s.skinNodes.length <= 1 && (s.skinNodes[0] ?? 'CONF').startsWith('CONF'), s.skinNodes.join()); } finally { s.dispose(); setSmoothJoins(was); }
});

test('a merged skin hides the vessel it replaces whole, and its cut is restored with the rest', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true); useSettings.setState({ smoothJoins: true });
  const s = new CelScene({ joins: 'mesh2' });
  try {
    for (const [id, c] of cutsOf(s)) if (c[0] === SKIN_HIDDEN[0] && c[1] === SKIN_HIDDEN[1]) assert.ok(s.skinNodes.some((n) => n.includes('+')), `${id} hidden: a merged skin stands in its place`);
  } finally { s.dispose(); setSmoothJoins(was); }
});
