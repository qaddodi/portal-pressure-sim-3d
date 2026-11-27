// The Treat card, as the 2D app's (main.js openTreat, chart.js treatBody and treatChanges, treat-page.js, card-glide.js): the same markup, class for class, so the 2D stylesheets (src/ui/styles) style it:
// the one panel head (surface/PanelHead.tsx: a title with "n running" and the X, .tc-head.card-head), three tabs (its Tabs, .instr-tabs.treat-tabs: Drugs, Fluids,
// Procedures; the chosen one is the one gliding piece, seg-glide.copied.ts),
// the orders (.treat-pane), and the Changes list (.section.chart-sec: closed until opened and then remembered, keep.ts). On a phone Changes is one row (.tcp-row) that slides its list in as a page of its own
// (.tc-page, surface/page-push.ts), the sheet standing Full while the page is up; on a laptop or an iPad on its side it is the section under the orders. A phone's or an upright iPad's card is a sheet over the dock
// that opens at Half (as tall as its words, up to Full: sheetHeight, treat.css), and its height glides when a tab, the Changes section or the page changes it (surface/height-glide.ts: the card's plate is scaled, its
// words ride, the parts below the change ride and the parts whose foot opens are cut by a clip). Always in the page and faded in and out, so nothing pops; its words are the 2D app's
// (treat.generated.ts) and its numbers the engine's: an order only edits the patient's settings (orders.ts).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './treat.css';
import { flushSync } from 'react-dom';
import { attachTabSwipe } from '../surface/tab-swipe.ts';
import { readMetric } from '../layout-snap.ts';
import { I } from '../shell/icons.tsx';
import { useUi } from '../ui-store.ts';
import { useSurfaceMode } from '../surface/mode.ts';
import { usePanelSheet } from '../surface/use-sheet.ts';
import { stopsFor, stopVars } from '../surface/sheet-stops.ts';
import { SheetGrab } from '../surface/parts.tsx';
import { layoutClass, layoutVars, sheetFoot } from '../shell/room.ts';
import { isPhone } from '../layout/device.ts';
import { useTreat } from './store.ts';
import { sheetPlace } from './sheet-place.ts';
import { publishPanel } from '../surface/room.ts';
import { usePanelShell } from '../surface/wire.ts';
import { TABS, drugChips, fluids, giveFluid, procedures, pressChip, ranOn, type TabId } from './orders.ts';
import { appEnv } from './env.ts';
import { TREAT_WORDS } from './treat.generated.ts';
import { activeInterventions, factTarget, treatCount } from '../action/changes.ts';
import { currentParams, presetBase, updateParams, useParamsTick, type Params } from '../action/params.ts';
import { selectStructure } from '../action/selection.ts';
import { glideHeight } from '../surface/height-glide.ts';
import { startSegGlideOn } from './seg-glide.copied.ts';
import { pushPage, type Push } from '../surface/page-push.ts';
import { openSet, remember, startsOpen } from './keep.ts';
import { reduced } from '../a11y/motion.ts';
import { D_SMALL, EASE_ARRIVE } from '../motion.ts';

import { clock, type TimerId } from '../../clock/frame.ts';
import { Fade } from '../fade.tsx';
import { PanelHead } from '../surface/PanelHead.tsx';
import { useCaseBarUp } from '../case/room.ts';
const L = TREAT_WORDS.lines.labels;
const closeTreat = () => useTreat.getState().setOpen(false);
const TAB_IDS: readonly TabId[] = TABS.map((t) => t[0]);

type Active = ReturnType<typeof activeInterventions>[number];

/** What the patient came with is a fact about them, not a change to undo; the rest is the learner's own. */
function useChanges() {
  useParamsTick((s) => s.tick);
  const p = currentParams() as Params | null;
  if (!p) return { about: [] as Active[], mine: [] as Active[], p: null as Params | null };
  const base = presetBase();
  const baseLabels = new Set(base ? activeInterventions(base).map((a) => a.label) : []);
  const active = activeInterventions(p);
  return { about: active.filter((a) => baseLabels.has(a.label)), mine: active.filter((a) => !baseLabels.has(a.label)), p };
}

const splitLabel = (label: string): [string, string | null] => { const m = /^(.*?)\s+([×\d].*)$/.exec(label); return m ? [m[1]!, m[2]!] : [label, null]; };
const clearAll = () => updateParams((q) => { const base = presetBase(); if (base) return structuredClone(base); for (const a of activeInterventions(q)) a.remove(q); return q; }, { label: L.clearAll });

function Row({ a, undo }: { a: Active; undo: boolean }) {
  const [name, value] = splitLabel(a.label);
  const go = !undo ? factTarget(a.key) : null;
  if (go) {
    return (
      <div className="chg about" role="listitem">
        <button type="button" className="chg-go" title={L.showIt} aria-label={`${a.label}: ${L.showIt.toLowerCase()}`} onClick={() => selectStructure(go)}>
          <span className="chg-n">{name}</span>{value && <span className="chg-v">{value}</span>}<I n="chev-right" className="chg-ch" />
        </button>
      </div>
    );
  }
  return (
    <div className={`chg${undo ? '' : ' about'}`} role="listitem">
      <span className="chg-n">{name}</span>{value && <span className="chg-v">{value}</span>}
      {undo && <button type="button" className="ib chg-x" aria-label={`Undo ${a.label}`} title={L.undoThis} onClick={() => updateParams((q) => { a.remove(q); return q; }, { label: `Remove ${a.label}` })}><I n="close" /></button>}
    </div>
  );
}

/** The Changes list (2D chart.js changes()): "About this patient" and "Your changes", the hint while there are none, and Clear all. */
function ChangesBody({ about, mine }: { about: Active[]; mine: Active[] }) {
  return (
    <>
      <div className="chg-list" role="list" data-n={mine.length}>
        {about.length > 0 && <div className="chg-sub">{L.aboutThis}</div>}
        {about.map((a) => <Row key={`about:${a.label}`} a={a} undo={false} />)}
        {about.length > 0 && <div className="chg-sub">{L.yours}</div>}
        {mine.map((a) => <Row key={`mine:${a.label}`} a={a} undo />)}
      </div>
      <Fade as="p" axis="y" className="fd-empty" on={mine.length === 0}><b>{L.nothing[0]}</b>{L.nothing[1]}</Fade>
      <Fade as="button" axis="y" type="button" className="link chg-clear" on={mine.length > 0} onClick={clearAll}>{L.clear}</Fade>
    </>
  );
}

function Chip({ id, label, note, on }: { id: string; label: string; note: string; on: boolean }) {
  return (
    <button type="button" className="order-chip" aria-pressed={on} title={note} onClick={() => pressChip(id)}>
      <span className="oc-t" data-t={label}>{label}</span><span className="oc-dot"><I n="check" /></span>
    </button>
  );
}

function Fluid({ id, label, sub }: { id: string; label: string; sub: string }) {
  const [given, setGiven] = useState(false);
  const t = useRef<TimerId | undefined>(undefined);
  useEffect(() => () => clock.cancel(t.current), []);
  return (
    <button type="button" className="order-btn fluid-btn" data-given={given ? '' : undefined} title={`${label}: ${sub}`}
      onClick={() => { giveFluid(appEnv, id); setGiven(true); clock.cancel(t.current); t.current = clock.after(() => setGiven(false), 1400); }}>
      <span className="ob-t">{label}<small>{sub}</small></span>
    </button>
  );
}

export function TreatCard() {
  const open = useTreat((s) => s.open), tab = useTreat((s) => s.tab), page = useTreat((s) => s.changesPage);
  const device = useUi((s) => s.device), vp = useUi((s) => s.vp);
  // (a sheet exactly when every surface is one: surface/mode.ts)
  const thumb = useSurfaceMode() === 'sheet', phone = isPhone(device);
  const { about, mine, p } = useChanges();
  const ref = useRef<HTMLElement>(null), tabsRef = useRef<HTMLDivElement>(null), bodyRef = useRef<HTMLDivElement>(null), paneRef = useRef<HTMLDivElement>(null), rowRef = useRef<HTMLButtonElement>(null);
  const pageRef = useRef<HTMLDivElement>(null), secRef = useRef<HTMLDetailsElement>(null);
  const [gone, setGone] = useState<Record<string, boolean>>({ fluids: true, procs: true });   // (a pane whose fade is over takes no height: 2D tp-gone)
  const [mounted, setMounted] = useState(false), [top, setTop] = useState(0);
  const push = useRef<Push | null>(null), glides = useRef<Animation[]>([]), closing = useRef(false);
  const pending = useRef<{ h0: number; parts: () => GlideParts } | null>(null);
  const n = p ? treatCount(p) : 0;
  const foot = thumb;   // (a sheet over the dock stands on its foot: its plate scales about the foot and the words ride, card-glide.js)

  type GlideParts = { ride?: (Element | null)[]; cut?: (Element | null)[]; free?: (Element | null)[] };
  /** Asks for the card's height change that the next render makes to glide, from the height it has now (2D chart.js show(): h0 read in the tap, the glide started once the change is laid out). */
  const ask = useCallback((parts: () => GlideParts = () => ({})) => { const c = ref.current; if (c && !reduced() && useTreat.getState().open) pending.current = { h0: c.offsetHeight, parts }; }, []);
  /** The pane is as tall as the tab shown (2D chart.js spare(): a taller tab fading out is cut at it, not scrolled into the card's body). */
  const spare = useCallback(() => {
    const pane = paneRef.current; if (!pane) return;
    const on = pane.querySelector<HTMLElement>(':scope > :not(.tp-off)'); if (!on) return;
    const cs = getComputedStyle(pane);
    pane.style.height = `${on.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)}px`;
  }, []);
  useLayoutEffect(() => {
    spare();
    const g = pending.current; pending.current = null;
    const c = ref.current;
    if (g && c) glides.current = glideHeight(c, g.h0, c.offsetHeight, { foot, prior: glides.current, ...g.parts() });
  });
  // the panes change height with their words (a chip's note, a wrapped tile): the pane follows the tab shown
  useEffect(() => {
    const pane = paneRef.current; if (!pane || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(spare);
    for (const c of Array.from(pane.children)) ro.observe(c);
    return () => ro.disconnect();
  }, [spare]);
  // On a wide screen (float mode, a phone held sideways too) the panel shell places the card in the right column, beside every panel opened before it, publishes its box to the
  // one room channel and moves it (surface/Panel.tsx usePanelShell). A phone's or an upright iPad's sheet over the foot tells the channel itself, at the height its words need
  // (release review #15), so the figure is framed in what it leaves, the names keep off it and the zoom pill steps aside.
  const shell = usePanelShell('treat', open, ref, true);
  useEffect(() => {
    const c = ref.current;
    if (!open || !c || !thumb) return;
    const put = () => {
      const h = c.offsetHeight;
      if (h > 0) publishPanel('treat', { rect: sheetPlace(vp, sheetFoot(layoutClass(true)), h).rect, side: 'foot' });
    };
    put();
    if (typeof ResizeObserver === 'undefined') return () => publishPanel('treat', null);
    const ro = new ResizeObserver(put); ro.observe(c);
    return () => { ro.disconnect(); publishPanel('treat', null); };
  }, [open, thumb, vp]);
  // the tab strip's one gliding piece (the 2D stylesheet draws it)
  useEffect(() => (ref.current ? startSegGlideOn(ref.current) : undefined), []);
  // Changes is remembered open across opens and visits (2D chart.js section(): `open`, pps.chartOpen3): the section the card makes finds it as it was left (a phone's page always shows it open)
  const keptSection = useCallback((d: HTMLDetailsElement | null) => { secRef.current = d; if (d) d.open = d.closest('.tc-page') ? true : startsOpen('changes', openSet()); }, []);
  // a phone has room for one card: the Changes page goes with the card
  useEffect(() => {
    if (!open && (page || mounted)) { push.current = null; setMounted(false); useTreat.getState().showChanges(false); }
  }, [open, page, mounted]);
  // the page: slides in from the right over the tabs and the body when it is mounted (2D treat-page.js open())
  useLayoutEffect(() => {
    const el = pageRef.current, card = ref.current;
    if (!mounted || !el || !card) return;
    const away = [tabsRef.current, bodyRef.current].filter((e): e is HTMLDivElement => !!e);
    const pushed = pushPage(el, away, card.offsetWidth, {
      plate: true, prop: 'translate', tag: 'treat-page',
      onPop: () => { useTreat.getState().showChanges(false); rowRef.current?.focus({ preventScroll: true }); },
      onGone: () => { push.current = null; setMounted(false); },
    });
    push.current = pushed;
    // (the page left the card: nothing it started goes on writing)
    return () => pushed.dispose();
  }, [mounted]);
  // a sideways swipe on the card pages between the tabs with the finger (owner, 23 Nov: swipe between the tabs of every menu on touch screens): the one tab swipe, surface/tab-swipe.ts, as
  // the Tests card and the main menu page. The open orders follow the finger and the next tab's peek in beside them (.tp-peer); the tab that lands takes the card as it stands, and the one that
  // left goes at once, already off the card (.tp-cut, never its fade). Read live, so the closure never goes stale.
  const live = useRef({ open, page, tab, go: (_id: TabId, _swiped?: boolean) => undefined as void });
  const [cut, setCut] = useState<TabId | null>(null);
  const has = !!p;
  useEffect(() => {
    const el = ref.current, pane = paneRef.current;
    if (!has || !el || !pane) return;
    const of = (id: TabId) => pane.querySelector<HTMLElement>(`:scope > [data-tp="${id}"]`);
    return attachTabSwipe<TabId>(el, {
      tag: 'treat-swipe',
      enabled: () => live.current.open && !live.current.page,
      tabs: () => TAB_IDS,
      open: () => live.current.tab,
      width: () => readMetric(pane, 'clientWidth'),
      active: () => of(live.current.tab),
      // (the one it replaces, or the one put back, is hidden at once where it stands: it never fades over the open orders)
      peer: (id, was) => { was?.classList.add('tp-cut'); was?.classList.remove('tp-peer'); const nb = id ? of(id) : null; nb?.classList.add('tp-peer'); return nb; },
      land: (id, cur) => { flushSync(() => live.current.go(id, true)); cur.style.transform = ''; },
    });
  }, [has]);
  // a phone's or an upright iPad's sheet: Peek, Half (as tall as its words, capped) and Full, the one pull and the one grab bar (surface/use-sheet.ts); Full while the Changes page stands
  const caseUp = useCaseBarUp();
  const stops = useMemo(() => stopsFor(vp, device, { kind: 'words', h: Infinity }), [vp, device, caseUp]);  // eslint-disable-line react-hooks/exhaustive-deps
  const sheet = usePanelSheet({ ref, on: thumb && open, stops, close: closeTreat, tag: 'treat-sheet' });
  const setSheet = sheet.set;
  useEffect(() => { if (page && thumb) setSheet('full'); }, [page, thumb, setSheet]);
  if (!p) return null;
  const close = closeTreat;
  const setTab = (id: TabId, swiped = false) => {
    if (id === tab) return;
    setCut(swiped ? tab : null);
    // (A tab that changes the card's height glides it: the Changes row under the list rides from where it stood and the list's cut at its foot opens or closes with the plate.)
    ask(() => { const pane = paneRef.current; return { ride: [pane?.nextElementSibling ?? null], cut: [pane, bodyRef.current], free: [bodyRef.current] }; });
    setGone((g) => (g[id] ? { ...g, [id]: false } : g));
    useTreat.getState().setTab(id);
  };
  live.current = { open, page, tab, go: setTab };
  const openPage = () => {
    if (mounted) return;
    ask();
    setTop(tabsRef.current?.offsetTop ?? 0);   // (read in the tap itself, once: the page stands where the tabs stood and runs to the sheet's foot)
    setMounted(true); useTreat.getState().showChanges(true);
  };
  const closePage = () => { ask(); push.current?.pop(0); };
  // Changes opens and shuts by the card's glide (2D chart.js section(): done in the tap itself so no frame is drawn at the new height first; closing fades the words first, then folds and glides)
  const onSummary = (e: React.MouseEvent) => {
    const d = secRef.current, card = ref.current;
    if (!d || !card || reduced() || closing.current) { if (closing.current) e.preventDefault(); else if (d) remember('changes', !d.open); return; }
    e.preventDefault();
    const h0 = card.offsetHeight, tc = bodyRef.current;
    if (!d.open) {
      d.open = true; remember('changes', true);
      glides.current = glideHeight(card, h0, card.offsetHeight, { foot, prior: glides.current, cut: [d, tc], free: [tc] });
      return;
    }
    closing.current = true;
    const a = (d.lastElementChild as HTMLElement).animate([{ opacity: 1 }, { opacity: 0 }], { duration: D_SMALL * 0.6, easing: EASE_ARRIVE, fill: 'forwards' });
    const fold = () => { closing.current = false; const was = card.offsetHeight; d.open = false; remember('changes', false); a.cancel(); glides.current = glideHeight(card, was, card.offsetHeight, { foot, prior: glides.current }); };
    void a.finished.then(fold, fold);
  };
  const sections = (
    <details ref={keptSection} className="section chart-sec" data-id="changes">
      <summary onClick={onSummary}><span>{L.changes}</span><Fade className="count fd-count" on={mine.length > 0}>{mine.length || ''}</Fade><I n="chev-down" className="chev" /></summary>
      <div className="section-body"><ChangesBody about={about} mine={mine} /></div>
    </details>
  );
  const paneOf = (id: TabId, cls: string, node: React.ReactNode) => {
    const off = id !== tab;
    return (
      <div key={id} data-tp={id} className={`${cls}${off ? ' tp-off' : ''}${off && gone[id] ? ' tp-gone' : ''}${off && cut === id ? ' tp-cut' : ''}`} inert={off} aria-hidden={off}
        onTransitionEnd={(e) => { if (e.target === e.currentTarget && e.propertyName === 'visibility') setGone((g) => (g[id] === off ? g : { ...g, [id]: off })); }}>
        {node}
      </div>
    );
  };
  // (in float mode the shell's place and its step left of the panels opened before it are the card's, panel.css; 2D's --instr-occ rides at 0)
  const vars = { ...layoutVars(vp, layoutClass(thumb)), '--instr-occ': '0px', ...(thumb ? stopVars(stops) : shell.vars) } as React.CSSProperties;
  return (
    <section ref={ref} className="treat-card tr-card has-plate sf-panel" {...shell.attrs} id="treatCard" hidden={!open} data-open={open} data-bottom={thumb} data-device={device}
      data-page={page || undefined} data-sheet={thumb ? sheet.at : undefined} style={vars} role="dialog" aria-label={L.treat} inert={!open}>
      <div className="sheet-plate" aria-hidden="true" />
      <SheetGrab label="Resize Treat" onGrab={sheet.grab} />
      <div className="tr-in">
        <PanelHead className="tc-head" title={L.treat} meta={{ text: n ? `${n} running` : '' }} closeLabel="Close Treat" onClose={close}
          tabs={{ variant: 'text', className: 'treat-tabs', label: 'Treatments', value: tab, onPick: (id) => setTab(id as TabId), inert: page, ref: tabsRef,
            items: TABS.map(([id, label]) => { const v = ranOn(id, p); return { id, label, count: id !== 'fluids' ? v : undefined, ariaLabel: v ? `${label}, ${v} running` : label }; }) }} />
        <div ref={bodyRef} className="tc-body sf-body" inert={page}>
          <div ref={paneRef} className="treat-pane">
            {paneOf('drugs', 'order-chips', drugChips().map((c) => <Chip key={c.id} id={c.id} label={c.label} note={c.note} on={c.get(p)} />))}
            {paneOf('fluids', 'order-grid three', fluids().map((f) => <Fluid key={f.id} {...f} />))}
            {paneOf('procs', 'order-grid', procedures().map((x) => {
              const on = !!x.placed?.(p);
              return (
                <button key={x.id} type="button" className="order-btn" data-audit-select="" data-on={on ? '' : undefined} title={`${x.long}: ${x.sub}`} aria-label={on ? `${x.long}, in place` : x.long} onClick={() => x.run(appEnv)}>
                  <I n={x.icon} className="ac-ic" /><span className="ob-t">{x.label}</span>
                  {x.placed && <span className="ob-on" aria-hidden="true"><I n="check" /></span>}
                </button>
              );
            }))}
          </div>
          {phone ? (
            <button ref={rowRef} type="button" className="tcp-row" aria-haspopup="dialog" onClick={openPage}>
              <span className="tcp-t">{L.changes}</span><span className="tcp-n">{mine.length || ''}</span><I n="chev-right" />
            </button>
          ) : sections}
        </div>
        {phone && mounted && (
          <div ref={pageRef} className="tc-page" role="group" aria-label={L.changes} style={{ top }}>
            <div className="tcp-head">
              <button type="button" className="tcp-back" onClick={closePage}><I n="chev-left" />{L.treat}</button>
              <span className="tcp-title">{L.changes}</span>
            </div>
            <div className="tcp-body">{sections}</div>
          </div>
        )}
      </div>
    </section>
  );
}
