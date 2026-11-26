// The stop's card and the card on the way (docs/approved/play-the-case.md, "The three states"). At a stop: the kicker, the title, what followed and the numbers before and after (History's
// own moment words, history/HistoryList.tsx MomentWords), "Look closer here", Continue to the next stop, and a line on what the figure shows, with Back to this view once it is moved.
// Exploring (a Tests card open at the stop): the card folds to its title and Continue. On the way: the next stop and the days to it, and the smaller events passing as quiet notes.
// Mac: a card at the left. An upright iPad and an iPhone: a sheet over the foot of the figure; on the iPhone it shows the title, the numbers and Continue, pulled up for the rest.
import { useEffect, useRef, useState } from 'react';
import { MomentWords } from '../history/HistoryList.tsx';
import { Icon } from '../shell/icons.tsx';
import { useShell } from '../shell/store.ts';
import { useCase } from './store.ts';
import { continueCase, endCase } from './run.ts';
import { showShot } from './shot.ts';
import { openLook } from './look-pane.ts';
import { useFigureMoved } from './moved.ts';
import { CASE, chapterAt, continueWords, kickerWords, lookSide, passedNotes, shotWords, travelWords, type PassNote } from './words.ts';
import type { CaseView } from './view.ts';
import type { CaseLook, Stop } from './types.ts';

const LOOK_ICON: Record<string, string> = { circuit: 'circuit-map', lobule: 'lobule-hex', sinusoid: 'lobule-hex', anatomic: 'body-fig', endoscopy: 'scope-ring', scope: 'scope-ring' };

/** The shot the figure takes at a stop, as shot.ts takes it: a view the figure cannot draw yet stands on the whole body. */
export function shotNow(stop: Stop, ready: Readonly<Record<string, boolean>>): Stop['shot'] {
  return ready[stop.shot.view] ? stop.shot : { view: 'anatomic', cam: 'fit' };
}

function Look({ items }: { items: readonly CaseLook[] }) {
  if (!items.length) return null;
  return (
    <div className="cs-look">
      <span className="cs-lh">{CASE.look}</span>
      <ul>
        {items.map((l) => (
          <li key={`${l.tool}:${l.label}`}>
            <button type="button" onClick={() => openLook(l)}>
              <Icon n={LOOK_ICON[l.tool] ?? 'gauge'} /><span className="cs-lt">{l.label}</span><span className="cs-lw">{lookSide(l.tool)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface StopShown { at: number; stop: Stop; kicker: string; next: string | null; nextShort: string | null; tone: string }
const toneOf = (t: string): string => (t === 'danger' ? 'danger' : t === 'change' ? 'change' : t === 'ok' ? 'ok' : '');

/** What the stop's card shows, for the stop the case is at. */
export function stopShown(cv: CaseView, stops: readonly Stop[], at: number): StopShown | null {
  const stop = stops[at];
  if (!stop) return null;
  const kicker = kickerWords(stops, at, chapterAt(cv.v.chapters, stop.day));
  return { at, stop, kicker, next: continueWords(stops, at), nextShort: continueWords(stops, at, true), tone: toneOf(cv.tones[at] ?? 'info') };
}

function Go({ s, short, children }: { s: StopShown; short: boolean; children?: React.ReactNode }) {
  const words = short ? s.nextShort : s.next;
  return (
    <div className="cs-go">
      {words ? <button type="button" className="cs-btn primary" onClick={() => continueCase()}><span>{words}</span><Icon n="chev-right" /></button>
        : <button type="button" className="cs-btn primary" onClick={() => endCase()}><span>{CASE.leave}</span></button>}
      {children}
    </div>
  );
}

function ShotLine({ s, moved, back }: { s: StopShown; moved: boolean; back(): void }) {
  const ready = useShell((x) => x.ready);
  return (
    <p className="cs-shot">
      <Icon n="camera" />
      <span>{moved ? CASE.moved : shotWords(shotNow(s.stop, ready))}</span>
      {moved && <button type="button" className="cs-link" onClick={back}>{CASE.back}</button>}
    </p>
  );
}

/** An element's height as the browser lays it out (a resize observer: no layout read), told to `cb` when it changes. */
function useHeight(ref: React.RefObject<HTMLElement | null>, cb: (h: number) => void): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver((es) => { const b = es[0]?.borderBoxSize?.[0]; cb(Math.round(b ? b.blockSize : es[0]?.contentRect.height ?? 0)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, cb]);
}

/** The stop's full card (a Mac's at the left, an upright iPad's sheet), and its folded one while a Tests card is open. */
interface CardsIn { cv: CaseView; s: StopShown | null; on: boolean; fold: boolean; moved: boolean; back(): void; sheet: boolean; onHeight(h: number): void }
export function StopCards({ cv, s, on, fold, moved, back, sheet, onHeight }: CardsIn) {
  const m = s ? cv.moments[s.at] : null;
  const full = useRef<HTMLElement>(null);
  useHeight(full, onHeight);
  const words = m && m.type !== 'quiet' && m.type !== 'trimmed' ? <MomentWords m={m} v={cv.v} say={s?.stop.say ?? null} /> : null;
  return (
    <>
      <section ref={full} className={`cs-card cs-full${sheet ? ' cs-sheet' : ''} stage-blocker`} data-on={on && !fold} data-tone={s?.tone || undefined}
        aria-hidden={!(on && !fold)} inert={!(on && !fold)}>
        {s && <>
          <span className="cs-kick">{s.kicker}</span>
          <h2 className="cs-title">{s.stop.title}</h2>
          <div className="cs-words">{words}</div>
          <Look items={s.stop.look} />
          <Go s={s} short={false} />
          <ShotLine s={s} moved={moved} back={back} />
        </>}
      </section>
      {!sheet && (
        <section className="cs-card cs-fold stage-blocker" data-on={on && fold} data-tone={s?.tone || undefined} aria-hidden={!(on && fold)} inert={!(on && fold)}>
          {s && <>
            <span className="cs-kick">{s.kicker}</span>
            <h2 className="cs-title">{s.stop.title}</h2>
            <Go s={s} short>{moved && <button type="button" className="cs-btn plain" onClick={back}><Icon n="camera" /><span>{CASE.back}</span></button>}</Go>
          </>}
        </section>
      )}
    </>
  );
}

/** The iPhone's stop sheet: the title, the numbers and Continue; pulled up (a swipe up, or a tap on its foot line), Look closer here and the figure's line. The part pulled up is clipped
 *  and moved by a transform together, so the sheet's foot stands still while it grows: nothing is laid out again. */
export function PhoneStopSheet({ cv, s, on, moved, back, onHeight }: { cv: CaseView; s: StopShown | null; on: boolean; moved: boolean; back(): void; onHeight(h: number): void }) {
  const [up, setUp] = useState(false);
  const more = useRef<HTMLDivElement>(null), card = useRef<HTMLElement>(null);
  const [moreH, setMoreH] = useState(0);
  const [cardH, setCardH] = useState(0);
  useEffect(() => { setUp(false); }, [s?.at]);
  useEffect(() => {
    if (typeof ResizeObserver !== 'function') return;
    const size = (e: ResizeObserverEntry) => { const b = e.borderBoxSize?.[0]; return b ? b.blockSize : e.contentRect.height; };
    const ro = new ResizeObserver((es) => { for (const e of es) { if (e.target === more.current) setMoreH(size(e)); else setCardH(size(e)); } });
    if (more.current) ro.observe(more.current);
    if (card.current) ro.observe(card.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { onHeight(Math.max(0, cardH - moreH)); }, [cardH, moreH, onHeight]);
  const hide = up ? 0 : moreH;
  const startY = useRef<number | null>(null);
  const m = s ? cv.moments[s.at] : null;
  const n = s?.stop.look.length ?? 0;
  return (
    <section ref={card} className="cs-card cs-sheet cs-phone stage-blocker" data-on={on} data-up={up || undefined} data-tone={s?.tone || undefined} aria-hidden={!on} inert={!on}
      style={{ ['--cs-hide' as string]: `${Math.round(hide)}px` }}
      onPointerDown={(e) => { startY.current = e.clientY; }}
      onPointerUp={(e) => { const y0 = startY.current; startY.current = null; if (y0 == null) return; const dy = e.clientY - y0; if (dy < -24) setUp(true); else if (dy > 24) setUp(false); }}>
      <button type="button" className="cs-grab" aria-label={up ? CASE.pullDown : CASE.pullUp(n)} aria-expanded={up} onClick={() => setUp(!up)}><i /></button>
      {s && <>
        <span className="cs-kick">{s.kicker}</span>
        <h2 className="cs-title">{s.stop.title}</h2>
        <div className="cs-words">{m && m.type !== 'quiet' && m.type !== 'trimmed' ? <MomentWords m={m} v={cv.v} say={s.stop.say} /> : null}</div>
        <Go s={s} short />
        {n > 0 ? <button type="button" className="cs-pull" onClick={() => setUp(!up)}><Icon n={up ? 'chev-down' : 'camera'} /><span>{up ? CASE.pullDown : CASE.pullUp(n)}</span></button>
          : <ShotLine s={s} moved={moved} back={back} />}
      </>}
      <div ref={more} className="cs-more" data-up={up || undefined}>
        {s && n > 0 && <><Look items={s.stop.look} /><ShotLine s={s} moved={moved} back={back} /></>}
      </div>
    </section>
  );
}

/** The card on the way and the smaller events passing under it (the newest at the foot, the one before it fainter, the one before that gone). */
export function TravelCard({ cv, on, sheet, phone }: { cv: CaseView; on: boolean; sheet: boolean; phone: boolean }) {
  const { stops, at, to, day } = useCase();
  const from = stops[at]?.day ?? 0;
  const t = to != null ? travelWords(stops, to, day, cv.v.chapters) : null;
  const notes = passedNotes(cv.notes, from, day, 3);
  const newest: PassNote | undefined = notes[notes.length - 1];
  return (
    <>
      <section className={`cs-card cs-travel${sheet ? ' cs-sheet' : ''} stage-blocker`} data-on={on && !!t} aria-hidden={!on} inert={!on} aria-live="polite">
        {t && <>
          <span className="cs-kick">{t.kicker}</span>
          {phone ? <h2 className="cs-title cs-small">{t.line}</h2> : <><h2 className="cs-title cs-small">{t.head}</h2><p className="cs-sub">{t.sub}</p></>}
          {sheet && <p className="cs-sub cs-note1" key={newest ? newest.day : 'none'}>{newest ? <><b>{`Day ${newest.day}`}</b>{` ${newest.title}`}</> : phone ? t.sub : ''}</p>}
        </>}
      </section>
      {/* (on a sheet, an iPad's or an iPhone's, the newest of them is a line in the card itself: the sheet is at the foot, far from where a note would pass) */}
      {!sheet && (
        <div className="cs-passing" data-on={on} aria-hidden="true">
          {notes.map((x, i) => <div key={`${x.day}:${x.title}`} className="cs-pass" data-age={notes.length - 1 - i}><b>{`Day ${x.day}`}</b>{x.title}</div>)}
        </div>
      )}
    </>
  );
}

export function useStopMoved(s: StopShown | null, on: boolean): [boolean, () => void] {
  const ready = useShell((x) => x.ready);
  const shot = s ? shotNow(s.stop, ready) : null;
  const [moved, reset] = useFigureMoved(s ? `${s.at}` : '', shot?.view ?? null, on);
  return [moved, () => { if (s) showShot(s.stop.shot); reset(); }];
}
