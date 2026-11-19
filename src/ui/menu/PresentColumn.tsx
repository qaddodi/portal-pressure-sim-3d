// The menu's Present column, as the 2D menu lists it: the talks by topic (a row, an ⓘ that opens the talk's preview under it, with Resume / From the start / Presenter view / Copy link / Print notes),
// then "Your scripts" (New, Import; each script's Present, Add current state, Share link, Export, Print notes, Delete).
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../shell/icons.tsx';
import { builtinDeck, loadBuiltin } from '../../decks/registry.ts';
import { useUi } from '../ui-store.ts';
import { presentTopics, LEVELS, slideCount, type DeckMeta } from './library.ts';
import { resumeFor } from '../deck/resume.ts';
import { readMine, type Script } from '../deck/script-library.ts';
import { useScripts, newScript, addStep, removeScript, exportScript, shareScript, shareDeck, notes, present, presenterView } from '../talk/library.ts';
import { openImport } from '../deck/dialogs.ts';
import { deckOf } from '../deck/deck-of.ts';
import { W } from '../deck/words.ts';

const Act = ({ icon, label, primary, title, onClick }: { icon?: string; label: string; primary?: boolean; title?: string; onClick(): void }) => (
  <button type="button" className="sh-btn" data-primary={primary || undefined} title={title} onClick={onClick}>{icon && <Icon n={icon as 'play'} />} {label}</button>
);

function DeckPreview({ d }: { d: DeckMeta }) {
  const [, loaded] = useState(0);
  useEffect(() => { if (!builtinDeck(d.id)) void loadBuiltin(d.id).then(() => loaded((n) => n + 1)); }, [d.id]);   // (a talk read when it is opened: its objectives come in a moment)
  const deck = builtinDeck(d.id);
  const n = slideCount(d.id), r = resumeFor(d.id, n);
  return (
    <div className="sh-pv">
      <span className="sh-pv-meta">{[LEVELS[d.level ?? ''] ?? '', `${n} slides`, d.minutes ? `${d.minutes} min` : ''].filter(Boolean).join(' · ')}</span>
      <h3>{d.title}</h3>
      {d.summary && <p>{d.summary}</p>}
      {deck?.objectives.length ? <ul>{deck.objectives.map((o) => <li key={o}>{o}</li>)}</ul> : null}
      <div className="sh-acts">
        {r && <Act icon="play" primary label={`Resume ${r.at + 1} / ${r.n}`} onClick={() => present(d.id, r.at)} />}
        <Act icon="play" primary={!r} label={r ? W.fromStart : W.present} onClick={() => present(d.id)} />
        <Act icon="projector" label={W.presenterView} title={W.presenterViewTitle} onClick={() => presenterView(d.id, r?.at ?? 0)} />
        <Act icon="share" label={W.copyLink} onClick={() => shareDeck(d.id)} />
        <Act icon="print" label={W.printNotes} title={W.printNotesTitle} onClick={() => notes(d.id)} />
      </div>
    </div>
  );
}

function ScriptPreview({ s }: { s: Script }) {
  const deck = deckOf(s.id);
  return (
    <div className="sh-pv">
      <span className="sh-pv-meta">{`${s.deck ? W.yourDeck : W.yourScript} · ${W.slides(deck ? deck.slides.length : 0)}`}</span>
      <h3>{s.title}</h3>
      {s.summary && <p>{s.summary}</p>}
      <div className="sh-acts">
        <Act icon="play" primary label={W.present} onClick={() => present(s.id)} />
        {!s.deck && <Act label={W.addState} onClick={() => void addStep(s.id)} />}
        <Act label={W.shareLink} onClick={() => shareScript(s)} />
        <Act label={W.exportScript} onClick={() => exportScript(s)} />
        <Act label={W.printNotes} onClick={() => notes(s.id)} />
        <Act label={W.del} onClick={() => void removeScript(s.id)} />
      </div>
    </div>
  );
}

function Row({ id, label, meta, resume, current, open, onOpen, children }: { id: string; label: string; meta: string; resume?: string; current: boolean; open: boolean; onOpen(): void; children: React.ReactNode }) {
  return (
    <div className="sh-lrow">
      <button type="button" className="sh-row" aria-current={current ? 'true' : undefined} onClick={() => present(id, resume ? Number(resume) : 0)}>
        <Icon n="play" /><span className="sh-t">{label}</span><span className="sh-d">{meta}</span>
      </button>
      <button type="button" className="sh-info" aria-label={`About ${label}`} aria-expanded={open} onClick={onOpen}><Icon n="info" /></button>
      {open && children}
    </div>
  );
}

export function PresentColumn() {
  const [open, setOpen] = useState<string | null>(null);
  const version = useScripts((s) => s.version);
  const now = useUi((s) => s.deck?.id ?? null);
  const mine = useMemo(() => readMine(), [version]);   // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (k: string) => setOpen(open === k ? null : k);
  return (
    <div role="tabpanel">
      {presentTopics().map((t) => (
        <div key={t.topic}>
          <div className="sh-title">{t.label}</div>
          {t.decks.map((d) => {
            const r = resumeFor(d.id, slideCount(d.id));
            return (
              <Row key={d.id} id={d.id} label={d.short || d.title} resume={r ? String(r.at) : undefined} current={now === d.id}
                meta={[LEVELS[d.level ?? ''], r ? `Resume ${r.at + 1} / ${r.n}` : d.minutes ? `${d.minutes} min` : null].filter(Boolean).join(' · ')} open={open === 'd:' + d.id} onOpen={() => toggle('d:' + d.id)}>
                <DeckPreview d={d} />
              </Row>
            );
          })}
        </div>
      ))}
      <div>
        <div className="sh-title sh-gl"><span>{W.yourScripts}</span>
          <span className="sh-gacts">
            <button type="button" className="sh-link" title={W.newTitle} onClick={() => void newScript()}><Icon n="plus" />{W.yourScriptsNew}</button>
            <button type="button" className="sh-link" title={W.importHint} onClick={openImport}><Icon n="download" />{W.yourScriptsImport}</button>
          </span>
        </div>
        {mine.length
          ? mine.map((s) => (
            <Row key={s.id} id={s.id} label={s.title} current={now === s.id} meta={W.slides(s.steps ? s.steps.length + 2 : deckOf(s.id)?.slides.length ?? 0)} open={open === 's:' + s.id} onOpen={() => toggle('s:' + s.id)}>
              <ScriptPreview s={s} />
            </Row>
          ))
          : <p className="sh-note">{W.yourScriptsEmpty}</p>}
      </div>
    </div>
  );
}
