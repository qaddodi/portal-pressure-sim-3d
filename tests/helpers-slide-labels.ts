// A label controller on the real camera and the real card plan for ANY slide of ANY deck, in node (no browser): what the figure writes on itself on that slide, on a phone and on a Mac, with the vessels'
// screen lines, so a test can judge the general rules (no two labels touch, none stands on a vessel, the unit is said alike across the figure). The words card and the data card stand at estimated heights
// (the plan needs real heights only in a browser), as tests/labels-slice.test.ts has them.
import { CameraRig } from '../src/scene/camera/rig.ts';
import { centredKind, planLayout, BAR, type Plan } from '../src/ui/layout/plan.ts';
import { stopsOf, viewAt, lastSlideShot } from '../src/ui/deck/presenter-machine.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';
import { NO_EXTRAS } from '../src/scene/labels/readings.ts';
import { labelsAt } from '../src/scene/labels/deck-link.ts';
import { labelUnit } from '../src/scene/labels/unit-rule.ts';
import { rectToBox, type Box } from '../src/scene/labels/geometry.ts';
import { figureCourses } from '../src/scene/labels/stations.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { UI } from '../src/ui/strings.generated.ts';
import { SHOTS } from '../src/scene/camera/shots.ts';
import type { Vector3 } from 'three';

export const SCREENS = {
  phone: { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  mac: { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
} as const;
export type ScreenName = keyof typeof SCREENS;

const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;

/** The unit of the reading a lens's labels give. */
export const lensUnit = (key: string | null): string => ({ velocity: 'cm/s', flow: 'L/min', oxygen: '% O₂' } as Record<string, string>)[key ?? ''] ?? 'mmHg';
export type DeckStops = ReturnType<typeof stopsOf>;
export const loadDecks = async (): Promise<[string, DeckStops][]> => Promise.all((UI.decks as readonly { id: string }[]).map(async (d) => [d.id, stopsOf((await loadBuiltin(d.id))!)] as [string, DeckStops]));

export interface SlideFigure {
  ctl: LabelController; plan: Plan; vp: (typeof SCREENS)[ScreenName]; view: Box;
  /** the vessels the figure draws, as screen segments */
  lines: [number, number, number, number][];
  /** the lens whose key the slide shows (null: none) */
  key: string | null;
  blockers: Box[]; named: Set<string>; shown: Set<string>; panel: boolean; body: boolean;
  settle(ms?: number): void;
}

/** The slide at `stop` of a deck, on a screen, with a pressure unit on every reading (as a slide's labels carry it). Null for a view that is not the body figure. */
export function slideFigure(deckId: string, stops: DeckStops, stop: number, screen: ScreenName, opts: { unit?: string; organNames?: boolean } = {}): SlideFigure | null {
  const vp = SCREENS[screen], s = stops[stop]!;
  const pos = { stop, beat: s.kind === 'slide' && (s.slide.vignette || s.slide.question) ? 1 : 0 };
  const v = viewAt(stops, pos, lastSlideShot(stops));
  if (s.kind === 'slide' && s.slide.scene && s.slide.scene.view !== 'body') return null;
  const needs = [{ id: v.words, slot: 'words' as const, h: v.words === 'title' ? 420 : 300 }, ...(v.data ? [{ id: v.data, slot: 'data' as const, h: 230 }] : [])];
  const plan: Plan = planLayout(vp, needs, 'words');
  const panel = plan.cards.length === 1 && !plan.strip && centredKind(plan.cards[0]!.id) === 'panel';
  const shot = typeof v.shot === 'string' ? SHOTS[v.shot as keyof typeof SHOTS] : v.shot;
  const rig = new CameraRig(shot as never, plan.free); rig.resize(vp.w, vp.h); rig.update(0);
  const lab = labelsAt(stops, pos, deckId);
  let t = 1000;
  const blockers = plan.cards.map((c) => rectToBox(c.rect)).concat(plan.strip ? [rectToBox(plan.strip.rect)] : []);
  const view: Box = { x0: vp.safe.left, y0: vp.safe.top + BAR, x1: vp.w - vp.safe.right, y1: vp.h - vp.safe.bottom };
  // the unit of the reading the lens gives (the figure's labels are pressures but on the velocity, flow and oxygen lenses), said as the readings say it: not where the slide's key already says it (unit-rule.ts)
  const unit = opts.unit ?? lensUnit(lab.key);
  const deps: LabelDeps = {
    now: () => t, project: (p: Vector3, o) => rig.project(p, o), cameraMoving: () => false, free: () => rectToBox(plan.free), view: () => view, vp: () => vp, reversed: () => false,
    words: () => plan.cards.find((c) => c.slot === 'words')?.rect ?? null, blockers: () => blockers, measure,
    pressure: (n) => 4 + ((n.length * 1.7) % 18), reading: () => null, cathere: () => 0, drawn: (v) => v.kind !== 'collateral' && v.kind !== 'shunt',
    extras: (_n, P) => ({ ...NO_EXTRAS, number: P == null ? null : P.toFixed(1), unit: labelUnit({ selected: false, presenting: true, key: lab.key, unit }) }),
  } as LabelDeps;
  const ctl = new LabelController(deps);
  ctl.setState({ ...NO_STATE, key: lab.key, named: lab.named, shown: lab.shown, cath: lab.cath, presenting: true, organNames: opts.organNames ?? true });
  const lines: [number, number, number, number][] = [];
  for (const c of figureCourses()) {
    if (c.v.kind === 'collateral' || c.v.kind === 'shunt') continue;
    let prev: { x: number; y: number } | null = null;
    for (const q of c.pts) { const a = rig.project(q, { x: 0, y: 0 }); if (prev && Number.isFinite(a.x) && Number.isFinite(prev.x)) lines.push([prev.x, prev.y, a.x, a.y]); prev = a; }
  }
  return { ctl, plan, vp, view, lines, key: lab.key, blockers, named: lab.named, shown: lab.shown, panel, body: true, settle: (ms = 1200) => { for (let i = 0; i < ms / 16; i++) { t += 16; ctl.tick(); } } };
}
