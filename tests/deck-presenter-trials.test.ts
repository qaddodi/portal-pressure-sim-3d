// The Trials pane's open trial: the Model line (2D trials-pane.js paintModel) and the Baveno VIII lines, as pure decisions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIALS, BAVENO_VIII } from '../src/ui/charts/trial/trials.generated.ts';
import { modelRx, rxOn, hasEvlArm, today531, modelLineOf, bavenoLines } from '../src/ui/trials/trials-model.ts';
import { ratiosOf } from '../src/ui/charts/forest/model.ts';

const t = (id: string) => TRIALS[id]!;
const result = { base: { hvpg: 14, ppg: 16, map: 85, hr: 80 }, rx: { hvpg: 11, ppg: 12, map: 83, hr: 66 } };
const ctx = (o: object = {}) => ({ facts: { hvpg: 14 }, params: {}, hidden: null, result, ...o });

test('every trial\'s treated arm is read for what the model can run: a beta-blocker, TIPS, terlipressin, albumin, or nothing', () => {
  const names = new Map(Object.keys(TRIALS).map((id) => [id, modelRx(t(id))?.name ?? null]));
  assert.ok([...names.values()].some((n) => n === 'carvedilol'), 'a beta-blocker trial runs as carvedilol');
  assert.ok([...names.values()].some((n) => n === 'TIPS'), 'a TIPS trial runs as TIPS');
  assert.ok([...names.values()].some((n) => n === null), 'a trial of something the model does not run says so');
  assert.deepEqual(modelRx({ arms: [{ label: 'Propranolol', side: 'treat', rate: 1 }] } as never)?.patch, { drugs: { propranolol: true } });
  assert.equal(modelRx({ name: 'Early TIPS', arms: [{ label: 'TIPS', side: 'treat', rate: 1 }] } as never)?.patch?.tips?.on, true);
  assert.equal(modelRx({ name: 'Before TIPS', arms: [{ label: 'TIPS', side: 'treat', rate: 1 }] } as never), null, 'a trial of what comes before TIPS is not a TIPS trial');
  assert.equal(modelRx({ arms: [{ label: 'Albumin', side: 'treat', rate: 1 }] } as never)?.kind, 'albumin');
  assert.equal(modelRx(null), null);
  assert.equal(rxOn({ name: 'carvedilol', patch: { drugs: { carvedilol: true } } }, { drugs: { carvedilol: true } }), true);
  assert.equal(rxOn({ name: 'TIPS', patch: { tips: { on: true, d: 8 } } }, { tips: { on: false } }), false);
});

test('the Model line says what each case of the 2D card says: none, albumin, hidden, already on, waiting, the engine\'s numbers', () => {
  const bb = Object.values(TRIALS).find((x) => modelRx(x)?.name === 'carvedilol')!;
  const tipsT = Object.values(TRIALS).find((x) => modelRx(x)?.name === 'TIPS')!;
  const none = Object.values(TRIALS).find((x) => modelRx(x) === null)!;
  assert.equal(modelLineOf(none, ctx()).state, 'none'); assert.equal(modelLineOf(none, ctx()).text, 'The model does not run this treatment.');
  assert.equal(modelLineOf(none, ctx()).head, 'Model');
  const alb = { arms: [{ label: 'Albumin', side: 'treat', rate: 1 }] } as never;
  assert.equal(modelLineOf(alb, ctx({ albumin: 3.2 })).text, 'Serum albumin 3.2 g/dL'); assert.equal(modelLineOf(alb, ctx({ albumin: null })).text, 'Serum albumin not in the model');
  assert.equal(modelLineOf(bb, ctx({ hidden: new Set(['trueHVPG']) })).state, 'hidden');
  assert.equal(modelLineOf(tipsT, ctx({ hidden: new Set(['pv']) })).state, 'hidden', 'a TIPS reads the portal pressure, which a case may keep hidden');
  assert.equal(modelLineOf(bb, ctx({ hidden: new Set(['pv']) })).state, 'ok', 'the portal pressure is hidden but a beta-blocker reads the HVPG');
  assert.equal(modelLineOf(bb, ctx({ params: { drugs: { carvedilol: true } } })).text, 'Already on. HVPG 14.0 mmHg.');
  assert.equal(modelLineOf(bb, ctx({ result: undefined })).state, 'wait');
  assert.equal(modelLineOf(bb, ctx({ result: null })).text, 'HVPG now 14.0 mmHg.');
  assert.equal(modelLineOf(bb, ctx({ result: null, facts: { hvpg: null } })).text, 'HVPG now not measured.');
  assert.match(modelLineOf(bb, ctx()).head, /^Model · carvedilol on this patient$/);
});

test('a beta-blocker\'s line reads HVPG and the heart rate, a TIPS\'s the PPG and the HVPG, from the card\'s own numbers plus the engine\'s change, with the fall in percent', () => {
  const bb = Object.values(TRIALS).find((x) => modelRx(x)?.name === 'carvedilol')!, tipsT = Object.values(TRIALS).find((x) => modelRx(x)?.name === 'TIPS')!;
  const a = modelLineOf(bb, ctx({ live: { hr: 90 } }));
  assert.equal(a.state, 'ok'); assert.equal(a.nums!.lead, 'HVPG ');
  assert.equal(a.nums!.from, 14, 'it starts on the number the card shows'); assert.equal(a.nums!.to, 11);
  assert.equal(a.nums!.more, ' · heart rate 90 → 76/min', 'the live rate, moved by the engine\'s change');
  assert.match(a.sub, /^−21% in the model\./);
  assert.equal(a.nums!.sevFrom, 'danger'); assert.equal(a.nums!.sevTo, 'danger');
  const b = modelLineOf(tipsT, ctx({ live: { ppg: 18 } }));
  assert.equal(b.nums!.lead, 'PPG '); assert.equal(b.nums!.from, 18); assert.equal(b.nums!.to, 14); assert.equal(b.nums!.more, ' · HVPG 14.0 → 11.0');
  const terli = { arms: [{ label: 'Terlipressin', side: 'treat', rate: 1 }] } as never;
  assert.match(modelLineOf(terli, ctx({ live: { map: 90 } })).nums!.more, /^ · MAP 90 → 88 mmHg$/);
  const evl = { name: 'Combined', arms: [{ label: 'Carvedilol plus band ligation', side: 'treat', rate: 1 }, { label: 'Band ligation', side: 'control', rate: 2 }] } as never;
  assert.equal(hasEvlArm(evl), true); assert.match(modelLineOf(evl, ctx()).sub, /Band ligation treats the varix, not the pressure/);
});

test('Baveno VIII: each open trial prints its recommendations by number, and 5.31 is checked against this patient (never VII)', () => {
  const withBav = Object.values(TRIALS).filter((x) => x.bav.length);
  assert.ok(withBav.length >= 5);
  for (const x of withBav) for (const l of bavenoLines(x, { hvpg: 12 }, false)) assert.ok(l.text.length > 10 && BAVENO_VIII[l.k], `${x.id} ${l.k} has its words`);
  assert.equal(today531(null, true), 'This patient: HVPG not measured.');
  assert.equal(today531(12, false), 'The HVPG rule applies at a bleed. This patient: HVPG 12.0 mmHg.');
  assert.equal(today531(22, true), 'This patient is bleeding with HVPG 22.0 mmHg: meets the HVPG rule.');
  assert.equal(today531(15, true), 'This patient is bleeding with HVPG 15.0 mmHg: under the HVPG rule.');
  const five31 = withBav.find((x) => x.bav.includes('5.31'));
  if (five31) assert.ok(bavenoLines(five31, { hvpg: 22 }, true).find((l) => l.k === '5.31')!.today!.includes('meets'));
  assert.ok(Object.values(BAVENO_VIII).every((s) => !/Baveno VII\b(?!I)/.test(s)));
});

test('a trial\'s other results are listed after its primary one', () => {
  const many = Object.values(TRIALS).find((x) => ratiosOf(x).length > 1);
  if (many) assert.equal(ratiosOf(many).slice(1).length, ratiosOf(many).length - 1);
});
