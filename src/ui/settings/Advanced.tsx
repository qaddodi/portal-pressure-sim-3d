// Advanced physiology, on the 2D panel's own markup (chart.js advanced() and section(), inspector.js slider() and toggle()): `.p-body.chart-body.adv-body` holding four
// `details.section.chart-sec`, each control a `.ctl` (label, ⓘ, reset, value, the `.range-wrap` track with its green normal band; or a `.toggle-row` with a `.switch`), and the
// three `.order-btn` actions. Its stylesheet is the 2D app's (src/ui/styles); nothing here styles it. The rows, words, ranges, steps and defaults are advanced.generated.ts.
// A change edits the patient's settings (action/params.ts updateParams: one History entry per gesture, as in 2D) and the engine answers; no number is worked out here.
// It is a page of the Settings menu (2D opened it in the side panel, which the 3D app does not have).
import { useState, useRef, type CSSProperties } from 'react';
import { I } from '../shell/icons.tsx';
import { currentParams, updateParams, useParamsTick } from '../action/params.ts';
import { sendAction } from '../action/send.ts';
import { prefs } from '../readings/dom2d.ts';
import { ADV_ACTS, ADV_CONTROLS, ADV_SECTIONS, advChanged, advGet, advLabel, advSet, normalBand, type AdvControl, type AdvSlider } from './advanced.ts';

// 2D chart.js: the Advanced sections start open; the saved set holds the ones closed.
const OPEN_KEY = 'pps.chartOpen3';
const shutNow = (): Set<string> => { try { const v = JSON.parse(prefs.getItem(OPEN_KEY) || '[]'); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []); } catch { return new Set(); } };
const remember = (id: string, open: boolean) => { const s = shutNow(); if (open) s.delete(id); else s.add(id); try { prefs.setItem(OPEN_KEY, JSON.stringify([...s])); } catch { /* storage unavailable */ } };

/** 2D util.js infoButton: the text on hover; on a touch screen a tap opens it under its row. */
function Info({ text, open, onToggle }: { text: string; open: boolean; onToggle: () => void }) {
  const touch = useRef(false);
  return (
    <button type="button" className="info-i" aria-label={text} title={text} aria-expanded={open}
      onPointerDown={(e) => { touch.current = e.pointerType === 'touch' || e.pointerType === 'pen'; }}
      onClick={(e) => { if (!touch.current && !matchMedia('(hover: none)').matches) return; e.preventDefault(); e.stopPropagation(); onToggle(); }}><I n="info" /></button>
  );
}
const InfoText = ({ text }: { text: string }) => <div className="ac-info"><div><p>{text}</p></div></div>;

function Slider({ c }: { c: AdvSlider }) {
  useParamsTick((s) => s.tick);
  const [drag, setDrag] = useState<number | null>(null);
  const [info, setInfo] = useState(false);
  const fresh = useRef(true);   // the first change of a gesture is one History entry; the rest of the drag edits it
  const p = currentParams();
  const v = drag ?? (p ? (advGet(c, p) as number) : c.def ?? c.min);
  const band = normalBand(c), words = c.format(v);
  const send = (val: number) => { updateParams((q) => { advSet(c, q, val); return q; }, { label: advLabel(c, val), history: fresh.current }); fresh.current = false; };
  return (
    <div className={`ctl${advChanged(c, v) ? ' changed' : ''}${info ? ' info-open' : ''}`}>
      <div className="ctl-top">
        <span className="ctl-label">{c.label}{c.info ? <Info text={c.info} open={info} onToggle={() => setInfo(!info)} /> : null}
          <button type="button" className="reset-btn" title="Reset" aria-label={`Reset ${c.label}`} onClick={() => { if (c.def == null) return; setDrag(null); updateParams((q) => { advSet(c, q, c.def!); return q; }, { label: advLabel(c, c.def, true) }); }}><I n="reset" /></button>
        </span>
        <span className="ctl-val">{words}</span>
      </div>
      <div className="range-wrap" style={{ '--p': Math.min(1, Math.max(0, (v - c.min) / (c.max - c.min))) } as CSSProperties}>
        {band ? <span className="normal" title="Normal range" style={band} /> : null}
        <input type="range" min={c.min} max={c.max} step={c.step} value={v} aria-label={c.label} aria-valuetext={words} data-def={c.def ?? undefined}
          onPointerDown={() => { fresh.current = true; }} onKeyDown={() => { fresh.current = true; }}
          onInput={(e) => { const val = parseFloat((e.target as HTMLInputElement).value); setDrag(val); send(val); }}
          onPointerUp={() => setDrag(null)} onBlur={() => setDrag(null)} onChange={() => { /* (the input event carries it) */ }} />
      </div>
      {c.sub ? <div className="ctl-sub">{c.sub}</div> : null}
      {c.info && info ? <InfoText text={c.info} /> : null}
    </div>
  );
}

function Toggle({ c }: { c: AdvControl }) {
  useParamsTick((s) => s.tick);
  const [info, setInfo] = useState(false);
  const p = currentParams();
  const on = p ? !!advGet(c, p) : false;
  return (
    <div className={`ctl${info ? ' info-open' : ''}`}>
      <label className="toggle-row">
        <span className="ctl-label">{c.label}{c.info ? <Info text={c.info} open={info} onToggle={() => setInfo(!info)} /> : null}</span>
        <span className="switch"><input type="checkbox" role="switch" aria-label={c.label} checked={on} onChange={(e) => { const val = e.target.checked; updateParams((q) => { advSet(c, q, val); return q; }, { label: advLabel(c, val) }); }} /><span /></span>
      </label>
      {c.sub ? <div className="ctl-sub">{c.sub}</div> : null}
      {c.info && info ? <InfoText text={c.info} /> : null}
    </div>
  );
}

export function Advanced() {
  const [shut] = useState(shutNow);
  return (
    <div className="p-body chart-body adv-body">
      {ADV_SECTIONS.map((sec) => (
        <details key={sec.id} className="section chart-sec" data-id={sec.id} open={!shut.has(sec.id)} onToggle={(e) => remember(sec.id, (e.currentTarget as HTMLDetailsElement).open)}>
          <summary>{sec.title}<I n="chev-down" className="chev" /></summary>
          <div className="section-body">
            {sec.controls.map((id) => { const c = ADV_CONTROLS[id]; return c.type === 'slider' ? <Slider key={id} c={c} /> : <Toggle key={id} c={c} />; })}
            {sec.acts ? (
              <div className="order-grid">
                {ADV_ACTS.map((a) => <button key={a.label} type="button" className="order-btn" onClick={() => sendAction(a.action)}><span className="ob-t">{a.label}<small>{a.sub}</small></span></button>)}
              </div>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}
