// Treat's orders: each does what the 2D app's does to the patient's settings and says what it says (the words are generated from 2D: treat.generated.ts).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESETS, defaultParams, DRUGS } from '../src/engine/hales/portal/scenario.js';
import { setParams } from '../src/engine/store.ts';
import { currentParams, historyNow, presetStarted, undo, redo, updateParams } from '../src/ui/action/params.ts';
import { SURGICAL, drugChips, fluids, giveFluid, placeShunt, pressChip, procedures, ranOn, removeShunt, TABS, type Env } from '../src/ui/treat/orders.ts';
import { TREAT_WORDS } from '../src/ui/treat/treat.generated.ts';

const preset = (id: string) => (PRESETS as { id: string; apply(p: unknown): unknown }[]).find((x) => x.id === id)!.apply(defaultParams());
interface Spy extends Env { said: string[]; picked: unknown[]; actions: { kind: string }[] }
const spy = (): Spy => { const s = { said: [] as string[], picked: [] as unknown[], actions: [] as { kind: string }[], say: (t: string) => { s.said.push(t); }, select: (x: unknown) => { s.picked.push(x); }, action: (a: { kind: string }) => { s.actions.push(a); } }; return s as Spy; };
const load = (id: string) => { const p = preset(id); setParams(p); presetStarted(id, p); };
beforeEach(() => load('healthy'));

test('the tabs, the drugs, the fluids and the procedures are the 2D card\'s, in its order', () => {
  assert.deepEqual(TABS, [['drugs', 'Drugs'], ['fluids', 'Fluids'], ['procs', 'Procedures']]);
  assert.deepEqual(drugChips().map((c) => c.label), ['Propranolol', 'Carvedilol', 'Terlipressin', 'Octreotide', 'Anticoagulation', 'Diuretics']);
  assert.deepEqual(fluids().map((f) => f.label), ['1 L crystalloid', '1 unit PRBC', 'Albumin']);
  const inventory = JSON.parse(readFileSync('parity/inventory.json', 'utf8')) as { treat: { procedures: string[]; drugs: { label: string }[] } };
  assert.deepEqual(drugChips().slice(0, 4).map((c) => c.label), inventory.treat.drugs.map((d) => d.label));
  // the inventory lists the 2D tiles' names: each is on our Procedures tab
  for (const name of inventory.treat.procedures) assert.ok(procedures().some((p) => p.label === name), name);
  for (const d of Object.keys(DRUGS)) assert.ok(TREAT_WORDS.drugs.some((x) => x.id === d && x.note.length > 0), d);
});

test('a drug or a standing order flips and lands in History under its name', () => {
  pressChip('propranolol');
  assert.equal(currentParams().drugs.propranolol, true);
  assert.deepEqual(historyNow().map((h) => h.label), ['Propranolol']);
  pressChip('propranolol');
  assert.equal(currentParams().drugs.propranolol, false);
  pressChip('anticoag'); pressChip('diuretics');
  assert.equal(currentParams().anticoag, true); assert.equal(currentParams().diuretics, true);
  assert.equal(ranOn('drugs', currentParams()), 2);
});

test('undo and redo walk the history', () => {
  pressChip('carvedilol'); pressChip('diuretics');
  assert.equal(undo(), 'Diuretics'); assert.equal(currentParams().diuretics, false);
  assert.equal(undo(), 'Carvedilol'); assert.equal(currentParams().drugs.carvedilol, false);
  assert.equal(undo(), false);
  assert.equal(redo(), 'Carvedilol'); assert.equal(currentParams().drugs.carvedilol, true);
});

test('a fluid is the engine\'s own action', () => {
  const e = spy();
  for (const f of fluids()) giveFluid(e, f.id);
  assert.deepEqual(e.actions, [{ kind: 'infuse', fluid: 'crystalloid' }, { kind: 'infuse', fluid: 'prbc' }, { kind: 'infuse', fluid: 'albumin' }]);
});

test('the procedures: TIPS and DIPS place at once, say so, and show their vessel; a second press says it is in place', () => {
  const e = spy(), by = (id: string) => procedures().find((p) => p.id === id)!;
  by('tips').run(e);
  assert.deepEqual(currentParams().tips, { on: true, d: 8 });
  assert.deepEqual(e.picked.at(-1), { type: 'edge', id: 'TIPS' });
  assert.equal(e.said.at(-1), TREAT_WORDS.lines.toasts.tipsDone);
  assert.ok(by('tips').placed!(currentParams()));
  by('tips').run(e);
  assert.equal(e.said.at(-1), TREAT_WORDS.lines.toasts.tipsHave);
  assert.equal(historyNow().length, 1);
  by('dips').run(e);
  assert.equal(currentParams().dips.on, true); assert.equal(e.said.at(-1), TREAT_WORDS.lines.toasts.dipsDone);
});

test('balloon tamponade: the gastric balloon goes up first; the esophageal one is the varices card\'s', () => {
  const e = spy(), b = procedures().find((p) => p.id === 'balloon')!;
  b.run(e);
  assert.equal(currentParams().balloonGas, true); assert.equal(currentParams().balloonEso, false);
  assert.equal(e.said.at(-1), TREAT_WORDS.lines.toasts.balloonDone); assert.deepEqual(e.picked.at(-1), { type: 'organ', id: 'varices' });
  b.run(e);
  assert.equal(e.said.at(-1), TREAT_WORDS.lines.toasts.balloonUp);
});

test('BRTO needs a gastrorenal shunt; with one it occludes it and shows the gastric card', () => {
  const e = spy(), brto = procedures().find((p) => p.id === 'brto')!;
  brto.run(e);   // healthy: no gastrorenal shunt
  assert.equal(e.said.at(-1), TREAT_WORDS.lines.toasts.brtoNone); assert.equal(currentParams().occluded.C5, undefined);
  updateParams((p) => { p.spontaneous.C5 = true; }, { history: false });
  brto.run(e);
  assert.equal(currentParams().occluded.C5, true); assert.equal(e.said.at(-1), TREAT_WORDS.lines.toasts.brtoDone);
  brto.run(e); assert.equal(e.said.at(-1), TREAT_WORDS.lines.toasts.brtoHave);
});

test('the spleen\'s two treatments are two orders: one takes the other down, a second press undoes it', () => {
  const e = spy(), a = procedures().find((p) => p.id === 'spleen1')!, b = procedures().find((p) => p.id === 'spleen2')!;
  a.run(e); assert.equal(currentParams().splenicRx, 1);
  b.run(e); assert.equal(currentParams().splenicRx, 2); assert.ok(b.placed!(currentParams())); assert.ok(!a.placed!(currentParams()));
  b.run(e); assert.equal(currentParams().splenicRx, 0);
  assert.deepEqual(historyNow().map((h) => h.label), ['Partial splenic embolization', 'Splenectomy', 'Spleen untreated']);
});

test('band ligation selects the varices and sends the engine its band action; paracentesis shows the abdomen', () => {
  const e = spy();
  procedures().find((p) => p.id === 'band')!.run(e);
  assert.deepEqual(e.picked.at(-1), { type: 'organ', id: 'varices' }); assert.deepEqual(e.actions, [{ kind: 'band' }]);
  procedures().find((p) => p.id === 'paracentesis')!.run(e);
  assert.deepEqual(e.picked.at(-1), { type: 'organ', id: 'abdomen' });
});

interface ShuntRow { preset: string; blocked: Record<string, string>; on: Record<string, boolean>; applied: Record<string, Record<string, unknown>> }
const rows = (JSON.parse(readFileSync('tests/fixtures/changes-2d.json', 'utf8')) as { shunts: ShuntRow[] }).shunts;
test('the surgical shunts check, apply and report as the 2D app does, for every preset', () => {
  assert.equal(SURGICAL.length, 5);
  for (const r of rows) {
    const p = preset(r.preset) as Record<string, unknown>;
    for (const s of SURGICAL) {
      assert.equal(s.blocked(structuredClone(p)), r.blocked[s.id], `${r.preset} ${s.id} blocked`);
      assert.equal(s.on(p), r.on[s.id], `${r.preset} ${s.id} on`);
      const q = s.apply(structuredClone(p));
      for (const [k, v] of Object.entries(r.applied[s.id])) assert.equal(q[k], v, `${r.preset} ${s.id} applied ${k}`);
    }
  }
});

test('placing a shunt: made once, shows its vessel, and a Meso-Rex bypass says why it cannot be made on a patent trunk', () => {
  const e = spy();
  assert.equal(placeShunt(e, 'mesocaval'), true);
  assert.equal(currentParams().mesocaval, true); assert.deepEqual(e.picked.at(-1), { type: 'edge', id: 'S_MC' });
  assert.equal(placeShunt(e, 'mesocaval'), false); assert.equal(e.said.at(-1), 'The mesocaval shunt is already in place.');
  assert.equal(placeShunt(e, 'rex'), false); assert.equal(e.said.at(-1), TREAT_WORDS.lines.rex.patent); assert.equal(currentParams().rex, false);
  load('pvt-acute');   // a clotted trunk with an open left portal vein: the case for a bypass
  assert.equal(placeShunt(e, 'rex'), true); assert.equal(currentParams().rex, true); assert.equal(e.said.at(-1), 'Meso-Rex bypass placed: superior mesenteric vein → left portal vein.');
});

test('taking a shunt down: the portocaval one takes either kind; with none there is nothing to take down', () => {
  const e = spy();
  assert.equal(removeShunt(e, 'pc-es'), false); assert.equal(e.said.at(-1), 'There is no portocaval shunt to take down.');
  placeShunt(e, 'pc-ss');
  assert.equal(currentParams().portocavalSide, true);
  assert.equal(removeShunt(e, 'pc-es'), true);
  assert.equal(currentParams().portocaval, false); assert.equal(currentParams().portocavalSide, false);
  assert.deepEqual(e.picked.at(-1), null);
  assert.equal(removeShunt(e, 'warren'), false); assert.equal(e.said.at(-1), 'There is no distal splenorenal shunt (DSRS) to take down.');
});
