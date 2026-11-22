// The TIPS view of Tests > IR (2D ir-tips.js, 17 Nov 2026, the approved mock tips-cards-elegant.html): its title (the stent, its state, Velocity | Pressure, and a menu for Tube vs patient and Compare), one
// line of numbers (no tiles), the stent drawn to scale with its chart under it on the same x (tips-figure.ts, a frame on the shared chart GL), and the three rows that edit it (the stent editor, whose
// tray unrolls under the tiles, under the chart). Tube vs patient is CurvesView, Compare is CompareView. The words, the numbers and the rules are the 2D file's own (copied/tips-parts.copied.js).
import { useEffect, useRef } from 'react';
import { latest, shownParams, useEngine } from '../../../engine/index.ts';
import { useParamsTick } from '../../action/params.ts';
import { StentEditor } from '../../action/stent/StentPanel.tsx';
import { Chart } from '../../charts/Chart.tsx';
import { fmt } from '../../charts/fmt.ts';
import { stentState } from '../../charts/stent/model.ts';
import { Icon } from '../../shell/icons.tsx';
import { KEYS, SUBS } from './copied/tips-parts.copied.js';
import { CompareView } from './CompareView.tsx';
import { CurvesView } from './CurvesView.tsx';
import { newKeep, tipsFigureFrame } from './tips-figure.ts';
import { stentsNow, useIr, type IrLens, type IrSub, type StentId } from './store.ts';
import { useState } from 'react';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
/** What the figure is drawn from, in the words it prints: a re-draw only when a printed tenth changes. */
function stentSig(id: StentId): string {
  const s = stentState(latest.frame, id, shownParams() as Any);
  const r = (v: number, k = 10) => Math.round(v * k);
  return [s.have ? 1 : 0, r(s.flow, 100), r(s.dp), r(s.ppg), r(s.ivc), s.g.map((g) => r(g, 1)).join(), r(s.tract, 100), r(s.wall, 100), r(s.ends, 100), r(s.jet, 100), r(s.sh.len, 100), r(s.sh.waist, 100), r(s.sh.trans, 100), r(s.sh.red || 0, 1000), r(s.d), r(s.s, 1000), r(s.site, 1000)].join('|');
}

function Figure({ id, lens }: { id: StentId; lens: IrLens }) {
  useEngine((s) => { void s.frames; return stentSig(id); });
  useParamsTick((s) => s.tick);
  const keep = useRef(newKeep());
  const sig = stentSig(id);
  return (
    <div className="tf tf-chart">
      <Chart tag="ir-tips" deps={[sig, lens, id]} label={`${id}, drawn to scale, with its ${lens === 'pressure' ? 'pressure' : 'peak velocity'} chart`}
        build={(c) => tipsFigureFrame(stentState(latest.frame, id, shownParams() as Any), c, { lens, labels: true, chart: true, keep: keep.current })} />
    </div>
  );
}

export function TipsView({ h }: { h: number }) {
  useEngine((s) => { void s.frames; const m = latest.frame?.metrics as { ppg?: number } | undefined; return `${Math.round((m?.ppg ?? 0) * 10)}`; });
  useParamsTick((s) => s.tick);
  const stent = useIr((s) => s.stent), pick = useIr((s) => s.pick), lens = useIr((s) => s.lens), setLens = useIr((s) => s.setLens), sub = useIr((s) => s.sub), setSub = useIr((s) => s.setSub);
  const ids = stentsNow(), at: StentId = ids.includes(stent) ? stent : ids[0] ?? 'TIPS';
  // the stent set changes under the view (one taken away): the title follows the stent that is left
  useEffect(() => { if (ids.length && !ids.includes(stent)) pick(ids[0]!); });
  const m = latest.frame?.metrics as Record<string, unknown> | undefined;
  const st = (at === 'DIPS' ? m?.dips : m?.tips) as Record<string, unknown> | undefined;
  const still = !!st?.still;
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const close = (back = false) => { setOpen(false); if (back) more.current?.focus({ preventScroll: true }); };
  useEffect(() => { if (open) (menu.current?.querySelector(`[data-sub="${sub}"]`) as HTMLElement | null)?.focus({ preventScroll: true }); }, [open, sub]);
  // the menu and the lens are shut with the view they belong to
  useEffect(() => { if (sub !== 'inside') setOpen(false); }, [sub]);
  return (
    <div className="ir-tips" data-pane-view="tips" data-sub={sub}>
      <div className="ir-top">
        <div className="ir-chips" role="group" aria-label="Stent" data-n={ids.length}>
          {(ids.length ? ids : ['TIPS' as StentId]).map((id) => <button key={id} type="button" className="ir-chip" data-id={id} aria-pressed={id === at} onClick={() => pick(id)}>{id}</button>)}
        </div>
        <span className="ir-status" data-sev={still ? 'caution' : 'none'}><span className="ir-status-t">{still ? 'No flow' : 'Patent'}</span></span>
        <div className="pressure-switch ir-lens" role="group" aria-label="What the stent shows">
          {(['velocity', 'pressure'] as IrLens[]).map((k) => <button key={k} type="button" className="ps-btn" data-lens={k} aria-pressed={lens === k} onClick={() => setLens(k)}>{k === 'velocity' ? 'Velocity' : 'Pressure'}</button>)}
        </div>
        <button ref={more} type="button" className="ir-more" aria-label="More views" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><Icon n="more" /></button>
        <div ref={menu} className="ir-menu" role="menu" aria-label="TIPS views" data-open={open ? 'true' : 'false'} inert={!open}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } }}
          onBlur={(e) => { if (!menu.current?.contains(e.relatedTarget as Node | null) && e.relatedTarget !== more.current) setOpen(false); }}>
          {(SUBS as [IrSub, string][]).map(([k, name]) => (
            <button key={k} type="button" className="ir-mi" role="menuitemradio" data-sub={k} aria-checked={k === sub} onClick={() => { close(); setSub(k); }}><Icon n="check" className="ir-mi-ic" /><span>{name}</span></button>
          ))}
        </div>
      </div>
      {sub === 'inside' && (
        <div className="ir-inside ir-fade" data-sub-view="inside">
          <div className="ir-keys">
            {(KEYS as { id: string; k: string; u: string; d: number; title: string; v(m: unknown, st: unknown): number | null }[]).map((t) => {
              const raw = m && (st || t.id === 'ppg') ? t.v(m, st) : null, v = raw == null || !Number.isFinite(raw) ? null : raw;
              return <span key={t.id} className="ir-kv" data-k={t.id} title={t.title} aria-label={`${t.k}: ${v == null ? 'not measured' : `${fmt(v, t.d)} ${t.u}`}`}><em>{t.k}</em><b>{v == null ? '—' : fmt(v, t.d)}</b><u>{t.u}</u></span>;
            })}
          </div>
          <div className="se-zone ir-zone">
            <Figure id={at} lens={lens} />
            {st && <StentEditor id={at} lead />}
          </div>
        </div>
      )}
      {sub === 'curves' && <CurvesView which={at} h={h} />}
      {sub === 'compare' && <CompareView which={at} />}
    </div>
  );
}
