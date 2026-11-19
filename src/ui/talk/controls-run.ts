// Carries out a slide's live controls on the live model and the figure (decks/controls.ts says what they are). The model changes the way the 2D presenter's buttons do:
// a treatment or a response is `setParams` eased in, a patient or another slide's state is a `morph` to a state worked out off screen, a lens is the scene's lens,
// a scale is the scene's view. The slide's own state comes back whenever the slide is shown again (hp/link.ts morphs to it).
import { engine } from '../../engine/index.ts';
import { useStates } from '../../decks/hp/calc.ts';
import { patchOf, valueAt, type CompareOpt, type Scale } from '../../decks/controls.ts';
import { sceneApi } from '../../scene/api.ts';
import { LENS_IDS, type LensId, DEFAULT_LENS } from '../../scene/lenses/model.ts';
import { LOBULE_CAMS, type LobuleCam } from '../../scene/lobule/shots.ts';
import { camPlan } from '../../decks/hp/cams.ts';
import { useUi } from '../ui-store.ts';
import type { Deck } from '../../decks/schema.ts';

/** How long a treatment button takes to settle the model (ms), and a patient or a slide to ease over. */
export const EASE_MS = 700, MORPH_MS = 1100, SLIDER_EASE_MS = 350;

const stateOf = (deck: Deck, i: number) => useStates.getState().results[deck.id]?.[i];
const presetSnaps = new Map<string, Promise<unknown>>();
/** The state of a patient (a preset), worked out off screen once. */
const snapOfPreset = (preset: string): Promise<unknown> => {
  let p = presetSnaps.get(preset);
  if (!p) { p = engine().sequence([{ preset }]).then((r) => r[0]?.snap); presetSnaps.set(preset, p); p.catch(() => presetSnaps.delete(preset)); }
  return p;
};
const morph = (snap: unknown) => { if (snap) engine().send({ type: 'morph', snap, ms: MORPH_MS }); };

/** A compare button: the slide's own state, a treatment's parameters, another patient, another slide's state, or a lens. `i` is the slide's index in the deck. */
export async function pickCompare(deck: Deck, i: number, o: CompareOpt): Promise<void> {
  if (o.lens) {
    const own = deck.slides[i]?.scene?.lens ?? DEFAULT_LENS;
    const lens = o.own && !(LENS_IDS as readonly string[]).includes(o.lens) ? own : o.lens;
    if ((LENS_IDS as readonly string[]).includes(lens)) sceneApi.setLens(lens as LensId);
    return;
  }
  if (o.params) { engine().send({ type: 'setParams', params: o.params, settle: false, ease: EASE_MS }); return; }
  if (o.preset) { morph(await snapOfPreset(o.preset)); return; }
  if (o.slide) { const j = deck.slides.findIndex((s) => s.id === o.slide); if (j >= 0) morph(stateOf(deck, j)?.snap); return; }
  if (o.own) morph(stateOf(deck, i)?.snap);
}

/** The what-if slider: one value at its parameter paths, eased in. */
export function dragWhatIf(paths: readonly string[], x: number): void { engine().send({ type: 'setParams', params: patchOf(paths, x), settle: false, ease: SLIDER_EASE_MS }); }
/** Where the slider starts: the slide's own value at its first path (its computed state's parameters), else the low end. */
export const whatIfStart = (deck: Deck, i: number, paths: readonly string[], min: number): number => valueAt(stateOf(deck, i)?.params, paths[0]!) ?? min;

/** The scale pill: the anatomy (the slide's own shot), the lobule or the sinusoid. */
export function pickScale(deck: Deck, i: number, scale: Scale, land?: string): void {
  const room = useUi.getState().boxes.free;
  if (room.w <= 0 || room.h <= 0) return;
  const s = deck.slides[i];
  if (scale === 'sinusoid') { sceneApi.showView('sinusoid', room); return; }
  if (scale === 'lobule') { sceneApi.showView('lobule', room, (LOBULE_CAMS as readonly string[]).includes(land ?? '') ? (land as LobuleCam) : 'lobule'); return; }
  const own = s?.scene?.view === 'body' ? s.scene.shot : null;
  const shot = land && land !== 'fit' ? (() => { try { const p = camPlan(land); return p.kind === 'body' ? p.shot : null; } catch { return null; } })() : null;
  const fit = (() => { const p = camPlan('fit'); return p.kind === 'body' ? p.shot : null; })();
  sceneApi.showShot('body', shot ?? (land === 'fit' ? fit : own) ?? fit!, room);
}
