// A new deploy reaches an open tab, whatever the service worker does (owner, 22 Nov: a tab kept an old build and he tested stale code without knowing).
// Two independent signals say a newer build is out: (1) the new worker took over (src/pwa/register.ts), (2) the page's own check: build-info.txt, which the deploy writes with the commit and which the worker never
// serves from a cache, differs from the commit this page was built from. The second does not depend on a worker update ever being noticed (an installed home-screen app, a failed install, an old worker).
// Once one is seen the tab is told, and moves onto the new build at a SAFE moment, eased, keeping what is on screen (reloadKeepingState):
//   out of sight (the tab is hidden)                                   at once, nothing on the screen jumps;
//   in front, on a preview build (VITE_CHANNEL=preview, the one he tests)   once nobody has touched the screen for IDLE_APPLY_MS, no finger is down and no talk plays; the page fades out over FADE_MS first, and a touch during the fade cancels it;
//   in front on the live site                                           never by itself: the update note stays up (sticky) and the build pill, where there is one, says so.
// A talk is never interrupted, in or out of sight. The build pill (ui/shell/BuildPill.tsx) always shows the RUNNING build's commit, and "update ready" beside it when a newer one is out.
import { useUpdate } from './update-state.ts';
import { clock } from '../clock/frame.ts';
import { talkOn } from '../state/deck.ts';
import { buildLabel } from '../ui/shell/build-pill.ts';
import { reloadKeepingState } from '../boot/reload.ts';

type Timer = ReturnType<typeof clock.after>;

/** How often the page asks the host which build is out while it is in front, how long the screen must be left alone before a preview moves by itself, and the fade before the reload. */
export const POLL_MS = 60_000, IDLE_APPLY_MS = 4000, FADE_MS = 300, TICK_MS = 1000;

/** The commit a deploy wrote into build-info.txt ("commit abc12345"), or ''. */
export const parseBuildCommit = (text: string): string => /^commit[ \t]+(\S+)/m.exec(text)?.[1] ?? '';
/** The newer build's commit when build-info.txt names another build than `mine`; null when it is the same, or either is unknown (a local run has no commit: nothing to compare). */
export const newerBuild = (mine: string, text: string): string | null => { const c = parseBuildCommit(text); return mine && c && c !== mine ? c : null; };

/** Whether the tab takes the newer build now, by itself, because it is out of sight (nothing on the screen jumps), a build is waiting, and no talk plays. */
export const takesOverNow = (s: { pending: boolean; hidden: boolean; mode: string }): boolean => s.pending && s.hidden && s.mode !== 'deck';

export interface Safe { pending: boolean; hidden: boolean; talk: boolean; down: boolean; idleMs: number; auto: boolean }
/** 'now' when the newer build may be taken this second, else 'wait'. Never in a talk, never with a finger or the pointer down. */
export function whenToApply(s: Safe): 'now' | 'wait' {
  if (!s.pending || s.talk) return 'wait';
  if (takesOverNow({ pending: s.pending, hidden: s.hidden, mode: 'figure' })) return 'now';
  return s.auto && !s.hidden && !s.down && s.idleMs >= IDLE_APPLY_MS ? 'now' : 'wait';
}

export interface UpdaterEnv {
  /** the commit this page was built from ('' in a local run: nothing is checked) */
  mine: string;
  /** in front on a preview build: may move by itself when it is quiet */
  auto: boolean;
  now(): number; hidden(): boolean; talk(): boolean;
  /** build-info.txt's text, or null when it could not be read */
  fetchInfo(): Promise<string | null>;
  /** leave for the newest build, keeping what is on the screen */
  reload(): void;
  /** the page's fade out (true) and back in (false) */
  fade(on: boolean): void;
  after(fn: () => void, ms: number): Timer; cancel(id: Timer): void;
  /** the note (a sticky line with Reload) */
  offer(): void;
}

export function createUpdater(env: UpdaterEnv) {
  let pending = false, applying = false, checking = false, down = false, lastInput = env.now(), timer: Timer | null = null;
  const apply = (): void => {
    if (applying) return;
    applying = true;
    if (env.hidden()) { env.reload(); return; }
    env.fade(true);
    timer = env.after(() => env.reload(), FADE_MS);
  };
  const u = {
    get pending() { return pending; },
    /** A newer build is out (`commit` '' when only the worker said so). Tells the pill and the note once. */
    found(commit: string): void {
      if (pending) return;
      pending = true;
      useUpdate.getState().found(commit);
      env.offer();
      u.tick();
    },
    /** Asks the host which build is out; a newer one is `found`. */
    async check(): Promise<void> {
      if (pending || checking || !env.mine) return;
      checking = true;
      try { const c = newerBuild(env.mine, (await env.fetchInfo()) ?? ''); if (c) u.found(c); } catch { /* offline: asked again later */ } finally { checking = false; }
    },
    /** The person touched the screen (`kind`: a finger or key went down, went up, or something else moved): a fade under way is taken back, and the quiet starts again. */
    input(kind: 'down' | 'up' | 'other' = 'other'): void {
      lastInput = env.now();
      if (kind === 'down') down = true; else if (kind === 'up') down = false;
      if (applying && !env.hidden()) { if (timer !== null) env.cancel(timer);
      env.fade(false); applying = false; }
    },
    /** The tab came to the front: its quiet starts then (it was not being looked at before). */
    shown(): void { lastInput = env.now(); down = false; },
    /** Once a second while a newer build waits, and when the tab goes out of sight. */
    tick(): void {
      if (whenToApply({ pending, hidden: env.hidden(), talk: env.talk(), down, idleMs: env.now() - lastInput, auto: env.auto }) === 'now') apply();
    },
  };
  return u;
}

/** Starts the page's own watch (a built page, once): input listeners, the build-info check when the tab comes to the front, comes back online and every POLL_MS while in front, and the apply tick.
 *  `offer` puts up the sticky note. Returns the updater, for the worker's signal. */
export function startUpdateWatch(offer: () => void): ReturnType<typeof createUpdater> {
  const root = document.documentElement;
  const u = createUpdater({
    mine: buildLabel(import.meta.env.VITE_BUILD), auto: import.meta.env.VITE_CHANNEL === 'preview',
    now: () => clock.now(), hidden: () => document.hidden, talk: talkOn,
    fetchInfo: async () => { const r = await fetch(new URL('build-info.txt', document.baseURI), { cache: 'no-store' }); return r.ok ? r.text() : null; },
    reload: () => { void reloadKeepingState(); },
    fade: (on) => { root.style.transition = `opacity ${FADE_MS}ms ease`; root.style.opacity = on ? '0' : ''; },
    after: (fn, ms) => clock.after(fn, ms), cancel: (id) => clock.cancel(id),
    offer,
  });
  const o = { passive: true, capture: true } as const;
  addEventListener('pointerdown', () => u.input('down'), o);
  for (const t of ['pointerup', 'pointercancel']) addEventListener(t, () => u.input('up'), o);
  for (const t of ['keydown', 'wheel', 'touchstart', 'touchmove', 'scroll']) addEventListener(t, () => u.input('other'), o);
  const ask = () => { if (!document.hidden) void u.check(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) u.tick(); else { u.shown(); ask(); } });
  addEventListener('pageshow', ask); addEventListener('online', ask);
  clock.every(ask, POLL_MS);
  clock.every(() => u.tick(), TICK_MS);
  clock.after(ask, 5000);
  return u;
}
