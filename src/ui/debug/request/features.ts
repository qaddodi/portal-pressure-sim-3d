// The feature table: what "audit the junctions" means, written once. A feature names the talks and slides that show it, the lenses it matters in, the source folders that own it and the repo's
// own node tests that hold it (globs under tests/, `*` only). `feature:junctions` is the same set of things every time, in every runner. A new feature is a new row here and nothing else;
// tests/audit-request.test.ts checks that every deck, lens, folder and test glob a row names exists.
// A slide is `deck:n` counted from 1 (the title is 0 and is never a slide), a bare id is every slide of that talk.
// Name the slides that show the feature, not whole talks: the stress capture takes at most 40.

import type { CheckId } from './grammar.ts';

export interface Feature {
  id: string;
  /** the checks its tests serve: the tests run when one of them is asked for, and a failing test is a finding of the first of them that was asked for */
  checks: readonly CheckId[];
  /** one line for the picker and the report */
  words: string;
  slides: readonly string[];
  lenses: readonly string[];
  sources: readonly string[];
  tests: readonly string[];
}

export const FEATURES: readonly Feature[] = Object.freeze([
  {
    id: 'junctions', checks: ['junctions', 'layout'], words: 'Where veins join: the engine\'s junction table, the pieces and skins drawn from it, the outline at each seam',
    // (the slides the review of 27 Nov found a shown value crossing 10 or 12 mmHg on, and the others that show a join; the review counted from the deck's own list, a slide here counts from 1)
    slides: [
      'shunts:2', 'shunts:7', 'shunts:8', 'tips-complete:17', 'tips-complete:21', 'tips-complete:22', 'tips-complete:23',
      'tips-doppler:2', 'tips-doppler:3', 'tips-doppler:4', 'tips-doppler:5', 'tips-doppler:6', 'tips-doppler:11',
      'same-gradient:4', 'same-gradient:7', 'variceal-bleed:4', 'circuit:4',
    ],
    lenses: ['pressure', 'flow'],
    sources: ['src/scene/vessels', 'src/scene/anatomy', 'src/engine/hales/portal/topology.js'],
    tests: [
      'tests/junction-*.test.ts', 'tests/skin-*.test.ts', 'tests/*-junction*.test.ts', 'tests/placed-*.test.ts',
      'tests/lpv-taper.test.ts', 'tests/shunt-*.test.ts', 'tests/hv-*.test.ts', 'tests/course-bend.test.ts', 'tests/b3-quiet-wall.test.ts',
      'tests/scene-vessels.test.ts', 'tests/boot-entry.test.ts',
    ],
  },
  {
    id: 'tips', checks: ['numbers', 'junctions'], words: 'TIPS and the shunts: the stent, its numbers, its drawing, the procedure cards',
    slides: ['tips-complete:12', 'tips-complete:17', 'tips-doppler:6', 'shunts:11', 'tips-candidacy:3'],
    lenses: ['pressure', 'flow', 'direction'],
    sources: ['src/scene/devices', 'src/engine/hales/portal/stent-geom.js'],
    tests: ['tests/b5-stent.test.ts', 'tests/b9-stent.test.ts', 'tests/stent-*.test.ts', 'tests/tips-*.test.ts', 'tests/shunt-*.test.ts', 'tests/doppler-*.test.ts'],
  },
  {
    id: 'bleed', checks: ['motion', 'junctions'], words: 'The variceal bleed: the rupture drawn on the vessel, the jet, the stop',
    slides: ['variceal-bleed:2', 'variceal-bleed:13', 'varices:1', 'endoscopy:3'],
    lenses: ['pressure'],
    sources: ['src/scene/disease', 'src/scene/blood'],
    tests: ['tests/bleed-*.test.ts', 'tests/b3-varices.test.ts', 'tests/tamponade-*.test.ts', 'tests/balloon-*.test.ts'],
  },
  {
    id: 'ascites', checks: ['numbers', 'motion'], words: 'The belly filling and clearing: the hull, the gauge, the numbers behind them',
    slides: ['ascites:5', 'ascites:6', 'ascites:7'],
    lenses: [],
    sources: ['src/scene/disease'],
    tests: ['tests/ascites-*.test.ts', 'tests/abdomen-*.test.ts', 'tests/paracentesis-*.test.ts'],
  },
  {
    id: 'cards', checks: ['layout'], words: 'Cards and their room: where each card stands on each screen, nothing clipped, nothing over anything',
    slides: [],
    lenses: [],
    sources: ['src/ui/layout', 'src/ui/cards', 'src/ui/talk'],
    tests: [
      'tests/card-*.test.ts', 'tests/deck-card-*.test.ts', 'tests/audit-card-layout.test.ts', 'tests/layout-boxes.test.ts',
      'tests/ui-layout.test.ts', 'tests/landscape-phone-plan.test.ts', 'tests/pair-*.test.ts', 'tests/phone-*.test.ts', 'tests/sheet-*.test.ts',
      'tests/data-card-*.test.ts', 'tests/path-card-fit.test.ts', 'tests/words-room-iphone.test.ts',
    ],
  },
  {
    id: 'labels', checks: ['layout'], words: 'Labels and callouts: names beside the vessel, leaders, keeping clear of cards and of each other',
    slides: ['hyperdynamic:5', 'circulation:1', 'circuit:4'],
    lenses: [],
    sources: ['src/scene/labels'],
    tests: ['tests/labels-*.test.ts', 'tests/label-*.test.ts', 'tests/callout*.test.ts'],
  },
  {
    id: 'circuit', checks: ['junctions', 'numbers'], words: 'The pressure circuit: the strip figure, its skins and joins, its numbers',
    slides: ['circuit:3', 'circuit:4', 'circuit:5'],
    lenses: ['pressure'],
    sources: ['src/scene/circuit'],
    tests: ['tests/circuit-*.test.ts', 'tests/b7-circuit.test.ts'],
  },
  {
    id: 'lobule', checks: ['layout', 'motion'], words: 'The lobule and sinusoid close-ups',
    slides: ['lobule:3', 'lobule:4', 'lobule:5'],
    lenses: [],
    sources: ['src/scene/lobule', 'src/scene/micro3d'],
    tests: ['tests/lobule-*.test.ts', 'tests/micro*.test.ts', 'tests/sinusoid-*.test.ts', 'tests/scene-lobule-*.test.ts', 'tests/scene-sinusoid-*.test.ts'],
  },
  {
    id: 'boot', checks: ['perf'], words: 'What the app weighs and does at start: the boot budgets',
    slides: [],
    lenses: [],
    sources: ['src/boot', 'scripts/boot-budget.json'],
    tests: ['tests/boot-*.test.ts'],
  },
  {
    id: 'a11y', checks: ['a11y'], words: 'Accessibility: contrast, focus, announcements, targets',
    slides: [],
    lenses: [],
    sources: ['src/ui/a11y'],
    tests: ['tests/a11y*.test.ts', 'tests/focus-*.test.ts', 'tests/dark-contrast.test.ts', 'tests/site-ink-contrast.test.ts', 'tests/colour-tokens.test.ts'],
  },
  {
    id: 'numbers', checks: ['numbers'], words: 'The engine\'s numbers on every slide against the recorded baseline',
    slides: [],
    lenses: [],
    sources: ['src/engine', 'tests/fixtures'],
    tests: ['tests/engine-*.test.ts', 'tests/decks-*numbers.test.ts', 'tests/decks-ag.test.ts', 'tests/advanced.test.ts', 'tests/tiles-2d.test.ts', 'tests/numbers-shown.test.ts'],
  },
]);

export const featureOf = (id: string): Feature | undefined => FEATURES.find((f) => f.id === id);
export const featureIds = (): string[] => FEATURES.map((f) => f.id);

/** The test files under `tests/` (just names, `x.test.ts`) that a feature's globs name, sorted. A glob has `*` only; a plain name matches itself. Pure: the caller lists the directory. */
export function testsOfFeature(f: Feature, all: readonly string[]): string[] {
  const res = f.tests.map((g) => new RegExp(`^${g.replace(/^tests\//, '').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`));
  return all.filter((t) => res.some((re) => re.test(t))).sort();
}
