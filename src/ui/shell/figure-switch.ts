// The one writer of a figure switch (audit W2). A switch has one owner: the Blood menu's six live in the scene's `useBlood` (chevrons, key chevrons, key streaks, pressure values,
// potential collaterals, organ names; organ names also in the labels' `useLabels`), the lobule's three layers (zones, lymph, bile) in the shell's `figure`. The menus (FigureMenu)
// and a link or bug packet (share-apply) both write through here, so a link changes the figure exactly as the tap does, and `figureNow` (share-wire) reads the owners back.
import { useBlood, type BloodChoice } from '../../scene/blood/options.ts';
import { useLabels } from '../../scene/labels/store.ts';
import { sceneApi } from '../../scene/api.ts';
import { talkOn } from '../../state/deck.ts';
import { useShell } from './store.ts';

export const BLOOD_SWITCHES = ['chevrons', 'keyChevrons', 'keyStreaks', 'chips', 'collaterals', 'labels'] as const satisfies readonly (keyof BloodChoice)[];
export const LAYER_SWITCHES = ['zones', 'lymph', 'bile'] as const;
export type BloodSwitch = (typeof BLOOD_SWITCHES)[number];
export type LayerSwitch = (typeof LAYER_SWITCHES)[number];
export type FigureSwitch = BloodSwitch | LayerSwitch;

export const isBloodSwitch = (k: string): k is BloodSwitch => (BLOOD_SWITCHES as readonly string[]).includes(k);
export const isLayerSwitch = (k: string): k is LayerSwitch => (LAYER_SWITCHES as readonly string[]).includes(k);

/** Turn a figure switch on or off through its owner and tell the scene (it eases: nothing pops). Returns false for a key that is no switch. */
export function setFigureSwitch(key: string, on: boolean): boolean {
  if (isBloodSwitch(key)) {
    sceneApi.setBlood({ [key]: on }, talkOn());
    if (key === 'labels') useLabels.getState().set({ organNames: on });
    return true;
  }
  if (isLayerSwitch(key)) {
    useShell.getState().setFigure({ [key]: on });
    sceneApi.setLobuleLayers({ [key]: on });
    return true;
  }
  return false;
}

/** Every switch as it stands now, read from its owner. */
export function figureSwitches(): Record<FigureSwitch, boolean> {
  const b = useBlood.getState(), f = useShell.getState().figure;
  return { chevrons: b.chevrons, keyChevrons: b.keyChevrons, keyStreaks: b.keyStreaks, chips: b.chips, collaterals: b.collaterals, labels: b.labels, zones: f.zones, lymph: f.lymph, bile: f.bile };
}
