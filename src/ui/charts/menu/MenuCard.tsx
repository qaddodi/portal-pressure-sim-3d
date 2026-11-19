import { useEffect, useMemo, useState } from 'react';
import { Chart } from '../Chart.tsx';
import { engineRun } from '../curve/run.ts';
import type { RunFn, SlideState } from '../curve/data.ts';
import { menuFrame } from './frame.ts';
import { baseName, menuKey, menuOptions, menuPoints, menuSteps, type MenuWork } from './model.ts';
import '../charts.css';

// What was worked out, kept for the session by slide and rows (2D keeps it per deck): a slide that comes up again draws its dots in the first drawing.
const asked = new Map<string, Promise<MenuWork | null>>();
const ready = new Map<string, MenuWork>();

/** The slide's menu, worked out once on the engine's worker (2D menuWork): each offered treatment as its own step from the slide's state. */
export function menuWork(tool: { rows?: unknown }, slide: SlideState, run: RunFn, key: string): Promise<MenuWork | null> {
  let p = asked.get(key);
  if (p) return p;
  const opts = menuOptions(slide.params as Record<string, unknown>, tool.rows);
  p = (opts.length ? run(menuSteps(opts)) : Promise.resolve([])).then((outs) => { const pts = menuPoints(opts, outs as never); return pts && { pts, base: slide.fp ?? null, name: baseName(slide.params as never) }; });
  asked.set(key, p);
  p.then((v) => { if (!v) asked.delete(key); else ready.set(key, v); }, () => asked.delete(key));
  return p;
}

/** The treatment menu for a slide (`tool: { kind: 'menu' }`): every treatment this patient could get as a dot, PPG against the liver's flow it costs. Until the numbers are there the frame shows (the ring and the axes). */
export function MenuCard({ tool, slide, id, run, height }: { tool: { rows?: unknown }; slide: SlideState | null; id?: string; run?: RunFn; height?: number }) {
  const key = useMemo(() => menuKey(tool as Record<string, unknown>, id ?? (slide?.fp ? JSON.stringify(slide.fp) : 0)), [tool, id, slide?.fp]);
  const [work, setWork] = useState<MenuWork | null>(() => ready.get(key) ?? null);
  useEffect(() => {
    setWork(ready.get(key) ?? null);
    if (!slide) return;
    let on = true;
    void menuWork(tool, slide, run ?? engineRun(slide), key).then((w) => { if (on && w) setWork(w); }, () => undefined);
    return () => { on = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, !!slide]);
  const dots = work?.pts ?? [], base = work?.base ?? slide?.fp ?? null, name = work?.name ?? baseName(slide?.params as never);
  const [label, setLabel] = useState('Treatment menu');
  return (
    <div className="pz-curve pz-menu">
      <Chart tag="chart:menu" deps={[key, work, height]} label={label} build={(c) => { const o = menuFrame({ dots, base, baseLabel: name, height }, c); setLabel(o.frame.label); return o.frame; }} />
    </div>
  );
}
