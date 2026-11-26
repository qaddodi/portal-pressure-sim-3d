// Playing a model patient's case, step 2: the guard (docs/approved/play-the-case.md; Mohammad's pick 3, 26 Nov: a change at a stop leaves the case, keeping the way back).
// Every course-changing step asks first while the case is at a stop or on its way, and not otherwise; Stay leaves everything as it was; Leave lets the step through with the case left
// at that day; steps that only look never ask; the case's own calls pass. Node only: the worker is not started (a step that reaches the engine is stopped before it, or is a no-op).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useCase, CASE_OFF } from '../src/ui/case/store.ts';
import { asCase, caseAsk, guardWords, paramsKind, actionKind, useGuard, stayInCase, leaveForStep, endsCase, setLeaving, STORE_LEAVING, type GuardKind } from '../src/ui/case/guard.ts';
import { leaveCase, backToCase, endCase } from '../src/ui/case/run.ts';
import { sendAction } from '../src/ui/action/send.ts';
import { updateParams, presetStarted, currentParams, undo, redo } from '../src/ui/action/params.ts';
import { jumpAhead, timeline } from '../src/ui/timeline/index.ts';
import { play, setSpeed, step } from '../src/ui/shell/transport.ts';
import { useShell } from '../src/ui/shell/store.ts';
import { loadPatient, restartPatient } from '../src/ui/patients/index.ts';
import { openHistory } from '../src/ui/histories/open.ts';
import { setParams } from '../src/engine/store.ts';
import { defaultParams } from '../src/engine/hales/portal/scenario.js';
import type { Stop } from '../src/ui/case/types.ts';
import type { CasePhase } from '../src/ui/case/types.ts';

const stop = (day: number, entry: number): Stop => ({ key: `k${day}`, type: 'key', day, entry, title: `Day ${day}`, kind: 'Event', shot: { view: 'anatomic', cam: 'fit' }, look: [], open: null, say: null });
const STOPS = [stop(0, 0), stop(40, 3), stop(70, 6), stop(73, 7)];
const CASE_ID = 'hist-bleed';
/** a case at stop 2 (Day 70), or on its way from it to stop 3 (Day 72 so far) */
function inCase(phase: CasePhase = 'stop'): void {
  useGuard.setState({ ask: null });
  useCase.setState({ ...CASE_OFF, phase, id: CASE_ID, stops: STOPS, at: 2, to: phase === 'travel' ? 3 : null, day: phase === 'travel' ? 72 : 70 });
}
function offCase(): void { useGuard.setState({ ask: null }); useCase.setState({ ...CASE_OFF }); }
const asked = (): GuardKind | null => useGuard.getState().ask?.kind ?? null;
type P = Record<string, unknown>;
const freshPatient = () => { const p = defaultParams() as P; setParams(p); presetStarted('cirrhosis', p); return p; };
const settle = () => new Promise<void>((r) => { setImmediate(r); });
// (the runner's own leave and end; the hold and the resume are the store's part only, so no walk is started in a test: a walk's leg is the runner's, case-stops.test.ts)
setLeaving({ ...STORE_LEAVING, leave: () => { leaveCase(); }, end: endCase });

test('the words are the design\'s: the title, the body with the day, Leave and Stay; another patient and Restart end the case', () => {
  const w = guardWords('drain', 70, { label: 'Paracentesis 5.0 L' });
  assert.equal(w.title, 'Draining fluid changes this patient\'s course.');
  assert.equal(w.body, 'The case shows what happened to this patient, and a paracentesis was not part of it. If you drain now, the case stops here and the patient is yours from Day 70.');
  assert.equal(w.leave, 'Drain and leave the case');
  assert.equal(w.stay, 'Stay in the case');
  assert.equal(w.kicker, 'Paracentesis 5.0 L · Day 70');
  assert.match(w.keep ?? '', /Back to the case brings you here again/);
  assert.match(guardWords('change', 70).title, /^Changing this changes this patient's course\.$/);
  assert.equal(guardWords('change', 70).leave, 'Change and leave the case');
  assert.match(guardWords('time', 52, { travel: true, stopDay: 40 }).keep ?? '', /Day 40/);
  for (const k of ['patient', 'restart'] as const) { assert.ok(endsCase(k)); assert.equal(guardWords(k, 70).keep, null); assert.match(guardWords(k, 70).leave, /end the case$/); }
  // (every kind's words are whole sentences with the day, and every Leave says the case)
  const kinds: GuardKind[] = ['drain', 'fluid', 'blood', 'albumin', 'band', 'medicine', 'stopMedicine', 'procedure', 'setting', 'time', 'undo', 'redo', 'patient', 'restart', 'change'];
  for (const k of kinds) { const x = guardWords(k, 70); assert.match(x.title, /\.$/); assert.match(x.body, /Day 70/); assert.match(x.leave, /the case$/); }
});

test('what a step is: an action by its kind, a change of the settings by what it changed', () => {
  assert.equal(actionKind({ kind: 'paracentesis' }), 'drain');
  assert.equal(actionKind({ kind: 'band' }), 'band');
  assert.equal(actionKind({ kind: 'infuse', fluid: 'prbc' }), 'blood');
  assert.equal(actionKind({ kind: 'infuse', fluid: 'albumin' }), 'albumin');
  assert.equal(actionKind({ kind: 'infuse', fluid: 'crystalloid' }), 'fluid');
  assert.equal(actionKind({ kind: 'valsalva' }), 'change');
  const p = defaultParams() as P;
  const drugOn = structuredClone(p) as P & { drugs: Record<string, boolean> };
  drugOn.drugs = { ...drugOn.drugs, carvedilol: true };
  assert.equal(paramsKind(p, drugOn), 'medicine');
  assert.equal(paramsKind(drugOn, p), 'stopMedicine');
  assert.equal(paramsKind(p, { ...p, diuretics: !p.diuretics }), p.diuretics ? 'stopMedicine' : 'medicine');
  assert.equal(paramsKind(p, { ...p, tips: { on: true, d: 8 } }), 'procedure');
  assert.equal(paramsKind(p, { ...p, albumin: 2.5 }), 'setting');
});

test('the guard asks only while the case is at a stop or on its way; in a left case another patient or a restart ends it', () => {
  offCase();
  assert.equal(caseAsk('drain'), null, 'no case: the step runs');
  for (const ph of ['stop', 'travel'] as const) {
    inCase(ph);
    assert.ok(caseAsk('drain'), `${ph}: it asks`);
    assert.equal(asked(), 'drain');
    stayInCase();
  }
  inCase('left');
  assert.equal(caseAsk('drain'), null, 'left: the learner\'s own course runs');
  assert.equal(useCase.getState().phase, 'left');
  assert.equal(caseAsk('patient'), null);
  assert.equal(useCase.getState().phase, 'off', 'another patient in a left case ends it');
  inCase('left');
  assert.equal(caseAsk('restart'), null);
  assert.equal(useCase.getState().phase, 'off', 'so does a restart');
});

test('every guarded entry point asks while in a case, and runs at once outside one', async () => {
  freshPatient();
  const shell = useShell.getState().transport;
  const lapse = (days: number, running = false) => useShell.setState({ transport: { ...shell, lapse: days, running } });
  const entries: [string, GuardKind, () => unknown][] = [
    ['sendAction (a paracentesis)', 'drain', () => sendAction({ kind: 'paracentesis', mL: 5000, albumin: true })],
    ['sendAction (a band)', 'band', () => sendAction({ kind: 'band' })],
    ['sendAction (a transfusion)', 'blood', () => sendAction({ kind: 'infuse', fluid: 'prbc' })],
    ['updateParams (a medicine)', 'medicine', () => updateParams((q) => { q.drugs.carvedilol = true; return q; }, { label: 'Carvedilol' })],
    ['updateParams (TIPS)', 'procedure', () => updateParams({ tips: { on: true, d: 8 } }, { label: 'TIPS' })],
    ['updateParams (a slider)', 'setting', () => updateParams({ albumin: 2.4 }, { label: 'Serum albumin' })],
    ['undo', 'undo', () => undo()],
    ['redo', 'redo', () => redo()],
    ['jumpAhead', 'time', () => jumpAhead(30)],
    ['play on the disease clock', 'time', () => { lapse(5); play(true); }],
    ['a new pace of running days', 'time', () => { lapse(5, true); setSpeed(10, true); }],
    ['a step of the disease clock', 'time', () => { lapse(5); step(); }],
    ['loadPatient', 'patient', () => loadPatient('healthy')],
    ['restartPatient', 'restart', () => restartPatient()],
    ['openHistory (another)', 'patient', () => openHistory('hist-ascites')],
    ['openHistory (this one again)', 'restart', () => openHistory(CASE_ID)],
  ];
  for (const [what, kind, run] of entries) {
    for (const ph of ['stop', 'travel'] as const) {
      inCase(ph);
      const before = JSON.stringify(currentParams());
      const r = run();
      assert.equal(asked(), kind, `${what}, ${ph}: asks as ${kind}`);
      stayInCase();
      if (r instanceof Promise) assert.equal(await r, false, `${what}: Stay, and it did not run`);
      assert.equal(JSON.stringify(currentParams()), before, `${what}: Stay leaves the patient as it was`);
      const s = useCase.getState();
      assert.equal(s.phase, ph, `${what}: Stay leaves the case where it was`);
      assert.equal(s.at, 2);
      assert.equal(s.paused, false, 'on the way, the days run on after Stay');
      lapse(0);
    }
  }
  // (outside a case nothing asks: a change of the settings is made at once)
  offCase();
  assert.equal(updateParams({ albumin: 2.6 }, { label: 'Serum albumin' }), true);
  assert.equal(asked(), null);
  assert.equal((currentParams() as P).albumin, 2.6);
});

test('pausing, and the heart\'s own clock, never ask', () => {
  inCase('stop');
  const shell = useShell.getState().transport;
  useShell.setState({ transport: { ...shell, lapse: 5, running: true } });
  try { play(false); } catch { /* the engine is not up: what matters is that nothing asked */ }
  assert.equal(asked(), null);
  useShell.setState({ transport: { ...shell, lapse: 0 } });
  try { play(true); } catch { /* as above */ }
  assert.equal(asked(), null);
  useShell.setState({ transport: shell });
});

test('Leave lets the step through: the case is left at the stop\'s day, and the change is made', async () => {
  freshPatient();
  inCase('stop');
  assert.equal(updateParams({ tips: { on: true, d: 8 } }, { label: 'TIPS' }), false, 'asked, not made yet');
  assert.equal(useGuard.getState().ask?.words.title, 'A procedure changes this patient\'s course.');
  leaveForStep();
  await settle();
  const s = useCase.getState();
  assert.equal(s.phase, 'left');
  assert.equal(s.leftDay, 70, 'the patient is the learner\'s own from the stop\'s day');
  assert.equal(s.at, 2, 'the stop is kept for Back to the case');
  assert.equal(s.id, CASE_ID);
  assert.equal(((currentParams() as P).tips as P).on, true, 'the change went through');
  assert.equal(asked(), null);
  // (and once left, the learner's own steps run without asking)
  assert.equal(updateParams({ albumin: 2.2 }, { label: 'Serum albumin' }), true);
});

test('on the way, the days stop while it asks; Leave keeps the day they stopped on', async () => {
  freshPatient();
  inCase('travel');
  const q = caseAsk('time', '+1 month');
  assert.ok(q);
  assert.equal(useCase.getState().paused, true, 'held while the question is up');
  assert.match(useGuard.getState().ask!.words.body, /yours from Day 72\./);
  leaveForStep();
  assert.equal(await q, true);
  const s = useCase.getState();
  assert.equal(s.phase, 'left');
  assert.equal(s.leftDay, 72);
  assert.equal(s.to, null);
});

test('a second step while one is asked is dropped (a slider\'s drag asks once)', async () => {
  inCase('stop');
  const first = caseAsk('setting');
  const second = caseAsk('setting');
  assert.ok(first && second);
  assert.equal(await second, false);
  stayInCase();
  assert.equal(await first, false);
});

test('the case\'s own calls pass without asking: Back to the case opens its history in a left case without ending it', async () => {
  freshPatient();
  inCase('stop');
  assert.equal(asCase(() => caseAsk('patient')), null);
  assert.equal(asCase(() => updateParams({ albumin: 2.8 }, { label: 'x' })), true);
  assert.equal(asked(), null);
  assert.equal(caseAsk('setting') instanceof Promise, true, 'the bypass ends with the call');
  stayInCase();
  // (opening this history again from outside the case, in a left case, would end it: the runner's own opening does not; the worker is not up, so the opening itself fails later)
  inCase('left');
  const back = backToCase();
  assert.equal(useCase.getState().phase, 'left', 'the case is still there to go back to');
  assert.equal(asked(), null);
  await back.catch(() => false);
});

test('leaveCase keeps the stop; Back to the case is only for a left case', async () => {
  inCase('travel');
  assert.equal(leaveCase(), true);
  assert.equal(useCase.getState().phase, 'left');
  assert.equal(useCase.getState().at, 2);
  assert.equal(useCase.getState().leftDay, 72);
  assert.equal(leaveCase(), false, 'a left case is not left again');
  offCase();
  assert.equal(await backToCase(), false);
});

test('the steps that only look never ask: History and its Show on the figure, Compare, the sheets', () => {
  inCase('stop');
  useShell.getState().open('history');
  timeline.goTo(0, { quiet: true });
  useShell.getState().toggle('compare');
  useShell.getState().close();
  assert.equal(asked(), null);
  assert.equal(useCase.getState().phase, 'stop');
  offCase();
});
