// Search (Ctrl or Cmd K, "/", or the top bar's Search): the 2D palette. A field and a list; ↑ ↓ choose, Enter runs, Esc closes. A number in the field is the argument
// ("tips 8"). An empty field offers a few of what works; "Nothing matches" says what to try.
import { useEffect, useMemo, useRef, useState } from 'react';
import { UI } from '../strings.generated.ts';
import { useShell } from '../shell/store.ts';
import { useUi } from '../ui-store.ts';
import { Icon } from '../shell/icons.tsx';
import { usesBottomBar } from '../shell/room.ts';
import { startTalk } from '../shell/talk.ts';
import { noMatch, NO_MATCH_HELP } from '../shell/words.ts';
import { search } from './match.ts';
import { buildCommands } from './commands.ts';

export function SearchSheet() {
  const open = useShell((s) => s.sheet === 'search');
  const phone = usesBottomBar(useUi((s) => s.device));
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const cmds = useMemo(() => (open ? buildCommands(startTalk) : []), [open]);
  const hits = useMemo(() => search(cmds, q, UI.search.emptyOrder), [cmds, q]);
  useEffect(() => { if (open) { setQ(''); setAt(0); input.current?.focus(); } }, [open]);
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
    <div className={`pal-back${leaving ? ' leaving' : ''}`} hidden={!shown} onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="Command palette" inert={!open}>
        <div className="pal-top">
          <Icon n="search" className="pal-ic" />
          <input ref={input} className="pal-input" type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={UI.search.placeholder[phone ? 0 : 1]} aria-label={UI.topbar.find((t) => t.id === 'btnPalette')!.label!}
            role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="pal-list" aria-activedescendant={hits[at] ? `pal-opt-${at}` : undefined} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" />
          <button type="button" className="ib pal-x" aria-label="Close search" onClick={close}><Icon n="close" /></button>
        </div>
        <div className="pal-list" id="pal-list" role="listbox" aria-label="Results">
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
