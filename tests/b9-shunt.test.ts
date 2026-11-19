// Add shunt (2D stage-hover.js startShunt / shuntDropOn): what each drop on a target makes, the change it makes to the params (2D's labels), the hint card's lines, and the wiring
// (the Add shunt button runs the 'shunt' feature, a tap on a target makes the shunt, the scene lights the targets).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultParams } from '../src/engine/hales/portal/scenario.js';
import { figurePlaces, shuntChange, shuntTargets } from '../src/ui/action/shunt-model.ts';
import { NAMED_RULES } from '../src/ui/action/shunt-rules.copied.ts';
import { SHUNT_WORDS, SHUNT_CREATED } from '../src/ui/action/shunt-words.copied.ts';
import { computeHighlight } from '../src/scene/highlight.ts';

const places = figurePlaces();
const keyOf = (src: string, tgt: string) => shuntTargets(src, places).get(tgt)?.key;

test('the right portal vein at the TIPS origin to the right hepatic vein makes a TIPS; a portal branch to the lower IVC, a DIPS', () => {
  assert.equal(keyOf('PVH_R_2', 'RHV_IVC_1'), 'tips');
  assert.equal(keyOf('PVH_R', 'IVC_IS_1'), 'dips');
});

test('the splenic vein to the left renal vein makes the distal splenorenal shunt, to the IVC below the hepatic veins a portocaval one', () => {
  assert.equal(keyOf('SV_CONF', 'V_KID_L_1'), 'dsrs');
  assert.equal(keyOf('SV_CONF', 'IVC_IS_1'), 'portocaval');
});

test('any other portal vein to any systemic vein is a custom shunt between the two stations, with the 2D label', () => {
  const r = shuntTargets('PVH_R', places).get('RHV_IVC_1')!;
  assert.equal(r.key, 'custom');
  assert.match(r.id!, /^X_PVH_RHV$/);
  assert.ok(r.label.length > 0);
});

test('a shunt reaches no artery, no shunt, no liver bed and not itself; nothing from a vessel that is not drawn', () => {
  const t = shuntTargets('SV_CONF', places);
  assert.ok(!t.has('SV_CONF'));
  for (const id of t.keys()) assert.ok(!/^(TIPS|DIPS|S_PC|S_DSR|S_MC|REX|A_)/.test(id), id);
  assert.equal(shuntTargets('NOT_A_VESSEL', places).size, 0);
});

test('`only` limits the rule (the TIPS placed from its own order)', () => {
  const t = shuntTargets('PVH_R_2', places, 'tips');
  assert.ok(t.size > 0);
  for (const r of t.values()) assert.equal(r.key, 'tips');
});

test('a drop changes the params as 2D does, with its labels, and selects the new vessel', () => {
  const p = defaultParams(); p.tips = { ...p.tips, d: 9 };
  const tips = shuntChange(shuntTargets('PVH_R_2', places).get('RHV_IVC_1')!, p);
  const q = tips.edit(structuredClone(p));
  assert.equal(tips.label, 'TIPS'); assert.equal(tips.select, 'TIPS');
  assert.equal(q.tips.on, true); assert.equal(q.tips.d, 9);
  const pc = shuntChange(shuntTargets('SV_CONF', places).get('IVC_IS_1')!, p);
  const q2 = pc.edit(structuredClone(p));
  assert.equal(q2.portocaval, true); assert.equal(q2.portocavalSide, false); assert.equal(pc.select, 'S_PC'); assert.equal(pc.label, 'Portocaval shunt');
  const ds = shuntChange(shuntTargets('SV_CONF', places).get('V_KID_L_1')!, p);
  assert.equal(ds.edit(structuredClone(p)).dsrs, true); assert.equal(ds.select, 'S_DSR');
  const custom = shuntChange(shuntTargets('PVH_R', places).get('RHV_IVC_1')!, p);
  assert.equal(custom.edit(structuredClone(p)).customShunts.X_PVH_RHV, 10); assert.equal(custom.select, 'X_PVH_RHV');
});

test('the named rules and the words are the 2D app\'s', () => {
  assert.equal(NAMED_RULES['RPV>RHV'].key, 'tips');
  assert.equal(NAMED_RULES['SV>LRV'].label, 'Distal splenorenal shunt');
  assert.equal(SHUNT_WORDS.canceled, 'Shunt canceled.');
  assert.equal(SHUNT_WORDS.none, 'No vessel on the other side of the circulation to connect this one to.');
  assert.equal(SHUNT_CREATED('TIPS'), 'TIPS created.');
});

test('the scene can light a set of vessels apart from a pick (the targets glow, nothing runs downstream)', () => {
  const src = readFileSync(new URL('../src/scene/highlight.ts', import.meta.url), 'utf8');
  assert.match(src, /setOnly\(ids: readonly string\[\]\)/);
  assert.match(readFileSync(new URL('../src/scene/api.ts', import.meta.url), 'utf8'), /markVessels\(ids: readonly string\[\]\)/);
  // (a pick, for comparison, runs on downstream)
  const spec = computeHighlight('SV_CONF', [{ id: 'SV_CONF', from: 'SV', to: 'CONF', length: 1 }, { id: 'PV_TRUNK', from: 'CONF', to: 'PVH', length: 1 }]);
  assert.equal(spec.get('PV_TRUNK')?.dir, 1);
});

test('Add shunt is wired: the card button runs the shunt feature, started at boot; a tap on a target is the shunt\'s while it waits; Esc and a tap on nothing call it off', () => {
  const boot = readFileSync(new URL('../src/ui/action/boot.ts', import.meta.url), 'utf8');
  assert.match(boot, /startShunting\(\)/);
  const sh = readFileSync(new URL('../src/ui/action/shunt.ts', import.meta.url), 'utf8');
  assert.match(sh, /registerFeature\('shunt'/);
  assert.match(sh, /holdScenePicks/);
  assert.match(sh, /e\.key === 'Escape'/);
  assert.match(sh, /else if \(!id\) cancelShunt\(\)/);
  const sel = readFileSync(new URL('../src/ui/action/selection.ts', import.meta.url), 'utf8');
  assert.match(sel, /if \(pickHold\) \{ pickHold\(id\); return; \}/);
});
