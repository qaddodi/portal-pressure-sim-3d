// Reads in a talk's charts (ToolCardBody.tsx: every chart family's card, model and data), a chunk of their own that a normal load never downloads.
// Kept apart from ToolCard.tsx so the talk's start (ui/shell/talk.ts) and the idle warm-up (boot/warm.ts) ask for the chunk without importing a component.
import type { ComponentType } from 'react';
import type { Deck, Slide } from '../../decks/schema.ts';

export type ToolCardProps = { deck: Deck; slide: Slide };
type Body = ComponentType<ToolCardProps>;
let body: Body | null = null;
let loading: Promise<boolean> | null = null;

/** Read the charts in (once; a failed read is tried again on the next ask). Resolves true when they are in; never rejects. */
/** The instruments' panes a slide's card mounts lazily (Doppler, FibroScan, the scope and wall): read in with the charts, so the card never mounts its placeholder (a box a third of the pane's height) and then grows when the code lands. */
const panes = (): Promise<unknown> => Promise.all([import('../tests/doppler/DopplerPane.tsx'), import('../tests/fibro/FibroPane.tsx'), import('../tests/endo/EndoPane.tsx')]).catch(() => undefined);
export function loadToolCard(load: () => Promise<{ ToolCard: Body }> = () => import('./ToolCardBody.tsx').then(async (m) => { await panes(); return m; })): Promise<boolean> {
  if (body) return Promise.resolve(true);
  return (loading ??= load().then((m) => { body = m.ToolCard; return true; }, (e) => { console.warn('[talk] the charts did not load:', e); loading = null; return false; }));
}
export const toolCardReady = (): boolean => body !== null;
export const toolCardBody = (): Body | null => body;
