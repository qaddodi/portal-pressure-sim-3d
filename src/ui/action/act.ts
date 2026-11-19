// How a card's verbs reach the app: the parameter changes (one History entry each), the selection, the features other batches own, the engine's own actions.
import type { Act } from './cards.ts';
import { updateParams } from './params.ts';
import { selectStructure } from './selection.ts';
import { runFeature } from '../shell/features.ts';
import { sendAction } from './send.ts';

export const appAct: Act = {
  update: (patchOrFn, o) => { updateParams(patchOrFn as never, o); },
  select: (sel) => selectStructure(sel),
  feature: (id, name) => { runFeature(id, name); },
  action: (action) => sendAction(action),
};
