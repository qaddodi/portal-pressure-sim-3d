// Starts the kill ledger on the preview copy (src/ui/debug/mount.ts): the keeper's boot, then the page's last moment every second while the page is visible (a timer, never a frame), and
// the alive mark cleared on pagehide. The Phone check and the Full check read the ledger (page/page.ts).
import { createKeeper, readLedger, ledgerLines } from './ledger.ts';
import { appSnapshot } from '../screen/app.ts';

import { clock } from '../../../clock/frame.ts';
let keeper: ReturnType<typeof createKeeper> | null = null;
const stores = () => { try { return { local: localStorage, session: sessionStorage }; } catch { return { local: null, session: null }; } };

export function mountKillLedger(): void {
  if (keeper) return;
  const { local, session } = stores();
  keeper = createKeeper({ local, session, device: () => appSnapshot().device });
  keeper.boot();
  const where = (): string => { const a = appSnapshot(); return a.deck ? `${a.deck.id} slide ${a.deck.number}` : `${a.view}${a.sheet ? ` + ${a.sheet}` : ''}${a.patient ? ` (${a.patient})` : ''}`; };
  clock.every(() => { if (document.visibilityState !== 'visible') return; const a = appSnapshot(); keeper!.tick(where(), a.memory.gpuMB ?? 0); }, 1000);
  addEventListener('pagehide', () => keeper?.end());
  addEventListener('pageshow', () => keeper?.back());
}

/** The ledger's lines for a report: what the estimate stood at each time a tab was ended on this device. */
export function killLedgerLines(): string[] { return ledgerLines(readLedger(stores().local)); }
