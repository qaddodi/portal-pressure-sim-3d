// The registry entry of the treatment menu (2D `tool: { kind: 'menu' }`, the Tests card's "Treatment menu" gallery cards menu/full, menu/rows and menu/clot). Its specimens are made-up
// readings for the treatments the 2D rules offer a made-up patient (menuOptions on his settings), not a patient: a look, not a number.
import type { ChartKind } from '../registry.ts';
import { menuFrame, type MenuDot } from './frame.ts';
import { baseName } from './menu-pure.generated.js';
import { menuOptionsOf } from './menu-types.ts';

/** A made-up reading for each treatment offered: the drugs sit near the ring, the shunts run down and to the left (the 2D text's own picture), the Meso-Rex goes down and to the right. */
const READING: Record<string, [number, number, number]> = {
  propranolol: [12.4, 61, 0.02], carvedilol: [11.6, 60, 0.02], pse: [13.1, 58, 0.04], recanalization: [9.2, 66, 0.02], tips8: [8.2, 44, 0.55], tips10: [6.9, 38, 0.65],
  warren: [9.4, 47, 0.4], mesocaval: [7.6, 34, 0.7], portocaval: [6.2, 26, 0.9], rex: [9.8, 72, 0.15],
};
const dots = (params: Record<string, unknown>, rows: string[] | null = null): MenuDot[] =>
  (menuOptionsOf(params, rows) as { id: string; name: string; short?: string }[]).map((m) => ({ id: m.id, name: m.name, short: m.short ?? m.name, ppg: READING[m.id]![0], liver: READING[m.id]![1], shunt: READING[m.id]![2] }));
const PATIENT = { ppg: 14.8, liver: 62, shunt: 0.08 };

export const menuEntry: ChartKind = {
  kind: 'menu', what: 'Treatment menu: every option for this patient, PPG against the sinusoidal flow it costs (tool: menu)', slides: 4, status: 'done',
  specimens: [
    { id: 'full', label: 'Every option for the patient (specimen numbers)', build: (c) => menuFrame({ dots: dots({}), base: PATIENT, baseLabel: baseName({}) as string }, c).frame },
    { id: 'rows', label: 'A chosen few', build: (c) => menuFrame({ dots: dots({}, ['carvedilol', 'tips8']), base: PATIENT, baseLabel: baseName({}) as string }, c).frame },
    { id: 'clot', label: 'A clotted trunk: no TIPS, recanalization offered', build: (c) => menuFrame({ dots: dots({ thrombus: { PV_TRUNK: 0.9 } }), base: { ppg: 15.6, liver: 44, shunt: 0.1 }, baseLabel: baseName({}) as string }, c).frame },
    { id: 'waiting', label: 'The frame alone, while the treatments are worked out', build: (c) => menuFrame({ dots: [], base: PATIENT, baseLabel: baseName({}) as string }, c).frame },
  ],
};
