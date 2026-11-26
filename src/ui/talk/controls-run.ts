// Carries out a slide's live controls on the live model and the figure (decks/controls.ts says what they are). The model changes the way the 2D presenter's buttons do:
// a treatment or a response is `setParams` eased in, a patient or another slide's state is a `morph` to a state worked out off screen, a lens is the scene's lens,
// a scale is the scene's view. The slide's own state comes back whenever the slide is shown again (hp/link.ts morphs to it).
import { engine, onFrame } from '../../engine/index.ts';
import { pressBegin, pressHeld } from './press-pending.ts';
import { sendParams } from '../../engine/params-send.ts';
import { useStates } from '../../decks/hp/calc.ts';
import { stopLapse } from '../../decks/hp/lapse.ts';
import { patchOf, valueAt, speaks, variantWords, type CompareOpt, type Scale } from '../../decks/controls.ts';
import { useVariant, variantOf } from './variant-words.ts';
import { variantStateOf, sliderOpt, type Picked, type Seq } from './variant-state.ts';
import { clock, type TimerId } from '../../clock/frame.ts';
import { sceneApi } from '../../scene/api.ts';
import { LENS_IDS, type LensId, DEFAULT_LENS } from '../../scene/lenses/model.ts';
import { LOBULE_CAMS, type LobuleCam } from '../../scene/lobule/shots.ts';
import { camPlan } from '../../decks/hp/cams.ts';
import { useUi } from '../ui-store.ts';
import { useLabels } from '../../scene/labels/store.ts';
import { KEY_LENSES } from '../../scene/labels/key.ts';
import { useToolPatch } from './tool-options.ts';
import { useDopplerProbe, type Gate } from '../tests/doppler/probe-state.ts';
import type { Deck } from '../../decks/schema.ts';
import { copiedOf } from '../../decks/hp/deck.ts';

/** How long a treatment button takes to settle the model (ms), and a patient or a slide to ease over. */
export const EASE_MS = 700, MORPH_MS = 1100, SLIDER_EASE_MS = 350;

const stateOf = (deck: Deck, i: number) => useStates.getState().results[deck.id]?.[i];
const picked = new Map<string, Promise<Picked>>();
let pickN = 0;
/** The model is sent to a state: it is a press still on its way until the engine has answered with a few frames of its own (a frame in flight from before the morph does not show it), or
 * after 4 s of page time. */
const MORPH_ANSWER_FRAMES = 3;
function morph(snap: unknown): void {
  if (!snap) return;
  engine().send({ type: 'morph', snap, ms: MORPH_MS });
  const done = pressBegin('the model has not begun easing to the press');
  let frames = 0, off: () => void = () => {}, guard: TimerId | null = null;
  const end = () => { off(); if (guard != null) clock.cancel(guard); done(); };
  guard = clock.after(end, 4000, 'press-morph');
  off = onFrame(() => { if (++frames >= MORPH_ANSWER_FRAMES) end(); });
}

/** A compare button, by what it does (decks/controls.ts howOf, 2D abChoice): switch the lens, ease the model to a state (a patient, another slide's, the slide's own), or patch the live
 *  parameters. A button that speaks brings its words to the card (variant-words.ts). `i` is the slide's index in the deck. */
export const pickCompare = (deck: Deck, i: number, o: CompareOpt): Promise<void> => pressHeld(`the "${o.label}" button`, () => pickCompareRun(deck, i, o));
async function pickCompareRun(deck: Deck, i: number, o: CompareOpt): Promise<void> {
  const slide = deck.slides[i];
  if (!slide) return;
  const key = `${deck.id}/${slide.id}`;
  // a button that moves an instrument: the Doppler's sample spot, or one option of the slide's instrument; the model is left alone (2D abPick)
  if (o.gate) { useDopplerProbe.getState().setGate(o.gate as Gate); return; }
  if (o.tool) { useToolPatch.getState().set(slideKey(deck, i), o.tool); return; }
  if (o.how === 'lens') {
    const own = slide.scene?.lens ?? DEFAULT_LENS;
    const lens = o.own && !(LENS_IDS as readonly string[]).includes(o.lens ?? '') ? own : o.lens!;
    if ((LENS_IDS as readonly string[]).includes(lens)) { sceneApi.setLens(lens as LensId); useLabels.getState().set({ key: KEY_LENSES.includes(lens) ? lens : null }); }   // (2D lensPick: the key under the line follows)
    return;
  }
  const at = o.slide ? deck.slides.find((s) => s.id === o.slide) ?? null : null;
  const words = variantWords(slide, o, at);
  const n = ++pickN;   // (a later press wins: an earlier one that is still being worked out must not land after it)
  const seq: Seq = (steps, base) => engine().sequence(steps, base);
  const j = o.slide ? deck.slides.findIndex((s) => s.id === o.slide) : i;
  if (o.how === 'params') {
    sendParams(o.params ?? {}, { settle: false, ease: EASE_MS });
    // (only a row where some button speaks brings words: a row of plain parameter buttons keeps the slide's)
    const w = speaks(slide.controls?.compare?.opts ?? []) ? words : null;
    useVariant.getState().set(key, w);
    // the charts of the slide read the patient this press makes (the slide's own state with the change), as they do for a patient button
    const got = await variantStateOf(seq, picked, { slideKey: key }, o, stateOf(deck, i), undefined);
    if (n === pickN && got) useVariant.getState().set(key, w, got.state);
    return;
  }
  const got = await variantStateOf(seq, picked, { slideKey: key }, o, stateOf(deck, i), stateOf(deck, j));
  if (n !== pickN) return;
  morph(got?.snap);
  useVariant.getState().set(key, words, got?.state ?? null);
}

/** The key a slide's instrument options are kept under. */
export const slideKey = (deck: Deck, i: number): string => `${deck.id}/${deck.slides[i]?.id ?? ''}`;
/** A what-if slider on an instrument (`tool: 'air'`): one option moved, the model left alone. */
export function dragToolOption(deck: Deck, i: number, name: string, x: number): void { useToolPatch.getState().one(slideKey(deck, i), name, x); }
/** Where an instrument slider starts: the slide's own option, else the low end. */
export const toolOptionStart = (deck: Deck, i: number, name: string, min: number): number => { const v = (copiedOf(deck.id)?.slides[i]?.tool as Record<string, unknown> | undefined)?.[name]; return typeof v === 'number' ? v : min; };

/** The what-if slider: one value at its parameter paths, eased in. The slide's charts follow it too (the same state a parameter button gives them), once the slider has rested a moment: each value is a
 *  settled model worked out off screen, so a drag asks for the last one only. At the slide's own value the slide's own state is back. */
const SLIDER_REST_MS = 250;
let dragTimer: TimerId | null = null, dragN = 0, dragDone: (() => void) | null = null;
const dragRelease = (): void => { const d = dragDone; dragDone = null; d?.(); };
export function dragWhatIf(deck: Deck, i: number, paths: readonly string[], x: number): void {
  sendParams(patchOf(paths, x), { settle: false, ease: SLIDER_EASE_MS });
  const key = slideKey(deck, i), n = ++dragN;
  dragDone ??= pressBegin('the slider');   // (held from the first move until the last one's state has been worked out)
  if (dragTimer != null) clock.cancel(dragTimer);
  dragTimer = clock.after(() => {
    dragTimer = null;
    const own = stateOf(deck, i), words = variantOf(key);
    if (x === whatIfStart(deck, i, paths, NaN)) { if (n === dragN) { useVariant.getState().set(key, words, null); dragRelease(); } return; }
    void variantStateOf((st, base) => engine().sequence(st, base), picked, { slideKey: key }, sliderOpt(paths, x), own, undefined).then((got) => {
      if (n === dragN && got?.state) useVariant.getState().set(key, words, got.state);
      if (n === dragN) dragRelease();
    }, () => { if (n === dragN) dragRelease(); });
  }, SLIDER_REST_MS);
}
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

// ── the hold-to-strain button (2D presenter-lapse.js strainHold): the engine's Valsalva, on only while it is held ──
let strainHeld = false;
/** Press (true) or let go (false). A treatment button's rule: two clocks must not drive the model, so a time-lapse or a procedure in play ends first. The engine lets go by itself after 30 s. */
export function strainHold(on: boolean): void {
  if (on === strainHeld) return;
  strainHeld = on;
  if (!on) { engine().send({ type: 'action', action: { kind: 'strain', on: false } }); return; }
  stopLapse();
  sceneApi.procedure.stop();
  engine().send({ type: 'run', running: true, clock: 'hemo', speed: 1 });
  engine().send({ type: 'action', action: { kind: 'strain', on: true } });
}
