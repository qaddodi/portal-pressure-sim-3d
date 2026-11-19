import { useEffect, useId, useRef, useState } from 'react';
import { useSettings, FLOW_MARKS, type FlowMarks } from '../../state/settings.ts';
import { LOOK_IDS, LOOK_LABELS, type LookChoice } from '../../looks/looks.ts';

const FLOW_LABEL: Record<FlowMarks, [string, string]> = {
  A: ['A', 'Chevrons on what the slide is about'],
  B: ['B', 'Chevrons everywhere, fainter off the topic'],
  C: ['C', 'Soft light bands everywhere'],
  D: ['D', 'Marks only after a change'],
};

/** Look and flow-mark style. A panel that fades; it is always in the page (nothing mounts or unmounts), so it never pops. */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const { look, setLook, flowMarks, setFlowMarks, blur, setBlur } = useSettings();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  const choices: LookChoice[] = [...LOOK_IDS, 'system'];
  return (
    <div ref={ref} className="dk-settings">
      <button type="button" aria-label="Settings" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
      </button>
      <div id={id} className="dk-panel" data-open={open} role="dialog" aria-label="Settings" inert={!open}>
        <p className="dk-kicker">Appearance</p>
        <div className="dk-chips" role="group" aria-label="Look">
          {choices.map((c) => <button key={c} type="button" className="dk-chip" aria-pressed={look === c} onClick={() => setLook(c)}>{LOOK_LABELS[c]}</button>)}
        </div>
        <p className="dk-kicker" style={{ marginTop: 16 }}>Blur effect</p>
        <div className="dk-chips" role="group" aria-label="Blur effect">
          <button type="button" className="dk-chip" aria-pressed={blur} onClick={() => setBlur(true)}>On</button>
          <button type="button" className="dk-chip" aria-pressed={!blur} onClick={() => setBlur(false)}>Off</button>
        </div>
        <p className="dk-kicker" style={{ marginTop: 16 }}>Flow marks</p>
        <div className="dk-chips" role="group" aria-label="Flow marks">
          {FLOW_MARKS.map((f) => <button key={f} type="button" className="dk-chip" aria-pressed={flowMarks === f} onClick={() => setFlowMarks(f)}>{FLOW_LABEL[f][0]}</button>)}
        </div>
        <p className="dk-body dk-body--muted dk-data" style={{ marginTop: 8 }}>{FLOW_LABEL[flowMarks][1]}</p>
      </div>
    </div>
  );
}
