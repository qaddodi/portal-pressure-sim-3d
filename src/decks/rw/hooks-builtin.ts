// The features that already exist in the 3D app, read from the tables they are built from (never typed apart from them), registered as hooks. Imported by the parity claims and the
// tests; a batch that lands a feature does not edit this file, it calls `registerHook(id)` itself (hooks.ts), or its feature appears in the table read here.
import { LENS_IDS } from '../../scene/lenses/model.ts';
import { CHARTS } from '../../ui/charts/registry.ts';
import { CATHS } from '../schema.ts';
import { registerHook } from './hooks.ts';

let done = false;
export function registerBuiltinHooks(): void {
  if (done) return;
  done = true;
  for (const id of LENS_IDS) registerHook(`lens:${id}`);                                   // B3: every lens has its ramp and a crossfade
  for (const c of CHARTS) if (c.status === 'done') registerHook(`tool:${c.kind}`);         // B10: a chart is done when its model, card, tests and gallery specimen are in
  for (const c of CATHS) registerHook(`device:hvpg-catheter:${c}`);                        // S2: route, free, wedge, result
  for (const id of ['view:lobule', 'view:sinusoid', 'view:wash', 'view:layers']) registerHook(id);   // B8: the lobule and sinusoid scenes, the wedge's wash, the zone bands
}
