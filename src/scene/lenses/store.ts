// Which lens the figure wears, for the menu, the legend and the top bar to read. Set through sceneApi.setLens (it also tells the scene).
import { create } from 'zustand';
import { DEFAULT_LENS, type LensId } from './model.ts';

export const useLens = create<{ lens: LensId }>(() => ({ lens: DEFAULT_LENS }));
