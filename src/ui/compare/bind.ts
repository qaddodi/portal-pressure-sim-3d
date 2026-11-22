// Compare's work: pin the moment now (or one from History), end it, and carry the figure's choice of Then, Now or Change out (the pinned frame held on show, or the Change lens counting
// from the pinned pressures). 2D: timeline.js togglePin / pinFrom, main.js (compareView 'A' shows the pinned frame; 'D' colours by change).
import { latest, holdFrame, patient } from '../../engine/index.ts';
import { onLeaveHeld } from '../../engine/store.ts';
import { clock } from '../../clock/frame.ts';
import { sceneApi } from '../../scene/api.ts';
import { useLens } from '../../scene/lenses/store.ts';
import { useShell } from '../shell/store.ts';
import { registerFeature } from '../shell/features.ts';
import { fmtClock, captureFrame, timeline, patientLabel, type Entry } from '../timeline/index.ts';
import { useCompare, type Pin } from './store.ts';
import { CMP, pinnedMoment } from './words.ts';
import { activeLabels } from './labels.ts';

/** Pin a moment: the frame and parameters of a timeline entry ("Compare with now" on a History row). */
export function pinEntry(e: Entry): boolean {
  if (!e.frame) return false;
  useCompare.getState().pin(pinOf(e.frame, e.label, fmtClock(e.t, e.day)));
  useShell.getState().say(pinnedMoment(e.label));
  return true;
}

const pinOf = (snap: Omit<Pin, 'label' | 'when' | 'changes'>, label: string, when: string): Pin => ({ ...snap, label, when, changes: activeLabels(snap.params) });

/** "Compare from here" / "Stop comparing" (the P key, the play bar, the search): freeze the live moment, or let go of the pinned one. */
export function togglePin(): void {
  const c = useCompare.getState();
  if (c.snap) { c.stop(); useShell.getState().say(CMP.stopped); return; }
  const f = latest.frame;
  if (!f) return;
  c.pin(pinOf(captureFrame(f, patient.params), patientLabel(), fmtClock(f.t, f.day)));
  useShell.getState().say(CMP.pinned);   // (the bar already says which moment: its label is not repeated here)
}

/** What the figure shows follows the pin and the choice; the one place that reaches the engine's shown frame and the scene's lens. */
let prevLens: ReturnType<typeof useLens.getState>['lens'] | null = null;
function apply(): void {
  const { snap, view } = useCompare.getState();
  holdFrame(snap && view === 'A' ? snap.frame : null, snap && view === 'A' ? snap.params : undefined);   // (Then is drawn with Then's own parameters)
  if (snap && view === 'D') {
    if (prevLens == null) prevLens = useLens.getState().lens;
    sceneApi.setLensRef(snap.P);
    if (useLens.getState().lens !== 'delta') sceneApi.setLens('delta');
  } else {
    sceneApi.setLensRef(null);
    if (prevLens != null) { const l = prevLens; prevLens = null; if (useLens.getState().lens === 'delta') sceneApi.setLens(l); }
  }
  clock.invalidate('compare');
}

let started = false;
export function startCompare(): () => void {
  if (started) return () => undefined;
  started = true;
  const off = useCompare.subscribe((s, p) => { if (s.snap !== p.snap || s.view !== p.view) apply(); });
  const offF = registerFeature('compare', togglePin);
  onLeaveHeld(() => useCompare.getState().setView('B'));   // (an edit while Then is shown goes back to Now first, eased like the Compare switch)
  return () => { started = false; off(); offF(); onLeaveHeld(null); apply(); };
}
