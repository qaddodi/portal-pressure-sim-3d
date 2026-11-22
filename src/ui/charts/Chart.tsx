import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LOOK_IDS, type LookId } from '../../looks/looks.ts';
import { useLookId as useAppLook } from '../../looks/use-look.ts';
import { useUi } from '../ui-store.ts';
import type { DeviceClass } from '../layout/device.ts';
import { chartType, panelType, toolType, type ChartType } from './type.ts';
import { fitOf, ownWidth, sizeStyleMoved } from './fit.ts';
import { paletteOf, type Palette } from './palette.ts';
import { ChartPainter } from './painter.ts';
import type { Frame } from './scene.ts';
import { frameTable, tableKey, type DataTable } from './table.ts';
import { observeThenFit } from '../layout/fit-later.ts';

import { clock, type TimerId } from '../../clock/frame.ts';
/** What a chart's model gets: the box's width, the colours of the look, the type of the device. */
export interface ChartCtx { w: number; pal: Palette; type: ChartType; look: LookId; /** the zoom the box lives under (the card's fit, 1 when none): a chart whose words may never be under 12 px on the screen lays itself out at w × fit and scales by 1 / fit (scaleFrame) */ fit?: number }

/** A look and a device class forced on the charts below (the ?charts gallery shows every look at every width at once). Absent: the app's own. */
export const ChartEnv = createContext<{ look?: LookId; device?: DeviceClass } | null>(null);

/** The look in force now ('system' follows the device): the one the page and the figure wear, so a chart changes with them (looks/use-look.ts). */
export function useLookId(): LookId { const id = useAppLook(); return LOOK_IDS.includes(id) ? id : 'light'; }

interface Props {
  /** The chart as a frame for this box. A pure function: the same inputs give the same frame. It runs again when `deps` or the width or the look changes. */
  build(c: ChartCtx): Frame;
  deps: readonly unknown[];
  /** the chart in a sentence (the picture itself is hidden from a screen reader) */
  label: string;
  /** a name the clock shows in ?perf */
  tag?: string;
  className?: string;
  /** the chart's painter, for a card that moves its picture itself every frame (the cross-section follows the model) */
  painter?: { current: ChartPainter | null };
  /** false: a new frame for the same box is set at once (a card that eases its own numbers every frame, the profile) */
  glide?: boolean;
}

/** One chart: a box that takes its width from the card, a GPU canvas for the shapes and a text layer for the words. */
export function Chart({ build, deps, label, tag = 'chart', className, painter: painterOut, glide = true }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const painter = useRef<ChartPainter | null>(null);
  const [w, setW] = useState(0);
  const [table, setTable] = useState<DataTable | null>(null);
  const [fit, setFit] = useState(1);   // (the zoom the box lives under, 2 decimals: it moves with the window, never with a frame)
  const env = useContext(ChartEnv);
  const appLook = useLookId();
  const appDevice = useUi((s) => s.device);
  const look = env?.look ?? appLook, device = env?.device ?? appDevice;
  const vp = useUi((s) => s.vp);
  const [tool, setTool] = useState(false);   // the chart stands in the Tests card (2D `.instrument-workspace`): its words are 2D's tool-card size
  const [panel, setPanel] = useState(false);   // the chart stands in a full-screen panel (2D `.pz-panel`): its words are the panel's caption size
  const type = useMemo(() => (panel && !env?.device ? panelType(vp.w, vp.h, chartType(device)) : tool && !env?.device ? toolType(vp.w, vp.h) : chartType(device)), [device, panel, tool, vp.w, vp.h, env?.device]);
  const first = useRef(true);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const p = new ChartPainter(tag);
    painter.current = p;
    if (painterOut) painterOut.current = p;
    el.append(p.box);
    setPanel(!!el.closest('.pz-panel'));
    setTool(!!el.closest('.t-card'));
    // The box's width in its own pixels. A card's fit (2D `--pz-fit`, `.pz-panel > *` and its kin: `zoom`) lays the contents out wider and zooms them down, and a rect is in screen pixels: drawn at
    // the rect's width the chart came out the zoom's share of the card (left-aligned, half empty) and then was zoomed down again, its words with it. Divide the zoom out.
    const measure = () => { const z = fitOf(el); setW(ownWidth(el, z)); setFit(Math.round(z * 100) / 100); };   // (scaleOf: a card zoom is a transform: the rect is its multiple, the box's own width is not)
    measure();
    const off = observeThenFit([el], measure);   // (a new width redraws the chart, which changes the height of the card around it: after the observer's delivery, never inside it)
    // The card's fit (`--pz-fit`, written on the card's style) changes the zoom the box lives under WITHOUT changing the box's own size (the card's width is fixed): the observer above never fires, and a chart
    // measured under a zoom of 0.88 stayed laid out 1.13 times too wide after the fit went (cut at the right edge, its height overblown, the card sized to it). Look again when the card's style changes.
    const card = el.closest('.dk-card');
    let again: TimerId | null = null;
    const mo = card && typeof MutationObserver === 'function' ? new MutationObserver((recs) => { if (!again && sizeStyleMoved(recs)) again = clock.after(() => { again = null; measure(); }, 0); }) : null;
    mo?.observe(card!, { attributes: true, attributeFilter: ['style'], attributeOldValue: true, subtree: true });
    return () => { mo?.disconnect(); clock.cancel(again); off(); p.dispose(); painter.current = null; if (painterOut) painterOut.current = null; first.current = true; };
  }, [tag]);

  const lastKey = useRef('');
  useLayoutEffect(() => {
    const p = painter.current;
    if (!p || w <= 0) return;
    const frame = build({ w, pal: paletteOf(look), type, look, fit });
    // a new width or look is set at once; the same chart with new numbers glides
    const key = `${w}|${look}|${device}|${type.sm}|${fit}`;
    p.show(frame, glide && !first.current && key === lastKey.current);
    const t = frameTable(frame), k = tableKey(t);
    setTable((o) => (o && tableKey(o) === k && o.caption === t.caption ? o : t));
    first.current = false;
    lastKey.current = key;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, fit, look, type, device, ...deps]);

  // The picture is one image with a sentence; its numbers are in a hidden table beside it (table.ts): the image role would hide them from a screen reader, so the table is its sibling, out of the way, never in the Tab order.
  return (
    <>
      <div ref={host} className={className} role="img" aria-label={label} style={{ position: 'relative', width: '100%' }} />
      {table && table.rows.length > 0 ? (
        <table className="sr-only" data-chart-data="">
          <caption>{table.caption || label}</caption>
          <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      ) : null}
    </>
  );
}
