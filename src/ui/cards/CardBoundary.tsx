import { Component, type ReactNode } from 'react';
import { noteFault } from '../../boot/crash-net.ts';

/** A card that fails to render must never blank the app (the Back crash, 20 Nov: one card threw and React emptied the whole root).
 *  The cards go; the figure, the controls and the talk stay, and the next slide's cards try again (`resetKey`). */
export class CardBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: string | null }> {
  state = { failed: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { failed: e instanceof Error ? e.message : String(e) }; }
  componentDidCatch(e: unknown) { noteFault('react:card', e); console.error('[cards] a card failed to render; the deck goes on without it', e); }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: null }); }
  render() { return this.state.failed ? null : this.props.children; }
}
