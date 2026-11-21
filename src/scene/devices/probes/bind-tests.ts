// The Tests card drives the devices: the Doppler tab puts the ultrasound probe on the figure, FibroScan puts its probe on the organ the exam reads, Endoscopy puts the scope down the esophagus.
// Open and on that instrument means on; closing the card or going to another instrument takes the device away (it eases out). The panes set the rest (the probed vessel, the scope's mode) through `useProbes`.
import { useTests } from '../../../ui/tests/store.ts';
import { useProbes, type DopplerSeg } from './state.ts';
import { useScope } from '../../../ui/tests/endo/scope-state.ts';
import { MEASURES } from '../../procedures/copied/proc-anim.js';
import { EDGES, isStent, stentGate } from '../../../engine/hales/portal/topology.js';
import { patient } from '../../../engine/index.ts';
import { useDopplerProbe } from '../../../ui/tests/doppler/probe-state.ts';
import { useUi } from '../../../ui/ui-store.ts';
import { useTestsRoom } from '../../../ui/tests/room.ts';
import { clock } from '../../../clock/frame.ts';

/** Starts following the Tests card; returns the remover. */
export function bindTests(): () => void {
  const sync = (): void => {
    const t = useTests.getState(), p = useProbes.getState();
    // (an instrument a deck slide has up keeps its device on the figure however the Tests card changes: p.slide, written by ui/talk/ToolCard.tsx)
    const on = (pane: string, slide: boolean): boolean => slide || (t.open && t.pane === pane);
    if (p.doppler.on !== on('doppler', p.slide.doppler)) p.setDoppler({ on: on('doppler', p.slide.doppler) });
    if (p.fibro.on !== on('fibroscan', p.slide.fibro) || p.fibro.organ !== t.fibro) p.setFibro({ on: on('fibroscan', p.slide.fibro), organ: t.fibro });
    if (p.endoscope.on !== on('endoscopy', p.slide.endoscope)) p.setEndoscope({ on: on('endoscopy', p.slide.endoscope) });
  };
  // the Doppler pane's vessel and sample gate (a stent's third) place the probe
  const syncDop = (): void => {
    // (the third of a stent the gate stands at: 'site' is the stent's tightest narrowing, no gate the mid stent; 2D stentGate. A vessel that is no stent has none.)
    const d = useDopplerProbe.getState(), edge = (EDGES as { id: string }[]).find((e) => e.id === d.probe);
    const seg: DopplerSeg = isStent(edge) ? (stentGate(d.gate, patient.params, d.probe) as DopplerSeg) : null, p = useProbes.getState().doppler;
    if (p.edge !== d.probe || p.seg !== seg) useProbes.getState().setDoppler({ edge: d.probe, seg });
  };
  // the Endoscopy pane's work: a band press loads and fires the ligator for a few seconds; the EUS measurement sends the needle to the station its step names
  let bandUntil = 0, lastTick = useScope.getState().bandTick, timer: number | undefined;
  const syncScope = (): void => {
    const e = useScope.getState(), p = useProbes.getState().endoscope;
    if (e.bandTick !== lastTick) { lastTick = e.bandTick; bandUntil = clock.now() + 3000; clock.cancel(timer); timer = clock.after(syncScope, 3050); }
    const steps = (MEASURES as unknown as { eus: { steps: [string][] } }).eus.steps;
    const station: 'pv' | 'hv' = e.step >= 0 && steps[e.step]?.[0] === 'hv' ? 'hv' : 'pv';
    const mode = e.eus === 'run' ? 'eus' : clock.now() < bandUntil ? 'band' : 'scope';
    if (p.mode !== mode || p.station !== station) useProbes.getState().setEndoscope({ mode, station });
  };
  sync(); syncDop(); syncScope();
  // the cards the devices keep clear of moved (a slide's card, the Tests card's place, the bars): they look again (the 2D probe reads the page's boxes four times a second)
  const offBoxes = useUi.subscribe((s, p) => { if (s.boxes !== p.boxes || s.vp !== p.vp) clock.invalidate('probe-cards'); });
  const offRoom = useTestsRoom.subscribe((s, p) => { if (s.place !== p.place) clock.invalidate('probe-cards'); });
  const offs = [useTests.subscribe(sync), useProbes.subscribe((s, prev) => { if (s.slide !== prev.slide) sync(); }), useDopplerProbe.subscribe(syncDop), useScope.subscribe(syncScope), offBoxes, offRoom];
  return () => { clock.cancel(timer); offs.forEach((f) => f()); };
}
