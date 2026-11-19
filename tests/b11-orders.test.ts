// Every order and card button against the 2D app: which Tests pane it opens, what it selects, what it starts (2D chart.js treatBody, actions.js, palette.js, main.js select
// and doAction). A new order has to be put in the table here, so one that should open an instrument cannot land without it.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PRESETS, defaultParams } from '../src/engine/hales/portal/scenario.js';
import { setParams } from '../src/engine/store.ts';
import { presetStarted } from '../src/ui/action/params.ts';
import { selectStructure, useSelection, type Sel } from '../src/ui/action/selection.ts';
import { cardFor, type Act, type Verb } from '../src/ui/action/cards.ts';
import { actionAnswer, actionLabel, BANDS_MAX } from '../src/ui/action/send.ts';
import { drugChips, fluids, giveFluid, pressChip, procedures, type Env } from '../src/ui/treat/orders.ts';
import { commandWork } from '../src/ui/treat/palette-orders.ts';
import { useTests } from '../src/ui/tests/store.ts';
import type { PaneId } from '../src/ui/tests/panes.ts';
import { probeSelected, vesselSelected } from '../src/ui/tests/from-orders.ts';
import { goToSel, isWiredCommand, TESTS_PANE } from '../src/ui/search/wired.ts';
import { UI } from '../src/ui/strings.generated.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const preset = (id: string) => (PRESETS as { id: string; apply(p: unknown): unknown }[]).find((x) => x.id === id)!.apply(defaultParams());
const load = (id: string) => { const p = preset(id); setParams(p); presetStarted(id, p); };
interface Spy extends Env { said: string[]; actions: { kind: string; [k: string]: unknown }[] }
/** Treat's Env as the app's (env.ts), with the real selection, and the toast and the engine's actions kept. */
const spy = (): Spy => { const s: Spy = { said: [], actions: [], say: (t) => { s.said.push(t); }, select: (x) => selectStructure(x), action: (a) => { s.actions.push(a); } }; return s; };
const shut = () => { useTests.setState({ open: false, pane: 'profile' }); useSelection.setState({ sel: null }); };
const tests = (): PaneId | null => (useTests.getState().open ? useTests.getState().pane : null);
beforeEach(() => { load('cirr-decomp'); shut(); });

// What each order of the Procedures tab does in 2D: the Tests pane it opens (null: none), what is left selected, the engine action it sends.
const PROCS: Record<string, { pane: PaneId | null; sel: Sel | null; action?: string }> = {
  band: { pane: null, sel: { type: 'organ', id: 'varices' }, action: 'band' },
  balloon: { pane: null, sel: { type: 'organ', id: 'varices' } },
  tips: { pane: null, sel: { type: 'edge', id: 'TIPS' } },
  dips: { pane: null, sel: { type: 'edge', id: 'DIPS' } },
  warren: { pane: null, sel: { type: 'edge', id: 'S_DSR' } },
  'pc-es': { pane: null, sel: { type: 'edge', id: 'S_PC' } },
  'pc-ss': { pane: null, sel: { type: 'edge', id: 'S_PC' } },
  mesocaval: { pane: null, sel: { type: 'edge', id: 'S_MC' } },
  rex: { pane: null, sel: null },   // (not made for a patient whose portal trunk is open: it says why)
  brto: { pane: null, sel: { type: 'organ', id: 'gastric' } },
  spleen1: { pane: null, sel: { type: 'organ', id: 'spleen' } },
  spleen2: { pane: null, sel: { type: 'organ', id: 'spleen' } },
  // Ascites has one home, the Tests card's Ascites pane: the order opens it and nothing stays selected (2D main.js select)
  paracentesis: { pane: 'abdomen', sel: null },
};

test('every Procedures order opens the Tests pane 2D opens (Paracentesis: Ascites), selects what 2D selects and sends what 2D sends', () => {
  assert.deepEqual(procedures().map((p) => p.id).sort(), Object.keys(PROCS).sort(), 'every order is in the table');
  for (const p of procedures()) {
    load('cirr-decomp'); shut();
    const env = spy(), want = PROCS[p.id]!;
    p.run(env);
    assert.equal(tests(), want.pane, `${p.id}: Tests pane`);
    const sel = useSelection.getState().sel;
    assert.deepEqual(sel, want.sel, `${p.id}: selection`);
    assert.deepEqual(env.actions.map((a) => a.kind), want.action ? [want.action] : [], `${p.id}: engine action`);
  }
});

test('Paracentesis opens Ascites from any pane and with the card already up; a second press keeps it there', () => {
  const para = procedures().find((p) => p.id === 'paracentesis')!;
  useTests.getState().show('doppler');
  para.run(spy());
  assert.equal(tests(), 'abdomen');
  para.run(spy());
  assert.equal(tests(), 'abdomen');
  assert.equal(useSelection.getState().sel, null);
});

test('a drug, a standing order and a fluid open no pane (2D: they change the patient where the card stands)', () => {
  for (const c of drugChips()) { shut(); pressChip(c.id); assert.equal(tests(), null, c.id); }
  for (const f of fluids()) { shut(); const env = spy(); giveFluid(env, f.id); assert.equal(tests(), null, f.id); assert.deepEqual(env.actions, [{ kind: 'infuse', fluid: f.id }]); }
});

test('the abdomen, however it is selected, opens Ascites and leaves nothing selected', () => {
  for (const sel of [{ type: 'organ', id: 'abdomen' }, { type: 'node', id: 'EPI' }] as Sel[]) {
    shut(); selectStructure({ type: 'edge', id: 'PV_TRUNK' });
    selectStructure(sel);
    assert.equal(tests(), 'abdomen', JSON.stringify(sel));
    assert.equal(useSelection.getState().sel, null);
  }
  shut(); selectStructure({ type: 'organ', id: 'spleen' });
  assert.equal(tests(), null, 'another organ opens its card, not the Tests card');
  assert.deepEqual(useSelection.getState().sel, { type: 'organ', id: 'spleen' });
});

// ── the cards' buttons ──
const fx: J = JSON.parse(readFileSync('tests/fixtures/actions-2d.json', 'utf8'));
/** verb id → the feature it runs (the Tests card registers each: TestsLayer.tsx) and whether the card is put away after (2D `CTX.select(null)`). */
const CARD_BUTTONS: Record<string, { feature: string; pane: PaneId; away: boolean }> = {
  doppler: { feature: 'doppler', pane: 'doppler', away: true },
  endoscope: { feature: 'endoscopy', pane: 'endoscopy', away: false },
  fibroscan: { feature: 'fibroscan', pane: 'fibroscan', away: true },
  ir: { feature: 'ir', pane: 'hvpg', away: false },
};
test('every card button that opens an instrument runs its feature, and the Tests card answers each with its pane', () => {
  const layer = readFileSync('src/ui/tests/TestsLayer.tsx', 'utf8');
  const seen = new Set<string>();
  for (const c of fx.cards) {
    const card = cardFor(c.sel);
    if (!card) continue;
    for (const v of card.verbs as Verb[]) {
      if (v.type !== 'button' || !v.id || !CARD_BUTTONS[v.id]) continue;
      const want = CARD_BUTTONS[v.id]!, log: string[] = [];
      const act: Act = { update() {}, select: (s) => { log.push(`select:${s ? JSON.stringify(s) : 'null'}`); }, feature: (id) => { log.push(`feature:${id}`); }, action() {} };
      v.run(act);
      assert.deepEqual(log, want.away ? [`feature:${want.feature}`, 'select:null'] : [`feature:${want.feature}`], `${JSON.stringify(c.sel)} ${v.id}`);
      seen.add(v.id);
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(CARD_BUTTONS).sort(), 'each kind of button is on some card');
  // the Tests card's handlers: the feature opens its pane, and the Doppler's puts the probe on the card's vessel first
  assert.match(layer, /registerFeature\('doppler', \(\) => \{ probeSelected\(\); show\('doppler'\)\(\); \}\)/);
  for (const b of Object.values(CARD_BUTTONS)) if (b.feature !== 'doppler') assert.ok(layer.includes(`registerFeature('${b.feature}', show('${b.pane}'))`), b.feature);
  // "Test TIPS in IR": the IR pane reads the stent from the card, which stays selected
  assert.match(readFileSync('src/ui/tests/ir/IrPane.tsx', 'utf8'), /if \(sel\?\.type === 'edge'\) openStent\(sel\.id\)/);
});

test('a vessel card\'s Doppler button puts the probe on that vessel (2D CTX.probe(id)); a station stands for its vessel; no vessel, no move', () => {
  const got: string[] = [];
  useSelection.setState({ sel: { type: 'edge', id: 'SV_CONF' } });
  probeSelected((id) => got.push(id));
  assert.deepEqual(got, ['SV_CONF']);
  useSelection.setState({ sel: { type: 'organ', id: 'liver' } });
  probeSelected((id) => got.push(id));
  useSelection.setState({ sel: null });
  probeSelected((id) => got.push(id));
  assert.deepEqual(got, ['SV_CONF']);
  assert.equal(vesselSelected(), null);
  // every vessel card that has the button names a vessel the probe can take
  for (const c of fx.cards) {
    const card = cardFor(c.sel);
    if (!card || !(card.verbs as Verb[]).some((v) => v.id === 'doppler')) continue;
    useSelection.setState({ sel: c.sel });
    assert.equal(typeof vesselSelected(), 'string', JSON.stringify(c.sel));
  }
});

// ── the search's orders ──
test('the search: Paracentesis drains at once (2D palette.js), Go to > Ascites opens the pane, every Go to and Tests command is wired', () => {
  const env = spy();
  commandWork(env, 'Treat', 'Paracentesis')!(4);
  assert.deepEqual(env.actions, [{ kind: 'paracentesis', mL: 4000, albumin: true }]);
  assert.equal(tests(), null);
  assert.deepEqual(goToSel('Ascites'), { type: 'organ', id: 'abdomen' });
  selectStructure(goToSel('Ascites'));
  assert.equal(tests(), 'abdomen');
  const go = UI.search.commands.filter((c) => c.group === 'Go to');
  assert.ok(go.length > 40);
  for (const c of go) { assert.ok(goToSel(c.title), c.title); assert.equal(isWiredCommand('Go to', c.title), true); }
  assert.deepEqual(goToSel('Portal vein'), { type: 'edge', id: 'PV_TRUNK' });
  assert.deepEqual(TESTS_PANE, { 'Doppler of the portal vein': 'doppler', Endoscopy: 'endoscopy' });
  assert.match(readFileSync('src/ui/search/commands.ts', 'utf8'), /'Doppler of the portal vein'\) setDopplerProbe\('PV_TRUNK'\)/);
});

// ── what an action answers with (2D doAction) ──
const withVarices = { metrics: { varix: { present: true } }, bands: 0 }, none = { metrics: { varix: { present: false } }, bands: 0 };
test('a band: none without varices, four at most, and each says its count; a fluid, a Valsalva and a paracentesis say what was done', () => {
  assert.deepEqual(actionAnswer({ kind: 'band' }, none), { send: false, say: 'No varices to band.' });
  assert.deepEqual(actionAnswer({ kind: 'band' }, withVarices), { send: true, say: 'Band (EVL) placed: 1 of 4.' });
  assert.deepEqual(actionAnswer({ kind: 'band' }, { ...withVarices, bands: 2.2 }), { send: true, say: 'Band (EVL) placed: 3 of 4.' });
  assert.deepEqual(actionAnswer({ kind: 'band' }, { ...withVarices, bands: BANDS_MAX }), { send: false, say: '4 bands are already on the varices.' });
  assert.deepEqual(actionAnswer({ kind: 'band' }, withVarices, true), { send: true, say: null }, 'a talk\'s own band says nothing');
  assert.deepEqual(actionAnswer({ kind: 'band' }, null), { send: true, say: 'Band (EVL) placed: 1 of 4.' }, 'before a frame, the model decides');
  assert.equal(actionAnswer({ kind: 'infuse', fluid: 'crystalloid' }, null).say, '1 L crystalloid running (≈25% stays intravascular).');
  assert.equal(actionAnswer({ kind: 'infuse', fluid: 'prbc' }, null).say, '1 unit of packed red cells running.');
  assert.equal(actionAnswer({ kind: 'infuse', fluid: 'albumin' }, null).say, 'Albumin given: plasma oncotic pressure rises.');
  assert.equal(actionAnswer({ kind: 'valsalva' }, null).say, 'Valsalva: intrathoracic and intra-abdominal pressures rise for 10 s.');
  assert.deepEqual(actionAnswer({ kind: 'paracentesis', mL: 5000, albumin: true }, null), { send: true, say: 'Paracentesis: up to 5.0 L drained with albumin.' });
  assert.equal(actionAnswer({ kind: 'paracentesis', mL: 2500, albumin: false }, null).say, 'Paracentesis: up to 2.5 L drained without albumin.');
  assert.deepEqual(actionAnswer({ kind: 'rupture' }, null), { send: true, say: null });
  assert.equal(actionLabel({ kind: 'band' }), 'Band (EVL)');
  assert.equal(actionLabel({ kind: 'paracentesis', mL: 5000, albumin: true }), 'Paracentesis 5.0 L + albumin');
});

const MAIN_2D = `${process.env.PPS_2D_REPO ?? '/home/claude/portal-pressure-simulator'}/src/ui/main.js`;
test('the answers are the 2D app\'s own words, and its rule for the abdomen is the one kept here (checked when the 2D checkout is at hand)', { skip: !existsSync(MAIN_2D) && 'no 2D checkout here' }, () => {
  const src = readFileSync(MAIN_2D, 'utf8');
  for (const s of ['No varices to band.', ' bands are already on the varices.', 'Band (EVL) placed: ', '1 L crystalloid running (≈25% stays intravascular).', '1 unit of packed red cells running.',
    'Albumin given: plasma oncotic pressure rises.', 'Valsalva: intrathoracic and intra-abdominal pressures rise for 10 s.', 'Paracentesis: up to ', ' with albumin', ' without albumin'])
    assert.ok(src.includes(s), s);
  assert.match(src, /n\.id === 'abdomen'\) \{ store\.set\(\{ selection: null \}\); dock\.show\('abdomen', \{ reveal: true \}\)/);
  assert.match(src, /const BANDS_MAX = 4;/);
  const chart = readFileSync(MAIN_2D.replace('main.js', 'chart.js'), 'utf8');
  assert.match(chart, /proc\('needle', 'paracentesis', 'drain ascites', \(\) => select\(\{ type: 'organ', id: 'abdomen' \}\)\)/);
});
