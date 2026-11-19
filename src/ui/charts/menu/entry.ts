// The registry entry of the treatment menu (2D `tool: { kind: 'menu' }`, tool-menu.js). Specimens: made-up readings that show the look (the drugs near the ring, the shunts down and to the left, the Meso-Rex
// the one dot that goes down and to the right), never a patient.
import type { ChartKind } from '../registry.ts';
import { menuFrame } from './frame.ts';
import type { MenuPoint } from './model.ts';

const pt = (id: string, name: string, ppg: number, liver: number, shunt: number, short?: string): MenuPoint => ({ id, name, short: short ?? name, ppg, liver, shunt });
export const SPECIMEN_DOTS: MenuPoint[] = [
  pt('propranolol', 'Propranolol', 16.2, 96, 0.02), pt('carvedilol', 'Carvedilol', 14.8, 94, 0.02), pt('pse', 'Splenic embolization', 15.1, 91, 0.05, 'Embolization'),
  pt('tips8', 'TIPS, 8 mm', 8.4, 58, 0.34), pt('tips10', 'TIPS, 10 mm', 6.1, 46, 0.52), pt('warren', 'Distal splenorenal shunt (DSRS)', 10.2, 80, 0.18, 'DSRS'),
  pt('mesocaval', 'Mesocaval shunt', 5.2, 40, 0.6, 'Mesocaval'), pt('rex', 'Meso-Rex bypass', 7.4, 112, 0.0, 'Meso-Rex'),
];
const BASE = { ppg: 17.4, liver: 100, shunt: 0.02 };

export const menuEntry: ChartKind = {
  kind: 'menu', what: 'Treatment menu: every treatment this patient could get, PPG against the liver flow it costs', slides: 4, status: 'done',
  specimens: [
    { id: 'menu', label: 'Every treatment on one chart: the patient as the ring (specimen numbers)', build: (c) => menuFrame({ dots: SPECIMEN_DOTS, base: BASE, baseLabel: 'No treatment' }, c).frame },
    { id: 'few', label: 'Two treatments offered, the patient already on one (specimen numbers)', build: (c) => menuFrame({ dots: SPECIMEN_DOTS.filter((d) => d.id === 'tips8' || d.id === 'rex'), base: { ppg: 14.8, liver: 94, shunt: 0.02 }, baseLabel: 'As now' }, c).frame },
    { id: 'wait', label: 'Before the treatments are worked out (the ring and the axes)', build: (c) => menuFrame({ dots: [], base: BASE, baseLabel: 'No treatment' }, c).frame },
  ],
};
