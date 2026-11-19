// The orders' reach into the app: the toast, the selection, the engine's own actions. Kept apart from orders.ts so a test can hand the orders a plain Env.
import type { Env } from './orders.ts';
import { useShell } from '../shell/store.ts';
import { selectStructure } from '../action/selection.ts';
import { engine } from '../../engine/boot.ts';

export const appEnv: Env = {
  say: (text) => useShell.getState().say(text),
  select: (sel) => selectStructure(sel),
  action: (action) => { engine().send({ type: 'action', action }); },
};
