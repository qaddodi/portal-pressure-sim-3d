// Reads in a talk's charts (ToolCardBody.tsx: every chart family's card, model and data), a chunk of their own that a normal load never downloads.
// Kept apart from ToolCard.tsx so the talk's start (ui/shell/talk.ts) and the idle warm-up (boot/warm.ts) ask for the chunk without importing a component.
import type { ComponentType } from 'react';
import type { Deck, Slide } from '../../decks/schema.ts';

export type ToolCardProps = { deck: Deck; slide: Slide };
type Body = ComponentType<ToolCardProps>;
let body: Body | null = null;
let loading: Promise<boolean> | null = null;

/** Read the charts in (once; a failed read is tried again on the next ask). Resolves true when they are in; never rejects. */
export function loadToolCard(load: () => Promise<{ ToolCard: Body }> = () => import('./ToolCardBody.tsx')): Promise<boolean> {
  if (body) return Promise.resolve(true);
  return (loading ??= load().then((m) => { body = m.ToolCard; return true; }, (e) => { console.warn('[talk] the charts did not load:', e); loading = null; return false; }));
}
export const toolCardReady = (): boolean => body !== null;
export const toolCardBody = (): Body | null => body;
