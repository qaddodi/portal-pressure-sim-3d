// "The slide has landed" (2D presenter.js: the slide's own glows and marks, its time-lapse and its auto procedure all wait for the end of its move: the camera has landed, the new cards are
// in sight and the change of patient has eased in; `paintOverlays`, `playLapse`, `procPlay` run after it). One signal for all of them: a position begins a landing, it is over once the
// camera has been still and the cards all in for SEEN_MS together, and everything that waited is told once. Pure (the clock and the two probes are handed in), so a test walks it.

export const MIN_MS = 200;      // never sooner than this after the press: the camera and the cards have not yet been told at the press itself
export const SEEN_MS = 120;     // the camera still and every card in, for this long (2D CARDS_SEEN: the cards are in sight)
export const POLL_MS = 40;
export const GIVE_UP_MS = 6000; // a landing that never settles (a follow that never ends) lands anyway: nothing waits for good

export interface LandingEnv {
  /** The camera is still (no glide, no follow under way). */
  still(): boolean;
  /** Every card up is in (none leaving, none waiting to come in, none still entering). */
  cardsIn(): boolean;
  now(): number;
  later(fn: () => void, ms: number): unknown;
  cancel(h: unknown): void;
}

export function makeLanding(env: LandingEnv) {
  let key = '', landed = false, t0 = 0, since = -1, timer: unknown = null, gen = 0;
  const fns = new Set<(key: string) => void>();
  const land = () => {
    landed = true; timer = null;
    for (const f of [...fns]) { try { f(key); } catch (e) { console.error(e); } }
  };
  const poll = (g: number) => {
    if (g !== gen) return;
    const now = env.now(), age = now - t0;
    if (age >= GIVE_UP_MS) { land(); return; }
    if (age >= MIN_MS && env.still() && env.cardsIn()) { if (since < 0) since = now; if (now - since >= SEEN_MS) { land(); return; } } else since = -1;
    timer = env.later(() => poll(g), POLL_MS);
  };
  return {
    /** A position (a slide, a beat) begins its landing: whatever waited on the one before is dropped. */
    begin(k: string): void {
      gen++; if (timer != null) env.cancel(timer);
      key = k; landed = false; t0 = env.now(); since = -1;
      timer = env.later(() => poll(gen), POLL_MS);
    },
    /** Make sure the landing is for this position (begin it when it is not). */
    ensure(k: string): void { if (k !== key) this.begin(k); },
    get landed(): boolean { return landed; },
    get key(): string { return key; },
    /** `fn` runs at each landing; the remover. */
    on(fn: (key: string) => void): () => void { fns.add(fn); return () => { fns.delete(fn); }; },
    /** Drop the landing under way (the talk ended). */
    stop(): void { gen++; if (timer != null) env.cancel(timer); timer = null; landed = false; key = ''; },
  };
}
export type Landing = ReturnType<typeof makeLanding>;
