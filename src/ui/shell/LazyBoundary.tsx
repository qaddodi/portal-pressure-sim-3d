import { Component, Suspense, useLayoutEffect, useRef, type ReactNode } from 'react';
import './shell.css';
import { chunkProblem, retryFailedChunks } from '../../boot/lazy-retry.ts';
import { reloadKeepingState } from '../../boot/reload.ts';
import { noteFault } from '../../boot/crash-net.ts';
import { APP_CRASH } from './words.ts';
import { waitCue } from './wait-cue.ts';
import { D_SMALL, fadeMs } from '../a11y/motion.ts';
import { EASE_ARRIVE } from '../motion.ts';

/** Around every lazily loaded part (an instrument's pane, a card's pane): Suspense with nothing shown while it comes, and when it cannot come after three tries, one line in its place with Try again and (when a newer build
 *  may be out) Reload. Back online it asks again by itself. A pane that fails to render says so the same way, and the rest of the card stays. The note eases in (shell.css `.sh-lazyfail`). */
export class LazyBoundary extends Component<{ children: ReactNode; resetKey?: string; /** the pane's known height in px: the placeholder holds it while the code comes (a plot's `p.plot`) */ height?: number }, { error: unknown; failed: boolean }> {
  state = { error: null as unknown, failed: false };
  /** Set when the placeholder was shown: the code was not here, so the part fades in when it lands (Arrive), and a part that was already here appears as it always did. */
  private late = false;
  private markLate = () => { this.late = true; };
  private isLate = () => this.late;
  static getDerivedStateFromError(error: unknown) { return { error, failed: true }; }
  componentDidCatch(e: unknown) { noteFault('react:lazy', e); console.warn('[lazy] a part failed to load or render', e); window.addEventListener('online', this.again, { once: true }); }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.failed && prev.resetKey !== this.props.resetKey) this.again(); }
  componentWillUnmount() { window.removeEventListener('online', this.again); }
  again = () => { window.removeEventListener('online', this.again); retryFailedChunks(); this.setState({ error: null, failed: false }); };
  render() {
    if (!this.state.failed) {
      return (
        <Suspense fallback={<Hold height={this.props.height} onLate={this.markLate} />}>
          {this.props.children}
          <Arrive late={this.isLate} />
        </Suspense>
      );
    }
    const p = chunkProblem(this.state.error);
    return (
      <div className="sh-lazyfail" role="alert">
        <span>{p.text}</span>
        {p.again && <button type="button" onClick={this.again}>Try again</button>}
        {p.reload && <button type="button" onClick={() => { void reloadKeepingState(); }}>{APP_CRASH.reload}</button>}
      </div>
    );
  }
}

/** The place of a part whose code has not arrived (splash plan A4): a quiet frame at the pane's height, fading in, and the shared wait cue if the wait passes 400 ms (no spinner before). */
function Hold({ height, onLate }: { height?: number; onLate(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { onLate(); return waitCue('this part', { host: ref.current, after: 400 }); }, [onLate]);
  return <div ref={ref} className="sh-lazyhold" style={height ? { minHeight: height } : undefined} aria-hidden="true" />;
}

/** Mounts with the part itself, as its next sibling (hidden: no box, no layout): when the part had to wait, the element before it fades in over --d-small, so it never pops. A wrapper element would break the panes' child selectors (`.dock-pane > .instrument-view`). */
function Arrive({ late }: { late(): boolean }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const part = ref.current?.previousElementSibling;
    if (late() && part && typeof part.animate === 'function') part.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fadeMs(D_SMALL), easing: EASE_ARRIVE });
  }, [late]);
  return <i ref={ref} hidden className="sh-lazymark" />;
}
