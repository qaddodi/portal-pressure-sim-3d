import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import './css2d/index.css';   // the 2D app's own stylesheets, lifted unchanged (scripts/copy-2d-css.mjs); the shell imports the same file, loaded once
import './deck-ui.css';
import { HVPG_DECK } from '../decks/hvpg.ts';
import { useEngine } from '../engine/index.ts';
import { useDeck } from '../state/deck.ts';
import { useUi } from './ui-store.ts';
import { stopsOf } from './deck/presenter-machine.ts';
import { typeFor } from './layout/device.ts';
import { layoutOf, isSideways, cardPad, radius } from './layout/rules2d.ts';
import { CardLayer } from './cards/CardLayer.tsx';
import { PresenterBar } from './deck/PresenterBar.tsx';
import { useDeckInput } from './deck/useDeckInput.ts';
import { linkScene } from './deck/scene-link.ts';

/** The talk's UI: cards, the wallet, the presenter bar. One overlay above the stage; it measures itself, so it needs only a positioned, full-size parent. */
export function DeckUi() {
  const root = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const device = useUi((s) => s.device);
  const vp = useUi((s) => s.vp);
  const setViewport = useUi((s) => s.setViewport);
  const hasStops = useUi((s) => s.stops.length > 0);
  useDeckInput();

  // the talk: its stops, mirrored into the deck store the scene reads (slide 0 is the title)
  useEffect(() => {
    const stops = stopsOf(HVPG_DECK);
    useUi.getState().setStops(stops);
    useDeck.getState().open(HVPG_DECK.id, stops.length - 1, 0);
    return useUi.subscribe((s, prev) => { if (s.pos.stop !== prev.pos.stop) useDeck.getState().goto(s.pos.stop); });
  }, []);

  // the scene follows the talk: the shot, the room the cards leave, the catheter
  useEffect(() => linkScene(), []);

  // the engine's headline numbers, mirrored for the cards
  useEffect(() => {
    const push = (s: ReturnType<typeof useEngine.getState>) => useUi.getState().setReadings({ whvp: s.whvp, fhvp: s.fhvp, hvpg: s.hvpg, ivc: s.ivc, ra: s.ra, pv: s.pv });
    push(useEngine.getState());
    return useEngine.subscribe(push);
  }, []);

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
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('orientationchange', measure);
    return () => { ro.disconnect(); window.removeEventListener('orientationchange', measure); };
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
      {hasStops && <PresenterBar title={HVPG_DECK.title} />}
      {hasStops && <CardLayer deck={HVPG_DECK} />}
    </div>
  );
}
