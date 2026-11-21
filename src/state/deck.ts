// Is a talk on, which, and where in it. ONE answer: `useUi` (src/ui/ui-store.ts: `deck`, `stops`, `pos`) holds it and this file only reads it.
// (Until 22 Nov it was three stores, `useDeck`, `useUi` and `useShell.mode`, copied into one another by subscription and closed by hand in three places, and they could disagree.)
// Slide 0 is the talk's title; slides 1..n follow (the quick check is the last). A talk starts with `startTalk` and ends with `closeTalk` (src/ui/shell/talk.ts).
import { useUi } from '../ui/ui-store.ts';

export const talkOn = (): boolean => useUi.getState().deck !== null;
export const talkId = (): string | null => useUi.getState().deck?.id ?? null;
/** The slide on show: 0 is the title. */
export const slideIndex = (): number => useUi.getState().pos.stop;
/** Slides after the title (0 when no talk is on). */
export const slideCount = (): number => Math.max(0, useUi.getState().stops.length - 1);
/** The same, as a hook: a component re-renders when a talk opens or closes. */
export const useTalkOn = (): boolean => useUi((s) => s.deck !== null);
