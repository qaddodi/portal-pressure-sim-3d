// Cards fit the screen and its edges (the 2D app's fit and edge rules, read from the cards part of the screen report). In the 3D app a card is web text: its words, its
// size and its place are measured in the page, so the rules judge those numbers, never a picture.
import { registerRule } from '../core/rules.copied.js';
import { typeFor } from '../../layout/device.ts';
import { WORDS_MIN_PX, TITLE_RATIO, PHONE_TITLE_RATIO, RATIO_TOLERANCE, BODY_SHRINK_TOLERANCE_PX, wording } from '../limits.ts';
import { isUp, inside, px } from './helpers.ts';

type Card = Record<string, any>;
const cardsOf = (r: Record<string, any>): Card[] => r.cards?.cards ?? [];
const place = (c: Card) => `card ${c.id} at [${c.box.join(', ')}]`;

registerRule({ id: 'fit-scroll', family: 'fit', owner: 'src/ui/cards/CardFrame.tsx', why: 'Nothing scrolls inside a card: no card is taller than the screen and its margin; a tall card splits into pages (owner, 18 Nov 20:33 ET)',
  check: (r: Record<string, any>) => cardsOf(r).filter((c) => c.scrollsY || (c.overflowFlag && c.scrollsY !== false)).map((c) => ({ what: `Card ${c.id} scrolls up and down`, where: place(c) })) });

registerRule({ id: 'fit-sideways', family: 'fit', owner: 'src/ui/cards/CardFrame.tsx', why: 'Nothing inside a card scrolls sideways: a phone swipe would open the next card (17 Nov)',
  check: (r: Record<string, any>) => cardsOf(r).filter((c) => c.scrollsX).map((c) => ({ what: `Card ${c.id} scrolls sideways`, where: place(c) })) });

registerRule({ id: 'fit-small', family: 'fit', owner: 'src/ui/DeckUi.tsx', why: `Card lettering is at least ${WORDS_MIN_PX} px (17 Nov, ffa2bfba)`,
  check: (r: Record<string, any>) => cardsOf(r).filter((c) => isUp(c) && c.small?.length).map((c) => ({ what: `Card ${c.id} has ${wording.small}`, where: c.small.map((s: any) => `"${s.text}" ${px(s.px)}`).join('; ') })) });

registerRule({ id: 'fit-ratio', family: 'fit', owner: 'src/ui/DeckUi.tsx', why: 'A slide title is at least 1.4 times the body (17 Nov, 0dcbf220), 1.33 on a phone where the words need the space (19 Nov)',
  check: (r: Record<string, any>) => {
    const phone = /phone|tablet/.test(r.page?.device ?? '');
    const need = (phone ? PHONE_TITLE_RATIO : TITLE_RATIO) - RATIO_TOLERANCE;
    return cardsOf(r).filter((c) => isUp(c) && c.id === 'teach' && c.title && c.body && c.title / c.body < need)
      .map((c) => ({ what: `Card ${c.id}: ${wording.ratio}`, where: `title ${px(c.title)}, words ${px(c.body)} (${Math.round((c.title / c.body) * 100) / 100} times)` }));
  } });

registerRule({ id: 'fit-shrink', family: 'fit', owner: 'src/ui/DeckUi.tsx', why: "The teaching card's body text never shrinks to fit (17 Nov, 2a8217e3): the figure and the top card yield instead",
  check: (r: Record<string, any>) => {
    const p = r.page;
    if (!p?.vw) return [];
    const want = typeFor(p.vw, p.vh).body;
    return cardsOf(r).filter((c) => isUp(c) && (c.id === 'teach' || c.id === 'case') && c.body && c.body < want - BODY_SHRINK_TOLERANCE_PX)
      .map((c) => ({ what: `Card ${c.id}'s words shrank to fit`, where: `${px(c.body)}, the role size is ${px(want)}` }));
  } });

registerRule({ id: 'fit-styled', family: 'fit', owner: 'src/ui/cards/CardFrame.tsx', why: 'A card is never shown before it is fully loaded and styled: no text before its fonts (17 Nov 22:01)',
  check: (r: Record<string, any>) => cardsOf(r).filter((c) => c.opacity > 0.05 && c.fontsLoaded === false).map((c) => ({ what: `Card ${c.id} is showing while the fonts are still loading`, where: place(c) })) });

registerRule({ id: 'fit-off', family: 'fit', owner: 'src/ui/layout/plan.ts', why: 'Cards must fit: a card standing in place is whole on the screen',
  check: (r: Record<string, any>) => {
    const p = r.page;
    return cardsOf(r).filter((c) => isUp(c) && p?.vw && !inside(c.box, p.vw, p.vh, 1)).map((c) => ({ what: `Card ${c.id} stands partly off the screen`, where: `${place(c)} on a ${p.vw}×${p.vh} screen` }));
  } });

registerRule({ id: 'edge-cutoff', family: 'edge', owner: 'src/ui/cards/CardFrame.tsx', why: "The last line of a card is never cut by the card's own edge (owner, 19 Nov: the words card was clipped on many slides and no check named it)",
  check: (r: Record<string, any>) => cardsOf(r).filter((c) => isUp(c) && c.textEdge && (c.textEdge[3] > c.box[3] + 1 || c.textEdge[2] > c.box[2] + 1)).map((c) => ({ what: `Card ${c.id}: a line runs past the card's edge`, where: `words end at ${c.textEdge[2]}, ${c.textEdge[3]}; the card ends at ${c.box[2]}, ${c.box[3]}` })) });

registerRule({ id: 'edge-off', family: 'edge', owner: 'src/ui/cards/CardFrame.tsx', why: 'Words never reach past the screen (19 Nov)',
  check: (r: Record<string, any>) => {
    const p = r.page;
    return cardsOf(r).filter((c) => isUp(c) && c.textEdge && p?.vw && !inside([c.textEdge[0], c.textEdge[1], c.textEdge[2], c.textEdge[3]], p.vw, p.vh, 1)).map((c) => ({ what: `Card ${c.id}: words stand off the screen`, where: `words span [${c.textEdge.join(', ')}] on a ${p.vw}×${p.vh} screen` }));
  } });
