// What the capture takes, as the form's first row (the self-test panel's `?audit=here` and the Mac's outer capture bar): the slides of the talks, every history case played,
// or both. One segmented row in the
// look of "which slides" (capture-pick.ts); the choice is read when Capture is pressed.
import type { CaptureWhat } from './capture-cases-plan.ts';

const MODES: readonly (readonly [CaptureWhat, string])[] = [['slides', 'Slides'], ['cases', 'Every case'], ['both', 'Both']];

/** The row; `read()` is the choice now. `initial` is the starting one (an address that names cases starts on them). */
export function whatUi(doc: Document, initial: CaptureWhat): { el: HTMLElement; read(): CaptureWhat } {
  const LINE = 'rgba(255,255,255,.18)';
  const el = doc.createElement('div'); el.style.cssText = 'flex:1 1 100%;margin:0 0 4px';
  const cap = doc.createElement('div'); cap.textContent = 'WHAT TO TAKE'; cap.style.cssText = 'font-size:12px;font-weight:600;letter-spacing:.04em;opacity:.6;margin:6px 0';
  const seg = doc.createElement('div'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'What to take'); seg.style.cssText = 'display:flex;gap:4px;margin:0 0 6px';
  const hint = doc.createElement('div'); hint.style.cssText = 'font-size:12px;opacity:.6;margin:0 0 8px';
  const HINTS: Record<CaptureWhat, string> = {
    slides: 'The slides of the talks, as below.',
    cases: 'Plays every model patient\'s case with Play the case: every stop with its card, each Look closer here, one folder a case and a manifest.',
    both: 'The slides below, then every case played.',
  };
  let which: CaptureWhat = initial;
  const btns = MODES.map(([v, t]) => {
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = t;
    b.style.cssText = 'flex:1 1 0;min-width:0;min-height:38px;margin:0;padding:0 2px;font-size:13px;border-radius:9px';
    b.onclick = () => { which = v; paint(); };
    seg.append(b); return [v, b] as const;
  });
  const paint = () => {
    for (const [v, b] of btns) {
      const on = v === which;
      b.setAttribute('aria-pressed', String(on));
      b.style.background = on ? 'rgba(255,255,255,.2)' : 'transparent';
      b.style.borderColor = on ? 'transparent' : LINE;
      b.style.opacity = on ? '1' : '.7';
      b.style.fontWeight = on ? '600' : '400';
    }
    hint.textContent = HINTS[which];
  };
  paint();
  el.append(cap, seg, hint);
  return { el, read: () => which };
}
