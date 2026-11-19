import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LOOK_IDS, resolveLook, type LookId } from '../../looks/looks.ts';
import { useSettings } from '../../state/settings.ts';
import { useUi } from '../ui-store.ts';
import { chartType, type ChartType } from './type.ts';
import { paletteOf, type Palette } from './palette.ts';
import { ChartPainter } from './painter.ts';
import type { Frame } from './scene.ts';

/** What a chart's model gets: the box's width, the colours of the look, the type of the device. */
export interface ChartCtx { w: number; pal: Palette; type: ChartType; look: LookId }

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
}

/** One chart: a box that takes its width from the card, a GPU canvas for the shapes and a text layer for the words. */
export function Chart({ build, deps, label, tag = 'chart', className }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const painter = useRef<ChartPainter | null>(null);
  const [w, setW] = useState(0);
  const look = useLookId();
  const device = useUi((s) => s.device);
  const type = useMemo(() => chartType(device), [device]);
  const first = useRef(true);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const p = new ChartPainter(tag);
    painter.current = p;
    el.append(p.box);
    const measure = () => setW(Math.round(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { ro.disconnect(); p.dispose(); painter.current = null; first.current = true; };
  }, [tag]);

  const lastKey = useRef('');
  useLayoutEffect(() => {
    const p = painter.current;
    if (!p || w <= 0) return;
    const frame = build({ w, pal: paletteOf(look), type, look });
    // a new width or look is set at once; the same chart with new numbers glides
    const key = `${w}|${look}|${device}`;
    p.show(frame, !first.current && key === lastKey.current);
    first.current = false;
    lastKey.current = key;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, look, type, device, ...deps]);

  return <div ref={host} className={className} role="img" aria-label={label} style={{ position: 'relative', width: '100%' }} />;
}
