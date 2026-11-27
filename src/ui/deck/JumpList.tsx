// The slide list (G while presenting; the 2D toggleJump): every stop with its number, grouped by kicker, the one on show marked. A tap or Enter goes there. Up and Down move the focus.
// It is a menu (surface/kinds.ts `slides`) on the one menu shell (surface/Menu.tsx): it floats above the pill's slide count that opens it (placed by shell/place.ts, cut to the room
// between the top bar and the foot), rests at the foot as a sheet with a grab bar, its title and an X where every surface is a sheet, and closes on a press outside, its X, a choice,
// the count again, a pull down, or Esc and G (the presenter's keys, deck/clicker.ts). Its open state stays the deck's (useUi.jump). It keeps the 2D app's markup and classes
// (presenter.js toggleJump: .pz-jump > .pzj-h, .pzj-list), so its lifted stylesheet (styles/app-05-presenter-cards.css) draws it, and it stays in the deck layer (`inline`).
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useUi } from '../ui-store.ts';
import { W } from './words.ts';
import { viewsOf, jumpGroups } from './presenter-link.ts';
import { Menu, useMenu, type MenuState } from '../surface/Menu.tsx';

export function JumpList() {
  const deck = useUi((s) => s.deck), open = useUi((s) => s.jump), at = useUi((s) => s.pos.stop);
  const state: MenuState = { open, close: () => useUi.getState().setJump(false) };
  const ctl = useMenu('slides', { state, side: 'above', align: 'end' });
  const ref = ctl.ref;
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
  }, [open, ref]);
  if (!deck) return null;
  const views = viewsOf(deck);
  const groups = jumpGroups(views);
  return (
    <Menu id="slides" ctl={ctl} skin="jump" mount="inline" width="l" headAlways label={W.jumpTitle} title={deck.title} closeLabel={W.jumpClose}>
      <div className="pzj-list">
        {groups.map((g, gi) => (
          <section key={gi}>
            {g.k ? <h3>{g.k}</h3> : null}
            <ol>{g.items.map((i) => (
              <li key={i}><button type="button" aria-current={i === at ? 'true' : undefined} onClick={() => { state.close(); useUi.getState().go(i); }}><span className="n">{i + 1}</span><span className="t">{views[i].title}</span></button></li>
            ))}</ol>
          </section>
        ))}
      </div>
    </Menu>
  );
}

/** The black screen (B, . or W): the page fades to black and back; a tap on it puts it away. */
export function BlackScreen() {
  const on = useUi((s) => s.black);
  return createPortal(<div className={`pz-black${on ? ' on' : ''}`} aria-hidden="true" onClick={() => useUi.getState().setBlack(false)} />, document.body);
}
