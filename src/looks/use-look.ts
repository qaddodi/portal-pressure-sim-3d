// The look a component draws in: the one the page and the figure are painted in NOW (looks/glide.ts), never the settings store's choice, which changes a step ahead of them. A component that
// read the store re-rendered the moment the person tapped, so the labels, the key, the charts and the cards took the new colours before the figure's palette and outside the cross-fade
// (owner, 22 Nov: "the labels are changing colour first before the palette"). Every component that draws in the look reads it here, so they all fade in the same transition.
import { useSyncExternalStore } from 'react';
import { lookGlide } from './glide.ts';
import { resolveLook, type LookId } from './looks.ts';
import { useSettings } from '../state/settings.ts';

const now = (): LookId => lookGlide.current ?? resolveLook(useSettings.getState().look, typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
const watch = (fn: () => void) => lookGlide.watch(fn);

/** The look in force (what the figure and the page wear), as a hook. */
export function useLookId(): LookId { return useSyncExternalStore(watch, now, now); }
