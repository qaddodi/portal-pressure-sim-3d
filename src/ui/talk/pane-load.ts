// The Tests panes a slide's data card mounts (the Doppler, the FibroScan, the scope and the wall) are chunks of their own, read in on first use. A card is measured, and let in, at the height its
// content has at that moment: while a pane's code was still on its way the card held the placeholder (the pane's `p.plot`, 150 px), so it landed at that height and the pane then arrived taller than
// its card and was cut off at the foot (capture 15c31759, iPhone: Stiffness 2 lost its FibroScan's last scale line and "LIVER · 50 Hz"; Pregnancy 5 showed half of the wall's circle, each the first
// use of its pane in the talk). The card layer now asks for the pane here and does not let the card in until it is in (CardLayer `go`), so the card is measured with the pane drawn in it, and
// ToolCardBody's lazy panes come from the same loaders, so there is one fetch and no second one.
import { useEffect, useState } from 'react';
import { retryImport } from '../../boot/lazy-retry.ts';

const LOADERS = {
  doppler: () => import('../tests/doppler/DopplerPane.tsx'),
  fibroscan: () => import('../tests/fibro/FibroPane.tsx'),
  endo: () => import('../tests/endo/EndoPane.tsx'),
} as const;
export type PaneKey = keyof typeof LOADERS;

/** The pane a slide's instrument kind mounts (the scope and the wall are one pane); null for a kind that is not a lazy pane. */
export function paneOf(kind: unknown): PaneKey | null {
  return kind === 'doppler' ? 'doppler' : kind === 'fibroscan' ? 'fibroscan' : kind === 'scope' || kind === 'wall' ? 'endo' : null;
}

const done = new Set<PaneKey>();
const asked = new Map<PaneKey, Promise<boolean>>();

/** Reads the pane's code in (once; a failed read, after three tries, is asked again on the next call). Resolves true when it is in; never rejects. */
export function loadPane(key: PaneKey): Promise<boolean> {
  if (done.has(key)) return Promise.resolve(true);
  let p = asked.get(key);
  if (!p) {
    p = retryImport(LOADERS[key] as () => Promise<unknown>).then(() => { done.add(key); return true; }, () => { asked.delete(key); return false; });
    asked.set(key, p);
  }
  return p;
}
export const paneIn = (key: PaneKey | null): boolean => key === null || done.has(key);
/** The module itself, for the lazy component that mounts it (the same fetch as loadPane's). */
export const paneModule = <K extends PaneKey>(key: K): ReturnType<(typeof LOADERS)[K]> => LOADERS[key]() as ReturnType<(typeof LOADERS)[K]>;

/** Whether the pane the slide's instrument needs is in (true at once for a slide with none); asks for it while it is not. A pane that cannot load leaves it false: the card layer's own give-up lets the card in. */
export function usePaneIn(kind: unknown): boolean {
  const key = paneOf(kind);
  const [, bump] = useState(0);
  useEffect(() => {
    if (key === null || done.has(key)) return;
    let on = true;
    void loadPane(key).then((ok) => { if (on && ok) bump((n) => n + 1); });
    return () => { on = false; };
  }, [key]);
  return paneIn(key);
}

