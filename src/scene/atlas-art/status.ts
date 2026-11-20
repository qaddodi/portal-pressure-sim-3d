// Where the atlas art is: nothing loaded (Classic, or Atlas not asked for yet), loading, showing, or failed (the figure stays Classic and Settings says so).
// A tiny store of its own so Settings can show it without importing the loader (and three.js with it).
import { create } from 'zustand';

export type AtlasStatus = 'off' | 'loading' | 'on' | 'failed';
export const useAtlasStatus = create<{ status: AtlasStatus }>(() => ({ status: 'off' }));
export const setAtlasStatus = (status: AtlasStatus): void => { if (useAtlasStatus.getState().status !== status) useAtlasStatus.setState({ status }); };
