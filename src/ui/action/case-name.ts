// The case's name must agree with the case shown. A preset names the patient it starts as; once a disease process is put on it (a thrombus in the hepatic veins, cirrhosis,
// fibrosis, a stenosis, a failing heart) it is no longer that patient, so the pill says "Custom". A treatment (TIPS, a drug, a shunt, a balloon, BRTO) never renames the case,
// and neither does a meal or a tuning knob. One rule, read by the top bar, the timeline's start label, Compare, the capture and the a11y description (via patientLabel).
import { PRESETS, defaultParams } from '../../engine/hales/portal/scenario.js';
import { activeInterventions } from './changes.ts';
import type { Params } from './params.ts';

/** The changes that make a different patient (disease), by key; everything else in activeInterventions is a treatment, a meal or a tuning knob. */
export const isDiseaseKey = (k: string): boolean => k === 'cirrhosis' || k === 'tr' || k === 'pericardial' || k === 'contractility' || k === 'apShunt'
  || k.startsWith('fib:') || k.startsWith('thr:') || k.startsWith('sten:');

const own = new Map<string, Set<string>>();
/** The disease labels the preset itself comes with (what "Healthy" or "Budd-Chiari" already is), or null when the id is not a preset (a history, a saved patient: they keep their own name). */
function presetDisease(id: string): Set<string> | null {
  let s = own.get(id);
  if (s) return s;
  const def = (PRESETS as { id: string; apply(p: unknown): unknown }[]).find((x) => x.id === id);
  if (!def) return null;
  s = new Set(activeInterventions(def.apply(defaultParams()) as Params).filter((c) => isDiseaseKey(c.key)).map((c) => `${c.key}|${c.label}`));
  own.set(id, s);
  return s;
}

/** True when these settings carry a disease the preset `id` does not (or a different strength of it): the case is no longer that preset. */
export function isCustomCase(id: string | null, params: Params | null | undefined): boolean {
  if (!id || !params) return false;
  const base = presetDisease(id);
  if (!base) return false;
  return activeInterventions(params).some((c) => isDiseaseKey(c.key) && !base.has(`${c.key}|${c.label}`));
}
