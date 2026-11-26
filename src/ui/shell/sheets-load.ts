// Everything that opens over the figure from the bars (the main menu, Settings, Search, History, the timeline chart, Why, the Treat card, the dialogs: ui/shell/Sheets.tsx, about 85 files and
// their styles) is a chunk of its own. A normal load draws the figure and the bars and has every one of these closed, so none of it is downloaded, parsed or run before the first picture;
// the shell mounts it (ui/shell/SheetsSlot.tsx) once the cover is up, or at once when something opens it first.
// Kept apart from Sheets.tsx so the shell asks for the chunk without importing the component.
import type { ComponentType } from 'react';
import { lazyPart } from '../../boot/lazy-part.ts';

export const sheetsPart = lazyPart<ComponentType>(() => import('./Sheets.tsx').then((m) => m.Sheets));
export const loadSheets = (): Promise<boolean> => sheetsPart.load();
