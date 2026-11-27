// TIPS Doppler review item 15 (23 Nov 2026): the portal vein reads "Phasic" only when its beat really swings (a healthy vein), "Monophasic" when the stiff liver has damped it;
// and the deck shows the hepatic vein's own trace (a paired strip under the portal vein's), triphasic before the TIPS and with no reversal after a patent one. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as host from '../src/engine/hales/host/worker-core.js';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { Engine } from '../src/engine/hales/portal/engine.js';
import { PORTAL_PHASIC_PI } from '../src/ui/tests/doppler/phasic-cut.js';
import { pulsatility } from '../src/ui/tests/copied/doppler-marks.copied.js';
import { TIPS_DOPPLER } from '../src/decks/rw/copied/tips-doppler.ts';

const reading = readFileSync(new URL('../src/ui/tests/doppler/copied/doppler-reading.copied.js', import.meta.url), 'utf8');
const copier = readFileSync(new URL('../scripts/copy-b11-doppler.mjs', import.meta.url), 'utf8');
const slide = (id: string) => (TIPS_DOPPLER.slides as readonly Record<string, any>[]).find((s) => s.id === id)!;

const atBedside = (host as unknown as { atBedside(e: unknown): void }).atBedside;
type Pi = { pi: { value: number } };

/** The median whole beat's pulsatility index of PV_TRUNK, as the engine tracks it (engine.js trackPulsatility: (max - min) / the larger extreme, once a beat). */
function beatPi(id: string, patch?: Record<string, unknown>): number {
  const e = new Engine() as Engine & Pi;
  const g = e.loadPresetSteps(id, {});
  while (!g.next().done);
  if (patch) { e.setParams({ ...e.paramsTarget(), ...patch }); e.settle(); }
  atBedside(e);
  const pis: number[] = [];
  let last = e.pi.value;
  for (let i = 0; i < 2000; i++) { e.step(0.008); if (e.pi.value !== last) { last = e.pi.value; pis.push(last); } }
  pis.sort((a, b) => a - b);
  return pis[pis.length >> 1]!;
}
const pattern = (pi: number) => (pi > 0.5 ? 'Pulsatile' : pi > PORTAL_PHASIC_PI ? 'Phasic' : 'Monophasic');

test('the reading cuts the portal vein pattern at the shared cut, not at 2D\'s 0.15 (a fresh copy from 2D keeps the departure)', () => {
  assert.equal((reading.match(/pi > PORTAL_PHASIC_PI \? 'Phasic'/g) || []).length, 2, 'both portal branches use the cut');
  assert.doesNotMatch(reading, /pi > 0\.15 \? 'Phasic'/);
  assert.match(copier, /PORTAL_PHASIC_PI/, 'scripts/copy-b11-doppler.mjs makes the same departure');
  assert.equal(pulsatility(10, 5) > PORTAL_PHASIC_PI, true);
});

test('a healthy portal vein is phasic, the cirrhotic one (and the slide\'s patient) flattened to monophasic', () => {
  assert.equal(pattern(beatPi('healthy')), 'Phasic');
  for (const id of ['cirr-comp', 'cirr-decomp']) assert.equal(pattern(beatPi(id)), 'Monophasic', id);
  assert.equal(pattern(beatPi('cirr-decomp', { cirrhosis: 0.92 })), 'Monophasic', 'the deck\'s Before TIPS patient');
  assert.equal(pattern(beatPi('rhf')), 'Pulsatile', 'right heart failure still reads pulsatile');
});

test('the deck pairs the hepatic vein under the portal vein before the TIPS and after a patent one', () => {
  assert.equal(slide('before').tool.pair, true);
  assert.equal(slide('mpv').tool.pair, true);
  assert.match(slide('before').line, /hepatic vein is triphasic/);
  assert.match(slide('mpv').line, /hepatic vein is monophasic/);
  assert.match(slide('before').notes, /a small reversal \(a\).*\(S\).*\(v\).*\(D\)/, 'the waves are named in the notes');
});

/** The hepatic vein's velocity over 3 s of beats at a slide's state, from the host's own `wave` step (what the page's strip is drawn from). */
async function hepaticWave(step: Record<string, unknown>): Promise<number[]> {
  let out: any;
  const core = createCore((m: any) => { if (m.type === 'seqStep') out = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: [{ ...step, wave: 'RHV_IVC' }], reqId: 1 });
  core.dispose();
  return out.extra.wave.RHV_IVC.v as number[];
}

test('the strip shows what it says: the hepatic vein reverses (triphasic) before the TIPS and never after a patent one', async () => {
  const before = await hepaticWave({ preset: slide('before').preset, params: slide('before').params });
  assert.ok(Math.min(...before) < -10 && Math.max(...before) > 20, 'the atrium\'s a wave reverses the flow between forward waves');
  const j = slide('jet');
  const after = await hepaticWave({ preset: 'cirr-decomp', params: { ...slide('before').params, ...j.params }, days: j.days });
  assert.ok(Math.min(...after) > 0, 'with the stent carrying the portal flow nothing reverses');
});
