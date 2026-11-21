// What the figure says about itself, kept current: the stage's accessible name and `aria-description` (the patient in one line), the polite live region (#live),
// and the words a listener hears when a patient loads or a slide changes. The 2D app's main.js (every 3 s, not while the figure moves) and live.js, with the
// 3D app's stores. The glue only: the words are caption.ts (pure, tested), the pacing is announce.ts.
import { latest, patient, useEngine, onFrame } from '../../engine/index.ts';
import { useShell } from '../shell/store.ts';
import { useUi } from '../ui-store.ts';
import { viewAt } from '../deck/presenter-machine.ts';
import { UI } from '../strings.generated.ts';
import { sceneApi } from '../../scene/api.ts';
import { caption } from './caption.ts';
import { announce } from './announce.ts';
import { createPatientAnnouncer } from './patient-announce.ts';

export const FIGURE_NAME = 'Portal circulation: the liver, the portal vein and its tributaries, the hepatic veins and the heart';
/** The description is rewritten at most this often (ms) and never while the figure moves. */
export const DESCRIBE_GAP = 3000;

const labelOf = (id: string | null | undefined): string | undefined => (UI.presets as unknown as { id: string; label: string }[]).find((p) => p.id === id)?.label;

/** The patient's line as the page has it now. */
export function describeNow(opts: { scenario?: boolean } = {}, frame: unknown = latest.frame): string {
  const f = frame as typeof latest.frame;
  if (!f) return '';
  const id = useEngine.getState().presetId ?? useShell.getState().patientId;
  return caption(f as never, { ...opts, label: labelOf(id), healthyQ: patient.reference?.Q ?? null });
}

/** Put a name and the description on the figure (the stage's canvas, once it exists) and keep it current. Returns the remover. */
export function mountDescription(doc: Document = document): () => void {
  let canvas: HTMLElement | null = null, last = -Infinity, timer: ReturnType<typeof setTimeout> | undefined;
  const find = () => { if (!canvas || !canvas.isConnected) { canvas = doc.querySelector('canvas'); if (canvas) { canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', FIGURE_NAME); } } return canvas; };
  const write = () => {
    clearTimeout(timer);
    const c = find();
    if (!c) { timer = setTimeout(write, 500); return; }
    if (sceneApi.cameraMoving) { timer = setTimeout(write, 700); return; }   // (a settled figure, not one in motion)
    const t = describeNow();
    if (t && c.getAttribute('aria-description') !== t) c.setAttribute('aria-description', t);
    last = performance.now();
  };
  const ask = () => {
    const wait = last + DESCRIBE_GAP - performance.now();
    clearTimeout(timer);
    timer = setTimeout(write, Math.max(0, wait));
  };
  // a patient loads: the words wait for the first frame of THAT patient (the one on hand when the id changes is still the last patient's), so the name and the numbers agree
  const loaded = createPatientAnnouncer((id, f) => announce(`${labelOf(id) ?? 'Patient'} loaded. ${describeNow({ scenario: false }, f)}`));
  const off1 = useEngine.subscribe((s, p) => {
    if (s.presetId !== p.presetId && s.presetId && p.presetId) loaded.request(s.presetId);
    ask();
  });
  const off2 = onFrame((f) => loaded.frame(f));
  ask();
  return () => { clearTimeout(timer); off1(); off2(); loaded.cancel(); };
}

/** "Slide 3 of 9: <title>" when the talk moves on (the 2D presenter's announce), spoken once the cards are the slide's. */
export function mountSlideAnnouncer(): () => void {
  return useUi.subscribe((s, p) => {
    if (s.pos === p.pos || !s.stops.length) return;
    const v = viewAt(s.stops, s.pos);
    const title = v.slide?.title ?? (v.words === 'title' ? 'Start of the talk' : v.words === 'check' ? 'Quick check' : '');
    if (title) announce(`Slide ${v.number} of ${v.of}: ${title}`);
  });
}
