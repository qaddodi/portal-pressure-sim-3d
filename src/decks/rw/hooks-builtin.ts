// The features that already exist in the 3D app, read from the tables they are built from (never typed apart from them), registered as hooks. Imported by the parity claims and the
// tests; a batch that lands a feature does not edit this file, it calls `registerHook(id)` itself (hooks.ts), or its feature appears in the table read here.
import { LENS_IDS, SINCE_BASELINE_FED } from '../../scene/lenses/model.ts';
import { CHARTS } from '../../ui/charts/registry.ts';
import { CATHS } from '../schema.ts';
import { registerHook } from './hooks.ts';

let done = false;
export function registerBuiltinHooks(): void {
  if (done) return;
  done = true;
  for (const id of LENS_IDS) if (id !== 'since' || SINCE_BASELINE_FED) registerHook(`lens:${id}`);                                   // B3: every lens has its ramp and a crossfade
  for (const c of CHARTS) if (c.status === 'done') registerHook(`tool:${c.kind}`);         // B10: a chart is done when its model, card, tests and gallery specimen are in
  // (the 2D `course` tool is the curve chart's second mode; the plane, all-patients and ladders visuals are charts too: a slide's visual card, mounted by the presenter, draws them)
  const chartDone = (k: string) => CHARTS.some((c) => c.kind === k && c.status === 'done');
  for (const [hook, kind] of [['tool:course', 'curve'], ['visual:plane', 'plane'], ['visual:allpatients', 'small'], ['visual:ladders', 'ladder']] as const) if (chartDone(kind)) registerHook(hook);
  // B10/B12: the data card of tiles is one card for every deck (CardLayer mounts hp/TilesCard.tsx from the slide's `tiles`: each reading from the slide's own engine state, the key ones strong, the change from another state)
  registerHook('card:tiles');
  for (const c of CATHS) registerHook(`device:hvpg-catheter:${c}`);                        // S2: route, free, wedge, result
  // B12: the presenter plays any deck by id, with case question, summary table, scale pill, live compare buttons, response, what-if and the time-lapse (ui/cards/SlideControls.tsx, hp/lapse.ts)
  for (const id of ['presenter:deck', 'engine:steps', 'time:lapse', 'slider:whatIf', 'card:response', 'card:case-question', 'card:question', 'view:scales', 'visual:table', 'compare:params', 'compare:preset', 'compare:slide', 'compare:lens']) registerHook(id);
  for (const id of ['view:lobule', 'view:sinusoid', 'view:wash', 'view:layers']) registerHook(id);   // B8: the lobule and sinusoid scenes, the wedge's wash, the zone bands
}
