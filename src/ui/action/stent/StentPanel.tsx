// The stent editor, layout M1 (owner, 22 Nov 2026, mocks in /mnt/project-files/visual-mocks/tips-card/M1-*-min.png): plain ruled rows (Diameter, Stenosis, Waist), each its name, its value and one small line, a chevron; a tap opens that
// row's controls indented right under it (its sliders, its two-way choice told by weight, Done), another tap moves the editor to that row, a tap on the open row, Done or Escape closes it. The card's actions stay under it.
// One component for the TIPS and DIPS vessel card (with the 2D card's line of three numbers: PPG, flow, peak velocity), a custom shunt's card (registerPanel('stent')) and the Tests card's IR pane (`lead`, and a vessel card's editor for that
// stent then folds to one line of its narrowings, the way into that view: 2D play-test F39). Its rows' words and the controls are the 2D app's (stent-rows.copied.ts, stent-controls.copied.ts, cut by scripts/copy-b11-stent.mjs); the
// rows are this app's own (stent-editor.css; the 2D tile rules in css2d stay as they are and no longer reach them). Each drag is one History entry (the first move of a gesture) and the later moves edit it; a change made anywhere else
// (the other card, a slide, undo) is followed. The motion is transforms and opacity only (Web Animations, FLIP): what is below the open row rides to its place, the editor fades up; the boxes are read once on the tap.
// (The stent's picture above the numbers is the charts thread's: src/ui/charts.)
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { create } from 'zustand';
import { SwitchNum } from '../../patients/SwitchNum.tsx';
import { LUMEN_STEP, lumenShown, shareFor } from '../../../engine/hales/portal/stent-geom.js';
import { latest, useEngine } from '../../../engine/index.ts';
import { fmt } from '../../charts/fmt.ts';
import { D_SURFACE, D_SMALL, EASE_ARRIVE } from '../../tests/copied/ease.copied.js';
import { currentParams, updateParams, useParamsTick } from '../params.ts';
import { OrderIcon } from '../icons.tsx';
import { Icon } from '../../shell/icons.tsx';
import { runFeature } from '../../shell/features.ts';
import './stent-editor.css';
import { registerPanel, registerHead } from '../panels.ts';
import { Chart } from '../../charts/Chart.tsx';
import { stentState } from '../../charts/stent/model.ts';
import { newKeep, tipsFigureFrame } from '../../tests/ir/tips-figure.ts';
import { stentControls } from './stent-controls.copied.ts';
import { EDITOR_ROWS, CAPTION, LUMEN, lumLo, mm1, rowValue, tileWords } from './stent-rows.copied.ts';
import { VESSEL_KEYS } from './vessel-keys.copied.ts';

const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** One editor on screen at a time (play-test F39): the Tests view's (`lead`) is the one that shows; a vessel card's for the same stent folds to the line of its narrowings. */
export const useStentLeads = create<{ shown: readonly string[]; focus: string | null }>(() => ({ shown: [], focus: null }));
export const setStentLead = (id: string, on: boolean): void => useStentLeads.setState((s) => ({ shown: on ? (s.shown.includes(id) ? s.shown : [...s.shown, id]) : s.shown.filter((x) => x !== id) }));
/** The folded line's way in: Tests › IR › TIPS on this stent. */
export function openStentInIr(id: string): void { useStentLeads.setState({ focus: id }); runFeature('ir', `Test ${id} in IR`); }

interface Ctl { id: string; type: string; label: string; min: number; max: number; step: number; format(v: number): string; get(p?: unknown): never; set(p: unknown, v: number): void; hist?: string; dimIf?(p: unknown): boolean; options?: [string, string][] }
type Anim = Animation;

/** A lumen slider's running value and what it writes: the slider shows mm, the params keep the share narrowed. */
function SliderCtl({ v, d, p }: { v: Ctl; d: number; p: unknown }) {
  const lum = LUMEN.has(v.id);
  const lo = lum ? lumLo(d, v.max) : v.min, hi = lum ? d : v.max, step = lum ? LUMEN_STEP : v.step;
  const x = v.get(p) as number;
  const toIn = (s: number) => (lum ? Math.max(lo, lumenShown(d * (1 - s))) : s), fromIn = (y: number) => (lum ? Math.min(v.max, shareFor(lumenShown(y), d)) : y);
  const fresh = useRef(true);   // the first move of a gesture is one History entry; the rest of the drag edits it
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? x, y = toIn(shown);
  const text = lum ? (shown > 0.004 ? `${mm1(y)} mm` : v.id === 'waistD' ? 'No waist' : 'Open') : v.id === 'diameter' ? `${mm1(shown)} mm` : splitFirst(v.format(shown));
  const name = v.id === 'diameter' ? 'Diameter' : CAPTION[v.id as keyof typeof CAPTION] || v.label;
  return (
    <div className="sr-ctl" data-ctl={v.id}>
      <div className="sr-cap"><span>{name}</span><b className="sr-cv"><SwitchNum text={text} /></b></div>
      <div className="range-wrap" style={{ '--p': Math.min(1, Math.max(0, (y - lo) / (hi - lo || 1))) } as CSSProperties}>
        <input type="range" min={lo} max={hi} step={step} value={y} aria-label={name} aria-valuetext={lum ? (shown > 0.004 ? `${mm1(y)} mm` : 'open') : v.format(shown)}
          onPointerDown={() => { fresh.current = true; }} onKeyDown={() => { fresh.current = true; }}
          onInput={(e) => { const s = fromIn(parseFloat((e.target as HTMLInputElement).value)); setDrag(s); updateParams((q) => { v.set(q, s); return q; }, { history: fresh.current, label: v.hist || v.label }); fresh.current = false; }}
          onPointerUp={() => setDrag(null)} onBlur={() => setDrag(null)} onChange={() => { /* (the input event carries it) */ }} />
      </div>
    </div>
  );
}
/** "40% · 6.0 mm" → the part the slider's caption prints (the millimetres first, as the tile does). */
const splitFirst = (t: string): string => { const i = t.indexOf(' · '); if (i < 0) return t; const a = t.slice(0, i), b = t.slice(i + 3); return b.endsWith('mm') && !a.endsWith('mm') ? b : a; };

function SegCtl({ v, p }: { v: Ctl; p: unknown }) {
  void p;
  const cur = v.get() as string;
  const name = CAPTION[v.id as keyof typeof CAPTION] || v.label;
  return (
    <div className="sr-ctl sr-ctl-seg" data-ctl={v.id}>
      <span className="sr-cap">{name}</span>
      <div className="sr-seg" role="group" aria-label={name}>
        {v.options!.map((o) => <button key={o[0]} type="button" data-t={o[1]} aria-pressed={o[0] === cur} onClick={() => (v as unknown as { set(val: string): void }).set(o[0])}>{o[1]}</button>)}
      </div>
    </div>
  );
}

export interface StentEditorProps {
  /** the stent's edge ID: 'TIPS', 'DIPS' or a custom shunt's */
  id: string;
  /** the Tests view's own editor: a vessel card's for the same stent folds while this one shows */
  lead?: boolean;
}

export function StentEditor({ id, lead = false }: StentEditorProps) {
  useParamsTick((s) => s.tick);   // the params changed (a drag, another card, undo): read them again
  const p = currentParams();
  const ctl = useMemo(() => stentControls(id) as Ctl[], [id]);
  const rows = useMemo(() => EDITOR_ROWS.filter((g) => g.ids.some((cid) => ctl.some((c) => c.id === cid))), [ctl]);
  const [open, setOpen] = useState('');
  const [leaving, setLeaving] = useState('');   // the row whose editor is fading out where it stood (it takes no room)
  const folded = useStentLeads((s) => !lead && s.shown.includes(id));
  const root = useRef<HTMLDivElement>(null);
  const anims = useRef<Anim[]>([]), prev = useRef(''), gen = useRef(0);
  const rowEls = useRef(new Map<string, HTMLButtonElement>()), tops = useRef(new Map<Element, number>());
  useEffect(() => { if (!lead) return; setStentLead(id, true); return () => setStentLead(id, false); }, [lead, id]);
  useEffect(() => { if (folded) setOpen(''); }, [folded]);
  useEffect(() => { setOpen(''); setLeaving(''); }, [id]);

  /** A box's top from the editor's own top (the card above may be moving as its height glides, ActionCard.tsx, and that is not this row's ride). */
  const topOf = (el: Element): number => { const box = (e: Element) => e.getBoundingClientRect(); return box(el).top - box(root.current!).top; };
  /** What stands below the open row and moves when it opens: the rows and the card's actions (read once, on the tap, never in a frame). */
  const below = (): Element[] => {
    const strip = root.current?.closest('.ac-panel')?.nextElementSibling;
    return [...rowEls.current.values(), ...(strip?.classList.contains('ac-as') ? [strip] : [])];
  };
  const choose = (rowId: string) => {
    if (folded) return;
    tops.current.clear();
    for (const el of below()) tops.current.set(el, topOf(el));
    setLeaving(open);
    setOpen(rowId === open ? '' : rowId);
  };
  // The motion, transforms and opacity only (the layout is already at its new height; what is seen glides there): the rows and the actions below ride from where they stood, the editor that comes in
  // fades up a beat after, the one that goes out fades where it stood. A move that is under way is cancelled and the next one starts from the layout it finds.
  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = open;
    if (was === open) return;
    const at = ++gen.current;
    for (const a of anims.current) a.cancel();
    anims.current = [];
    const old = tops.current, panelOf = (rid: string) => (rid ? root.current?.querySelector(`.sr-item[data-row="${rid}"] > .sr-panel`) ?? null : null), out = panelOf(leaving);
    if (reduced() || typeof Element.prototype.animate !== 'function') { old.clear(); setLeaving(''); return; }
    const move = { duration: D_SURFACE, easing: EASE_ARRIVE };
    for (const [el, y0] of old) { const dy = y0 - topOf(el); if (Math.abs(dy) > 0.5) anims.current.push(el.animate([{ transform: `translateY(${dy.toFixed(1)}px)` }, { transform: 'none' }], move)); }
    old.clear();
    const inn = panelOf(open);
    if (inn) anims.current.push(inn.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: D_SMALL, easing: EASE_ARRIVE, delay: D_SMALL * 0.4, fill: 'backwards' }));
    if (out) {
      const a = out.animate([{ opacity: 1 }, { opacity: 0 }], { duration: D_SMALL * 0.7, easing: EASE_ARRIVE, fill: 'forwards' });
      anims.current.push(a);
      const done = () => { if (gen.current === at) setLeaving(''); };
      a.finished.then(done, done);
    } else setLeaving('');
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { for (const a of anims.current) a.cancel(); }, []);

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Escape' && open) { e.stopPropagation(); choose(open); } };
  const d = (ctl.find((c) => c.id === 'diameter')?.get(p) as number | undefined) ?? 10;
  // the folded line: the stent's narrowings as the rows read them (the diameter is left out: the card's picture shows it)
  const sum = (() => {
    const st = rowValue('end', id, p), w = rowValue('waist', id, p), parts: string[] = [];
    if (st !== 'None') parts.push(`Stenosis ${st}`);
    if (w !== 'None') parts.push(`Waist ${w}`);
    return parts.length ? parts.join(' · ') : 'No narrowing';
  })();
  /** A row's editor: its sliders, then its two-way choice (or the diameter's range) and Done at its foot. */
  const editor = (r: (typeof rows)[number], gone: boolean) => {
    const cells = r.ids.map((cid) => ctl.find((c) => c.id === cid)).filter((c): c is Ctl => !!c);
    const pick = cells.find((c) => c.type === 'seg'), dia = cells.find((c) => c.id === 'diameter');
    return (
      <div className="sr-panel" role="group" data-leaving={gone || undefined} inert={gone} aria-label={`Edit ${r.name}`}>
        <div className="sr-pb">{cells.filter((c) => c.type !== 'seg').map((c) => <SliderCtl key={c.id + d} v={c} d={d} p={p} />)}</div>
        <div className="sr-foot">
          <div className="sr-fl">{pick ? <SegCtl v={pick} p={p} /> : dia ? <span className="sr-hint">{`${dia.min} to ${dia.max} mm`}</span> : null}</div>
          <button type="button" className="sr-done" aria-label={`Done with ${r.name}`} onClick={() => choose(r.id)}>Done</button>
        </div>
      </div>
    );
  };

  return (
    <div ref={root} className="se-zone tv-zone" onKeyDown={onKey}>
      <div className="stent-editor" role="group" aria-label="Edit stent" data-open={open} data-fold={folded ? 'true' : 'false'}>
        <div className="sr-rows" inert={folded}>
          {rows.map((r) => {
            const w = tileWords(r.id, id, p) as [string, string, string], t = rowValue(r.id, id, p);
            return (
              <div key={r.id} className="sr-item" data-row={r.id}>
                <button ref={(el) => { if (el) rowEls.current.set(r.id, el); else rowEls.current.delete(r.id); }} type="button" className="sr-row" data-audit-select="" aria-expanded={open === r.id} aria-label={`Edit ${r.name}: ${t}`} onClick={() => choose(r.id)}>
                  <span className="sr-n">{r.name}</span>
                  <span className="sr-vv"><span className="sr-v"><b>{w[0]}</b><u>{w[1] ? ` ${w[1]}` : ''}</u></span><span className="sr-ts">{w[2]}</span></span>
                  <Icon n="chev-down" className="sr-c" />
                </button>
                {open === r.id ? editor(r, false) : leaving === r.id ? editor(r, true) : null}
              </div>
            );
          })}
        </div>
        <button type="button" className="se-summary" aria-live="polite" aria-label={`${sum}. Open in Tests, IR`} inert={!folded} tabIndex={folded ? 0 : -1} onClick={() => openStentInIr(id)}><span className="se-sum-t">{sum}</span><OrderIcon n="chev-right" className="se-sum-ic" /></button>
      </div>
    </div>
  );
}

/** The TIPS and DIPS vessel card's three numbers (2D tips-vessel.js): the PPG, the flow, the peak velocity, as the engine's frame has them. */
function VesselKeys({ id }: { id: string }) {
  useEngine((s) => s.frames);
  const m = (latest.frame?.metrics ?? null) as Record<string, any> | null;   // eslint-disable-line @typescript-eslint/no-explicit-any
  const st = m ? (id === 'DIPS' ? m.dips : m.tips) : null;
  return (
    <div className="ir-keys tv-keys">
      {VESSEL_KEYS.map((t: { id: string; k: string; u: string; d: number; aria?: string; v(m: unknown, st: unknown): number | null }) => {
        const raw = m && (st || t.id === 'ppg') ? t.v(m, st) : null, ok = raw != null && Number.isFinite(raw), txt = ok ? fmt(raw, t.d) : '—';
        return <span key={t.id} className="ir-kv" data-k={t.id} aria-label={`${t.aria || t.k || t.u}: ${ok ? `${txt} ${t.u}` : 'not measured'}`}>{t.k ? <em>{t.k}</em> : null}<b>{txt}</b><u>{t.u}</u></span>;
      })}
    </div>
  );
}

/** The stent drawn to scale in the vessel card (2D tips-vessel.js): its lumen coloured by velocity, the waist's and the end stenosis's brackets, the three Doppler gates' numbers and the two ends'. It
 *  follows the engine's frame and the params as they are edited (a slider drag moves it at once; the brackets fade with their narrowing). The chart under it is Tests > IR's alone (`chart: false`). */
function CardFigure({ id }: { id: string }) {
  useEngine((s) => s.frames);
  useParamsTick((s) => s.tick);
  const keep = useRef(newKeep());
  const sid = id === 'DIPS' ? 'DIPS' : 'TIPS';
  const st = stentState(latest.frame, sid, currentParams() as never);
  const r = (v: number, k = 10) => Math.round(v * k);
  const sig = [st.have ? 1 : 0, r(st.flow, 100), r(st.dp), r(st.ppg), r(st.ivc), st.g.map((g) => r(g, 1)).join(), r(st.tract, 100), r(st.wall, 100), r(st.ends, 100), r(st.jet, 100), r(st.sh.len, 100), r(st.sh.waist, 100), r(st.sh.trans, 100), r(st.sh.red || 0, 1000), r(st.d), r(st.s, 1000), r(st.site, 1000)].join('|');
  // the bracket row (the waist's and the end stenosis's brackets, 14 px) is there while a narrowing is: the card's figure eases its height by that much, and the picture slides with it
  const open = (st.have && ((st.sh.red || 0) > 0.004 || st.s > 0.004)) ? 'true' : 'false';
  return (
    <div className="tf tf-card" data-row={open}>
      <div className="tf-in"><Chart tag="card-tips" deps={[sig, sid]} label={`${sid}, drawn to scale, with its pressures and velocities`}
        build={(c) => tipsFigureFrame(stentState(latest.frame, sid, currentParams() as never), c, { lens: 'velocity', labels: true, chart: false, card: true, keep: keep.current })} /></div>
    </div>
  );
}

/** The card's stent panel: for a TIPS or DIPS the numbers line and the editor; for a custom shunt the editor alone. */
export function StentPanel({ id }: { id: string }) {
  const stent = id === 'TIPS' || id === 'DIPS';
  return (
    <div className="tv" style={{ ['--se-id' as string]: id } as CSSProperties}>
      {stent && <CardFigure id={id} />}
      <StentEditor id={id} />
    </div>
  );
}

registerPanel('stent', StentPanel);
/** The TIPS and DIPS card's three readings stand in its header, between the name and the state (a custom shunt's card has none). */
registerHead('stent', ({ id }: { id: string }) => (id === 'TIPS' || id === 'DIPS' ? <VesselKeys id={id} /> : null));
