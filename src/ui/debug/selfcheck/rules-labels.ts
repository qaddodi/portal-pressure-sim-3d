// Labels stay clear and whole (the 2D app's label rules, read from the labels and cards parts).
import { registerRule } from '../core/rules.copied.js';
import { area, overlap, inside, isUp, pct, type Box } from './helpers.ts';

type L = { name: string; kind: string; alpha: number; box: Box };
const settled = (l: L) => l.alpha >= 0.5 && l.kind !== 'key';
const labelsOf = (r: Record<string, any>): L[] => (r.labels?.shown ?? []).filter(settled);
const nm = (l: L) => `${l.kind === 'callout' ? 'Callout' : 'Label'} "${l.name}"`;
/** The share of a label that stands over an area. */
const covered = (l: L, b: Box) => (area(l.box) ? overlap(l.box, b) / area(l.box) : 0);

registerRule({ id: 'label-under-card', family: 'label', owner: 'src/scene/labels/solver.ts', why: 'Labels stay clear of every open card (owner, 17 Nov 2026): a card never hides a name',
  check: (r: Record<string, any>) => {
    const cards = (r.cards?.cards ?? []).filter(isUp);
    const out: { what: string; where: string }[] = [];
    for (const l of labelsOf(r)) for (const c of cards) { const s = covered(l, c.box); if (s > 0.1) out.push({ what: nm(l), where: `under the ${c.id} card, ${pct(s)} covered` }); }
    return out;
  } });

registerRule({ id: 'label-off-screen', family: 'label', owner: 'src/scene/labels/solver.ts', why: 'A label is whole on the stage: none stands past its edge',
  check: (r: Record<string, any>) => {
    const p = r.page;
    return p?.vw ? labelsOf(r).filter((l) => !inside(l.box, p.vw, p.vh, 1)).map((l) => ({ what: nm(l), where: `at [${l.box.join(', ')}] on a ${p.vw}×${p.vh} screen` })) : [];
  } });

registerRule({ id: 'label-overlap', family: 'label', owner: 'src/scene/labels/solver.ts', why: 'Two labels never lie over each other: the solver keeps a ring of spots so each can be read',
  check: (r: Record<string, any>) => {
    const ls = labelsOf(r), out: { what: string; where: string }[] = [];
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
      const a = ls[i]!, b = ls[j]!, s = overlap(a.box, b.box) / Math.max(1, Math.min(area(a.box), area(b.box)));
      if (s > 0.15) out.push({ what: `${nm(a)} and ${nm(b)}`, where: `overlap by ${pct(s)} of the smaller` });
    }
    return out;
  } });
