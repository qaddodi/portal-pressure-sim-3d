// The chart of a slide's data card: the 2D slide's `tool: { kind, … }` (criteria, path, profile, curve, course, fluid, stent, lumen, flows, plane, trial, forest, saag, trace, shift,
// evgraph, stiffness) or its `visual` (plane, ladders, allpatients) mounted as the chart Card that draws it, from the slide's own state in the talk (the 2D `ctx`: its fingerprint,
// parameters, the healthy patient, the slides before it). The card is the one the chart batch built (src/ui/charts/*/…Card.tsx): this file only gives it its inputs.
// An instrument that reads the live model (the Tests devices: Doppler, HVPG monitor, FibroScan, abdomen, readouts) is mounted in the Tests pane's own components.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Deck, Slide } from '../../decks/schema.ts';
import { CHART_VISUALS } from '../../decks/charts.ts';
import { copiedOf } from '../../decks/hp/deck.ts';
import { useStates } from '../../decks/hp/calc.ts';
import { changes } from '../../decks/hp/numbers.ts';
import type { CopiedSlide } from '../../decks/hp/types.ts';
import { latest, patient, useEngine } from '../../engine/index.ts';
import { healthyFp, beforeOf } from '../charts/profile/data.ts';
import { CriteriaCard } from '../charts/criteria/CriteriaCard.tsx';
import { PathCard } from '../charts/path/PathCard.tsx';
import { ProfileCard } from '../charts/profile/ProfileCard.tsx';
import { MenuCard } from '../charts/menu/MenuCard.tsx';
import { CurveCard } from '../charts/curve/CurveCard.tsx';
import { FluidCard } from '../charts/fluid/FluidCard.tsx';
import { StentCard } from '../charts/stent/StentCard.tsx';
import { LumenCard } from '../charts/lumen/LumenCard.tsx';
import { FlowsCard } from '../charts/flows/FlowsCard.tsx';
import { PlaneCard } from '../charts/plane/PlaneCard.tsx';
import { loadPoints, trailStops } from '../charts/plane/data.ts';
import { TrialCard } from '../charts/trial/TrialCard.tsx';
import { ForestCard } from '../charts/forest/ForestCard.tsx';
import { TraceCard } from '../charts/trace/TraceCard.tsx';
import { chainFor, traceProps } from '../charts/trace/data.ts';
import { ShiftCard } from '../charts/shift/ShiftCard.tsx';
import { shiftData, stateOfStep, shiftTrail } from '../charts/shift/data.ts';
import { LaddersCard } from '../charts/ladder/LaddersCard.tsx';
import { AllPatientsCard } from '../charts/small/AllPatientsCard.tsx';
import { WallsCard } from '../charts/walls/WallsCard.tsx';
import { ghostOf } from './ghost.ts';
import { useProbes } from '../../scene/devices/probes/state.ts';
import { StiffCard } from '../charts/stiff/StiffCard.tsx';
import { VitalsCard } from '../charts/vitals/VitalsCard.tsx';
import { engine } from '../../engine/index.ts';
import { FlowTimeCard } from '../charts/flowtime/FlowTimeCard.tsx';
import { SaagCard } from '../charts/saag/SaagCard.tsx';
import { EvGraphCard } from '../charts/evgraph/EvGraphCard.tsx';
import { eventGraphOf } from '../charts/evgraph/model.ts';
import { evBounds } from '../charts/evgraph/data.ts';
import { fitTrial, metricsOfFp, trialOf } from '../charts/trial/model.ts';
import { useLapse } from '../../decks/hp/lapse.ts';
import { useScope } from '../tests/endo/scope-state.ts';
import { lazy, Suspense } from 'react';
import { useUi } from '../ui-store.ts';
import { ReadoutsPane } from '../tests/ReadoutsPane.tsx';
import { AbdomenPane } from '../tests/abdomen/AbdomenPane.tsx';
import { startFeed } from '../tests/feed.ts';
import { useTests } from '../tests/store.ts';
import { setDopplerProbe, useDopplerProbe } from '../tests/doppler/probe-state.ts';
import '../tests/tests.css';
import '../tests/abdomen/abdomen.css';
const DopplerPane = lazy(() => import('../tests/doppler/DopplerPane.tsx').then((m) => ({ default: m.DopplerPane })));
const FibroPane = lazy(() => import('../tests/fibro/FibroPane.tsx').then((m) => ({ default: m.FibroPane })));
const EndoPane = lazy(() => import('../tests/endo/EndoPane.tsx').then((m) => ({ default: m.EndoPane })));
const IrPane = lazy(() => import('../tests/ir/IrPane.tsx').then((m) => ({ default: m.IrPane })));

type Rec = Record<string, unknown>;
type Fp = Record<string, number | null | undefined>;

/** A trial's fit for the patient a slide stands on (its own state, or the state of the slide the tool names with `at`, and the case facts it gives). */
function fitFor(tool: Rec, fp: Fp | null, params: unknown, fpOf: (id: string) => Fp | null, results: ReturnType<typeof useStates.getState>['results'][string] | undefined, slides: CopiedSlide[]) {
  const t = trialOf(tool.id);
  const at = typeof tool.at === 'string' ? slides.findIndex((x) => x.id === tool.at) : -1;
  const st = at >= 0 ? results?.[at] : null, f = (st?.fp as Fp | undefined) ?? (at >= 0 ? fpOf(String(tool.at)) : null) ?? fp;
  if (!t || !f) return null;
  try { return (fitTrial(t as never, metricsOfFp(f as never), (st?.params ?? params) ?? null, (tool.facts as never) ?? null) as never) ?? null; } catch { return null; }
}

/** One slide's inputs: its own state, the healthy patient, and the deck's other states by slide id. */
function useEnv(deck: Deck, i: number) {
  const copied = copiedOf(deck.id)!;
  const results = useStates((s) => s.results[deck.id]);
  const [healthy, setHealthy] = useState<Fp | null>(null);
  useEffect(() => { let on = true; void healthyFp().then((h) => { if (on) setHealthy(h as Fp | null); }); return () => { on = false; }; }, []);
  const cs = copied.slides[i] as CopiedSlide;
  const st = results?.[i];
  const fpOf = (id: string): Fp | null => { const j = copied.slides.findIndex((x) => x.id === id); return (results?.[j]?.fp as Fp | undefined) ?? null; };
  return { copied, cs, st, fp: (st?.fp ?? null) as Fp | null, params: st?.params, healthy, results, fpOf };
}

export function ToolCard({ deck, slide }: { deck: Deck; slide: Slide }): ReactNode {
  const i = deck.slides.findIndex((s) => s.id === slide.id);
  if (i < 0 || !copiedOf(deck.id)) return null;
  return <Mounted deck={deck} slide={slide} i={i} />;
}

function Mounted({ deck, slide, i }: { deck: Deck; slide: Slide; i: number }): ReactNode {
  const env = useEnv(deck, i);
  const { copied, cs, fp, params, healthy, results, fpOf } = env;
  const tool = (cs.tool ?? {}) as Rec;
  const kind = slide.visual && (CHART_VISUALS as readonly string[]).includes(slide.visual) ? `visual:${slide.visual}` : String(tool.kind ?? '');
  useEngine((s) => s.frames);   // (the live model's charts follow its frames)
  const frame = latest.frame;
  const stateOf = useMemo(() => { let last = 0; return copied.slides.map((s, j) => (j === 0 || changes(s as CopiedSlide) ? (last = j) : last)); }, [copied]);
  const before = useMemo(() => beforeOf(tool.from as string | boolean | undefined, { slides: copied.slides, index: i, fp, fpOf }), [tool.from, copied, i, fp, results]);  // eslint-disable-line react-hooks/exhaustive-deps

  switch (kind) {
    case 'criteria': return <CriteriaCard tool={tool as never} fp={fp as never} />;
    case 'path': return <PathCard of={tool.of as string | undefined} patient={(tool.patient as Rec | undefined) ?? null} fp={fp as never} />;
    case 'profile': return <ProfileCard fp={fp as never} healthy={healthy as never} before={before as never} fromLabel={typeof tool.fromLabel === 'string' ? tool.fromLabel : 'Before'} spans={tool.spans as string[] | undefined} hold={!!cs.hold} />;
    case 'curve': case 'course': return <CurveCard tool={tool as never} slide={fp ? { fp: fp as never, params, base: results?.[i]?.base, snap: results?.[i]?.snap } : null} fpOf={fpOf as never} id={`${deck.id}/${slide.id}`} />;
    case 'menu': return <MenuCard rows={Array.isArray(tool.rows) ? (tool.rows as string[]) : null} slide={fp ? { fp: fp as never, params, base: results?.[i]?.base, snap: results?.[i]?.snap } : null} id={`${deck.id}/${slide.id}`} />;
    case 'fluid': return <FluidCard fp={fp as never} frame={frame as never} params={(params ?? patient.params) as never} window={!!tool.window} forces={!!tool.forces} caveat={!!tool.caveat} compare={(cs.compare as never) ?? null} />;
    case 'stent': return <StentCard vessel={tool.vessel as never} show={tool.show as never} lens={tool.lens as never} color={tool.color as never} colorSwitch={tool.colorSwitch !== false} pick={tool.pick as never} panels={tool.panels as never} to={tool.to as never} max={tool.max as number | undefined} gate={tool.gate as never} fp={fp as never} frame={frame as never} params={params ?? patient.params} />;
    case 'lumen': return <LumenCard params={(params ?? patient.params ?? null) as never} vessel={(tool.vessel as string | undefined) ?? 'PV_TRUNK'} site={(tool.site as string | undefined) ?? null} name={(tool.name as string | undefined) ?? null} />;
    case 'flows': return frame ? <FlowsCard of={tool.of === 'inflow' ? 'inflow' : 'portal'} input={{ Q: frame.Q, shunt: ((patient.params as { shunt?: number } | null)?.shunt ?? 0) as number, customShunts: ((patient.params as { customShunts?: Rec } | null)?.customShunts ?? null) as never }} /> : null;
    case 'plane': return <PlaneCard plane={tool.plane as never} ring={fp as never} stops={trailStops(tool.trail as never, fpOf as never) ?? undefined} />;
    case 'trial': return typeof tool.id === 'string' ? <TrialCard id={tool.id} fit={fitFor(tool, fp, params, fpOf, results, copied.slides as CopiedSlide[])} head /> : null;
    case 'flowtime': return <FlowTime deck={deck} slide={slide} i={i} tool={tool} trail={(results?.[i]?.trail as never) ?? null} />;
    case 'saag': return <SaagCard rows={((tool.of as unknown[] | undefined) ?? []).map((o) => { const x = (typeof o === 'string' ? { id: o } : o) as { id?: string; name?: string; title?: string }; return { id: x.id, name: x.name ?? x.title ?? deck.slides.find((s) => s.id === x.id)?.title ?? x.id ?? '', f: x.id ? (fpOf(x.id) as never) : null }; })} extra={(tool.extra as never) ?? []} own={(tool.own as string | undefined) ?? null} />;
    case 'evgraph': return <EvGraph cs={cs} fp={fp} before={results?.[i]?.before as { fp: Fp } | undefined} opened={i > 0 ? ((results?.[i - 1]?.fp as Fp | undefined) ?? null) : null} />;
    case 'vitals': return <VitalsCard tool={tool} fp={fp as never} />;
    case 'forest': return <ForestCard ids={(tool.ids as string[] | undefined) ?? []} />;
    case 'stiffness': return <StiffCard lsm={(fp?.lsm as number | null | undefined) ?? null} plt={(fp?.plt as number | null | undefined) ?? null} note />;
    case 'trace': return <TraceCard chain={chainFor(copied.slides as never, stateOf, (results ?? []).map((r) => r && { fp: r.fp as never, params: r.params }), i, tool as never)} {...traceProps(tool as never)} />;
    case 'shift': return <Shift deck={deck} i={i} lit={(cs.key as string[] | undefined) ?? undefined} live={fp as never} />;
    case 'visual:plane': return <PlaneVisual deck={deck} cs={cs} fpOf={fpOf} />;
    case 'visual:ladders': return <LaddersCard slide={cs as never} deck={copied as never} />;
    case 'visual:allpatients': return <AllPatientsCard slide={cs as never} deck={copied as never} />;
    case 'visual:walls': return <WallsCard />;
    case 'doppler': case 'fibroscan': case 'abdomen': case 'reading': case 'hvpg': case 'scope': case 'wall': {
      const ghost = ghostOf(cs as never, i, copied.slides as never, fpOf as never, stateOf);
      return <>{ghost ? <p className="pz-ghost"><span>{ghost.label}</span><b>{ghost.value}</b></p> : null}<Instrument kind={kind} tool={tool} /></>;
    }
    default: return null;
  }
}

/** A Tests-card instrument as a slide's data card: the pane of the Tests card, sized to the card's width. It reads the live model; the slide's vessel or organ is set when it comes up. */
function Instrument({ kind, tool }: { kind: string; tool: Rec }) {
  const w = useUi((s) => s.vp.w);
  useEffect(() => { startFeed(); }, []);
  useEffect(() => {
    if (kind === 'doppler' && typeof tool.vessel === 'string') { setDopplerProbe(tool.vessel); useDopplerProbe.getState().setGate((tool.gate as never) ?? null); }
    if (kind === 'wall') useScope.getState().setView('wall');
    if (kind === 'scope') useScope.getState().setView('scope');
    if (kind === 'fibroscan') useTests.getState().setFibro(tool.organ === 'spleen' ? 'spleen' : 'liver');
  }, [kind, tool]);
  // the instrument's own device on the figure while its card is up: the ultrasound probe on the slide's vessel (none on the EUS slide, probe: 'scope': the scope is the probe), the FibroScan probe on the organ
  const organ = tool.organ === 'spleen' ? 'spleen' : 'liver', scopeProbe = tool.probe === 'scope';
  useEffect(() => {
    const pr = useProbes.getState();
    if (kind === 'doppler') pr.setDoppler({ on: !scopeProbe });
    else if (kind === 'fibroscan') pr.setFibro({ on: true, organ });
    else if (kind === 'scope') pr.setEndoscope({ on: true });
    return () => { const q = useProbes.getState(); if (kind === 'doppler') q.setDoppler({ on: false }); else if (kind === 'fibroscan') q.setFibro({ on: false }); else if (kind === 'scope') q.setEndoscope({ on: false }); };
  }, [kind, organ, scopeProbe]);
  const plot = Math.round(Math.min(220, Math.max(150, w * 0.32)));
  const p = { narrow: w < 470, plot, square: plot, roomy: false };
  return (
    <div className="dock-pane-host" data-instrument={kind}>
      <Suspense fallback={null}>
        {kind === 'doppler' ? <DopplerPane {...p} options={tool} /> : kind === 'fibroscan' ? <FibroPane {...p} /> : kind === 'hvpg' ? <IrPane {...p} /> : kind === 'scope' || kind === 'wall' ? <EndoPane {...p} options={tool} /> : kind === 'abdomen' ? <AbdomenPane square={p.square} /> : <ReadoutsPane narrow={p.narrow} />}
      </Suspense>
    </div>
  );
}

/** Two readings over a time-lapse: the slide's days, drawn as they play (the heads follow the lapse's progress), whole once it is done or when it does not play. */
function FlowTime({ deck, slide, i, tool, trail }: { deck: Deck; slide: Slide; i: number; tool: Rec; trail: never }) {
  const mine = useLapse((s) => s.key === `${deck.id}/${slide.id}`), d = useLapse((s) => s.d), n = useLapse((s) => s.n);
  const k = slide.lapse?.plays && mine && n ? Math.min(1, d / n) : 1;
  void i;
  return <FlowTimeCard trail={trail} k={k} lines={(tool.lines as string[] | undefined) ?? undefined} clock={tool.clock === 'days' ? 'days' : 'meal'} given={(tool.given as Record<string, number> | undefined) ?? null} view={(tool.view as never) ?? null} rx={Array.isArray(tool.bands) ? (tool.bands as string[]) : undefined} />;
}

/** A procedure's graph: the two readings before the change and where the slide's settled state ends them. */
function EvGraph({ cs, fp, before, opened }: { cs: CopiedSlide; fp: Fp | null; before?: { fp: Fp }; opened: Fp | null }) {
  const spec = useMemo(() => eventGraphOf(cs as never), [cs]);
  const b = spec && fp ? evBounds(spec, opened as never, { fp: fp as never, before: before as never }) : null;
  return spec && b ? <EvGraphCard spec={spec} before={b.before} end={b.end} /> : null;
}

/** The change-from-healthy chart: one chart over the deck's states, a state's slot once its slide is reached. */
function Shift({ deck, i, lit, live }: { deck: Deck; i: number; lit?: string[]; live: Record<string, number | null | undefined> | null }) {
  const copied = copiedOf(deck.id)!;
  const results = useStates((s) => s.results[deck.id]);
  const data = useMemo(() => shiftData(copied.slides as never, (j) => (results?.[j] ? stateOfStep(results[j] as never) : null), null), [copied, results]);
  void shiftTrail;
  return <ShiftCard stages={data.stages} vals={data.vals} trails={data.trails} at={i} lit={lit} live={live as never} />;
}

/** A summary on the plane (visual: 'plane'): one named point for each patient the slide's `of` lists. */
function PlaneVisual({ deck, cs, fpOf }: { deck: Deck; cs: CopiedSlide; fpOf: (id: string) => Fp | null }) {
  const [points, setPoints] = useState<Awaited<ReturnType<typeof loadPoints>>>([]);
  const states = useStates((s) => s.results[deck.id]);
  useEffect(() => {
    let on = true;
    void loadPoints(cs.of as never, deck.slides as never, fpOf as never, engine() as never).then((p) => { if (on) setPoints(p); }, () => undefined);
    return () => { on = false; };
  }, [deck, cs, states]);  // eslint-disable-line react-hooks/exhaustive-deps
  return <PlaneCard plane={cs.plane as never} points={points} />;
}
