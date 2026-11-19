// Search (Ctrl or Cmd K, "/", or the top bar's Search): the 2D palette. A field and a list; ↑ ↓ choose, Enter runs, Esc closes. A number in the field is the argument
// ("tips 8"). An empty field offers a few of what works; "Nothing matches" says what to try.
import { useEffect, useMemo, useRef, useState } from 'react';
import { UI } from '../strings.generated.ts';
import { useShell } from '../shell/store.ts';
import { useUi } from '../ui-store.ts';
import { Frame } from '../shell/Frame.tsx';
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
  return (
    <Frame kind="search" label="Command palette" head={null}>
      <div className="sh-find">
        <Icon n="search" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={UI.search.placeholder[phone ? 0 : 1]} aria-label={UI.topbar.find((t) => t.id === 'btnPalette')!.label!}
          role="combobox" aria-expanded={open} aria-controls="sh-hits" aria-activedescendant={hits[at] ? `sh-hit-${at}` : undefined} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" />
      </div>
      <div className="sh-list" id="sh-hits" role="listbox">
        {hits.length === 0 ? (
          <div className="sh-empty"><b>{noMatch(q)}</b>{q ? NO_MATCH_HELP : null}</div>
        ) : hits.map((h, i) => (
          <button key={`${h.c.group}/${h.c.title}`} id={`sh-hit-${i}`} type="button" role="option" className="sh-hit-row" aria-selected={i === at} onPointerMove={() => setAt(i)} onClick={() => run(i)}>
            <span className="sh-g">{h.c.group}</span>
            <span>{h.c.title}{h.num != null && h.c.num ? <b> → {h.num} {h.c.num}</b> : null}</span>
            {h.c.hint && h.num == null && <span className="sh-h">{h.c.hint}</span>}
          </button>
        ))}
      </div>
      <div className="sh-foothints" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd>to move</span><span><kbd>Enter</kbd>to run</span><span><kbd>Esc</kbd>to close</span></div>
    </Frame>
  );
}
