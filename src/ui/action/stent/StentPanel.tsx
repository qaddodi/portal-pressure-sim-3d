// The stent editor (2D stent-editor.js, option A, the tab tray): three tiles side by side (Diameter, Stenosis, Waist), each its name, its value and one small line; a tap fills a tile in and a tray
// unrolls from under the row with that tile's controls, its two-way choice and Done at its foot; another tap moves the tray to that tile, a tap on the open tile, Done or Escape rolls it back up.
// One panel for the TIPS and DIPS vessel card (with the 2D card's line of three numbers: PPG, flow, peak velocity) and for a custom shunt's card, registered as registerPanel('stent'); the Tests card's
// IR pane mounts the same editor as `lead` (and a vessel card's editor for that stent then folds to one line of its narrowings, the way into that view: 2D play-test F39).
// The tiles' words and the controls are the 2D app's (stent-rows.copied.ts, stent-controls.copied.ts, cut by scripts/copy-b11-stent.mjs). Each drag is one History entry (the first move of a gesture)
// and the later moves edit it; a change made anywhere else (the other card, a slide, undo) is followed. The tray's motion is transforms and opacity only (Web Animations), the boxes read once on the tap.
// (The stent's picture above the numbers is the charts thread's: the stent pictures are still to come in src/ui/charts.)
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { create } from 'zustand';
import { LUMEN_STEP, lumenShown, shareFor } from '../../../engine/hales/portal/stent-geom.js';
import { latest, useEngine } from '../../../engine/index.ts';
import { fmt } from '../../charts/fmt.ts';
import { D_SURFACE, D_SMALL, EASE_ARRIVE } from '../../tests/copied/ease.copied.js';
import { currentParams, updateParams, useParamsTick } from '../params.ts';
import { OrderIcon } from '../icons.tsx';
import { Icon } from '../../shell/icons.tsx';
import { runFeature } from '../../shell/features.ts';
import { registerPanel } from '../panels.ts';
import { stentControls } from './stent-controls.copied.ts';
import { EDITOR_ROWS, CAPTION, LUMEN, lumLo, mm1, rowValue, tileWords } from './stent-rows.copied.ts';
import { VESSEL_KEYS } from './vessel-keys.copied.ts';

const R = 12;   // (the tray's corner radius, px)
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
    <div className="se-ctl" data-ctl={v.id}>
      <div className="se-cap"><span>{name}</span><b className="se-cv">{text}</b></div>
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
  const cur = v.get() as string, at = Math.max(0, v.options!.findIndex((o) => o[0] === cur));
  const name = CAPTION[v.id as keyof typeof CAPTION] || v.label;
  return (
    <div className="se-ctl se-ctl-seg" data-ctl={v.id}>
      <span className="se-cap">{name}</span>
      <div className="se-seg" role="group" aria-label={name} data-at={at}>
        <i className="se-thumb" aria-hidden="true" />
        {v.options!.map((o) => <button key={o[0]} type="button" aria-pressed={o[0] === cur} onClick={() => (v as unknown as { set(val: string): void }).set(o[0])}>{o[1]}</button>)}
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
  const [leaving, setLeaving] = useState('');
  const folded = useStentLeads((s) => !lead && s.shown.includes(id));
  const root = useRef<HTMLDivElement>(null), tin = useRef<HTMLDivElement>(null), join = useRef<HTMLElement>(null), bgM = useRef<HTMLElement>(null), bgB = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null), foot = useRef<HTMLDivElement>(null), footL = useRef<HTMLDivElement>(null);
  const anims = useRef<Anim[]>([]), prev = useRef(''), oldH = useRef(0), joinAt = useRef<{ x: number; w: number } | null>(null);
  const tiles = useRef(new Map<string, HTMLButtonElement>());
  const shown = open || leaving;
  useEffect(() => { if (!lead) return; setStentLead(id, true); return () => setStentLead(id, false); }, [lead, id]);
  useEffect(() => { if (folded) setOpen(''); }, [folded]);
  useEffect(() => { setOpen(''); setLeaving(''); }, [id]);

  const choose = (rowId: string) => {
    if (folded) return;
    oldH.current = tin.current?.getBoundingClientRect().height || 0;
    if (rowId === open) { setLeaving(open); setOpen(''); } else { setLeaving(''); setOpen(rowId); }
  };
  // the tray's motion: transforms and opacity only (the boxes are read here, once, after the tap's change is laid out)
  useLayoutEffect(() => {
    const was = prev.current, now = open;
    prev.current = now;
    if (was === now) return;
    const el = tin.current;
    for (const a of anims.current) a.cancel();
    anims.current = [];
    if (now) {
      // the patch under the open tile: placed by its box; from the last tile's box it glides there
      const t = tiles.current.get(now), pb = el?.getBoundingClientRect(), tb = t?.getBoundingClientRect();
      if (el && join.current && pb && tb) {
        const x = tb.left - pb.left, w = tb.width, from = joinAt.current;
        join.current.style.left = `${x.toFixed(1)}px`; join.current.style.width = `${w.toFixed(1)}px`;
        if (was && from && from.w > 0 && w > 0 && !reduced() && join.current.animate) anims.current.push(join.current.animate([{ transform: `translateX(${(from.x - x).toFixed(1)}px) scaleX(${(from.w / w).toFixed(4)})` }, { transform: 'none' }], { duration: D_SMALL, easing: EASE_ARRIVE }));
        joinAt.current = { x, w };
      }
    }
    if (!el || reduced() || !el.animate) { if (!now) setLeaving(''); return; }
    const H = el.getBoundingClientRect().height;
    if (!(H > 0)) { if (!now) setLeaving(''); return; }
    const ease = { duration: D_SURFACE, easing: EASE_ARRIVE };
    const rise = (e: Element | null) => e?.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: D_SMALL, easing: EASE_ARRIVE, delay: D_SMALL * 0.4, fill: 'both' });
    if (now && !was) {
      // it unrolls: the tray's paper and words slide down from behind the tiles, the words a beat later
      anims.current.push(el.animate([{ transform: `translateY(${(-H).toFixed(1)}px)` }, { transform: 'none' }], ease));
      for (const e of [body.current, foot.current]) { const a = rise(e); if (a) anims.current.push(a); }
    } else if (!now && was) {
      const a = el.animate([{ transform: 'none' }, { transform: `translateY(${(-H).toFixed(1)}px)` }], { duration: D_SURFACE * 0.8, easing: EASE_ARRIVE, fill: 'forwards' });
      anims.current.push(a);
      for (const e of [body.current, foot.current]) e?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: D_SMALL * 0.5, easing: EASE_ARRIVE, fill: 'forwards' });
      const done = () => { setLeaving(''); for (const x of anims.current) x.cancel(); anims.current = []; joinAt.current = null; };
      a.finished.then(done, done);
    } else if (now && was) {
      // another tile: the paper's middle stretches from the old height to the new and its foot and Done ride with it; the new controls fade in
      const oh = oldH.current;
      if (oh > 0 && Math.abs(oh - H) > 0.5) {
        const dy = oh - H, k = Math.max(0, oh - 2 * R) / Math.max(1, H - 2 * R);
        const m = bgM.current?.animate([{ transform: `scaleY(${k.toFixed(4)})` }, { transform: 'none' }], ease); if (m) anims.current.push(m);
        for (const e of [bgB.current, foot.current]) { const a = e?.animate([{ transform: `translateY(${dy.toFixed(1)}px)` }, { transform: 'none' }], ease); if (a) anims.current.push(a); }
      }
      for (const e of [body.current, footL.current]) { const a = e?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE }); if (a) anims.current.push(a); }
    }
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { for (const a of anims.current) a.cancel(); }, []);
  // the card's actions fold away while a tray is open (the stylesheet holds them at the numbers written here: it takes them out of the flow at once, and they fade where they stood)
  useLayoutEffect(() => {
    if (!open || leaving || prev.current !== open) return;
    const strip = root.current?.closest('.ac-panel')?.nextElementSibling as HTMLElement | null | undefined;
    if (!strip?.classList.contains('ac-as') || reduced()) return;
    strip.style.setProperty('--as-top', `${strip.offsetTop}px`); strip.style.setProperty('--as-left', `${strip.offsetLeft}px`); strip.style.setProperty('--as-w', `${strip.offsetWidth}px`);
  }, [open, leaving]);

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Escape' && open) { e.stopPropagation(); choose(open); } };
  const row = rows.find((r) => r.id === shown);
  const cells = row ? row.ids.map((cid) => ctl.find((c) => c.id === cid)).filter((c): c is Ctl => !!c) : [];
  const d = (ctl.find((c) => c.id === 'diameter')?.get(p) as number | undefined) ?? 10;
  const pick = cells.find((c) => c.type === 'seg'), dia = cells.find((c) => c.id === 'diameter');
  const pos = Math.max(0, rows.findIndex((r) => r.id === shown));
  // the folded line: the stent's narrowings as the rows read them (the diameter is left out: the card's picture shows it)
  const sum = (() => {
    const st = rowValue('end', id, p), w = rowValue('waist', id, p), parts: string[] = [];
    if (st !== 'None') parts.push(`Stenosis ${st}`);
    if (w !== 'None') parts.push(`Waist ${w}`);
    return parts.length ? parts.join(' · ') : 'No narrowing';
  })();

  return (
    <div ref={root} className="se-zone tv-zone" onKeyDown={onKey}>
      <div className="stent-editor" role="group" aria-label="Edit stent" data-open={open} data-fold={folded ? 'true' : 'false'}>
        <div className="se-rows" inert={folded}>
          {rows.map((r) => {
            const w = tileWords(r.id, id, p) as [string, string, string], t = rowValue(r.id, id, p);
            return (
              <button key={r.id} ref={(el) => { if (el) tiles.current.set(r.id, el); else tiles.current.delete(r.id); }} type="button" className="se-row" data-row={r.id} aria-expanded={open === r.id} aria-label={`Edit ${r.name}: ${t}`} onClick={() => choose(r.id)}>
                <i className="se-tfill" aria-hidden="true" />
                <span className="se-tc"><span className="se-row-n">{r.name}</span><Icon n="chev-down" className="se-row-c" /></span>
                <span className={`se-row-v${w[0] === 'None' ? ' se-none' : ''}`}><b>{w[0]}</b><u>{w[1] ? ` ${w[1]}` : ''}</u></span>
                <span className="se-ts">{w[2]}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="se-summary" aria-live="polite" aria-label={`${sum}. Open in Tests, IR`} inert={!folded} tabIndex={folded ? 0 : -1} onClick={() => openStentInIr(id)}><span className="se-sum-t">{sum}</span><OrderIcon n="chev-right" className="se-sum-ic" /></button>
      </div>
      <div className="se-panel" role="dialog" data-open={open ? shown : ''} data-row={shown} data-pos={pos === 0 ? 'first' : pos === rows.length - 1 ? 'last' : 'mid'} aria-hidden={!open} inert={!open} aria-label={row ? `Edit ${row.name}` : 'Edit stent'}>
        <div ref={tin} className="se-tin">
          <div className="se-paper" aria-hidden="true"><i className="se-bg se-bg-t" /><i ref={bgM} className="se-bg se-bg-m" /><i ref={bgB} className="se-bg se-bg-b" /><i ref={join} className="se-join" /></div>
          <div ref={body} className="se-pb">{cells.filter((c) => c.type !== 'seg').map((c) => <SliderCtl key={c.id + d} v={c} d={d} p={p} />)}</div>
          <div ref={foot} className="se-foot">
            <div ref={footL} className="se-fl">{pick ? <SegCtl v={pick} p={p} /> : dia ? <span className="se-hint">{`${dia.min} to ${dia.max} mm`}</span> : null}</div>
            <button type="button" className="se-done" aria-label={row ? `Done with ${row.name}` : 'Done'} onClick={() => open && choose(open)}>Done</button>
          </div>
        </div>
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

/** The card's stent panel: for a TIPS or DIPS the numbers line and the editor; for a custom shunt the editor alone. */
export function StentPanel({ id }: { id: string }) {
  const stent = id === 'TIPS' || id === 'DIPS';
  return (
    <div className="tv" style={{ ['--se-id' as string]: id } as CSSProperties}>
      {stent && <VesselKeys id={id} />}
      <StentEditor id={id} />
    </div>
  );
}

registerPanel('stent', StentPanel);
