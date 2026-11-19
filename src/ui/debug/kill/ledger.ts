// The tab-kill ledger (the 2D app's kill-ledger.js, bible review 19 Nov 2026, 5.5 gap 6). Safari exposes no process memory, so the only way to learn what the page held when the browser
// ended its tab is to write down its last moment (where it was, its own GPU memory estimate and the highest it reached) and read it in the next page. A kill gives no warning: the page's
// last moment is written while it runs, and a boot that finds the "alive" mark still set knows the page before it was ended without unloading. Each such moment is kept here, so the
// Phone check and the Full check can print what the estimate stood at every time a tab was ended on this device. Local only (the keys are `pps.kills`, `pps.alive` and `pps.last`);
// nothing is sent. Pure: handed storages, a clock and the numbers, so a Node test drives it.
export const KILLS_KEY = 'pps.kills', ALIVE_KEY = 'pps.alive', LAST_KEY = 'pps.last', KILLS_MAX = 12;

export interface Moment { where: string; mb: number; peak: number; s: number }
export interface Kill extends Moment { at: string; device: string }
export interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** The ledger as stored, oldest first. Never throws. */
export function readLedger(storage: Store | null | undefined): Kill[] {
  try { const v = JSON.parse(storage?.getItem(KILLS_KEY) || '[]'); return Array.isArray(v) ? v.filter((k) => k && typeof k === 'object') : []; } catch { return []; }
}

/** Adds one kill (the page's last moment, read after the tab was ended) and keeps the last KILLS_MAX. Returns the ledger. */
export function addKill(storage: Store | null | undefined, last: Partial<Moment> | null, { at = new Date().toISOString(), device = '' }: { at?: string; device?: string } = {}): Kill[] {
  const list = readLedger(storage);
  if (!last || typeof last.where !== 'string') return list;
  list.push({ at, where: last.where.slice(0, 80), mb: +(last.mb ?? 0) || 0, peak: +(last.peak ?? 0) || 0, s: +(last.s ?? 0) || 0, device: String(device).slice(0, 20) });
  if (list.length > KILLS_MAX) list.splice(0, list.length - KILLS_MAX);
  try { storage?.setItem(KILLS_KEY, JSON.stringify(list)); } catch { /* storage full or blocked: the kill is still in this page's notes */ }
  return list;
}

/** The ledger as the lines the Phone check and the Full check print: when, where, the estimate then, its highest, how long the page had been open. */
export function ledgerLines(list: readonly Kill[]): string[] {
  if (!list.length) return ['KILL LEDGER: no tab ended on this device since the ledger began.'];
  const mbs = list.map((k) => k.mb).filter((n) => n > 0);
  const head = `KILL LEDGER (${list.length} tab${list.length === 1 ? '' : 's'} ended on this device; the page's own GPU estimate at the last moment it wrote${mbs.length ? `: lowest ${Math.min(...mbs)} MB, highest ${Math.max(...mbs)} MB` : ''}; Safari gives no process memory, so calibrate the memory limit from these):`;
  return [head, ...list.map((k) => `  ${String(k.at).slice(0, 16).replace('T', ' ')}  ${k.mb} MB (highest ${k.peak}), ${k.s} s after opening, at ${k.where}${k.device ? ` [${k.device}]` : ''}`)];
}

export interface KeeperEnv {
  /** where the ledger lives (localStorage: kept across tabs) and where the page's own marks live (sessionStorage: this tab) */
  local: Store | null; session: Store | null;
  device: () => string;
  now?: () => number;
}

/**
 * The keeper: `boot()` once at start (a boot that finds the alive mark still set adds the page before it to the ledger), `tick(where, mb)` now and then (writes the last moment
 * only when where it is or its memory, in steps of 10 MB, changed), `end()` on pagehide, `back()` on pageshow (back from the page cache: alive again).
 */
export function createKeeper(env: KeeperEnv) {
  const now = env.now ?? (() => Date.now());
  const t0 = now();
  let lastKey = '', peak = 0, killed = false;
  const put = (s: Store | null, k: string, v: string) => { try { s?.setItem(k, v); } catch { /* blocked */ } };
  return {
    /** Returns the ledger after this boot (with the page before added when it was ended without unloading). */
    boot(): Kill[] {
      let list = readLedger(env.local);
      try {
        if (env.session?.getItem(ALIVE_KEY) === '1') {
          killed = true;
          const l = JSON.parse(env.session.getItem(LAST_KEY) || 'null') as Partial<Moment> | null;
          list = addKill(env.local, l, { at: new Date(now()).toISOString(), device: env.device() });
        }
      } catch { /* a last moment that cannot be read is left out */ }
      put(env.session, ALIVE_KEY, '1');
      return list;
    },
    tick(where: string, mb: number): void {
      peak = Math.max(peak, mb);
      const key = `${where}|${Math.round(mb / 10)}`;
      if (key === lastKey) return;
      lastKey = key;
      put(env.session, LAST_KEY, JSON.stringify({ where: String(where).slice(0, 80), mb: Math.round(mb), peak: Math.round(peak), s: Math.round((now() - t0) / 1000) }));
    },
    end(): void { put(env.session, ALIVE_KEY, ''); },
    back(): void { put(env.session, ALIVE_KEY, '1'); },
    get killed(): boolean { return killed; },
  };
}
