// The main menu on the 2D app's own markup and class names (menu.js build / sections / deckRow / patientRow): `.umenu` with `.um-grab`, `.um-top` (the search field and the close
// button), `.um-tabs`, `.um-cols` holding the Present and Patients lists, `.um-empty` and `.um-foot`. Its stylesheet is 2D's (src/ui/css2d), copied unchanged. A popover under the menu
// button from 768 px, a bottom sheet with a scrim on the stacked layout (STACK_MQ). It is in the page only while open and leaves by `.out`. A row opens a talk or a patient; the ⓘ
// opens the preview under it (`.um-inline`), and a mouse that rests on a row shows the same preview beside the panel (`.um-pv`).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PRESETS } from '../../engine/hales/portal/scenario.js';
import { builtinDeck, loadBuiltin } from '../../decks/registry.ts';
import { useShell, type MenuTab } from '../shell/store.ts';
import { useOutside } from '../shell/Pop.tsx';
import { STACK_MQ, usePresence, placeMenu } from '../shell/Menu.tsx';
import { I } from '../shell/icons.tsx';
import { useUi } from '../ui-store.ts';
import { resumeFor } from '../deck/resume.ts';
import { readMine, type Script } from '../deck/script-library.ts';
import { deckOf } from '../deck/deck-of.ts';
import { openImport } from '../deck/dialogs.ts';
import { W } from '../deck/words.ts';
import { useScripts, newScript, addStep, removeScript, exportScript, shareScript, shareDeck, shareView, notes, present, presenterView } from '../talk/library.ts';
import { UI } from '../strings.generated.ts';
import { presentTopics, patientGroups, LEVELS, slideCount, type DeckMeta } from './library.ts';
import { loadPatient } from './patients.ts';
import { GROUP_WHERE, fold, filterRows, emptyNote, stepRow, wordsOf } from './umenu-logic.ts';

const PRESET_SUMMARY: Record<string, string> = Object.fromEntries((PRESETS as { id: string; summary?: string }[]).map((p) => [p.id, p.summary ?? '']));
const TABS = UI.menus.mainMenu.tabs as readonly { id: MenuTab; label: string }[];
const TAB_ICON: Record<MenuTab, string> = { present: 'projector', patients: 'scenario' };
const LEAVE_MS = 180;   // 2D --d-flip

interface Row { key: string; find: string; more: string }

const Btn = ({ icon, label, primary, ghost = true, title, onClick }: { icon?: string; label: string; primary?: boolean; ghost?: boolean; title?: string; onClick(): void }) => (
  <button type="button" className={`btn sm${primary ? ' primary' : ghost ? ' ghost' : ''}`} title={title} onClick={onClick}>{icon && <I n={icon} className="mi-ic" />}{label}</button>
);

function DeckPv({ d, close }: { d: DeckMeta; close(): void }) {
  const [, loaded] = useState(0);
  useEffect(() => { if (!builtinDeck(d.id)) void loadBuiltin(d.id).then(() => loaded((n) => n + 1)); }, [d.id]);   // (a talk read when it is opened: its objectives come in a moment)
  const deck = builtinDeck(d.id), n = slideCount(d.id), r = resumeFor(d.id, n);
  const go = (at?: number) => { close(); present(d.id, at); };
  return (
    <div className="um-pv-in pt">
      <span className="um-pv-meta">{[LEVELS[d.level ?? ''] ?? '', `${n} slides`, d.minutes ? `${d.minutes} min` : ''].filter(Boolean).join(' · ')}</span>
      <h3>{d.title}</h3>
      {d.summary ? <p>{d.summary}</p> : null}
      {deck?.objectives.length ? <ul>{deck.objectives.map((o) => <li key={o}>{o}</li>)}</ul> : null}
      <div className="um-acts">
        {r ? <Btn primary icon="play" label={`Resume ${r.at + 1} / ${r.n}`} onClick={() => go(r.at)} /> : null}
        <Btn primary={!r} ghost={false} icon="play" label={r ? W.fromStart : W.present} onClick={() => go()} />
        <Btn icon="projector" label={W.presenterView} title={W.presenterViewTitle} onClick={() => { presenterView(d.id, r?.at ?? 0); close(); }} />
        <Btn icon="share" label={W.copyLink} onClick={() => shareDeck(d.id)} />
        <Btn icon="print" label={W.printNotes} title={W.printNotesTitle} onClick={() => notes(d.id)} />
      </div>
    </div>
  );
}

function ScriptPv({ s, close }: { s: Script; close(): void }) {
  const deck = deckOf(s.id);
  return (
    <div className="um-pv-in">
      <span className="um-pv-meta">{`${s.deck ? W.yourDeck : W.yourScript} · ${W.slides(deck ? deck.slides.length : 0)}`}</span>
      <h3>{s.title}</h3>
      {s.summary ? <p>{s.summary}</p> : null}
      <div className="um-acts">
        <Btn primary ghost={false} icon="play" label={W.present} onClick={() => { close(); present(s.id); }} />
        {!s.deck ? <Btn ghost={false} label={W.addState} onClick={() => void addStep(s.id)} /> : null}
        <Btn label={W.shareLink} onClick={() => shareScript(s)} />
        <Btn label={W.exportScript} onClick={() => exportScript(s)} />
        <Btn label={W.printNotes} onClick={() => notes(s.id)} />
        <Btn label={W.del} onClick={() => void removeScript(s.id)} />
      </div>
    </div>
  );
}

function PatientPv({ id, label, group }: { id: string; label: string; group: string }) {
  return (
    <div className="um-pv-in pt">
      <span className="um-pv-meta">{`${group} · ${GROUP_WHERE[group] || ''}`}</span>
      <h3>{label}</h3>
      <p>{PRESET_SUMMARY[id] ?? ''}</p>
    </div>
  );
}

/** The preview that folds open under a row (the ⓘ) and folds shut again. */
function Inline({ open, children }: { open: boolean; children: ReactNode }) {
  const { shown, leaving } = usePresence(open, 180);
  if (!shown) return null;
  return <div className={`um-inline on${leaving ? ' out' : ''}`}><div>{children}</div></div>;
}

interface ItemProps { k: string; row: Row; hidden: boolean; current?: boolean; info: string; open: boolean; onInfo(): void; onHover(el: HTMLElement | null): void; onPress(): void; lead?: ReactNode; text: string; metas: ReactNode; trail?: ReactNode; pv: ReactNode; isNew?: boolean }
function Item({ k, row, hidden, current, info, open, onInfo, onHover, onPress, lead, text, metas, trail, pv }: ItemProps) {
  return (
    <li hidden={hidden}>
      <button type="button" className="um-row" data-k={k} data-find={row.find} aria-current={current ? 'true' : undefined} onClick={onPress}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') onHover(e.currentTarget); }} onPointerLeave={() => onHover(null)}
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) onHover(e.currentTarget); }} onBlur={() => onHover(null)}>
        {lead}<span className="um-t">{text}</span>{metas}{trail}
      </button>
      <button type="button" className="um-info" aria-label={`About ${info}`} aria-expanded={open} onClick={onInfo}><I n="info" /></button>
      <Inline open={open}>{pv}</Inline>
    </li>
  );
}

export function UMenu() {
  const ref = useRef<HTMLDivElement>(null);
  const open = useOutside('menu', ref);
  const { shown, leaving } = usePresence(open, LEAVE_MS);
  const tab = useShell((s) => s.menuTab);
  const seed = useShell((s) => s.menuQuery);
  const patientId = useShell((s) => s.patientId);
  const now = useUi((s) => s.deck?.id ?? null);
  const version = useScripts((s) => s.version);
  const mine = useMemo(() => readMine(), [version]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState('');
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [hover, setHover] = useState<{ k: string; el: HTMLElement } | null>(null);
  const [sheet, setSheet] = useState(() => typeof matchMedia === 'function' && matchMedia(STACK_MQ).matches);
  const hoverT = useRef(0), hideT = useRef(0);
  const root = typeof document === 'undefined' ? null : document.querySelector('.sh-root');
  const close = () => useShell.getState().close();

  useEffect(() => { const mq = matchMedia(STACK_MQ), f = () => setSheet(mq.matches); f(); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  // a menu opened by a link carries its search (menuQuery); every other open starts empty
  useEffect(() => { if (open) { setQuery(seed); setOpenRow(null); setHover(null); useShell.setState({ menuQuery: '' }); } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (!shown || !el || sheet) return;
    const put = () => { const a = document.querySelector<HTMLElement>('[data-opens="menu"]'); if (a) placeMenu(el, a, 'start', 'below'); };
    put(); addEventListener('resize', put);
    return () => removeEventListener('resize', put);
  }, [shown, sheet]);
  // a sheet stays above the keyboard (menu.js fitSheet): the keyboard's height and the room above it, written when the keyboard comes or goes, never per frame
  useEffect(() => {
    const el = ref.current, vv = window.visualViewport;
    if (!shown || !el || !sheet || !vv) return;
    const fit = () => {
      const kb = Math.round(innerHeight - vv.offsetTop - vv.height);
      if (kb > 80) { const room = Math.round(vv.height - 16); el.style.setProperty('--menu-kb', `${kb}px`); el.style.setProperty('--menu-h', `${room}px`); el.classList.toggle('kb-tight', room < 300); }
      else { el.style.removeProperty('--menu-kb'); el.style.removeProperty('--menu-h'); el.classList.remove('kb-tight'); }
    };
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); };
  }, [shown, sheet]);
  useEffect(() => {   // a key typed over the figure goes to the search field (menu.js typed)
    if (!open) return;
    const typed = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!ref.current || ref.current.contains(t) || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === ' ' || t?.closest?.('input, textarea, select, [contenteditable], .modal-back')) return;
      ref.current.querySelector<HTMLInputElement>('.um-q')?.focus();
    };
    addEventListener('keydown', typed, true);
    return () => removeEventListener('keydown', typed, true);
  }, [open]);
  useEffect(() => {   // it opens on the search (a mouse) or the close button (a sheet, a finger), and scrolls the patient or talk now showing into view
    const el = ref.current;
    if (!open || !el) return;
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    el.querySelector<HTMLElement>(sheet || !fine ? '.um-x' : '.um-q')?.focus({ preventScroll: true });
    el.querySelector(`.um-col[data-col="${tab}"] .um-row[aria-current="true"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  const topics = useMemo(() => presentTopics(), []);
  const groups = useMemo(() => patientGroups(), []);
  const presentRows = useMemo<Row[]>(() => [
    ...topics.flatMap((t) => t.decks.map((d) => ({ key: 'd:' + d.id, find: fold([d.title, d.short].join(' ')), more: fold(d.summary) }))),
    ...mine.map((s) => ({ key: 's:' + s.id, find: fold([s.title, 'script'].join(' ')), more: fold(s.summary) })),
  ], [topics, mine]);
  const patientRows = useMemo<Row[]>(() => groups.flatMap((g) => g.patients.map((p) => ({ key: 'p:' + p.id, find: fold([p.label, g.group, GROUP_WHERE[g.group], p.id].join(' ')), more: fold(PRESET_SUMMARY[p.id]) }))), [groups]);
  const shownP = useMemo(() => new Set([...filterRows(presentRows, query)].map((r) => r.key)), [presentRows, query]);
  const shownT = useMemo(() => new Set([...filterRows(patientRows, query)].map((r) => r.key)), [patientRows, query]);
  const words = wordsOf(query).length > 0;
  const here = tab === 'present' ? shownP.size : shownT.size, there = tab === 'present' ? shownT.size : shownP.size;
  const empty = emptyNote(tab, here, there, query);
  const rowOf = (key: string) => (key[0] === 'p' ? patientRows : presentRows).find((r) => r.key === key)!;

  const setTab = (t: MenuTab, focus = false) => { useShell.setState({ menuTab: t }); setHover(null); if (focus) afterCommit(() => ref.current?.querySelector<HTMLElement>(`#umtab-${t}`)?.focus({ preventScroll: true })); };
  const visible = (col: Element | null) => [...(col?.querySelectorAll<HTMLElement>('li:not([hidden]) > .um-row') ?? [])].filter((r) => !r.closest('.um-g[hidden]'));
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const el = ref.current!, q = el.querySelector<HTMLInputElement>('.um-q')!, t = e.target as HTMLElement;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (t === q && q.value) setQuery(''); else close(); return; }
    const col = () => el.querySelector(`.um-col[data-col="${tab}"]`);
    if (t === q) {
      if (e.key === 'Enter') { e.preventDefault(); visible(col())[0]?.click(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); visible(col())[0]?.focus(); }
      return;
    }
    if (t.classList?.contains('um-tab') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); setTab(tab === 'present' ? 'patients' : 'present', true); return; }
    const row = t.closest?.('.um-row') as HTMLElement | null;
    if (row && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const list = visible(row.closest('.um-col')), at = stepRow(list.indexOf(row), e.key === 'ArrowDown' ? 1 : -1, list.length);
      if (at < 0) q.focus(); else list[at]?.focus();
    } else if (row && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const next: MenuTab = tab === 'present' ? 'patients' : 'present';
      setTab(next);
      afterCommit(() => visible(el.querySelector(`.um-col[data-col="${next}"]`))[0]?.focus());
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') q.focus();
  };

  // the preview beside the panel: a mouse that rests on a row for 300 ms (120 ms when one is already up); it goes 220 ms after the mouse leaves both
  const onHover = (k: string) => (el: HTMLElement | null) => {
    if (sheet || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    clearTimeout(hoverT.current); clearTimeout(hideT.current);
    if (!el) { hideT.current = window.setTimeout(() => setHover(null), 220); return; }
    hoverT.current = window.setTimeout(() => setHover({ k, el }), hover ? 120 : 300);
  };
  useEffect(() => () => { clearTimeout(hoverT.current); clearTimeout(hideT.current); }, []);

  if (!shown || !root) return null;
  const startDeck = (id: string, at: number) => { close(); present(id, at); };
  const pvFor = (k: string): ReactNode => {
    const id = k.slice(2);
    if (k[0] === 'd') { const d = topics.flatMap((t) => t.decks).find((x) => x.id === id); return d ? <DeckPv d={d} close={close} /> : null; }
    if (k[0] === 's') { const s = mine.find((x) => x.id === id); return s ? <ScriptPv s={s} close={close} /> : null; }
    const g = groups.find((x) => x.patients.some((p) => p.id === id)); const p = g?.patients.find((x) => x.id === id);
    return g && p ? <PatientPv id={id} label={p.label} group={g.group} /> : null;
  };
  const toggleInfo = (k: string) => setOpenRow(openRow === k ? null : k);

  const deckItem = (d: DeckMeta) => {
    const k = 'd:' + d.id, r = now === d.id ? null : resumeFor(d.id, slideCount(d.id)), name = d.short || d.title;
    return (
      <Item key={k} k={k} row={rowOf(k)} hidden={!shownP.has(k)} current={now === d.id} info={name} open={openRow === k} onInfo={() => toggleInfo(k)} onHover={onHover(k)} onPress={() => startDeck(d.id, r?.at ?? 0)}
        lead={<I n="play" className="um-play" />} text={name}
        metas={<><span className="um-m um-lv">{LEVELS[d.level ?? ''] ?? ''}</span>{r ? <span className="um-m um-res">{`Resume ${r.at + 1} / ${r.n}`}</span> : <span className="um-m">{d.minutes} min</span>}</>}
        pv={<DeckPv d={d} close={close} />} />
    );
  };
  const scriptItem = (s: Script) => {
    const k = 's:' + s.id;
    return (
      <Item key={k} k={k} row={rowOf(k)} hidden={!shownP.has(k)} current={now === s.id} info={s.title} open={openRow === k} onInfo={() => toggleInfo(k)} onHover={onHover(k)} onPress={() => startDeck(s.id, 0)}
        lead={<I n="play" className="um-play" />} text={s.title} metas={<span className="um-m">{W.slides(s.steps ? s.steps.length + 2 : deckOf(s.id)?.slides.length ?? 0)}</span>}
        pv={<ScriptPv s={s} close={close} />} />
    );
  };
  const hiddenGroup = (keys: string[], set: Set<string>) => words && !keys.some((k) => set.has(k));
  const mineHidden = words && (mine.length === 0 || !mine.some((s) => shownP.has('s:' + s.id)));

  const menu = (
    <div ref={ref} className={`umenu${sheet ? ' sheet' : ''}${leaving ? ' out' : ''}${words && here > 0 ? ' filtered' : ''}`} role="dialog" aria-modal={sheet || undefined} aria-label="Menu" data-tab={tab} inert={!open} onKeyDown={onKeyDown}>
      <div className="um-grab" aria-hidden="true" />
      <div className="um-top">
        <label className="um-search"><I n="search" /><input className="um-q" type="search" placeholder="Find a presentation or patient" aria-label="Find a presentation or patient" autoComplete="off" spellCheck={false} value={query} onChange={(e) => setQuery(e.target.value)} /><kbd className="um-kb">/</kbd></label>
        <button type="button" className="ib um-x" aria-label="Close the menu" onClick={close}><I n="close" /></button>
      </div>
      <div className="um-tabs" role="tablist" aria-label="Menu">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="um-tab" role="tab" id={`umtab-${t.id}`} data-tab={t.id} aria-selected={tab === t.id} aria-controls={`umcol-${t.id}`} onClick={() => setTab(t.id, true)}><I n={TAB_ICON[t.id]} className="um-hi" /><span>{t.label}</span></button>
        ))}
      </div>
      <div className="um-cols">
        <section className="um-col" data-col="present" id="umcol-present" role="tabpanel" aria-labelledby="umtab-present">
          {topics.map((t) => (
            <div key={t.topic} className="um-g" hidden={hiddenGroup(t.decks.map((d) => 'd:' + d.id), shownP)}>
              <div className="um-gl" id={`umt-${t.topic}`}><b>{t.label}</b></div>
              <ul aria-labelledby={`umt-${t.topic}`}>{t.decks.map(deckItem)}</ul>
            </div>
          ))}
          <div className="um-g scripts" hidden={mineHidden}>
            <div className="um-gl" id="umt-mine"><b>{W.yourScripts}</b>
              <span className="um-gacts">
                <button type="button" className="um-link" title={W.newTitle} onClick={() => void newScript()}><I n="plus" /><span>{W.yourScriptsNew}</span></button>
                <button type="button" className="um-link" title={W.importHint} onClick={openImport}><I n="download" /><span>{W.yourScriptsImport}</span></button>
              </span>
            </div>
            {mine.length ? <ul aria-labelledby="umt-mine">{mine.map(scriptItem)}</ul> : <p className="um-note">{W.yourScriptsEmpty}</p>}
          </div>
        </section>
        <section className="um-col" data-col="patients" id="umcol-patients" role="tabpanel" aria-labelledby="umtab-patients">
          {groups.map((g) => (
            <div key={g.group} className="um-g" hidden={hiddenGroup(g.patients.map((p) => 'p:' + p.id), shownT)}>
              <div className="um-gl" id={`umg-${g.group}`}><b>{g.group}</b><span>{GROUP_WHERE[g.group] || ''}</span></div>
              <ul aria-labelledby={`umg-${g.group}`}>
                {g.patients.map((p) => {
                  const k = 'p:' + p.id;
                  return (
                    <Item key={k} k={k} row={rowOf(k)} hidden={!shownT.has(k)} current={patientId === p.id} info={p.label} open={openRow === k} onInfo={() => toggleInfo(k)} onHover={onHover(k)}
                      onPress={() => { void loadPatient(p.id).then((ok) => { if (ok) close(); }); }}
                      text={p.label} metas={null} trail={patientId === p.id ? <I n="check" className="um-check" /> : null} pv={<PatientPv id={p.id} label={p.label} group={g.group} />} />
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      </div>
      <p className="um-empty" hidden={!empty.show}><span>{empty.text}</span>
        <button type="button" className="um-link um-other" hidden={!empty.other} onClick={() => setTab(tab === 'present' ? 'patients' : 'present', true)}>{empty.other}</button></p>
      <footer className="um-foot">
        <button type="button" className="um-link" onClick={() => { close(); shareView(patientId); }}><I n="share" /><span>Copy link to this view</span></button>
        <button type="button" className="um-link" onClick={() => useShell.setState({ sheet: 'help' })}><I n="help" /><span>Help</span></button>
        <span className="um-esc">Esc closes</span>
      </footer>
    </div>
  );
  const hovered = hover && !sheet && hover.el.isConnected && open ? hover : null;
  return createPortal(<>
    {sheet && <div className={`um-scrim${leaving ? ' out' : ''}`} onPointerDown={close} />}
    {menu}
    {hovered && <Beside k={hovered.k} row={hovered.el} panel={ref.current} onEnter={() => clearTimeout(hideT.current)} onLeave={() => { hideT.current = window.setTimeout(() => setHover(null), 220); }}>{pvFor(hovered.k)}</Beside>}
  </>, root);
}

/** menu.js placePreview: beside the panel (over its right edge when there is no room), 40 px above the row, kept inside the screen. Put once as it shows. */
function Beside({ k, row, panel, onEnter, onLeave, children }: { k: string; row: HTMLElement; panel: HTMLElement | null; onEnter(): void; onLeave(): void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !panel) return;
    const pr = panel.getBoundingClientRect(), rr = row.getBoundingClientRect(), w = 360, ph = el.offsetHeight;
    let x = pr.right + 8;
    if (x + w > innerWidth - 8) x = Math.max(8, innerWidth - w - 8);
    const y = Math.min(Math.max(rr.top - 40, 8), Math.max(8, innerHeight - ph - 8));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }, [k, row, panel]);
  useEffect(() => { row.classList.add('pv-on'); return () => row.classList.remove('pv-on'); }, [row]);
  return (
    <div ref={ref} className="um-pv on" role="region" aria-label="Preview" key={k} onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <div className="um-pv-cut"><div className="um-pv-cutin">{children}</div></div>
    </div>
  );
}

/** After the commit has painted (a focus that must land on an element React has just shown): the one clock is not asked for a frame, a timer is enough for a focus. */
const afterCommit = (f: () => void) => { window.setTimeout(f, 0); };
