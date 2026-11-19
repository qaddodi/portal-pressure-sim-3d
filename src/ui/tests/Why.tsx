// Why? for a readout (the 2D "what is driving it" card, blueprint 9.3): the engine's leave-one-out attribution for the metric, asked of the model on a tap and written as a
// sentence, the formula, and each factor's share as a bar. The numbers and words are the engine's own (explain.js); nothing is retyped here.
import { useEffect, useState } from 'react';
import { engine } from '../../engine/boot.ts';
import { useTests } from './store.ts';
import { TIcon } from './icons.tsx';
import { fmt } from './copied/num.copied.js';

interface Explain { metricId: string; label: string; unit: string; digits: number; current: number; base: number; total: number; sentence: string; formula: string; contributions: { label: string; say: string; delta: number }[] }

export function Why() {
  const metric = useTests((s) => s.why), close = useTests((s) => s.closeWhy);
  const [ex, setEx] = useState<Explain | null>(null);
  useEffect(() => {
    setEx(null);
    if (!metric) return;
    let live = true;
    engine().request({ type: 'explain', metric }).then((m) => { if (live) setEx((m as unknown as { result: Explain | null }).result); }).catch(() => { /* the model is busy or gone: the card stays empty */ });
    return () => { live = false; };
  }, [metric]);
  const rows = ex ? ex.contributions.filter((c) => Math.abs(c.delta) > Math.pow(10, -ex.digits) / 2).slice(0, 5) : [];
  const top = rows.reduce((a, c) => Math.max(a, Math.abs(c.delta)), 0) || 1;
  return (
    <div className="t-why" data-open={!!metric && !!ex} role="dialog" aria-label={ex ? `Why is ${ex.label} ${fmt(ex.current, ex.digits)}?` : 'Why?'} inert={!(metric && ex)}>
      <button type="button" className="t-why-x" aria-label="Close" onClick={close}><TIcon n="close" /></button>
      {ex && (
        <>
          <h3>{ex.label}: {fmt(ex.current, ex.digits)} {ex.unit}</h3>
          <p>{ex.sentence}</p>
          {ex.formula && <p className="t-f">{ex.formula}</p>}
          <div className="t-why-rows">
            {rows.map((c) => (
              <div key={c.label} className="t-why-row">
                <span>{c.label}</span><span className="t-why-d">{c.delta > 0 ? '+' : '−'}{fmt(Math.abs(c.delta), ex.digits)}</span>
                <span className="t-why-bar" aria-hidden="true"><i data-neg={c.delta < 0} style={{ transform: `scaleX(${Math.abs(c.delta) / top})` }} /></span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
