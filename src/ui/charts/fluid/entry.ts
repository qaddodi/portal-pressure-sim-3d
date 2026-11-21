// The registry entry of the fluid chart (2D: tool-fluid.js; slides: the sinusoid wall in circulation, the ascites deck, choose-treatment's a2-fluid). Specimens are made-up numbers, not a patient.
import type { ChartKind } from '../registry.ts';
import { fluidFrame } from './frame.ts';
import { fluidOf } from './model.ts';

// a fingerprint's fluid terms (mL/min): lymph made beyond what the lymphatics carry, part of it taken back, the rest staying as ascites
const BUILD = fluidOf({ hepLymph: 3.2, splLymph: 1.6, lymphCap: 4, lymphOver: 0.8, lymphBack: 0.3, lymphNet: 0.5 })!;
const STABLE = fluidOf({ hepLymph: 2.6, splLymph: 1.5, lymphCap: 4, lymphOver: 0.1, lymphBack: 0.1, lymphNet: 0 })!;
const HEALTHY = fluidOf({ hepLymph: 0.5, splLymph: 0.4, lymphCap: 5, lymphOver: 0, lymphBack: 0, lymphNet: 0 })!;
const SHRINK = fluidOf({ hepLymph: 2.4, splLymph: 1.3, lymphCap: 4.6, lymphOver: 0, lymphBack: 0.2, lymphNet: -0.2 })!;
const FORCES = { out: 9.4, pull: 6.1 };

export const fluidEntry: ChartKind = {
  kind: 'fluid', what: 'Starling forces and the fluid window', slides: 2, status: 'done',
  specimens: [
    { id: 'flow', label: 'The flow picture: lymph made, carried, taken back, building up (specimen numbers)', build: (c) => fluidFrame(BUILD, null, c, { caveat: true }) },
    { id: 'flow-forces', label: 'The flow picture with the forces across the sinusoid wall', build: (c) => fluidFrame(STABLE, FORCES, c, { forces: true }) },
    { id: 'window', label: 'The day card, ascites accumulating', build: (c) => fluidFrame(BUILD, null, c, { window: true }) },
    { id: 'window-forces', label: 'The day card with the forces tile', build: (c) => fluidFrame(SHRINK, FORCES, c, { window: true, forces: true }) },
    { id: 'healthy', label: 'No ascites: the lymphatics drain all the lymph made', build: (c) => fluidFrame(HEALTHY, null, c, { window: true }) },
  ],
};
