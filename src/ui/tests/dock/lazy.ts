// The instruments that load after the first paint (2D lazy-pane.js + main.js lazy(): the Doppler, the FibroScan, the Trials tab; here also the IR, the Endoscopy and the Pressure chart, each its own chunk).
// `need(id)` asks for an instrument's code and answers null once it is in, else a promise that settles (it never rejects) when it has come or failed: a tab for an instrument still on its way waits for it, so
// the pane it leaves stays up and no pane ever shows empty (copied holdUntilLoaded). Asked for as a finger or the pointer reaches a tab, when the card opens, and when the app is idle.
import type { PaneId } from '../panes.ts';
import { retryImport } from '../../../boot/lazy-retry.ts';
// @ts-ignore plain JS copied from the 2D app
import { holdUntilLoaded as holdUntilLoadedJs } from '../copied/hold-until-loaded.copied.js';

export const LOADERS = {
  profile: () => retryImport(() => import('../profile/ProfilePane.tsx')),
  hvpg: () => retryImport(() => import('../ir/IrPane.tsx')),
  doppler: () => retryImport(() => import('../doppler/DopplerPane.tsx')),
  endoscopy: () => retryImport(() => import('../endo/EndoPane.tsx')),
  fibroscan: () => retryImport(() => import('../fibro/FibroPane.tsx')),
  trials: () => retryImport(() => import('../../trials/TrialsPane.tsx')),
} as const;
type Lazy = keyof typeof LOADERS;
export const isLazy = (id: PaneId): id is Lazy => id in LOADERS;

const done = new Set<PaneId>(), waiting = new Map<PaneId, Promise<void>>();
/** null: the instrument's code is in; else a promise that settles when it is (or when it failed: asking again tries again). */
export function need(id: PaneId): Promise<void> | null {
  if (!isLazy(id) || done.has(id)) return null;
  let p = waiting.get(id);
  if (!p) {
    p = LOADERS[id]().then(() => { done.add(id); }, (err) => { console.warn(`The ${id} instrument did not load.`, err); }).then(() => { waiting.delete(id); });
    waiting.set(id, p);
  }
  return p;
}
/** Every instrument's code, in the background (the card opened, or the app is idle). */
export function needAll(): void { for (const id of Object.keys(LOADERS) as Lazy[]) void need(id); }

/** afterLoad(id, go): calls go() once the instrument for `id` is in, and says whether it is waiting; the latest ask wins (2D lazy-pane.js holdUntilLoaded, copied). */
export const afterLoad = holdUntilLoadedJs((id: PaneId) => ({ need: () => need(id) })) as (id: PaneId, go: () => void) => boolean;
