import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import './css2d/index.css';   // the 2D app's own stylesheets, lifted unchanged (scripts/copy-2d-css.mjs); the shell imports the same file, loaded once
import './deck-ui.css';
import { useEngine } from '../engine/index.ts';
import { useDeck } from '../state/deck.ts';
import { useUi } from './ui-store.ts';
import { stopsOf } from './deck/presenter-machine.ts';
import { typeFor } from './layout/device.ts';
import { layoutOf, isSideways, cardPad, radius } from './layout/rules2d.ts';
import { CardLayer } from './cards/CardLayer.tsx';
import { CardBoundary } from './cards/CardBoundary.tsx';
import { PresenterBar } from './deck/PresenterBar.tsx';
import { useDeckInput } from './deck/useDeckInput.ts';
import { linkScene } from './deck/scene-link.ts';
import { linkLanding } from './deck/landing.ts';
import { linkProcs } from './deck/procs-link.ts';
import { linkFigure } from './deck/figure-link.ts';
import { linkModel } from './talk/deck-model.ts';
import { linkStates } from '../decks/hp/link.ts';
import { JumpList, BlackScreen } from './deck/JumpList.tsx';
import { noteResume } from './deck/resume.ts';
import { landOn } from './deck/deck-of.ts';
import { observeThenFit } from './layout/fit-later.ts';

/** The talk's UI: cards, the wallet, the presenter bar. One overlay above the stage; it measures itself, so it needs only a positioned, full-size parent. */
export function DeckUi() {
  const root = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const device = useUi((s) => s.device);
  const vp = useUi((s) => s.vp);
  const setViewport = useUi((s) => s.setViewport);
  const deck = useUi((s) => s.deck);
  const nonce = useUi((s) => s.nonce);
  const hasStops = useUi((s) => s.stops.length > 0);
  const stopKey = useUi((s) => JSON.stringify(s.pos) + ':' + String(s.page));
  useDeckInput();

  // the talk: its stops, mirrored into the deck store the scene reads (slide 0 is the title)
  useEffect(() => {
    if (!deck) return;
    const stops = stopsOf(deck);
    const at = landOn(deck.id, useUi.getState().startAt, stops.length);   // (a link's slide past the end opens the last one)
    useUi.getState().setStops(stops, at);
    useDeck.getState().open(deck.id, stops.length - 1, at);
    const note = () => { const s = useUi.getState(); noteResume(deck.id, s.pos.stop, s.stops.length); };
    return useUi.subscribe((s, prev) => { if (s.pos.stop !== prev.pos.stop) { useDeck.getState().goto(s.pos.stop); note(); } });
  }, [deck, nonce]);

  // "the slide has landed" (the camera still, its cards in): what waits for the end of a slide's move asks it (landing.ts)
  useEffect(() => linkLanding(), []);
  // the scene follows the talk: the shot, the room the cards leave, the catheter
  useEffect(() => linkScene(), []);
  // the slide's procedures, stented veins, lobule layers and wash
  useEffect(() => linkProcs(), []);
  // what the slide's own fields draw on the figure: names in colour, glow, outlined organs, marks, sites, steps, calipers, the since lens's reference
  useEffect(() => linkFigure(), []);
  // the slide's patient, when it names one
  useEffect(() => linkModel(), []);

  // a talk whose slides each have their own state: the cards print that state, and the figure eases to it
  const ownStates = deck?.numbers === 'states';
  useEffect(() => (deck && ownStates ? linkStates(deck) : undefined), [deck, ownStates, nonce]);

  // the engine's headline numbers, mirrored for the cards (a talk with states of its own prints those instead)
  useEffect(() => {
    if (ownStates) return;
    const push = (s: ReturnType<typeof useEngine.getState>) => useUi.getState().setReadings({ whvp: s.whvp, fhvp: s.fhvp, hvpg: s.hvpg, ivc: s.ivc, ra: s.ra, pv: s.pv });
    push(useEngine.getState());
    return useEngine.subscribe(push);
  }, [ownStates]);

  // the screen: its size and its safe areas, measured when either changes (never per frame)
  useLayoutEffect(() => {
    const el = root.current, pr = probe.current;
    if (!el || !pr) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(pr);
      const px = (v: string) => Math.round(parseFloat(v) || 0);
      setViewport({ w: Math.round(r.width), h: Math.round(r.height), safe: { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) } });
    };
    measure();
    const off = observeThenFit([el], measure);   // (after the observer's delivery: what it sets changes the size of a box above it)
    window.addEventListener('orientationchange', measure);
    return () => { off(); window.removeEventListener('orientationchange', measure); };
  }, [setViewport]);

  const layout = layoutOf(vp.w, vp.h), sideways = isSideways(vp.w, vp.h);
  const t = typeFor(vp.w, vp.h);
  // the 2D app's card padding (--pz-cp; a stacked card's words 13 px in from its 8 px margin) and corner radius (--pz-r)
  const pad = cardPad(vp.w, vp.h);
  const vars = {
    '--fs-deck': `${t.deckTitle}px`, '--lh-deck': t.deckTitleLead, '--fs-title': `${t.slideTitle}px`, '--fs-title-trim': `${t.slideTitleTrim}px`, '--lh-title': t.slideTitleLead,
    '--fs-body': `${t.body}px`, '--lh-body': t.bodyLead, '--fs-data': `${t.data}px`, '--fs-kicker': `${t.kicker}px`, '--fs-big': `${t.bigNumber}px`,
    '--pz-tk-trim': t.slideTitle ? t.slideTitleTrim / t.slideTitle : 1, '--pad-x': `${pad.x}px`, '--pad-y': `${pad.y}px`, '--r': `${Math.round(radius(vp.w, vp.h, layout))}px`,
  } as CSSProperties;
  // the 2D app's own root classes: `pz` is its card layer, `stack` a phone or an upright iPad, `tab` the iPad, `short` a wide screen under 860 px, `pz-card` every screen with floating cards,
  // `pz-wide` the same with the data card stacked under the words. The lifted 2D stylesheet (src/ui/css2d) keys its type, colour and glass on these.
  const stacked = layout === 'stack' || layout === 'tab';
  const cls = ['deck-ui', 'pz', stacked && 'stack', layout === 'tab' && 'tab', layout === 'short' && 'short', !stacked && 'pz-card pz-wide'].filter(Boolean).join(' ');
  return (
    <div ref={root} className={cls} data-device={device} data-layout={layout} data-sideways={sideways || undefined} style={{ position: 'fixed', zIndex: 'var(--z-cards)' as unknown as number, ...vars }}>
      <div ref={probe} aria-hidden="true" style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', paddingTop: 'env(safe-area-inset-top, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)' }} />
      {deck && hasStops && <PresenterBar title={deck.title} />}
      {deck && hasStops && <CardBoundary resetKey={`${deck.id}:${stopKey}`}><CardLayer deck={deck} /></CardBoundary>}
      {deck && hasStops && <JumpList />}
      {deck && <BlackScreen />}
    </div>
  );
}
