// The Treat card, as the 2D app's (main.js openTreat, chart.js treatBody and treatChanges, treat-page.js): a title with "n running" and a close button, three tabs
// (Drugs, Fluids, Procedures), the orders, and the Changes list. On a laptop or an iPad on its side Changes is a section under the orders; on a phone it is one row that
// slides its list in as a page of its own (nothing scrolls inside a card). Always in the page and faded in and out, so nothing pops; its words are the 2D app's
// (treat.generated.ts) and its numbers the engine's: an order only edits the patient's settings (orders.ts).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import './treat.css';
import { Icon } from '../shell/icons.tsx';
import { OrderIcon } from '../action/icons.tsx';
import { useUi } from '../ui-store.ts';
import { isPhone } from '../layout/device.ts';
import { usesBottomBar } from '../shell/room.ts';
import { useTreat } from './store.ts';
import { TABS, drugChips, fluids, giveFluid, procedures, pressChip, ranOn, type TabId } from './orders.ts';
import { appEnv } from './env.ts';
import { TREAT_WORDS } from './treat.generated.ts';
import { activeInterventions, factTarget, treatCount } from '../action/changes.ts';
import { currentParams, presetBase, updateParams, useParamsTick, type Params } from '../action/params.ts';
import { selectStructure } from '../action/selection.ts';

const L = TREAT_WORDS.lines.labels;

/** What the patient came with is a fact about them, not a change to undo; the rest is the learner's own. */
function useChanges() {
  useParamsTick((s) => s.tick);
  const p = currentParams() as Params | null;
  if (!p) return { about: [], mine: [], p: null as Params | null };
  const base = presetBase();
  const baseLabels = new Set(base ? activeInterventions(base).map((a) => a.label) : []);
  const active = activeInterventions(p);
  return { about: active.filter((a) => baseLabels.has(a.label)), mine: active.filter((a) => !baseLabels.has(a.label)), p };
}

const splitLabel = (label: string): [string, string | null] => { const m = /^(.*?)\s+([×\d].*)$/.exec(label); return m ? [m[1], m[2]] : [label, null]; };
const clearAll = () => updateParams((q) => { const base = presetBase(); if (base) return structuredClone(base); for (const a of activeInterventions(q)) a.remove(q); return q; }, { label: L.clearAll });

function Row({ a, undo }: { a: ReturnType<typeof activeInterventions>[number]; undo: boolean }) {
  const [name, value] = splitLabel(a.label);
  const go = !undo ? factTarget(a.key) : null;
  if (go) {
    return (
      <div className="tr-chg" data-about role="listitem">
        <button type="button" className="tr-chg-go" title={L.showIt} aria-label={`${a.label}: ${L.showIt.toLowerCase()}`} onClick={() => selectStructure(go)}>
          <span className="tr-chg-n">{name}</span>{value && <span className="tr-chg-v">{value}</span>}<Icon n="chev-right" className="tr-chg-ch" />
        </button>
      </div>
    );
  }
  return (
    <div className="tr-chg" data-about={!undo || undefined} role="listitem">
      <span className="tr-chg-n">{name}</span>{value && <span className="tr-chg-v">{value}</span>}
      {undo && <button type="button" className="tr-ib tr-chg-x" aria-label={`Undo ${a.label}`} title={L.undoThis} onClick={() => updateParams((q) => { a.remove(q); return q; }, { label: `Remove ${a.label}` })}><Icon n="close" /></button>}
    </div>
  );
}

/** The Changes list and its Clear all (the one the section and the phone's page both show). */
function ChangesList({ about, mine }: { about: ReturnType<typeof activeInterventions>; mine: ReturnType<typeof activeInterventions> }) {
  return (
    <>
      <div className="tr-list" role="list" data-n={mine.length}>
        {about.length > 0 && <div className="tr-sub">{L.aboutThis}</div>}
        {about.map((a) => <Row key={`about:${a.label}`} a={a} undo={false} />)}
        {about.length > 0 && <div className="tr-sub">{L.yours}</div>}
        {mine.map((a) => <Row key={`mine:${a.label}`} a={a} undo />)}
      </div>
      {mine.length === 0 && <p className="tr-empty"><b>{L.nothing[0]}</b>{L.nothing[1]}</p>}
      {mine.length > 0 && <button type="button" className="tr-link" onClick={clearAll}>{L.clear}</button>}
    </>
  );
}

function Chip({ id, label, note, on }: { id: string; label: string; note: string; on: boolean }) {
  return (
    <button type="button" className="tr-chip" aria-pressed={on} title={note} onClick={() => pressChip(id)}>
      <span className="tr-chip-t">{label}</span><span className="tr-chip-dot" aria-hidden="true"><Icon n="check" /></span>
    </button>
  );
}

function Fluid({ id, label, sub }: { id: string; label: string; sub: string }) {
  const [given, setGiven] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button type="button" className="tr-order tr-fluid" data-given={given || undefined} title={`${label}: ${sub}`}
      onClick={() => { giveFluid(appEnv, id); setGiven(true); clearTimeout(t.current); t.current = setTimeout(() => setGiven(false), 1400); }}>
      <span className="tr-order-t">{label}<small>{sub}</small></span>
    </button>
  );
}

function Panes({ p, tab }: { p: Params; tab: TabId }) {
  const onTab = (id: TabId, node: ReactNode, cls = '') => <div key={id} className={`tr-pane-in ${cls}`} data-off={id !== tab || undefined} inert={id !== tab} aria-hidden={id !== tab}>{node}</div>;
  return (
    <div className="tr-pane">
      {onTab('drugs', <div className="tr-chips">{drugChips().map((c) => <Chip key={c.id} id={c.id} label={c.label} note={c.note} on={c.get(p)} />)}</div>)}
      {onTab('fluids', <div className="tr-grid tr-three">{fluids().map((f) => <Fluid key={f.id} {...f} />)}</div>)}
      {onTab('procs', (
        <div className="tr-grid">
          {procedures().map((x) => {
            const on = !!x.placed?.(p);
            return (
              <button key={x.id} type="button" className="tr-order" data-on={on || undefined} title={`${x.long}: ${x.sub}`} aria-label={on ? `${x.long}, in place` : x.long} onClick={() => x.run(appEnv)}>
                <OrderIcon n={x.icon} className="tr-ic" /><span className="tr-order-t">{x.label}</span>
                <span className="tr-tick" aria-hidden="true"><Icon n="check" /></span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function TreatCard() {
  const open = useTreat((s) => s.open), tab = useTreat((s) => s.tab), page = useTreat((s) => s.changesPage);
  const device = useUi((s) => s.device);
  const phone = isPhone(device), bottom = usesBottomBar(device);
  const { about, mine, p } = useChanges();
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number } | null>(null);
  const n = p ? treatCount(p) : 0;
  // a phone has room for one card: the Changes page goes with the card
  useEffect(() => { if (!open && page) useTreat.getState().showChanges(false); }, [open, page]);
  if (!p) return null;
  const close = () => useTreat.getState().setOpen(false);
  // pull the sheet down to put it away (a phone's bottom sheet: transform only, written to the element; never through state)
  const onDown = (e: React.PointerEvent) => { if (!bottom) return; drag.current = { y: e.clientY }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d || !ref.current) return; ref.current.style.transition = 'none'; ref.current.style.transform = `translateY(${Math.max(0, e.clientY - d.y)}px)`; };
  const onUp = (e: React.PointerEvent) => { const d = drag.current; drag.current = null; const el = ref.current; if (!d || !el) return; const dy = e.clientY - d.y; el.style.transition = ''; el.style.transform = ''; if (dy > 70) close(); };
  return (
    <section ref={ref} className="tr-card" data-open={open} data-bottom={bottom || undefined} data-device={device} data-page={page || undefined} role="dialog" aria-label={L.treat} inert={!open}>
      <div className="tr-grab" aria-hidden="true" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}><i /></div>
      <header className="tr-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <h2>{L.treat}</h2><span className="tr-meta" data-on={n > 0 || undefined}>{n ? `${n} running` : ''}</span>
        <button type="button" className="tr-ib" aria-label="Close Treat" title="Close (Esc)" onClick={close}><Icon n="close" /></button>
      </header>
      <div className="tr-stage" data-page={page || undefined}>
        <div className="tr-main" inert={page}>
          <div className="tr-tabs" role="tablist" aria-label="Treatments">
            {TABS.map(([id, label]) => {
              const v = ranOn(id, p);
              return (
                <button key={id} type="button" role="tab" className="tr-tab" aria-selected={tab === id} aria-label={v ? `${label}, ${v} running` : label} onClick={() => useTreat.getState().setTab(id)}>
                  <span className="tr-tab-l">{label}<span className="tr-tab-n" data-on={v > 0 || undefined} aria-hidden="true">{v || ''}</span></span>
                </button>
              );
            })}
          </div>
          <div className="tr-body">
            <Panes p={p} tab={tab} />
            {phone ? (
              <button type="button" className="tr-row" aria-haspopup="dialog" onClick={() => useTreat.getState().showChanges(true)}>
                <span className="tr-row-t">{L.changes}</span><span className="tr-row-n" data-on={mine.length > 0 || undefined}>{mine.length || ''}</span><Icon n="chev-right" />
              </button>
            ) : (
              <details className="tr-sec">
                <summary><span>{L.changes}</span><span className="tr-count" data-on={mine.length > 0 || undefined}>{mine.length || 0}</span><Icon n="chev-down" className="tr-chev" /></summary>
                <div className="tr-sec-body"><ChangesList about={about} mine={mine} /></div>
              </details>
            )}
          </div>
        </div>
        {phone && (
          <div className="tr-page" role="group" aria-label={L.changes} inert={!page}>
            <div className="tr-page-head">
              <button type="button" className="tr-back" onClick={() => useTreat.getState().showChanges(false)}><Icon n="chev-left" />{L.treat}</button>
              <span className="tr-page-title">{L.changes}</span>
            </div>
            <div className="tr-page-body"><ChangesList about={about} mine={mine} /></div>
          </div>
        )}
      </div>
    </section>
  );
}
