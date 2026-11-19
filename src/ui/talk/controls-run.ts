// Carries out a slide's live controls on the live model and the figure (decks/controls.ts says what they are). The model changes the way the 2D presenter's buttons do:
// a treatment or a response is `setParams` eased in, a patient or another slide's state is a `morph` to a state worked out off screen, a lens is the scene's lens,
// a scale is the scene's view. The slide's own state comes back whenever the slide is shown again (hp/link.ts morphs to it).
import { engine } from '../../engine/index.ts';
import { useStates } from '../../decks/hp/calc.ts';
import { patchOf, valueAt, speaks, variantWords, type CompareOpt, type Scale } from '../../decks/controls.ts';
import { useVariant } from './variant-words.ts';
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
/** A patient's state (2D xKey: the preset with the params, days and relax a button gives it), worked out off screen once. */
const xKey = (o: { preset: string; params?: unknown; days?: number }): string => o.preset + (o.params || o.days ? JSON.stringify([o.params, o.days]) : '');
const snapOfPatient = (o: CompareOpt): Promise<unknown> => {
  const key = xKey(o as { preset: string });
  let p = presetSnaps.get(key);
  if (!p) {
    p = engine().sequence([{ preset: o.preset!, ...(o.params ? { params: o.params } : {}), ...(o.days ? { days: o.days } : {}) }]).then((r) => r[0]?.snap);
    presetSnaps.set(key, p); p.catch(() => presetSnaps.delete(key));
  }
  return p;
};
const morph = (snap: unknown) => { if (snap) engine().send({ type: 'morph', snap, ms: MORPH_MS }); };

/** A compare button, by what it does (decks/controls.ts howOf, 2D abChoice): switch the lens, ease the model to a state (a patient, another slide's, the slide's own), or patch the live
 *  parameters. A button that speaks brings its words to the card (variant-words.ts). `i` is the slide's index in the deck. */
export async function pickCompare(deck: Deck, i: number, o: CompareOpt): Promise<void> {
  const slide = deck.slides[i];
  if (!slide) return;
  const key = `${deck.id}/${slide.id}`;
  if (o.how === 'lens') {
    const own = slide.scene?.lens ?? DEFAULT_LENS;
    const lens = o.own && !(LENS_IDS as readonly string[]).includes(o.lens ?? '') ? own : o.lens!;
    if ((LENS_IDS as readonly string[]).includes(lens)) sceneApi.setLens(lens as LensId);
    return;
  }
  const at = o.slide ? deck.slides.find((s) => s.id === o.slide) ?? null : null;
  const words = variantWords(slide, o, at);
  if (o.how === 'params') {
    engine().send({ type: 'setParams', params: o.params ?? {}, settle: false, ease: EASE_MS });
    // (only a row where some button speaks brings words: a row of plain parameter buttons keeps the slide's)
    if (speaks(slide.controls?.compare?.opts ?? [])) useVariant.getState().set(key, words);
    return;
  }
  const j = o.slide ? deck.slides.findIndex((s) => s.id === o.slide) : i;
  const snap = o.preset ? await snapOfPatient(o) : stateOf(deck, j)?.snap;
  morph(snap);
  useVariant.getState().set(key, words);
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
