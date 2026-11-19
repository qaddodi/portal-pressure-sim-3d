// The Tests card drives the devices: the Doppler tab puts the ultrasound probe on the figure, FibroScan puts its probe on the organ the exam reads, Endoscopy puts the scope down the esophagus.
// Open and on that instrument means on; closing the card or going to another instrument takes the device away (it eases out). The panes set the rest (the probed vessel, the scope's mode) through `useProbes`.
import { useTests } from '../../../ui/tests/store.ts';
import { useProbes, type DopplerSeg } from './state.ts';
import { useScope } from '../../../ui/tests/endo/scope-state.ts';
import { MEASURES } from '../../procedures/copied/proc-anim.js';
import { useDopplerProbe } from '../../../ui/tests/doppler/probe-state.ts';

/** Starts following the Tests card; returns the remover. */
export function bindTests(): () => void {
  const sync = (): void => {
    const t = useTests.getState(), p = useProbes.getState();
    const on = (pane: string): boolean => t.open && t.pane === pane;
    if (p.doppler.on !== on('doppler')) p.setDoppler({ on: on('doppler') });
    if (p.fibro.on !== on('fibroscan') || p.fibro.organ !== t.fibro) p.setFibro({ on: on('fibroscan'), organ: t.fibro });
    if (p.endoscope.on !== on('endoscopy')) p.setEndoscope({ on: on('endoscopy') });
  };
  // the Doppler pane's vessel and sample gate (a stent's third) place the probe
  const syncDop = (): void => {
    const d = useDopplerProbe.getState(), seg: DopplerSeg = d.gate === 'proximal' || d.gate === 'mid' || d.gate === 'distal' ? d.gate : null, p = useProbes.getState().doppler;
    if (p.edge !== d.probe || p.seg !== seg) useProbes.getState().setDoppler({ edge: d.probe, seg });
  };
  // the Endoscopy pane's work: a band press loads and fires the ligator for a few seconds; the EUS measurement sends the needle to the station its step names
  let bandUntil = 0, lastTick = useScope.getState().bandTick, timer: ReturnType<typeof setTimeout> | undefined;
  const syncScope = (): void => {
    const e = useScope.getState(), p = useProbes.getState().endoscope;
    if (e.bandTick !== lastTick) { lastTick = e.bandTick; bandUntil = performance.now() + 3000; clearTimeout(timer); timer = setTimeout(syncScope, 3050); }
    const steps = (MEASURES as unknown as { eus: { steps: [string][] } }).eus.steps;
    const station: 'pv' | 'hv' = e.step >= 0 && steps[e.step]?.[0] === 'hv' ? 'hv' : 'pv';
    const mode = e.eus !== 'idle' ? 'eus' : performance.now() < bandUntil ? 'band' : 'scope';
    if (p.mode !== mode || p.station !== station) useProbes.getState().setEndoscope({ mode, station });
  };
  sync(); syncDop(); syncScope();
  const offs = [useTests.subscribe(sync), useDopplerProbe.subscribe(syncDop), useScope.subscribe(syncScope)];
  return () => { clearTimeout(timer); offs.forEach((f) => f()); };
}
