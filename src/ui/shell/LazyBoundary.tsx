import { Component, Suspense, type ReactNode } from 'react';
import './shell.css';
import { chunkProblem, retryFailedChunks } from '../../boot/lazy-retry.ts';
import { reloadKeepingState } from '../../boot/reload.ts';
import { APP_CRASH } from './words.ts';

/** Around every lazily loaded part (an instrument's pane, a card's pane): Suspense with nothing shown while it comes, and when it cannot come after three tries, one line in its place with Try again and (when a newer build
 *  may be out) Reload. Back online it asks again by itself. A pane that fails to render says so the same way, and the rest of the card stays. The note eases in (shell.css `.sh-lazyfail`). */
export class LazyBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: unknown; failed: boolean }> {
  state = { error: null as unknown, failed: false };
  static getDerivedStateFromError(error: unknown) { return { error, failed: true }; }
  componentDidCatch(e: unknown) { console.warn('[lazy] a part failed to load or render', e); window.addEventListener('online', this.again, { once: true }); }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.failed && prev.resetKey !== this.props.resetKey) this.again(); }
  componentWillUnmount() { window.removeEventListener('online', this.again); }
  again = () => { window.removeEventListener('online', this.again); retryFailedChunks(); this.setState({ error: null, failed: false }); };
  render() {
    if (!this.state.failed) return <Suspense fallback={null}>{this.props.children}</Suspense>;
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
