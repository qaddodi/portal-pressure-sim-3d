// The details of a structure, inside its own card (2D card-details.js createCardDetails, class for class: .ac-details, .ad-head, .ad-back, .ad-kicker, .ad-scroll, .ad-between, .ad-stats, .ad-stat, .ad-v,
// .ad-why, .ad-about; the 2D stylesheets style it). A tap on the card's name slides the card's face away and this view in, in the same box; Back slides the face home (ActionCard.tsx). What it keeps is what the
// card does not say: which two stations the bar's pressures belong to, the vessel's resistance and its healthy flow (or how far a collateral has opened), the organ's own numbers the card leaves out,
// why the value is what it is (the Why? explainer), and what the structure is, in words. The words and the numbers are the 2D app's (card-details.copied.ts, scripts/copy-card-details.mjs).
import { forwardRef, useEffect, useMemo, useState } from 'react';
import { I } from '../shell/icons.tsx';
import type { Card } from './cards.ts';
import { detailsPlan, DETAILS_WORDS } from './card-details.copied.ts';
import { useParamsTick } from './params.ts';
import { latest, useEngine } from '../../engine/store.ts';

export interface DetailsPlan { kicker: string; between: string | null; stats: [string, (f: unknown, c: unknown) => string | null][]; about: string | null; why: string | null }
/** What a card's details say, or null for a card with none (a lobule part's). */
export const planOf = (card: Card): DetailsPlan | null => (card.noDetails ? null : (detailsPlan(card) as DetailsPlan | null));

/** The numbers of the details, from the model frame (2D update(f)): re-read when the engine's headline numbers move or the patient's settings change. */
function useTexts(plan: DetailsPlan): string[] {
  const read = () => { const f = latest.frame; return plan.stats.map(([, fn]) => (f ? fn(f, null) : null) ?? '—'); };
  const [t, setT] = useState(read);
  useEffect(() => {
    const run = () => setT((prev) => { const n = read(); return n.length === prev.length && n.every((x, i) => x === prev[i]) ? prev : n; });
    run();
    const off = [useEngine.subscribe(run), useParamsTick.subscribe(run)];
    return () => off.forEach((f) => f());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);
  return t;
}

export const Details = forwardRef<HTMLElement, { card: Card; onBack(): void; onWhy(metric: string): void }>(function Details({ card, onBack, onWhy }, ref) {
  const plan = useMemo(() => planOf(card), [card]);
  if (!plan) return null;
  return <DetailsView ref={ref} card={card} plan={plan} onBack={onBack} onWhy={onWhy} />;
});

const DetailsView = forwardRef<HTMLElement, { card: Card; plan: DetailsPlan; onBack(): void; onWhy(metric: string): void }>(function DetailsView({ card, plan, onBack, onWhy }, ref) {
  const texts = useTexts(plan), title = card.title;
  return (
    <section ref={ref} className="ac-details" role="region" aria-label={DETAILS_WORDS.region(title)}>
      <div className="ad-head">
        <button className="ad-back" type="button" aria-label={DETAILS_WORDS.back(title)} onClick={onBack}><I n="chev-left" /><span>{title}</span></button>
        <span className="ad-kicker">{plan.kicker}</span>
      </div>
      <div className="ad-scroll">
        {plan.between && <p className="ad-between"><em>{DETAILS_WORDS.between}</em>{plan.between}</p>}
        {plan.stats.length > 0 && (
          <div className="ad-stats">
            {plan.stats.map(([k], i) => <div className="ad-stat" key={k}><em>{k}</em><b className="ad-v">{texts[i]}</b></div>)}
          </div>
        )}
        {plan.why && <button className="ad-why" type="button" onClick={() => onWhy(plan.why!)}><I n="bulb" /><span>{DETAILS_WORDS.why}</span></button>}
        {plan.about && <p className="ad-about">{plan.about}</p>}
      </div>
    </section>
  );
});
