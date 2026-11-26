// What the page knows of the model patients without loading one: whether an id is one, its name, and the preset it began from.
import { HISTORIES } from './index.generated.ts';
import type { HistoryMeta } from './types.ts';

export const historyOf = (id: string | null | undefined): HistoryMeta | undefined => (id && id.startsWith('hist-') ? HISTORIES.find((h) => h.id === id) : undefined);
export const isHistory = (id: string | null | undefined): boolean => !!historyOf(id);
export const historyName = (id: string | null | undefined): string => historyOf(id)?.name ?? '';
/** The id a shared link can carry: a model patient's settings are shared on the preset it began from (the link has no history). */
export const shareableId = (id: string): string => historyOf(id)?.preset ?? id;
/** A model patient's chapters (authored in courses.ts, anchored to its steps, baked as days); any other patient's are derived from its History (timeline/story.ts). */
export const chaptersOf = (id: string | null | undefined): readonly { from: number; label: string }[] | null => historyOf(id)?.chapters ?? null;
