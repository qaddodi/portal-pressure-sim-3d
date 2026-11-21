// The main menu on the 2D app's own markup and class names (menu.js build / sections / deckRow / patientRow): `.umenu` with `.um-grab`, `.um-top` (the search field and the close
// button), `.um-tabs`, `.um-cols` holding the Present and Patients lists, `.um-empty` and `.um-foot`. Its stylesheet is 2D's (src/ui/css2d), copied unchanged. A popover under the menu
// button from 768 px, a bottom sheet with a scrim on the stacked layout (STACK_MQ). It is in the page only while open and leaves by `.out`. A row opens a talk or a patient; the ⓘ
// opens the preview under it (`.um-inline`), and a mouse that rests on a row shows the same preview beside the panel (`.um-pv`).
import { useSheetSwipe } from '../shell/use-sheet-swipe.ts';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PRESETS } from '../../engine/hales/portal/scenario.js';
import { builtinDeck, loadBuiltin } from '../../decks/registry.ts';
import { useShell, type MenuTab } from '../shell/store.ts';
import { useOutside } from '../shell/Pop.tsx';
import { STACK_MQ, usePresence } from '../shell/Menu.tsx';
import { placeAt, visibleBottom } from '../shell/place.ts';
import { Chart } from '../charts/Chart.tsx';
import { clamp } from '../tests/copied/num.copied.js';
import { easeArrive, D_FLIP } from '../tests/copied/ease.copied.js';
import { reduced } from '../a11y/motion.ts';
import { glide, type Glide } from './motion.ts';
import { swipeTabs, enterCol } from './swipe-tabs.ts';
import { profileScene, PROF_H } from './profile-frame.ts';
// @ts-ignore plain JS copied from the 2D app
import { SNAPSHOTS } from './snapshots.copied.js';
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
import { openFromReadings } from '../readings/FromReadings.tsx';
import { GROUP_WHERE, fold, filterRows, emptyNote, stepRow, wordsOf, chipsOf, type Snap } from './umenu-logic.ts';

import { clock } from '../../clock/frame.ts';
const PRESET_SUMMARY: Record<string, string> = Object.fromEntries((PRESETS as { id: string; summary?: string }[]).map((p) => [p.id, p.summary ?? '']));
const TABS = UI.menus.mainMenu.tabs as readonly { id: MenuTab; label: string }[];
const TAB_ICON: Record<MenuTab, string> = { present: 'projector', patients: 'scenario' };
const LEAVE_MS = 120;   // 2D --d-flip (a popover's exit); a sheet's is --d-small (menu.js close)
const SHEET_LEAVE_MS = 240;

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

/** menu.js patientPreview: the group and where it sits, the name, the pressure curve from the splanchnic bed to the right atrium (the GPU's, a Chart) with its caption, the chips (HVPG,
 *  PPG, PV, Hepatofugal; coloured by the standing cut-offs) and the summary. A patient with no settled snapshot (one made from readings) has the words alone, as in 2D. */
function PatientPv({ id, label, group }: { id: string; label: string; group: string }) {
  const s = (SNAPSHOTS as Record<string, Snap | undefined>)[id];
  return (
    <div className="um-pv-in pt">
      <span className="um-pv-meta">{`${group} · ${GROUP_WHERE[group] || ''}`}</span>
      <h3>{label}</h3>
      {s ? <span className="hp-cap">Pressure, splanchnic bed to right atrium (0 to 30 mmHg)</span> : null}
      {s ? <div className="hp-prof" aria-hidden="true"><Chart tag="menu-profile" glide={false} deps={[s.P.join(',')]} label={`${label}: pressure from the splanchnic bed to the right atrium`} build={(c) => profileScene(s.P, c)} /></div> : null}
      {s ? <span className="hp-facts">{chipsOf(s).map((c) => <span key={c.word} className={c.cls} title={c.title}>{c.word}{c.value ? <b>{c.value}</b> : null}</span>)}</span> : null}
      <p>{PRESET_SUMMARY[id] ?? ''}</p>
    </div>
  );
}

/** The preview that folds open under a row (the ⓘ) and folds shut again. */
function Inline({ open, children }: { open: boolean; children: ReactNode }) {
  const { shown, leaving } = usePresence(open, 240);   // (2D --d-small: it slides shut as it slid open)
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
  const [sheet, setSheet] = useState(() => typeof matchMedia === 'function' && matchMedia(STACK_MQ).matches);
  const { shown, leaving } = usePresence(open, sheet ? SHEET_LEAVE_MS : LEAVE_MS);
  const tab = useShell((s) => s.menuTab);
  const still = useRef(false);   // the list was swiped into place: it does not play its entrance again
  const seed = useShell((s) => s.menuQuery);
  const patientId = useShell((s) => s.patientId);
  const now = useUi((s) => s.deck?.id ?? null);
  const version = useScripts((s) => s.version);
  const mine = useMemo(() => readMine(), [version]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState('');
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [hover, setHover] = useState<{ k: string; el: HTMLElement } | null>(null);
  const hoverT = useRef(0), hideT = useRef(0);
  const root = typeof document === 'undefined' ? null : document.querySelector('.sh-root');
  const close = () => useShell.getState().close();
  useSheetSwipe(ref, close, () => sheet, true);   // (2D menu.js: a phone's menu is a sheet that follows a pull down)

  useEffect(() => { const mq = matchMedia(STACK_MQ), f = () => setSheet(mq.matches); f(); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  // a menu opened by a link carries its search (menuQuery); every other open starts empty
  useEffect(() => { if (open) { setQuery(seed); setOpenRow(null); setHover(null); useShell.setState({ menuQuery: '' }); } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (!shown || !el || sheet) return;
    // (menu.js place: the one placer, placeAt: under the button, 8 px clear, held 12 px in from the window's sides; it settles in by opacity alone)
    const put = () => { const a = document.querySelector<HTMLElement>('[data-opens="menu"]'); if (a) placeAt(el, a, { margin: 12, flip: false }); };
    put(); addEventListener('resize', put);
    return () => removeEventListener('resize', put);
  }, [shown, sheet]);
  // a sideways drag pages between Present and Patients (menu.js swipeTabs); the tab change plays the list's entrance unless the swipe has already carried it in (menu.js setTab)
  useEffect(() => {
    const el = ref.current;
    if (!shown || !el) return;
    return swipeTabs(el, { tab: () => useShell.getState().menuTab, setTab: (t, s) => { still.current = s; useShell.setState({ menuTab: t }); setHover(null); } });
  }, [shown]);
  const firstTab = useRef(true);
  useLayoutEffect(() => {
    if (firstTab.current) { firstTab.current = false; return; }
    const s = still.current; still.current = false;
    if (ref.current) enterCol(ref.current.querySelector<HTMLElement>(`.um-col[data-col="${tab}"]`), s);
  }, [tab]);
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
  // (2D menu.js: Work backward's door heads the Patients list)
  const frShown = useMemo(() => [...filterRows([{ key: 'fr', find: fold('From readings work backward enter measured pressures stiffness reverse search scenarios'), more: fold('Enter what you measured and see which lesions could give it') }], query)].length > 0, [query]);
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
    clock.cancel(hoverT.current); clock.cancel(hideT.current);
    if (!el) { hideT.current = clock.after(() => setHover(null), 220); return; }
    hoverT.current = clock.after(() => setHover({ k, el }), hover ? 120 : 300);
  };
  useEffect(() => () => { clock.cancel(hoverT.current); clock.cancel(hideT.current); }, []);

  // the preview beside the panel stays in the page while it fades out (menu.js hidePreview), holding the row it showed last
  const pvOn = !!(hover && !sheet && open && hover.el.isConnected);
  const pv = usePresence(pvOn, LEAVE_MS);
  const pvLast = useRef<{ k: string; el: HTMLElement } | null>(null);
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
      <i className="sh-grabbar" aria-hidden="true" />
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
          <div className="um-g um-fr" hidden={!frShown}><ul><li>
            <button type="button" className="um-row um-fromread" data-k="from-readings" onClick={() => { close(); openFromReadings(); }}>
              <I n="rewind" className="um-play" /><span className="um-t">From readings</span><span className="um-m">Work backward</span></button>
          </li></ul></div>
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
  const hovered = pvOn ? hover : null;
  if (hovered) pvLast.current = hovered;
  return createPortal(<>
    {sheet && <div className={`um-scrim${leaving ? ' out' : ''}`} onPointerDown={close} />}
    {menu}
    {pv.shown && pvLast.current && <Beside hover={pvLast.current} on={!!hovered} panel={ref.current} make={pvFor} onEnter={() => clock.cancel(hideT.current)} onLeave={() => { hideT.current = clock.after(() => setHover(null), 220); }} />}
  </>, root);
}

interface Old { id: number; node: ReactNode }
const PV_W = 360;   // 2D .um-pv width

/**
 * menu.js showPreview / placePreview / pvResize / hidePreview: the preview beside the panel (over its right edge when there is no room), 40 px above the row, kept inside the screen. It is one
 * card for as long as the mouse is on a row: a new row's words fade in over the old (the old ones fade out, `.um-pv-old`, and go after --d-flip), the card glides to its new place by transform
 * and eases to its new height without any height being eased (laid out once at the taller of the two; a clip with the card's own round foot runs from the old height to the new, the words cut
 * at the foot by two opposite translates). Written by the clock as `transform`, `translate` and `scale` only. It comes in and goes by the stylesheet's own `.on` (opacity and a settle by the rise).
 */
function Beside({ hover, on, panel, make, onEnter, onLeave }: { hover: { k: string; el: HTMLElement }; on: boolean; panel: HTMLElement | null; make(k: string): ReactNode; onEnter(): void; onLeave(): void }) {
  const { k, el: row } = hover;
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const geo = useRef({ x: 0, y: 0, h: 0, from: 0, move: null as Glide | null, size: null as (() => void) | null, ready: false });
  // the words on show, and the ones fading out: derived as the hovered row changes (set during render, so no frame shows both in the flow)
  const [st, setSt] = useState<{ k: string; node: ReactNode; fresh: boolean; olds: Old[]; n: number }>(() => ({ k, node: make(k), fresh: true, olds: [], n: 0 }));
  if (st.k !== hover.k) setSt({ k: hover.k, node: make(hover.k), fresh: !live, olds: live ? [...st.olds, { id: st.n, node: st.node }] : [], n: st.n + 1 });
  useEffect(() => {
    if (!st.olds.length) return;
    const ids = st.olds.map((o) => o.id);
    const t = clock.after(() => setSt((s) => ({ ...s, olds: s.olds.filter((o) => !ids.includes(o.id)) })), D_FLIP);   // (.um-pv-old fades out over D_FLIP)
    return () => clock.cancel(t);
  }, [st.olds]);
  // it shows a frame after it is in the page (the stylesheet's opacity and rise settle), and goes the same way
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (on) { void el.offsetWidth; setLive(true); } else setLive(false);
  }, [on]);
  useLayoutEffect(() => {
    const el = ref.current, g = geo.current;
    if (!el || !panel) return;
    const cut = el.firstElementChild as HTMLElement | null, cutin = cut?.firstElementChild as HTMLElement | null, now = cutin?.querySelector<HTMLElement>(':scope > .um-pv-cur');
    const h0 = g.h, h1 = now ? now.offsetHeight : el.offsetHeight;
    g.size?.();   // (a resize still running ends here, as the new one begins)
    // Beside the panel, level with the row; over the other column when there is no room beside it.
    const pr = panel.getBoundingClientRect(), rr = row.getBoundingClientRect();
    let x = pr.right + 8;
    if (x + PV_W > innerWidth - 8) x = Math.max(8, innerWidth - PV_W - 8);   // (no room beside the panel: over its right edge)
    const y = clamp(rr.top - 40, 8, visibleBottom() - h1 - 8);
    // (A card already on show glides by transform from where it is drawn now to its new place.)
    const was = g.ready ? g.y : null;
    g.move?.stop(); g.move = null;
    const put = (yy: number) => { el.style.transform = `translate(${x}px, ${yy}px)`; };
    if (was != null && Math.abs(g.from - y) >= 1 && !reduced()) {
      const a = g.from;
      g.move = glide({ ms: D_FLIP, curve: easeArrive, tag: 'menu-preview', apply: (kk) => { g.from = a + (y - a) * kk; put(g.from); } });
    } else { g.from = y; put(y); }
    g.x = x; g.y = y; g.ready = true;
    if (h0 && h1 && Math.abs(h0 - h1) >= 1 && !reduced() && cut && cutin) g.size = pvResize(el, cut, cutin, h0, h1, () => { g.size = null; });
    g.h = h1;
  }, [k, row, panel]);
  useEffect(() => () => { const g = geo.current; g.move?.stop(); g.size?.(); }, []);
  useEffect(() => { row.classList.add('pv-on'); return () => row.classList.remove('pv-on'); }, [row]);
  return (
    <div ref={ref} className={`um-pv${live ? ' on' : ''}`} role="region" aria-label="Preview" onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <div className="um-pv-cut"><div className="um-pv-cutin">
        {st.olds.map((o) => <div key={o.id} className="um-pv-old" aria-hidden="true">{o.node}</div>)}
        <div key={st.k} className={`um-pv-cur${st.fresh ? ' um-pv-first' : ''}`}>{st.node}</div>
      </div></div>
    </div>
  );
}

/**
 * menu.js pvResize: the card is laid out once at the taller height H for the change. Its glass moves onto three plates that ride transform only: the top (still, the shorter height p), a flat
 * middle that scales down from it, and the round foot that slides from the old height to the new; the words are cut at the foot by a clip. At the landing the card takes its new height and its
 * own glass back, the same size it is drawn, so nothing moves. Returns the function that ends it at once.
 */
export function pvResize(card: HTMLElement, cut: HTMLElement, cutin: HTMLElement, h0: number, h1: number, over: () => void): () => void {
  const H = Math.max(h0, h1), p = Math.min(h0, h1);
  const R = parseFloat(getComputedStyle(card).borderBottomLeftRadius) || 0, capH = Math.ceil(2 * R + 2);
  if (H - p < 1 || p < 3 * R + 4) { card.style.height = ''; over(); return () => undefined; }
  card.style.height = `${H}px`;
  card.classList.add('pv-resizing');
  // (each plate's clip and square corners are CSS, by its class: um-pv-plate-foot / -mid; nothing painted is written here)
  const plate = (top: number, height: number, kind: string) => {
    const d = document.createElement('i');
    d.className = `um-pv-plate ${kind}`; d.setAttribute('aria-hidden', 'true');
    Object.assign(d.style, { top: `${top}px`, height: `${height}px`, transformOrigin: '50% 0' });
    return d;
  };
  const foot = plate(0, capH, 'um-pv-plate-foot'), mid = plate(p - R, H - p, 'um-pv-plate-mid'), top = plate(0, p, 'um-pv-plate-top');
  card.prepend(top, mid, foot);   // (top under the middle, the foot over both)
  // (the words, old and new, cut at the foot: they never show past the card's glass. The cut, H tall, rides up by what is below the foot and its contents ride down by as much, so the words stand still and only the cut's edge moves.)
  cut.style.height = `${H}px`;
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  let ended = false, run: Glide | null = null;
  const done = () => {
    if (ended) return; ended = true; run?.stop();
    top.remove(); mid.remove(); foot.remove();
    cut.style.height = ''; cut.style.translate = ''; cutin.style.translate = '';
    card.classList.remove('pv-resizing'); card.style.height = '';
    over();
  };
  const apply = (k: number) => {
    foot.style.translate = `0px ${lerp(h0 - capH, h1 - capH, k)}px`;
    mid.style.scale = `1 ${lerp((h0 - p) / (H - p), (h1 - p) / (H - p), k)}`;
    cut.style.translate = `0px ${lerp(h0 - H, h1 - H, k)}px`;
    cutin.style.translate = `0px ${lerp(H - h0, H - h1, k)}px`;
  };
  apply(0);   // (its first frame is drawn from the old height: no frame shows the plates at rest)
  run = glide({ ms: D_FLIP, curve: easeArrive, tag: 'menu-preview', apply, done });
  return done;
}

/** After the commit has painted (a focus that must land on an element React has just shown): the one clock is not asked for a frame, a timer is enough for a focus. */
const afterCommit = (f: () => void) => { clock.after(f, 0); };
