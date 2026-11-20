import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LOOK_IDS, resolveLook, type LookId } from '../../looks/looks.ts';
import { useSettings } from '../../state/settings.ts';
import { useUi } from '../ui-store.ts';
import type { DeviceClass } from '../layout/device.ts';
import { chartType, panelType, toolType, type ChartType } from './type.ts';
import { fitOf } from './fit.ts';
import { paletteOf, type Palette } from './palette.ts';
import { ChartPainter } from './painter.ts';
import type { Frame } from './scene.ts';

/** What a chart's model gets: the box's width, the colours of the look, the type of the device. */
export interface ChartCtx { w: number; pal: Palette; type: ChartType; look: LookId }

/** A look and a device class forced on the charts below (the ?charts gallery shows every look at every width at once). Absent: the app's own. */
export const ChartEnv = createContext<{ look?: LookId; device?: DeviceClass } | null>(null);

/** The look in force now ('system' follows the device). */
export function useLookId(): LookId {
  const choice = useSettings((s) => s.look);
  const [dark, setDark] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const id = resolveLook(choice, dark);
  return LOOK_IDS.includes(id) ? id : 'light';
}

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
    const measure = () => setW(Math.round(el.getBoundingClientRect().width / fitOf(el)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { ro.disconnect(); p.dispose(); painter.current = null; if (painterOut) painterOut.current = null; first.current = true; };
  }, [tag]);

  const lastKey = useRef('');
  useLayoutEffect(() => {
    const p = painter.current;
    if (!p || w <= 0) return;
    const frame = build({ w, pal: paletteOf(look), type, look });
    // a new width or look is set at once; the same chart with new numbers glides
    const key = `${w}|${look}|${device}|${type.sm}`;
    p.show(frame, glide && !first.current && key === lastKey.current);
    first.current = false;
    lastKey.current = key;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, look, type, device, ...deps]);

  return <div ref={host} className={className} role="img" aria-label={label} style={{ position: 'relative', width: '100%' }} />;
}
