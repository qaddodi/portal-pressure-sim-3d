import { useEffect, useMemo, useState } from 'react';
import { Chart } from '../Chart.tsx';
import { engineRun } from '../curve/run.ts';
import type { Fp, SlideState } from '../curve/data.ts';
import { baseName, menuPoints, menuSteps } from './menu-pure.generated.js';
import { menuOptionsOf } from './menu-types.ts';
import { menuFrame, type MenuBase, type MenuDot } from './frame.ts';
import '../charts.css';

// What was worked out, kept for the session by slide (2D keeps it per deck): a slide that comes up again draws its dots in the first drawing.
interface Work { dots: MenuDot[]; base: MenuBase | null; name: string }
const asked = new Map<string, Promise<Work | null>>();
const ready = new Map<string, Work>();

/** The treatments this patient could get, each worked out on the slide's own state by the engine's worker (one step a treatment, each from the slide's state), as dots (2D menuWork). */
export function menuWork(key: string, rows: readonly string[] | null, slide: SlideState, run = engineRun(slide)): Promise<Work | null> {
  let p = asked.get(key);
  if (p) return p;
  const opts = menuOptionsOf(slide.params, rows) as unknown[];
  p = (opts.length ? run(menuSteps(opts)) : Promise.resolve([])).then((outs) => {
    const dots = menuPoints(opts, outs) as MenuDot[] | null;
    return dots && { dots, base: slide.fp as MenuBase, name: baseName(slide.params) as string };
  });
  asked.set(key, p);
  p.then((v) => { if (!v) asked.delete(key); else ready.set(key, v); }, () => asked.delete(key));
  return p;
}

/** Every treatment option for the patient on the slide (2D `tool: { kind: 'menu', rows? }`). Until the numbers are there the frame shows alone and the dots come in over it. */
export function MenuCard({ rows, slide, id, height }: { rows?: readonly string[] | null; slide: { fp: Fp; params?: unknown; base?: unknown; snap?: unknown } | null; id: string; height?: number }) {
  const key = useMemo(() => JSON.stringify([id, rows ?? null]), [id, rows]);
  const [work, setWork] = useState<Work | null>(() => ready.get(key) ?? null);
  useEffect(() => {
    setWork(ready.get(key) ?? null);
    if (!slide) return;
    let on = true;
    void menuWork(key, rows ?? null, slide as SlideState).then((w) => { if (on && w) setWork(w); }, () => undefined);
    return () => { on = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, !!slide]);
  const base = work?.base ?? (slide?.fp as MenuBase | undefined) ?? null, name = work?.name ?? (slide ? (baseName(slide.params) as string) : 'No treatment');
  const [label, setLabel] = useState('Treatment menu');
  return (
    <div className="pz-curve pz-menu">
      <Chart tag="chart:menu" deps={[work, base?.ppg, base?.liver, height]} label={label} build={(c) => { const o = menuFrame({ dots: work?.dots ?? [], base, baseLabel: name, height }, c); setLabel(o.frame.label); return o.frame; }} />
    </div>
  );
}
