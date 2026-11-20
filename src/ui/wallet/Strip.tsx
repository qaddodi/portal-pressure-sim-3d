import type { Entry } from '../cards/stack.ts';
import { EXIT_MS } from '../cards/stack.ts';
import { useEffect } from 'react';
import type { Rect } from '../layout/device.ts';
import { useGesture } from './useSwipe.ts';
import { isSwapSwipe, isTap, stripLabel } from './wallet-machine.ts';
import type { Slot } from '../layout/plan.ts';
import { useUi } from '../ui-store.ts';
import { layoutOf } from '../layout/rules2d.ts';

interface Props { entry: Entry; rect: Rect; behind: Slot; hvpg: string | null; slideTitle: string; /** the reader's dock: the data card's 34 px edge (2D), a grab bar and no name */ dock?: boolean; onSwap(): void; onGone(key: string): void }

/** The card that is not showing, as a 48 px strip at the foot, drawn by the 2D wallet rules (`.pz-shuf`: the grab bar is its ::before, the name its ::after from `data-strip`): tap it, or swipe up or down, to bring that card forward. */
export function Strip({ entry, rect, behind, hvpg, slideTitle, dock, onSwap, onGone }: Props) {
  const out = entry.phase === 'out';
  const vp = useUi((st) => st.vp);
  const lay = layoutOf(vp.w, vp.h), stackCls = lay === 'stack' ? ' stack' : lay === 'tab' ? ' stack tab' : '';
  const label = stripLabel(behind, hvpg, slideTitle);
  const g = useGesture((gesture) => { if (isTap(gesture) || isSwapSwipe(gesture)) onSwap(); });
  useEffect(() => { if (!out) return; const t = setTimeout(() => onGone(entry.key), EXIT_MS + 120); return () => clearTimeout(t); }, [out, entry.key, onGone]);
  return (
    <div className="dk-pos" style={{ width: rect.w, transform: `translate3d(${rect.x}px, ${rect.y}px, 0)` }}>
      <button type="button" className={`dk-strip pz-shade pz-card${stackCls} pz-shuf`} data-strip={`${label.lead}${label.rest ? ` · ${label.rest}` : ''}`} data-phase={out ? 'out' : 'in'} data-dock={dock || undefined} aria-label={`Show ${label.lead.toLowerCase()}${label.rest ? `: ${label.rest}` : ''}`}
        {...g} onClick={(e) => { if (e.detail === 0) onSwap(); }} onAnimationEnd={(e) => { if (out && e.target === e.currentTarget) onGone(entry.key); }}>
      </button>
    </div>
  );
}
