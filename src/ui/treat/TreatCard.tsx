// The Treat card, as the 2D app's (main.js openTreat, chart.js treatBody and treatChanges, treat-page.js, card-glide.js): the same markup, class for class, so the 2D stylesheets (src/ui/styles) style it:
// the one panel head (surface/PanelHead.tsx: a title with "n running" and the X, .tc-head.card-head), three tabs (its Tabs, .instr-tabs.treat-tabs: Drugs, Fluids,
// Procedures; the chosen one is the one gliding piece, seg-glide.copied.ts),
// the orders (.treat-pane), and the Changes list (.section.chart-sec: closed until opened and then remembered, keep.ts). On a phone Changes is one row (.tcp-row) that slides its list in as a page of its own
// (.tc-page, page-push.ts), the sheet standing Full while the page is up; on a laptop or an iPad on its side it is the section under the orders. A phone's or an upright iPad's card is a sheet over the dock
// that opens at Half (as tall as its words, up to Full: sheetHeight, treat.css), and its height glides when a tab, the Changes section or the page changes it (glideCard: the card's plate is scaled, its
// words ride, the parts below the change ride and the parts whose foot opens are cut by a clip). Always in the page and faded in and out, so nothing pops; its words are the 2D app's
// (treat.generated.ts) and its numbers the engine's: an order only edits the patient's settings (orders.ts).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './treat.css';
import { useSheetSwipe } from '../shell/use-sheet-swipe.ts';
import { attachTabSwipe, neighbourTab } from '../shell/tab-swipe.ts';
import { I } from '../shell/icons.tsx';
import { useUi } from '../ui-store.ts';
import { useThumb } from '../shell/thumb.ts';
import { layoutClass, layoutVars, sheetFoot } from '../shell/room.ts';
import { isPhone } from '../layout/device.ts';
import { useTreat } from './store.ts';
import { sheetPlace } from './sheet-place.ts';
import { publishPanel } from '../surface/room.ts';
import { useColumnStep } from '../surface/wire.ts';
import { panelPlace, placedBox } from '../surface/panel-place.ts';
import { TABS, drugChips, fluids, giveFluid, procedures, pressChip, ranOn, type TabId } from './orders.ts';
import { appEnv } from './env.ts';
import { TREAT_WORDS } from './treat.generated.ts';
import { activeInterventions, factTarget, treatCount } from '../action/changes.ts';
import { currentParams, presetBase, updateParams, useParamsTick, type Params } from '../action/params.ts';
import { selectStructure } from '../action/selection.ts';
import { glideCard } from './glide.ts';
import { startSegGlideOn } from './seg-glide.copied.ts';
import { pushPage, type Pushed } from './page-push.ts';
import { openSet, remember, startsOpen } from './keep.ts';
import { reduced } from '../a11y/motion.ts';
import { D_SMALL, EASE_ARRIVE } from '../motion.ts';

import { clock, type TimerId } from '../../clock/frame.ts';
import { Fade } from '../fade.tsx';
import { PanelHead } from '../surface/PanelHead.tsx';
const L = TREAT_WORDS.lines.labels;

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
  const thumb = useThumb(), phone = isPhone(device);
  const { about, mine, p } = useChanges();
  const ref = useRef<HTMLElement>(null), tabsRef = useRef<HTMLDivElement>(null), bodyRef = useRef<HTMLDivElement>(null), paneRef = useRef<HTMLDivElement>(null), rowRef = useRef<HTMLButtonElement>(null);
  const pageRef = useRef<HTMLDivElement>(null), secRef = useRef<HTMLDetailsElement>(null);
  const [gone, setGone] = useState<Record<string, boolean>>({ fluids: true, procs: true });   // (a pane whose fade is over takes no height: 2D tp-gone)
  const [mounted, setMounted] = useState(false), [top, setTop] = useState(0);
  const push = useRef<Pushed | null>(null), glides = useRef<Animation[]>([]), closing = useRef(false);
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
    if (g && c) glides.current = glideCard(c, g.h0, c.offsetHeight, { foot, prior: glides.current, ...g.parts() });
  });
  // the panes change height with their words (a chip's note, a wrapped tile): the pane follows the tab shown
  useEffect(() => {
    const pane = paneRef.current; if (!pane || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(spare);
    for (const c of Array.from(pane.children)) ro.observe(c);
    return () => ro.disconnect();
  }, [spare]);
  // the card tells the one room channel where it stands (surface/room.ts), at the height its words need, so the figure is framed in what it leaves, the names keep off it and the
  // zoom pill steps aside: a phone's or an upright iPad's sheet over the foot (release review #15), or the card in the right column of a wide screen (stepped beside every panel
  // opened before it, surface/wire.ts useColumnStep). A phone held sideways still draws it as 2D's sheet across the foot, which takes no room (as before).
  const step = useColumnStep('treat');
  useEffect(() => {
    const c = ref.current;
    if (!open || !c || (!thumb && device === 'phone-landscape')) return;
    const put = () => {
      const h = c.offsetHeight;
      if (h <= 0) return;
      if (thumb) publishPanel('treat', { rect: sheetPlace(vp, sheetFoot(layoutClass(true)), h).rect, side: 'foot' });
      else publishPanel('treat', { rect: placedBox(panelPlace('treat', vp, device, { step }), h), side: 'right' });
    };
    put();
    if (typeof ResizeObserver === 'undefined') return () => publishPanel('treat', null);
    const ro = new ResizeObserver(put); ro.observe(c);
    return () => { ro.disconnect(); publishPanel('treat', null); };
  }, [open, thumb, vp, device, step]);
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
    push.current = pushPage(el, away, card.offsetWidth, {
      plate: true,
      onPop: () => { useTreat.getState().showChanges(false); rowRef.current?.focus({ preventScroll: true }); },
      onGone: () => { push.current = null; setMounted(false); },
    });
  }, [mounted]);
  // a sideways swipe on the card goes to the next or the previous tab, as a tap on it does (owner, 23 Nov: swipe between the tabs of every menu on touch screens); read live, so the closure never goes stale
  const live = useRef({ open, page, tab, go: (_id: TabId) => undefined as void });
  const has = !!p;
  useEffect(() => {
    const el = ref.current;
    if (!has || !el) return;
    return attachTabSwipe(el, {
      enabled: () => live.current.open && !live.current.page,
      step: (dir) => { const id = neighbourTab(TABS.map((t) => t[0]), live.current.tab, dir); if (id) live.current.go(id); },
    });
  }, [has]);
  if (!p) return null;
  const close = () => useTreat.getState().setOpen(false);
  const setTab = (id: TabId) => {
    if (id === tab) return;
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
      glides.current = glideCard(card, h0, card.offsetHeight, { foot, prior: glides.current, cut: [d, tc], free: [tc] });
      return;
    }
    closing.current = true;
    const a = (d.lastElementChild as HTMLElement).animate([{ opacity: 1 }, { opacity: 0 }], { duration: D_SMALL * 0.6, easing: EASE_ARRIVE, fill: 'forwards' });
    const fold = () => { closing.current = false; const was = card.offsetHeight; d.open = false; remember('changes', false); a.cancel(); glides.current = glideCard(card, was, card.offsetHeight, { foot, prior: glides.current }); };
    void a.finished.then(fold, fold);
  };
  // a phone's sheet follows a pull down from anywhere on it and closes past a short pull or a flick (2D swipeSheet; shell/sheet-swipe.ts)
  useSheetSwipe(ref, close, () => thumb);
  const sections = (
    <details ref={keptSection} className="section chart-sec" data-id="changes">
      <summary onClick={onSummary}><span>{L.changes}</span><Fade className="count fd-count" on={mine.length > 0}>{mine.length || ''}</Fade><I n="chev-down" className="chev" /></summary>
      <div className="section-body"><ChangesBody about={about} mine={mine} /></div>
    </details>
  );
  const paneOf = (id: TabId, cls: string, node: React.ReactNode) => {
    const off = id !== tab;
    return (
      <div key={id} className={`${cls}${off ? ' tp-off' : ''}${off && gone[id] ? ' tp-gone' : ''}`} inert={off} aria-hidden={off}
        onTransitionEnd={(e) => { if (e.target === e.currentTarget && e.propertyName === 'visibility') setGone((g) => (g[id] === off ? g : { ...g, [id]: off })); }}>
        {node}
      </div>
    );
  };
  // (in the right column, left of every panel opened before it: 2D's own `translate` transition glides it there and back, --instr-occ)
  const vars = { ...layoutVars(vp, layoutClass(thumb)), '--instr-occ': `${thumb ? 0 : step}px` } as React.CSSProperties;
  return (
    <section ref={ref} className="treat-card tr-card has-plate" id="treatCard" hidden={!open} data-open={open} data-bottom={thumb} data-device={device} data-page={page || undefined} style={vars} role="dialog" aria-label={L.treat} inert={!open}>
      <div className="sheet-plate" aria-hidden="true" />
      <i className="sh-grabbar" aria-hidden="true" />
      <div className="tr-in">
        <PanelHead className="tc-head" title={L.treat} meta={{ text: n ? `${n} running` : '' }} closeLabel="Close Treat" onClose={close}
          tabs={{ variant: 'text', className: 'treat-tabs', label: 'Treatments', value: tab, onPick: (id) => setTab(id as TabId), inert: page, ref: tabsRef,
            items: TABS.map(([id, label]) => { const v = ranOn(id, p); return { id, label, count: id !== 'fluids' ? v : undefined, ariaLabel: v ? `${label}, ${v} running` : label }; }) }} />
        <div ref={bodyRef} className="tc-body" inert={page}>
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
