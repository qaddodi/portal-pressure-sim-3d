// The library's dialogs (a name, "Delete this script?", a link to copy by hand, the import box), one at a time, in the dialog shell (surface/Dialog.tsx). Esc and a press outside cancel.
import { useEffect, useRef, useState } from 'react';
import { useDialogs, closeDialog, type DeckDialog } from './dialogs.ts';
import { addText } from '../talk/library.ts';
import { W } from './words.ts';
import { Icon } from '../shell/icons.tsx';
import { Dialog } from '../surface/Dialog.tsx';

function Body({ d }: { d: DeckDialog }) {
  const field = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(d.kind === 'ask' ? d.value : d.kind === 'link' ? d.url : '');
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { (field.current ?? area.current)?.focus({ preventScroll: true }); if (d.kind === 'ask' || d.kind === 'link') field.current?.select(); }, [d.kind]);
  const add = (t: string) => { try { addText(t); closeDialog(); } catch (e) { setErr((e as Error).message || W.importNotDeck); } };
  switch (d.kind) {
    case 'ask': return (<>
      <h2>{d.title}</h2>
      <label className="sh-field"><span>{d.label}</span><input ref={field} type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') d.done(text); }} autoComplete="off" /></label>
      <div className="sh-btns"><button type="button" className="sh-btn" onClick={() => d.done(null)}>{W.cancel}</button><button type="button" className="sh-btn" data-primary="true" onClick={() => d.done(text)}>{d.yes}</button></div>
    </>);
    case 'confirm': return (<>
      <h2>{d.title}</h2><p>{d.body}</p>
      <div className="sh-btns"><button type="button" className="sh-btn" onClick={() => d.done(false)}>{W.cancel}</button><button type="button" className="sh-btn" data-danger={d.danger || undefined} onClick={() => d.done(true)}>{d.yes}</button></div>
    </>);
    case 'link': return (<>
      <h2>{W.copyDialogTitle}</h2><p>{W.copyDialogBody}</p>
      <input ref={field} className="sh-field-in" type="text" readOnly value={d.url} aria-label="Link" onFocus={(e) => e.currentTarget.select()} />
      <div className="sh-btns"><button type="button" className="sh-btn" data-primary="true" onClick={() => d.done()}>{W.done}</button></div>
    </>);
    case 'import': return (<>
      <h2>{W.importTitle}</h2><p>{W.importBody}</p>
      <input ref={file} type="file" hidden accept=".js,.mjs,.json,text/javascript,application/javascript,application/json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) add(await f.text()); e.target.value = ''; }} />
      <button type="button" className="sh-btn" onClick={() => file.current?.click()}><Icon n="download" /> {W.importChoose}</button>
      <textarea ref={area} className="sh-imp" rows={8} spellCheck={false} autoCapitalize="off" autoComplete="off" aria-label="Deck file contents" placeholder={W.importPlaceholder} value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} />
      {err && <p className="sh-err" role="alert">{err}</p>}
      <div className="sh-btns"><button type="button" className="sh-btn" onClick={() => d.done()}>{W.cancel}</button><button type="button" className="sh-btn" data-primary="true" onClick={() => add(text)}>{W.importAdd}</button></div>
    </>);
  }
}

const cancel = (d: DeckDialog) => { if (d.kind === 'ask') d.done(null); else if (d.kind === 'confirm') d.done(false); else d.done(); };

export function DeckDialogs() {
  const d = useDialogs((s) => s.dialog);
  const last = useRef<DeckDialog | null>(null);
  if (d) last.current = d;   // (kept while it fades out, so it never blanks first)
  const shown = d ?? last.current;
  return (
    <Dialog id="deck-dialog" size="s" open={!!d} label={shown ? ('title' in shown ? shown.title : W.copyDialogTitle) : W.copyDialogTitle} onCancel={() => { if (d) cancel(d); }}
      className="sh-dialog sh-dialog--deck">
      {shown && <Body key={shown === d ? 'on' : 'off'} d={shown} />}
    </Dialog>
  );
}
