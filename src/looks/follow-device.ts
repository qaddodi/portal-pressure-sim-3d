// Under "System" the look follows the device's light/dark setting, but never while the page is hidden (plan 29). iOS flips a web view to light, then back, only to take the app switcher's two snapshots:
// applied while hidden, the app really turned Light, and the dark event arrived on return and glided Light -> Dark in front of the person. So a hidden page ignores the device; on return the scheme is read
// again and, if the device really did change while away, applied at once (nothing to glide from: the page was not seen). A device event in the first moments after return is the stale half of that
// snapshot pair and is applied at once too, never glided. While visible, a real change (Control Centre) still glides.
import { clock } from '../clock/frame.ts';
import { resolveLook, type LookChoice, type LookId } from './looks.ts';

export const RETURN_SETTLE_MS = 500;
interface Glide { readonly current: LookId | null; change(next: LookId, opts?: { instant?: boolean }): void }
interface Opts {
  doc: { visibilityState: string; addEventListener(t: string, fn: () => void): void };
  win: { addEventListener(t: string, fn: () => void): void };
  mq: { matches: boolean; addEventListener(t: 'change', fn: () => void): void };
  glide: Glide;
  choice(): LookChoice;
  now?(): number;
}

export function followDevice(o: Opts): void {
  const now = o.now ?? (() => clock.now());
  const visible = () => o.doc.visibilityState === 'visible';
  const next = () => resolveLook(o.choice(), o.mq.matches);
  let shownAt = -Infinity;
  const settle = () => {
    if (!visible()) return;
    shownAt = now();
    const n = next();
    if (n !== o.glide.current) o.glide.change(n, { instant: true });
  };
  o.mq.addEventListener('change', () => {
    if (!visible()) return;   // iOS's snapshot flips: never applied
    o.glide.change(next(), { instant: now() - shownAt < RETURN_SETTLE_MS });
  });
  o.doc.addEventListener('visibilitychange', settle);
  o.win.addEventListener('pageshow', settle);
}
