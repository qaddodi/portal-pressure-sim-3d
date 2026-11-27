// Search (Ctrl or Cmd K, "/", or the top bar's Search): the 2D palette. A field and a list; ↑ ↓ choose, Enter runs, Esc closes. A number in the field is the argument
// ("tips 8"). An empty field offers a few of what works; "Nothing matches" says what to try. A size-l dialog of the dialog shell (surface/Dialog.tsx; owner, 27 Nov: Search becomes
// a dialog): the shell centres it, makes it a sheet that rests on the keyboard on a phone, fades it, and closes it on Esc, a press outside, its X and a pull down.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { UI } from '../strings.generated.ts';
import { useShell } from '../shell/store.ts';
import { Icon } from '../shell/icons.tsx';
import { startTalk } from '../shell/talk.ts';
import { noMatch, NO_MATCH_HELP } from '../shell/words.ts';
import { search } from './match.ts';
import { buildCommands } from './commands.ts';
import { readMetric } from '../tests/dock/layout-snap.ts';
import { restPass, cancelRest } from '../tests/dock/rest-pass.ts';
import { Dialog } from '../surface/Dialog.tsx';
import { CloseX } from '../surface/parts.tsx';
import { useSurfaceMode } from '../surface/mode.ts';
import type { CancelBy } from '../surface/dialog-fit.ts';

// (a press outside is recorded, so the tail of that press on Search's own opener does not open it again: store.ts closeByPress)
const cancel = (by: CancelBy) => { if (by === 'press') useShell.getState().closeByPress(); else useShell.getState().close(); };

export function SearchSheet() {
  const open = useShell((s) => s.sheet === 'search');
  const phone = useSurfaceMode() === 'sheet';
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null), listEl = useRef<HTMLDivElement>(null), hl = useRef<HTMLDivElement>(null), rowEls = useRef<(HTMLButtonElement | null)[]>([]), pt = useRef<[number, number]>([-1, -1]);   // (pt: a list that scrolls under a still pointer sends a move at the same spot: the keyboard keeps the highlight then, as 2D does)
  const cmds = useMemo(() => (open ? buildCommands(startTalk) : []), [open]);
  const hits = useMemo(() => search(cmds, q, UI.search.emptyOrder), [cmds, q]);
  // The field takes focus in the very commit that shows the palette (owner, 20 Nov: "when i hit search or / the search bar should be in focus right away so i can type"): it is the
  // dialog's `initialFocus`, which the shell focuses in a layout effect inside the click or key press that opened it, which is also what lets a phone raise its keyboard (iOS only
  // does so for a focus made by the gesture itself). The box is never display: none (a field there cannot take focus), and the shell looks again once the commit has settled, for a
  // menu that closed a moment ago handing focus back to its button. The on-screen keyboard is the shell's too (dialog-fit.ts keyboardFit: the sheet rests on it, the list keeps --pal-vh).
  useLayoutEffect(() => { if (open) { setQ(''); setAt(0); } }, [open]);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { document.getElementById(`pal-opt-${at}`)?.scrollIntoView({ block: 'nearest' }); }, [at]);
  // The highlight (2D palette.js place/snapNow): ONE piece under the rows, sized once to the row it first lands on and then moved by translate and scale only (on --d-flip, app-03-layouts.css .pal-glide),
  // so the arrow keys and the pointer glide it with no layout work. Root cause of "the menu doesn't highlight my choice" (owner, 20 Nov): 2D's rows draw `.on` as a transparent row and leave the tint to
  // this piece (`.pal-list.glides .pal-item.on { background: transparent }`); the port copied those rules but made no `glides` list and no `.pal-glide`, so the active row had no fill at all.
  // The rows' boxes are read once per list drawn or resize (never in a key or a pointer move); a new list, the first placement and a resize put it there with no glide (`still`).
  const geom = useRef<number[][]>([]), size = useRef<[number, number]>([0, 0]), at0 = useRef(0), measuring = useRef(0), live = useRef(false);
  at0.current = at;
  const place = (glide: boolean) => {
    const el = hl.current, g = live.current ? geom.current[at0.current] : null;
    if (!el) return;
    if (!g) { el.style.opacity = '0'; return; }
    const [x, y, w, h] = g;
    if (!glide || el.style.opacity !== '1' || !size.current[0]) {
      el.classList.add('still');
      size.current = [w, h]; el.style.width = `${w}px`; el.style.height = `${h}px`;
      el.style.translate = `${x}px ${y}px`; el.style.scale = ''; el.style.opacity = '1';
      void readMetric(el, 'offsetWidth');   // the new place is drawn with no transition, then it is let go (2D: 'still' is dropped a frame later)
      el.classList.remove('still');
      return;
    }
    el.style.translate = `${x}px ${y}px`; el.style.scale = `${(w / size.current[0]).toFixed(4)} ${(h / size.current[1]).toFixed(4)}`; el.style.opacity = '1';
  };
  const measure = () => {
    measuring.current = 0;
    geom.current = hits.map((_, i) => { const r = rowEls.current[i]; return r ? [readMetric(r, 'offsetLeft'), readMetric(r, 'offsetTop'), readMetric(r, 'offsetWidth'), readMetric(r, 'offsetHeight')] : [0, 0, 0, 0]; });
    live.current = open && hits.length > 0;
    place(false);
  };
  // a new list of rows (a new query, the palette opening) and a resize measure again, in a rest pass after the commit; the highlight then lands with no glide
  useLayoutEffect(() => {
    live.current = false;
    if (!open) return;
    cancelRest(measuring.current); measuring.current = restPass(measure);
    const l = listEl.current, ro = l && typeof ResizeObserver === 'function' ? new ResizeObserver(() => { cancelRest(measuring.current); measuring.current = restPass(measure); }) : null;
    if (l) ro?.observe(l);
    return () => { ro?.disconnect(); cancelRest(measuring.current); };
  }, [open, hits]);
  // an arrow key or the pointer only moves it: a glide to the new row
  useEffect(() => { if (live.current) place(true); }, [at]);
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
  };
  // closing: the shell fades it (leaveMs('dialog')); the list stays as it was until it has gone
  // 2D palette.js markup: .pal (.pal-top: icon, field, close; .pal-list of .pal-item; .pal-foot), on the 2D stylesheet; the shell's layer is its backdrop
  return (
    <Dialog id="search" size="l" open={open} label="Command palette" onCancel={cancel} initialFocus={input} className="pal">
      <div className="pal-top">
        <Icon n="search" className="pal-ic" />
        <input ref={input} className="pal-input" type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={UI.search.placeholder[phone ? 0 : 1]} aria-label={UI.topbar.find((t) => t.id === 'btnPalette')!.label!}
          role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="pal-list" aria-activedescendant={hits[at] ? `pal-opt-${at}` : undefined} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" />
        <CloseX className="pal-x" label="Close search" onClose={() => cancel('x')} />
      </div>
      <div ref={listEl} className="pal-list glides" id="pal-list" role="listbox" aria-label="Results">
        <div ref={hl} className="pal-glide" aria-hidden="true" />
        {hits.length === 0 ? (
          <div className="pal-empty"><b>{noMatch(q)}</b>{q ? NO_MATCH_HELP : null}</div>
        ) : hits.map((h, i) => (
          <button key={`${h.c.group}/${h.c.title}`} ref={(b) => { rowEls.current[i] = b; }} id={`pal-opt-${i}`} type="button" tabIndex={-1} role="option" className={`pal-item${i === at ? ' on' : ''}`} aria-selected={i === at} onPointerMove={(e) => { if (e.clientX === pt.current[0] && e.clientY === pt.current[1]) return; pt.current = [e.clientX, e.clientY]; setAt(i); }} onClick={() => run(i)}>
            <span className="pal-g">{h.c.group}</span>
            <span className="pal-t">{h.c.title}{h.num != null && h.c.num ? <b> → {h.num} {h.c.num}</b> : null}</span>
            {h.c.hint && h.num == null && <span className="pal-h">{h.c.hint}</span>}
          </button>
        ))}
      </div>
      <div className="pal-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd>to move</span><span><kbd>Enter</kbd>to run</span><span><kbd>Esc</kbd>to close</span></div>
    </Dialog>
  );
}
