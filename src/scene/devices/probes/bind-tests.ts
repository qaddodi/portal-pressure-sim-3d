// The Tests card drives the devices: the Doppler tab puts the ultrasound probe on the figure, FibroScan puts its probe on the organ the exam reads, Endoscopy puts the scope down the esophagus.
// Open and on that instrument means on; closing the card or going to another instrument takes the device away (it eases out). The panes set the rest (the probed vessel, the scope's mode) through `useProbes`.
import { useTests } from '../../../ui/tests/store.ts';
import { useProbes } from './state.ts';

/** Starts following the Tests card; returns the remover. */
export function bindTests(): () => void {
  const sync = (): void => {
    const t = useTests.getState(), p = useProbes.getState();
    const on = (pane: string): boolean => t.open && t.pane === pane;
    if (p.doppler.on !== on('doppler')) p.setDoppler({ on: on('doppler') });
    if (p.fibro.on !== on('fibroscan') || p.fibro.organ !== t.fibro) p.setFibro({ on: on('fibroscan'), organ: t.fibro });
    if (p.endoscope.on !== on('endoscopy')) p.setEndoscope({ on: on('endoscopy') });
  };
  sync();
  return useTests.subscribe(sync);
}
