// The slide list (G while presenting; the 2D toggleJump): every stop with its number, grouped by kicker, the one on show marked. A tap or Enter goes there. Up and Down move the focus.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useUi } from '../ui-store.ts';
import { W } from './words.ts';
import { Icon } from '../shell/icons.tsx';
import { viewsOf } from './presenter-link.ts';

export function JumpList() {
  const deck = useUi((s) => s.deck), open = useUi((s) => s.jump), at = useUi((s) => s.pos.stop);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const cur = ref.current?.querySelector<HTMLElement>('[aria-current]');
    cur?.focus({ preventScroll: true }); cur?.scrollIntoView({ block: 'center' });
    const key = (e: KeyboardEvent) => {
      const btns = [...(ref.current?.querySelectorAll<HTMLElement>('.dk-jump-list button') ?? [])], i = btns.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus(); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [open]);
  if (!deck) return null;
  const views = viewsOf(deck);
  const groups: { k: string; items: number[] }[] = [];
  views.forEach((v, i) => { if (groups.at(-1)?.k !== v.kicker) groups.push({ k: v.kicker, items: [] }); groups.at(-1)!.items.push(i); });
  const close = () => useUi.getState().setJump(false);
  return (
    <nav ref={ref} className="dk-jump" data-open={open} aria-label={W.jumpTitle} inert={!open}>
      <div className="dk-jump-h"><span>{deck.title}</span><button type="button" aria-label={W.jumpClose} onClick={close}><Icon n="close" /></button></div>
      <div className="dk-jump-list">
        {groups.map((g, gi) => (
          <section key={gi}>
            {g.k ? <h3>{g.k}</h3> : null}
            <ol>{g.items.map((i) => (
              <li key={i}><button type="button" aria-current={i === at ? 'true' : undefined} onClick={() => { close(); useUi.getState().go(i); }}><span className="n">{i + 1}</span><span className="t">{views[i].title}</span></button></li>
            ))}</ol>
          </section>
        ))}
      </div>
    </nav>
  );
}

/** The black screen (B, . or W): the page fades to black and back; a tap on it puts it away. */
export function BlackScreen() {
  const on = useUi((s) => s.black);
  return createPortal(<div className="dk-black" data-on={on} aria-hidden="true" onPointerDown={() => useUi.getState().setBlack(false)} />, document.body);
}
