// The treatment menu chart (2D tool-menu.js): what is offered follows the patient, each dot is a treatment run on the slide's state, and the frame is sound in every look at phone and Mac widths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU, MENU_IDS, baseName, dotRadius, menuKey, menuOptions, menuPoints, menuSteps, ratingTok } from '../src/ui/charts/menu/model.ts';
import { menuFrame } from '../src/ui/charts/menu/frame.ts';
import { SPECIMEN_DOTS } from '../src/ui/charts/menu/entry.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';

test('the menu offers what suits the patient: a treatment in place is the ring, a clotted trunk gets no TIPS and a recanalization', () => {
  assert.deepEqual(MENU_IDS, ['propranolol', 'carvedilol', 'pse', 'recanalization', 'tips8', 'tips10', 'warren', 'mesocaval', 'portocaval', 'rex']);
  const plain = menuOptions({}).map((m) => m.id);
  assert.ok(plain.includes('tips8') && plain.includes('carvedilol') && !plain.includes('recanalization'));
  const onDrug = menuOptions({ drugs: { carvedilol: true } }).map((m) => m.id);
  assert.ok(!onDrug.includes('carvedilol') && onDrug.includes('propranolol'));
  assert.equal(baseName({}), 'No treatment');
  assert.equal(baseName({ drugs: { carvedilol: true } }), 'As now');
  const clot = menuOptions({ thrombus: { PV_TRUNK: 0.9 } }).map((m) => m.id);
  assert.ok(clot.includes('recanalization') && !clot.includes('tips8') && !clot.includes('tips10'));
  assert.ok(!menuOptions({ tips: { on: true, d: 8 } }).map((m) => m.id).includes('tips10'), 'one stent at a time');
  assert.deepEqual(menuOptions({}, ['tips8', 'nonsense', 'rex']).map((m) => m.id), ['tips8', 'rex'].filter((id) => menuOptions({}).some((m) => m.id === id)));
});

test('each offered treatment is its own step from the slide\'s state, and the dots come from the states the worker returns', () => {
  const opts = menuOptions({}, ['carvedilol', 'tips8']);
  const steps = menuSteps(opts);
  assert.equal(steps.length, opts.length);
  assert.ok(steps.every((s) => s.restart === true && Object.keys(s.params).length > 0));
  const outs = [{ fp: { ppg: 14, liver: 95, shunt: 0.02 } }, { fp: { ppg: 7.5, liver: 55, shunt: 0.4 } }];
  const pts = menuPoints(opts, outs)!;
  assert.deepEqual(pts.map((p) => [p.id, p.ppg, p.liver]), [['carvedilol', 14, 95], ['tips8', 7.5, 55]]);
  assert.equal(menuPoints(opts, outs.slice(1)), null, 'a run that is not whole draws nothing');
  assert.equal(menuPoints(opts, [outs[0]!, { fp: { ppg: NaN, liver: 50, shunt: 0 } }])!.length, 1, 'a treatment the model gave no reading for is left out');
  assert.equal(menuKey({ rows: ['a'] }, 'x/y'), menuKey({ rows: ['a'] }, 'x/y'));
  assert.notEqual(menuKey({ rows: ['a'] }, 'x/y'), menuKey({}, 'x/y'));
});

test('a dot is rated by the PPG\'s own cut-offs and sized by the blood that bypasses the liver', () => {
  assert.equal(ratingTok(4), 'ok'); assert.equal(ratingTok(8), 'caution'); assert.equal(ratingTok(14), 'danger');
  assert.ok(dotRadius(0, 13) < dotRadius(0.5, 13) && dotRadius(0.5, 13) < dotRadius(1, 13));
  assert.equal(dotRadius(NaN, 13), dotRadius(0, 13));
  assert.ok(MENU.every((m) => m.name && typeof m.can === 'function'));
});

test('the menu frame is sound in every look at phone, tablet and Mac widths, with and without its dots, and a crowd of names takes numbers and a key', () => {
  const base = { ppg: 17.4, liver: 100, shunt: 0.02 };
  eachLook((look) => {
    for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [330, 'phone-landscape'], [430, 'tablet-portrait']] as const) {
      const c = ctxOf(look, w, d);
      for (const dots of [SPECIMEN_DOTS, [], SPECIMEN_DOTS.slice(0, 2)]) {
        const o = menuFrame({ dots, base, baseLabel: 'No treatment' }, c);
        judge(o.frame, look, { onCard: false });
        assert.match(o.frame.label, /^Treatment menu/);
        assert.equal(o.frame.shapes.filter((s) => s.k === 'circle').length, dots.length + 1, 'a circle for each dot and the ring');
      }
    }
  });
  const crowded = menuFrame({ dots: SPECIMEN_DOTS, base, baseLabel: 'No treatment' }, ctxOf('light', 300, 'phone-portrait'));
  const words = crowded.frame.shapes.filter((s) => s.k === 'text').map((s) => (s as { s: string }).s);
  assert.ok(words.includes('PPG') && words.some((s) => /Liver blood flow/.test(s)));
  if (crowded.G.stepKey) assert.ok(words.some((s) => /Propranolol/.test(s)), 'the key names the numbered dots');
});
