// The data card's tiles, on the 2D app's own markup (presenter-cards.js buildTiles) and so its own stylesheet (src/ui/styles): per tile the name (.pzt-k), the number and its unit
// (.pzt-vu > .pzt-v + small), the rating's word (.pzt-r), the line that says where it started (.pzt-d) and the scale bar (.pzt-bar: bands, cut-off ticks and numbers, a ring where it
// started and a dot where it is). Which tiles, their words and their numbers are tiles-2d.ts, from the slide's own state in the engine; this file only draws them.
// An instrument card's readings stand in its header row instead (.pz-dh > .pz-hr > .pz-hi) and its tiles card is not drawn (2D: .pz-data.tool-only .pz-tiles is hidden).
import { fitLabels } from './tile-labels.ts';
import { observeThenFit } from '../layout/fit-later.ts';
import { useLayoutEffect, useMemo, useRef, type MouseEvent, type RefObject } from 'react';
import { copiedOf } from '../../decks/hp/deck.ts';
import { useStates } from '../../decks/hp/calc.ts';
import { useShown } from '../talk/shown-state.ts';
import { useLapse } from '../../decks/hp/lapse.ts';
import { liveFp } from '../../decks/hp/figure-engine.ts';
import { mergeStates } from '../charts/baked/view.ts';
import type { CopiedSlide } from '../../decks/hp/types.ts';
import { layoutOf, isShortSide } from '../layout/rules2d.ts';
import { cardTitle, titleUnits } from '../talk/tool-title.ts';
import { useUi } from '../ui-store.ts';
import { tilesAt, liveResults, type Fp, type SlideTiles, type TileView } from './tiles-2d.ts';
import { Roll } from './Roll.tsx';
import { I } from '../shell/icons.tsx';
import { useCardZoomOn } from './card-zoom.ts';
import { Fade, fadeAttrs } from '../fade.tsx';
import { seriesAttrs } from '../text/series-tone.ts';

/** A slide's tiles from its state: the slide's own (the last one before it that changed the patient, as 2D has it), the state its change counts from, and the page's phone-ness. */
export function useSlideTiles(deckId: string, slideId: string): (SlideTiles & { live?: boolean }) | null {
  // (the baked states count as in: the words card has always read them, and a tile that waited for the live chain showed "—" under words that already had the number, audit f9a5d2e0, tips-complete 10 and two-lesions 9)
  const liveResults_ = useStates((s) => s.results[deckId]);
  const merged = useMemo(() => mergeStates(deckId, liveResults_) as typeof liveResults_, [deckId, liveResults_]);
  // (the state the slide stands at: a pressed control's, else its own: the tiles move with the words and the figure, shown-state.ts)
  const results = useShown(deckId, merged) as typeof liveResults_;
  const vp = useUi((s) => s.vp);
  const copied = copiedOf(deckId);
  // while the slide's days run the tiles stand where they begin and then climb with them (2D presenter-case.js playLapse: every poll `dataTo(liveFp(fr))`, but "only once a day has run: before that the live
  // figure is at the bedside, its numbers swinging with each beat, while the card already shows the settled start"); when the days are done they ease to the slide's own end (the counter's `done`)
  const lap = useLapse((s) => (s.key === `${deckId}/${slideId}` && !s.done ? (s.d >= 1 ? s.d : 0) : -1));
  return useMemo(() => {
    if (!copied) return null;
    const lay = layoutOf(vp.w, vp.h), slides = copied.slides as CopiedSlide[], i = slides.findIndex((x) => x.id === slideId);
    const fp = lap > 0 ? liveFp() : lap === 0 ? startOf(results, i) : null;
    const live = fp ? liveResults(results, i, fp) : null;
    const t = tilesAt(slides, (live ?? results) as never, i, lay === 'stack' || lay === 'tab');
    return t && live ? { ...t, live: true } : t;
  }, [copied, results, slideId, vp.w, vp.h, lap]);
}

/** Where a slide's days begin: the state the engine made them from (its `start`), else the slide before's. */
const startOf = (results: readonly (object | undefined)[] | undefined, i: number): Fp | null =>
  ((results?.[i] as { start?: { fp?: Fp } } | undefined)?.start?.fp ?? (results?.[i - 1] as { fp?: Fp } | undefined)?.fp) ?? null;

/** The card's header (.pz-dh): its title, and an instrument card's readings beside it. The title is 2D's cardTitle (presenter-question.js): the slide's own `dataTitle`, else its instrument's
 *  (ui/talk/tool-title.ts), else "The patient" for a tiles card with no instrument; a phone, or a phone held sideways, takes the short form of a long one. A unit in it keeps its own case (.pz-unit). */
export function TilesHead({ deckId, slideId, onZoom }: { deckId: string; slideId: string; /** the corner button that zooms the card (2D .pz-zbtn: an instrument's card, wide screens, shown only while the card is `pz-zoomable`) */ onZoom?: (e: MouseEvent<HTMLButtonElement>) => void }) {
  const t = useSlideTiles(deckId, slideId);
  const zoomed = useCardZoomOn();
  const vp = useUi((s) => s.vp);
  const copied = copiedOf(deckId)?.slides.find((s) => s.id === slideId);
  if (!copied) return null;
  const lay = layoutOf(vp.w, vp.h), title = cardTitle(copied, lay === 'stack' || lay === 'tab' || isShortSide(vp.w, vp.h));
  const heads = t?.toolOnly ? t.tiles.filter((x) => t.head.includes(x.k)) : [];
  // (The Gut to Heart card has no title: the chart's own zone words say it (24 Nov, Mohammad: "GUT TO HEART title can drop"). The heading stays in the page for a screen reader but leaves the flow, and the chart
  //  takes the height it held: ProfileCard measures it, `.pz-dh.off`.)
  const off = (copied.tool as { kind?: string } | undefined)?.kind === 'profile' && !heads.length;
  return (
    <div className={off ? 'pz-dh off' : 'pz-dh'}>
      <span>{titleUnits(title).map((p, i) => (i % 2 ? <span key={i} className="pz-unit">{p}</span> : p))}</span>
      <span className="pz-hr" data-n={heads.length}>
        {heads.map((x) => (
          <span key={x.k} className={`pz-hi${x.key ? ' key' : ''}`} data-rate={x.rate} data-measured={['hvpg', 'hvpgFall', 'ppg'].includes(x.k) ? '' : undefined}>
            <span className="pz-hk">{x.head.name}</span><b {...seriesAttrs(x.k)}><Roll text={x.head.text} still={t?.live} /></b><Fade as="small" on={!!x.head.unit}>{x.head.unit}</Fade>
          </span>
        ))}
      </span>
      {onZoom && <button type="button" className="pz-zbtn" aria-label="Enlarge this card" aria-expanded={zoomed} title="Enlarge" onClick={onZoom}><I n="fullscreen" /><I n="shrink" /></button>}
    </div>
  );
}

export function Tile({ t, live }: { t: TileView; live?: boolean }) {
  const b = t.bar;
  return (
    <div className={`pz-tile${b ? ' scaled' : ''}${t.key ? ' key' : ''}`} data-rate={t.rate}>
      <span className="pzt-k" data-s={t.short ?? undefined}>{t.name}</span>
      <span className={`pzt-vu${t.pct ? ' pct' : ''}`}><span className="pzt-v" {...seriesAttrs(t.k)}><Roll text={t.text} still={live} /></span><Fade as="small" on={!!t.unit}>{t.unit}</Fade></span>
      <span className="pzt-r">{t.word}</span>
      <span className="pzt-d">{t.delta}</span>
      <span className={`pzt-bar${b ? '' : ' empty'}`} aria-hidden="true">
        <span className="pzb-track">
          <span className="pzb-zs">{b?.zones.map((z, i) => <i key={i} className="pzb-z" data-rate={z.rate} style={{ left: `${z.left}%`, width: `${z.width}%` }} />)}</span>
          {b?.ticks.map((x, i) => <i key={i} className="pzb-t" style={{ left: `${x}%` }} />)}
          {b && <i className="pzb-link" {...fadeAttrs(b.was != null)} style={b.was == null || b.now == null ? undefined : { translate: `${Math.min(b.now, b.was)}% 0`, scale: `${(Math.abs(b.now - b.was) / 100).toFixed(4)} 1` }} />}
          {b && <i className="pzb-was" {...fadeAttrs(b.was != null)} style={{ translate: `clamp(4.5px, ${b.was ?? 0}%, calc(100% - 4.5px)) 0` }} />}
          {b && <i className="pzb-now" {...fadeAttrs(b.now != null)} style={{ translate: `clamp(6px, ${b.now ?? 0}%, calc(100% - 6px)) 0` }} />}
        </span>
        {b?.labels.map((l, i) => <span key={i} className="pzb-l" style={{ left: `${l.left}%` }}>{l.text}</span>)}
      </span>
    </div>
  );
}

/** The 2D card fit that is a decision of layout, not of the numbers (presenter-zoom.js fitCards): a name wider than its tile takes its short form, then wraps; a scale bar's cut-off
 *  numbers stay inside it, and where two would come within 8 px of each other it shows none; a row whose bars show no number keeps no row for them. Read once, written once. */
export function useTileFit(row: RefObject<HTMLDivElement | null>, sig: string) {
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const fit = () => {
      const names = [...el.querySelectorAll<HTMLElement>('.pzt-k')];
      const room = (k: HTMLElement) => { const t = k.parentElement!, cs = getComputedStyle(t); return t.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); };
      names.forEach((k) => k.classList.remove('wrap', 'short'));
      names.filter((k) => k.dataset.s).forEach((k) => { const r = room(k); if (r > 0 && k.scrollWidth > r + 0.5) k.classList.add('short'); });
      names.forEach((k) => { const r = room(k); if (r > 0 && k.scrollWidth > r + 0.5) k.classList.add('wrap'); });
      const bars = [...el.querySelectorAll<HTMLElement>('.pzt-bar')].map((bar) => ({ bar, ls: [...bar.querySelectorAll<HTMLElement>('.pzb-l')] }));
      bars.forEach(({ ls }) => ls.forEach((l) => l.classList.remove('lo', 'hi', 'off')));
      const boxes = bars.map((b) => ({ B: b.bar.getBoundingClientRect(), rs: b.ls.map((l) => l.getBoundingClientRect()) }));
      let anyShown = false, measured = true;
      bars.forEach(({ ls }, n) => {
        const { B, rs } = boxes[n]!;
        if (!B.width) { measured = false; return; }
        const fits = fitLabels(B, rs);
        ls.forEach((l, i) => { const f = fits[i]!; if (f.lean) l.classList.add(f.lean); if (f.off) l.classList.add('off'); });
        if (fits.some((f, i) => rs[i]!.width > 0 && !f.off)) anyShown = true;
      });
      if (measured && bars.length) el.classList.toggle('pzb-nonum', !anyShown);
    };
    fit();
    // the fonts arriving change what a name measures even when the row's own box stays as it was (the observer is silent then): judged again at once, before the card is let in on this height (24 Nov)
    let alive = true;
    if (typeof document !== 'undefined' && document.fonts && document.fonts.status !== 'loaded') void document.fonts.ready.then(() => { if (alive) fit(); });
    const off = observeThenFit([el], fit);
    return () => { alive = false; off(); };   // (the pass writes `pzb-nonum` on the row it observes: never inside the observer's own delivery)
  }, [row, sig]);
}

/** The tiles of a slide that has them and no instrument (an instrument card's readings are its header's: TilesHead). */
export function TilesCard({ deckId, slideId }: { deckId: string; slideId: string }) {
  const t = useSlideTiles(deckId, slideId);
  const row = useRef<HTMLDivElement>(null);
  useTileFit(row, t ? t.tiles.map((x) => `${x.k}${x.text}`).join('|') : '');
  if (!t || t.toolOnly) return null;
  return (
    <div className="pz-tiles" ref={row} data-n={t.tiles.length} data-keys={t.keys.join()}>
      {t.tiles.map((x) => <Tile key={x.k} t={x} live={t.live} />)}
    </div>
  );
}
