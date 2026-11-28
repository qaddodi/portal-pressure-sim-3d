// The global net for what an error boundary cannot see: a throw in an event handler or a timer (window `error`), a promise nobody caught (`unhandledrejection`), and a clock system that throws (the frame loop
// catches it so one system cannot stop the others, then asks this). Every fault is kept (the last 20), counted as `caught()` for the audit, written into Send feedback's report and the crash cards' Copy details.
// When the app is left broken (BROKEN_COUNT faults inside BROKEN_WINDOW_MS: a storm, not a stray) the same quiet recovery as a lost graphics context appears: a pill that fades in with Reload, Copy details and Keep going
// (ErrorNote.tsx). Keep going silences the pill for QUIET_MS; the faults are still kept. Nothing here runs per frame, and nothing is sent anywhere.
import { create } from 'zustand';
import { caught } from '../ui/debug/caught.ts';
import { setClockFaultSink, clock } from '../clock/frame.ts';

export interface Fault {
  site: string; message: string; stack: string; at: number;
  /** the build, the view (its route only, never the link's script or numbers) and the wall-clock time: which build broke, where, and when */
  build?: string; view?: string; when?: string;
}
/** The ring is also kept in sessionStorage (this tab only, gone when the tab closes), so a reload after a crash still has what led to it.
 *  Nothing here leaves the device unless the person sends the draft. */
export interface FaultStore { load(): Fault[]; save(f: readonly Fault[]): void }
export const FAULT_KEY = 'pps3d.errors';
export function sessionFaultStore(s: Pick<Storage, 'getItem' | 'setItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage): FaultStore {
  return {
    load() {
      try {
        const a: unknown = JSON.parse(s?.getItem(FAULT_KEY) ?? '[]');
        return Array.isArray(a) ? a.filter((f): f is Fault => !!f && typeof f.message === 'string' && typeof f.site === 'string').slice(-KEEP) : [];
      } catch { return []; }
    },
    save(f) { try { s?.setItem(FAULT_KEY, JSON.stringify(f)); } catch { /* storage blocked or full: the memory ring still stands */ } },
  };
}
/** The view as the report names it: the hash's route, cut before any `=`, `?` or `&`, so a shared script's content never rides along. */
export const viewOf = (hash: string): string => hash.split(/[?=&]/)[0]!.slice(0, 60) || '/';
export const BROKEN_COUNT = 5, BROKEN_WINDOW_MS = 10_000, QUIET_MS = 60_000, KEEP = 20;

/** Faults that are noise or already handled elsewhere: the browser's harmless resize notice, an aborted request, a cross-origin "Script error.", a browser extension's own error, a lazy part's ChunkError (its pane says so),
 *  and a network failure while offline. Never counted toward "broken" and never listed. */
export function ignorable(message: string, name: string, file: string, online: boolean): boolean {
  if (/ResizeObserver loop/i.test(message)) return true;
  if (name === 'AbortError' || /\bAbortError\b|The operation was aborted/i.test(message)) return true;
  if (name === 'ChunkError') return true;
  if (/^Script error\.?$/i.test(message.trim())) return true;
  if (/^(chrome|moz|safari)-extension:/.test(file) || /(chrome|moz|safari)-extension:\/\//.test(message)) return true;
  if (!online && /Failed to fetch|Load failed|NetworkError|network error/i.test(message)) return true;
  return false;
}

/** What is kept of a thrown value: its message's first line and the first three lines of its stack, shortened (a report, not a dump). */
export function toFault(site: string, e: unknown, at: number): Fault {
  const o = (e && typeof e === 'object' ? e : {}) as { message?: unknown; stack?: unknown; name?: unknown };
  const message = String(typeof e === 'string' ? e : o.message ?? e).split('\n')[0]!.slice(0, 160);
  const stack = typeof o.stack === 'string' ? o.stack.split('\n').filter((l) => /^\s*at |@/.test(l)).slice(0, 3).map((l) => l.trim().slice(0, 120)).join(' | ') : '';
  return { site, message: message || 'Error', stack, at: Math.round(at) };
}

export interface Net {
  /** A fault happened. `count: false` keeps it for the reports without counting it toward "broken" (a boundary already showed its card). */
  report(site: string, e: unknown, o?: { count?: boolean; /** the script that threw, as the window event gives it */ file?: string }): void;
  /** Keep going: the pill is put away and the count starts again after QUIET_MS. */
  dismiss(): void;
  recent(): readonly Fault[];
}
export function createNet(o: { now(): number; online(): boolean; onBroken(): void; onQuiet?(): void; store?: FaultStore; /** build, view and wall-clock time for a fault */ ctx?(): Pick<Fault, 'build' | 'view' | 'when'> }): Net {
  const faults: Fault[] = o.store?.load() ?? [];
  let stamps: number[] = [], broken = false, quietUntil = 0;
  return {
    report(site, e, opts) {
      const t = o.now();
      const raw = (e && typeof e === 'object' ? e : {}) as { name?: unknown; filename?: unknown };
      const f = { ...toFault(site, e, t), ...(o.ctx?.() ?? {}) };
      if (ignorable(f.message, String(raw.name ?? ''), String(opts?.file ?? raw.filename ?? ''), o.online())) return;
      faults.push(f); if (faults.length > KEEP) faults.shift();
      o.store?.save(faults);
      if (opts?.count === false || broken || t < quietUntil) return;
      stamps = stamps.filter((s) => t - s <= BROKEN_WINDOW_MS); stamps.push(t);
      if (stamps.length >= BROKEN_COUNT) { broken = true; o.onBroken(); }
    },
    dismiss() { broken = false; stamps = []; quietUntil = o.now() + QUIET_MS; o.onQuiet?.(); },
    recent: () => faults.slice(),
  };
}

export const useCrashNet = create<{ broken: boolean }>(() => ({ broken: false }));
const now = () => (typeof performance !== 'undefined' ? clock.now() : Date.now());
const here = (): Pick<Fault, 'build' | 'view' | 'when'> => ({
  build: String(import.meta.env.VITE_BUILD ?? 'dev'), view: typeof location === 'undefined' ? '' : viewOf(location.hash), when: new Date().toISOString(),
});
const net = createNet({
  now, online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  onBroken: () => useCrashNet.setState({ broken: true }), onQuiet: () => useCrashNet.setState({ broken: false }), store: sessionFaultStore(), ctx: here,
});
export const dismissBroken = (): void => net.dismiss();
/** Keep a fault for the reports without counting it (an error boundary caught it). */
export const noteFault = (site: string, e: unknown): void => { caught(site, e); net.report(site, e, { count: false }); };
export const recentFaults = (): readonly Fault[] => net.recent();
/** The faults as lines for a report; newest last. */
const faultLine = (f: Fault): string => {
  const at = `${f.when ? `${f.when} ` : ''}${f.site} ${f.at} ms${f.build ? ` build ${f.build}` : ''}${f.view ? ` view ${f.view}` : ''}`;
  return `[${at}] ${f.message}${f.stack ? ` — ${f.stack}` : ''}`;
};
export const faultsText = (n = KEEP): string => net.recent().slice(-n).map(faultLine).join('\n');

/** What a bug report needs from a crash: the message, the build, the browser, and the faults the page kept. */
export const crashDetails = (message: string, build: string, ua: string, faults = ''): string => `${message}\nBuild: ${build}\nBrowser: ${ua}${faults ? `\nRecent errors:\n${faults}` : ''}`;
export const detailsNow = (message: string): string => crashDetails(message, String(import.meta.env.VITE_BUILD ?? 'dev'), typeof navigator === 'undefined' ? '' : navigator.userAgent, faultsText());

let installed = false;
/** Once, at the top of main.tsx (before the app, so a boot fault counts too). */
export function installCrashNet(win: Window = window): void {
  if (installed) return;
  installed = true;
  win.addEventListener('error', (e) => { caught('window', e.error ?? e.message); net.report('window', e.error ?? e.message, { file: e.filename }); });
  win.addEventListener('unhandledrejection', (e) => { caught('promise', e.reason); net.report('promise', e.reason); });
  setClockFaultSink((phase, err) => { caught(`clock:${phase}`, err); net.report(`clock:${phase}`, err); });
}
