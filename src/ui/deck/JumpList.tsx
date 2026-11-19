// The slide list (G while presenting; the 2D toggleJump): every stop with its number, grouped by kicker, the one on show marked. A tap or Enter goes there. Up and Down move the focus.
// The markup and classes are the 2D app's own (presenter.js toggleJump: nav.pz-jump > .pzj-h, .pzj-list), so its lifted stylesheet (css2d/app-05-presenter-cards.css) draws it.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUi } from '../ui-store.ts';
import { W } from './words.ts';
import { Icon } from '../shell/icons.tsx';
import { viewsOf, jumpGroups } from './presenter-link.ts';

export function JumpList() {
  const deck = useUi((s) => s.deck), open = useUi((s) => s.jump), at = useUi((s) => s.pos.stop);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const cur = ref.current?.querySelector<HTMLElement>('[aria-current]');
    cur?.focus({ preventScroll: true }); cur?.scrollIntoView({ block: 'center' });
    const key = (e: KeyboardEvent) => {
      const btns = [...(ref.current?.querySelectorAll<HTMLElement>('.pzj-list button') ?? [])], i = btns.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus(); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [open]);
  // 2D: the list fades out (pz-leave, 220 ms), then is hidden; a list opened again inside the fade comes straight back
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) { setShown(true); return; }
    const t = setTimeout(() => setShown(false), 220);
    return () => clearTimeout(t);
  }, [open]);
  if (!deck) return null;
  const views = viewsOf(deck);
  const groups = jumpGroups(views);
  const close = () => useUi.getState().setJump(false);
  return (
    <nav ref={ref} className={`pz-jump stage-blocker${open ? '' : ' pz-leave'}`} data-open={open} hidden={!open && !shown} aria-label={W.jumpTitle} inert={!open}>
      <div className="pzj-h"><span>{deck.title}</span><button type="button" className="ib" aria-label={W.jumpClose} onClick={close}><Icon n="close" /></button></div>
      <div className="pzj-list">
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
  return createPortal(<div className={`pz-black${on ? ' on' : ''}`} aria-hidden="true" onClick={() => useUi.getState().setBlack(false)} />, document.body);
}
