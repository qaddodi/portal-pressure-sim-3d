// Search (Ctrl or Cmd K, "/", or the top bar's Search): the 2D palette. A field and a list; ↑ ↓ choose, Enter runs, Esc closes. A number in the field is the argument
// ("tips 8"). An empty field offers a few of what works; "Nothing matches" says what to try.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { UI } from '../strings.generated.ts';
import { useShell } from '../shell/store.ts';
import { useUi } from '../ui-store.ts';
import { Icon } from '../shell/icons.tsx';
import { usesBottomBar } from '../shell/room.ts';
import { startTalk } from '../shell/talk.ts';
import { noMatch, NO_MATCH_HELP } from '../shell/words.ts';
import { search } from './match.ts';
import { visibleBottom } from '../shell/place.ts';
import { buildCommands } from './commands.ts';

export function SearchSheet() {
  const open = useShell((s) => s.sheet === 'search');
  const phone = usesBottomBar(useUi((s) => s.device));
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null), back = useRef<HTMLDivElement>(null), listEl = useRef<HTMLDivElement>(null);
  const cmds = useMemo(() => (open ? buildCommands(startTalk) : []), [open]);
  const hits = useMemo(() => search(cmds, q, UI.search.emptyOrder), [cmds, q]);
  // Focus the field in the very commit that shows the palette (owner, 20 Nov: "when i hit search or / the search bar should be in focus right away so i can type"). A layout effect runs inside the
  // click or key press that opened it, which is also what lets a phone raise its keyboard (iOS only does so for a focus made by the gesture itself). The box is never `hidden` while `open` (below):
  // a field in a display:none box cannot take focus, which is why the old effect, run before the box was shown, focused nothing. A second look after the commit settles catches a sheet that
  // closed a moment ago handing focus back to its button.
  useLayoutEffect(() => { if (open) { setQ(''); setAt(0); input.current?.focus({ preventScroll: true }); } }, [open]);
  useEffect(() => { if (open && document.activeElement !== input.current) input.current?.focus({ preventScroll: true }); }, [open, q]);
  // The on-screen keyboard (iOS draws it over the page without shrinking it): the sheet rests on it, and the list is held to the room above it (2D palette.js fitList; --pal-kb, --pal-vh and
  // --pal-room are read by app-03-layouts.css). Event-driven, from the visual viewport's resize and scroll; nothing runs per frame.
  useEffect(() => {
    const el = back.current;
    if (!open || !el) return;
    const vv = window.visualViewport;
    const fit = () => {
      const kb = Math.max(0, Math.round(innerHeight - visibleBottom()));
      el.style.setProperty('--pal-kb', `${kb}px`);
      el.style.setProperty('--pal-vh', `${Math.round(vv ? vv.height : innerHeight)}px`);
      const l = listEl.current;
      if (l) el.style.setProperty('--pal-room', `${Math.max(96, Math.floor(visibleBottom() - l.getBoundingClientRect().top - 12))}px`);
    };
    fit();
    vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit);
    return () => { vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit); for (const k of ['--pal-kb', '--pal-vh', '--pal-room']) el.style.removeProperty(k); };
  }, [open]);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { document.getElementById(`pal-opt-${at}`)?.scrollIntoView({ block: 'nearest' }); }, [at]);
  const run = (i: number) => {
    const h = hits[i];
    if (!h) return;
    useShell.getState().close();
    h.c.run(h.num);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(hits.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(at); }
    else if (e.key === 'Escape') { e.preventDefault(); useShell.getState().close(); }
  };
  // closing: the palette sinks back (.leaving, 2D --d-flip) and is then hidden, as palette.js close() does
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (open) { setShown(true); setLeaving(false); return; }
    if (!shown) return;
    setLeaving(true);
    const t = window.setTimeout(() => { setShown(false); setLeaving(false); }, 180);
    return () => window.clearTimeout(t);
  }, [open, shown]);
  const close = () => useShell.getState().close();
  // 2D palette.js markup: .pal-back > .pal (.pal-top: icon, field, close; .pal-list of .pal-item; .pal-foot), on the 2D stylesheet
  return (
    <div ref={back} className={`pal-back${leaving ? ' leaving' : ''}`} hidden={!open && !shown} onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="Command palette" inert={!open}>
        <div className="pal-top">
          <Icon n="search" className="pal-ic" />
          <input ref={input} className="pal-input" type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={UI.search.placeholder[phone ? 0 : 1]} aria-label={UI.topbar.find((t) => t.id === 'btnPalette')!.label!}
            role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="pal-list" aria-activedescendant={hits[at] ? `pal-opt-${at}` : undefined} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" />
          <button type="button" className="ib pal-x" aria-label="Close search" onClick={close}><Icon n="close" /></button>
        </div>
        <div ref={listEl} className="pal-list" id="pal-list" role="listbox" aria-label="Results">
          {hits.length === 0 ? (
            <div className="pal-empty"><b>{noMatch(q)}</b>{q ? NO_MATCH_HELP : null}</div>
          ) : hits.map((h, i) => (
            <button key={`${h.c.group}/${h.c.title}`} id={`pal-opt-${i}`} type="button" tabIndex={-1} role="option" className={`pal-item${i === at ? ' on' : ''}`} aria-selected={i === at} onPointerMove={() => setAt(i)} onClick={() => run(i)}>
              <span className="pal-g">{h.c.group}</span>
              <span className="pal-t">{h.c.title}{h.num != null && h.c.num ? <b> → {h.num} {h.c.num}</b> : null}</span>
              {h.c.hint && h.num == null && <span className="pal-h">{h.c.hint}</span>}
            </button>
          ))}
        </div>
        <div className="pal-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd>to move</span><span><kbd>Enter</kbd>to run</span><span><kbd>Esc</kbd>to close</span></div>
      </div>
    </div>
  );
}
