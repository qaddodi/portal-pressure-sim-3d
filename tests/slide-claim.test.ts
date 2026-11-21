// A card that leaves must never undo the card that arrived (owner, 21 Nov, iPhone, Doppler slide 3 "Hepatic vein flow is phasic": no ultrasound probe). Root cause: the old slide's data card stays
// mounted until its exit ends, after the new card has mounted and set the slide's devices; its unmount cleanup then cleared them. Every shared slide state a card writes goes through slide-claim.ts now.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claimSlide, holdSlideDevices } from '../src/ui/talk/slide-claim.ts';
import { bindTests } from '../src/scene/devices/probes/bind-tests.ts';
import { useProbes } from '../src/scene/devices/probes/state.ts';
import { planOf } from '../src/ui/talk/instruments.ts';
import { setToolStep, toolCanStep } from '../src/ui/talk/tool-step.ts';

const flags = (tool: Record<string, unknown>) => { const p = planOf(tool.kind as never, tool); return { doppler: !!p.doppler?.figure, fibro: !!p.organ, endoscope: !!p.scope, points: !!p.doppler?.points }; };

test('Doppler slide after Doppler slide: the leaving card\'s cleanup leaves the new slide\'s probe on the figure', () => {
  const off = bindTests();
  const probe = useProbes;
  const one = holdSlideDevices(flags({ kind: 'doppler', vessel: 'PV_TRUNK' }));   // slide 2: the portal vein
  assert.equal(probe.getState().doppler.on, true);
  const two = holdSlideDevices(flags({ kind: 'doppler', vessel: 'RHV_IVC' }));    // slide 3 arrives (mounted before slide 2's card is gone)
  one();                                                                           // slide 2's card finishes leaving
  assert.equal(probe.getState().slide.doppler, true, 'the new slide still asks for the probe');
  assert.equal(probe.getState().doppler.on, true, 'and the probe is on');
  two();                                                                           // the slide goes
  assert.equal(probe.getState().doppler.on, false, 'it leaves with its own card');
  off();
});

test('the same for the FibroScan and the scope, whichever card is released first, and a card that re-runs its effect', () => {
  const off = bindTests();
  const a = holdSlideDevices(flags({ kind: 'fibroscan', organ: 'liver' })), b = holdSlideDevices(flags({ kind: 'fibroscan', organ: 'spleen' }));
  b(); a();   // (released in either order, the last to arrive owned it: b cleared, a is a no-op)
  assert.equal(useProbes.getState().fibro.on, false);
  const s1 = holdSlideDevices(flags({ kind: 'scope' }));
  const rerun = (() => { s1(); return holdSlideDevices(flags({ kind: 'scope' })); })();   // the effect's deps changed: cleanup then claim again
  assert.equal(useProbes.getState().endoscope.on, true);
  rerun();
  assert.equal(useProbes.getState().endoscope.on, false);
  off();
});

test('a slide with no instrument after an instrument slide takes the device away (the leaving card is the latest, so it clears)', () => {
  const off = bindTests();
  const rel = holdSlideDevices(flags({ kind: 'doppler', vessel: 'RHV_IVC' }));
  assert.equal(useProbes.getState().doppler.on, true);
  rel();
  assert.equal(useProbes.getState().doppler.on, false);
  off();
});

test('claims of different kinds do not undo one another; the stepper of a leaving HVPG card keeps the arriving one\'s', () => {
  const log: string[] = [];
  const pin = claimSlide('pin', () => log.push('pin')), opts = claimSlide('options', () => log.push('options'));
  pin(); opts();
  assert.deepEqual(log, ['pin', 'options']);
  const stepper = { can: () => true, step: () => true };
  const oldCard = (() => { setToolStep(stepper); return claimSlide('step', () => setToolStep(null)); })();
  const newCard = (() => { setToolStep({ can: () => true, step: () => true }); return claimSlide('step', () => setToolStep(null)); })();
  oldCard();
  assert.equal(toolCanStep(1), true, 'the arriving card still steps');
  newCard();
  assert.equal(toolCanStep(1), false);
});

test('every card cleanup that writes shared slide state goes through slide-claim.ts', () => {
  const body = readFileSync(new URL('../src/ui/talk/ToolCardBody.tsx', import.meta.url), 'utf8'), hv = readFileSync(new URL('../src/ui/talk/HvpgTool.tsx', import.meta.url), 'utf8');
  assert.ok(!/=> setSlidePin\(null\)\s*,\s*\[\]/.test(body) && /claimSlide\('pin'/.test(body), 'the pin');
  assert.ok(!/return \(\) => useToolPatch/.test(body) && /claimSlide\('options'/.test(body), 'the buttons\' patch');
  assert.ok(/holdSlideDevices\(/.test(body) && !/q\.setSlide\(\{ doppler: false/.test(body), 'the devices');
  assert.ok(!/return \(\) => setToolStep\(null\)/.test(hv) && /claimSlide\('step'/.test(hv), 'the HVPG stepper');
});
