// The orders' reach into the app: the toast, the selection, the engine's own actions. Kept apart from orders.ts so a test can hand the orders a plain Env.
import type { Env } from './orders.ts';
import { useShell } from '../shell/store.ts';
import { selectStructure } from '../action/selection.ts';
import { sendAction } from '../action/send.ts';
import { useTreat } from './store.ts';
import { useUi } from '../ui-store.ts';
import { isPhone } from '../layout/device.ts';

export const appEnv: Env = {
  say: (text) => useShell.getState().say(text),
  select: (sel) => {
    selectStructure(sel);
    // (the Ascites instrument is a sheet of its own: on a phone, which has room for one, Treat gives way to it, as it does to a structure's card)
    if (sel?.type === 'organ' && sel.id === 'abdomen' && isPhone(useUi.getState().device)) useTreat.getState().setOpen(false);
  },
  action: (action) => sendAction(action),
};
