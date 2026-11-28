// A request, made concrete: which talks and slides, cases, lenses, looks, sizes and features it names, which checks the runner can do and which it cannot. Pure: what exists (the talks and their
// slide counts, the cases, lenses, looks, sizes) is handed in as a `World`, so this runs the same in node, in the page and in a test.
// The rules:
//   - `app` is everything; an `app` part narrows nothing.
//   - deck:, slide:, random: and a feature's slides add slides. With none of those (and no feature), the slides are every slide of every talk.
//   - layout: parts name the sizes; with none, the three the stress capture uses.
//   - random:n@seed draws n slides from every slide of every talk with the capture's seeded generator (capture-pick.ts), so a seed gives the same slides in every runner, today and next month. `/deck`
//     takes one slide at a time from each talk in a seeded order, round after round, so it spreads over as many talks as it can.
import { randomPick, seeded, slideKeys, stopKey, type PickDeck } from '../audit/capture-pick.ts';
import { CHECKS, RUNNER_CHECKS, RUNNER_WORDS, formatRequest, type CheckId, type Request, type RunnerId } from './grammar.ts';
import { FEATURES, featureOf } from './features.ts';

export interface World {
  decks: readonly { id: string; slides: number }[];
  cases: readonly string[];
  lenses: readonly string[];
  looks: readonly string[];
  sizes: readonly string[];
}
export const DEFAULT_SIZES: readonly string[] = ['iphone', 'ipad-portrait', 'mac'];

export interface Scope {
  /** the request as one canonical line */
  line: string;
  runner: RunnerId;
  /** the checks that will run, in the table's order */
  checks: CheckId[];
  /** the checks asked for (or defaulted) that this runner cannot do, and why: the README says they were not judged */
  skipped: { check: CheckId; why: string }[];
  /** the request named its checks (`checks=`); left out, the checks are the defaults */
  explicit: boolean;
  /** nothing narrowed: the whole app */
  all: boolean;
  /** the request named slides, a talk, a feature or a random draw, so a tool that has its own default set of slides (the stress capture's key slides) uses these instead */
  named: boolean;
  /** the talks touched, in the registered order */
  decks: string[];
  /** `deck:n` keys, in talk order */
  slides: string[];
  cases: string[];
  lenses: string[];
  looks: string[];
  sizes: string[];
  /** the request had `layout:` parts, so `sizes` are the ones asked for (else they are the default three) */
  sized: boolean;
  features: string[];
  random: { n: number; seed: number; spread: boolean; picked: string[] } | null;
}
export type Resolved = { ok: true; scope: Scope } | { ok: false; error: string };

const WHY: Partial<Record<CheckId, Partial<Record<RunnerId, string>>>> = {
  pictures: { node: 'the node runner takes no pictures; use runner=gpu on a device' },
  types: { layout: 'the typecheck is a node check', gpu: 'the typecheck is a node check' },
  lint: { layout: 'the lint is a node check', gpu: 'the lint is a node check' },
};
const whyNot = (c: CheckId, r: RunnerId): string => WHY[c]?.[r] ?? `the ${r} runner does not do this check (it does ${RUNNER_CHECKS[r].join(', ')})`;

/** `n` slides spread over the talks: the talks in a seeded order, one seeded slide from each in turn, round after round (the same seed, the same slides). In talk order. */
export function randomSpread(decks: readonly PickDeck[], n: number, seed: number): string[] {
  const rnd = seeded(seed);
  const order = decks.filter((d) => d.slides.length).map((d, i) => ({ d, i }));
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
  const left = new Map(order.map(({ d }) => [d.id, d.slides.map((_, k) => stopKey(d.id, k + 1))]));
  const take = new Set<string>();
  const total = [...left.values()].reduce((a, v) => a + v.length, 0), want = Math.min(n, total);
  while (take.size < want) {
    for (const { d } of order) {
      const pool = left.get(d.id)!;
      if (!pool.length || take.size >= want) continue;
      take.add(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
    }
  }
  return slideKeys(decks).filter((k) => take.has(k));
}

const list = (xs: readonly string[]) => xs.join(', ');

export function resolveRequest(req: Request, world: World): Resolved {
  const decks = world.decks, byId = new Map(decks.map((d) => [d.id, d]));
  const pd: PickDeck[] = decks.map((d) => ({ id: d.id, title: d.id, slides: Array.from({ length: d.slides }, () => ({ title: '' })) }));
  const slides = new Set<string>(), cases = new Set<string>(), lenses = new Set<string>(), looks = new Set<string>(), sizes = new Set<string>(), features = new Set<string>();
  let random: Scope['random'] = null, all = false;
  const addDeck = (id: string): string | null => {
    const d = byId.get(id);
    if (!d) return `no talk "${id}" (the talks are ${list(decks.map((x) => x.id))})`;
    for (let k = 1; k <= d.slides; k++) slides.add(stopKey(id, k));
    return null;
  };
  for (const p of req.what) {
    let err: string | null = null;
    switch (p.kind) {
      case 'app': all = true; break;
      case 'deck': err = addDeck(p.id); break;
      case 'slide': {
        const d = byId.get(p.deck);
        if (!d) err = `no talk "${p.deck}" (the talks are ${list(decks.map((x) => x.id))})`;
        else if (p.n < 1 || p.n > d.slides) err = `${p.deck} has slides 1 to ${d.slides}, not ${p.n}`;
        else slides.add(stopKey(p.deck, p.n));
        break;
      }
      case 'case': if (!world.cases.includes(p.id)) err = `no case "${p.id}" (the cases are ${list(world.cases)})`; else cases.add(p.id); break;
      case 'lens': if (!world.lenses.includes(p.id)) err = `no lens "${p.id}" (the lenses are ${list(world.lenses)})`; else lenses.add(p.id); break;
      case 'look': if (!world.looks.includes(p.id)) err = `no look "${p.id}" (the looks are ${list(world.looks)})`; else looks.add(p.id); break;
      case 'layout': if (!world.sizes.includes(p.size)) err = `no size "${p.size}" (the sizes are ${list(world.sizes)})`; else sizes.add(p.size); break;
      case 'feature': {
        const f = featureOf(p.id);
        if (!f) { err = `no feature "${p.id}" (the features are ${list(FEATURES.map((x) => x.id))})`; break; }
        features.add(f.id);
        for (const s of f.slides) {
          if (s.includes(':')) slides.add(s); else { err = addDeck(s); if (err) break; }
        }
        for (const l of f.lenses) lenses.add(l);
        break;
      }
      case 'random': {
        if (random) { err = 'one random part per request'; break; }
        const total = decks.reduce((a, d) => a + d.slides, 0);
        const picked = p.spread ? randomSpread(pd, p.n, p.seed) : randomPick(pd, p.n, p.seed);
        if (p.n > total) { err = `random:${p.n} asks for more slides than the app has (${total})`; break; }
        for (const k of picked) slides.add(k);
        random = { n: p.n, seed: p.seed, spread: p.spread, picked };
        break;
      }
    }
    if (err) return { ok: false, error: err };
  }
  const named = slides.size > 0;
  // nothing that names slides, cases or a feature: the whole talk list
  if (!slides.size && !cases.size && !features.size) for (const d of decks) addDeck(d.id);
  const order = slideKeys(pd), keep = new Set(slides);
  const wanted = req.checks ?? [...CHECKS];
  const can = RUNNER_CHECKS[req.runner];
  const checks = CHECKS.filter((c) => wanted.includes(c) && can.includes(c));
  // (a check left out because it was never asked for is not "skipped": only an asked-for one the runner cannot do, and the default asks for none it cannot)
  const skipped = req.checks ? CHECKS.filter((c) => req.checks!.includes(c) && !can.includes(c)).map((c) => ({ check: c, why: whyNot(c, req.runner) })) : [];
  if (!checks.length) return { ok: false, error: `no check left to run: ${skipped.map((s) => `${s.check} (${s.why})`).join('; ')}. ${RUNNER_WORDS[req.runner]}` };
  return {
    ok: true,
    scope: {
      line: formatRequest(req), runner: req.runner, checks, skipped, explicit: !!req.checks, all, named,
      decks: decks.map((d) => d.id).filter((id) => order.some((k) => k.startsWith(`${id}:`) && keep.has(k))),
      slides: order.filter((k) => keep.has(k)),
      cases: world.cases.filter((c) => cases.has(c)),
      lenses: world.lenses.filter((l) => lenses.has(l)),
      looks: world.looks.filter((l) => looks.has(l)),
      sized: sizes.size > 0,
      sizes: world.sizes.filter((s) => sizes.has(s)).length ? world.sizes.filter((s) => sizes.has(s)) : [...DEFAULT_SIZES],
      features: FEATURES.map((f) => f.id).filter((id) => features.has(id)),
      random,
    },
  };
}
