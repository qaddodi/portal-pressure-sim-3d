// The chart of a slide's data card: the 2D slide's `tool: { kind, … }` (criteria, path, profile, curve, course, fluid, stent, lumen, flows, plane, trial, forest, saag, trace, shift,
// evgraph, stiffness) or its `visual` (plane, ladders, allpatients) mounted as the chart Card that draws it, from the slide's own state in the talk (the 2D `ctx`: its fingerprint,
// parameters, the healthy patient, the slides before it). The card is the one the chart batch built (src/ui/charts/*/…Card.tsx): this file only gives it its inputs.
// An instrument that reads the live model (the Tests devices: Doppler, HVPG monitor, FibroScan, abdomen, readouts) is mounted in the Tests pane's own components.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Deck, Slide } from '../../decks/schema.ts';
import { CHART_VISUALS } from '../../decks/charts.ts';
import { copiedOf } from '../../decks/hp/deck.ts';
import { useStates } from '../../decks/hp/calc.ts';
import { changes } from '../../decks/hp/numbers.ts';
import type { CopiedSlide } from '../../decks/hp/types.ts';
import { latest, patient, useEngine } from '../../engine/index.ts';
import { mergeStates } from '../charts/baked/view.ts';
import { bakedHealthy } from '../charts/baked/store.ts';
import { healthyFp, beforeOf } from '../charts/profile/data.ts';
import { useShown } from './shown-state.ts';
import { flowStartOf } from './flow-start.ts';
import { CriteriaCard } from '../charts/criteria/CriteriaCard.tsx';
import { PathCard } from '../charts/path/PathCard.tsx';
import { ProfileCard } from '../charts/profile/ProfileCard.tsx';
import { catheterBlocked } from '../charts/profile/model.ts';
import { MenuCard } from '../charts/menu/MenuCard.tsx';
import { CurveCard, warmCurve } from '../charts/curve/CurveCard.tsx';
import { FluidCard } from '../charts/fluid/FluidCard.tsx';
import { StentCard } from '../charts/stent/StentCard.tsx';
import { LumenCard } from '../charts/lumen/LumenCard.tsx';
import { ghostThrombus } from '../charts/lumen/model.ts';
import { FlowsCard } from '../charts/flows/FlowsCard.tsx';
import { flowsInputOf } from '../charts/flows/parts.ts';
import { PlaneCard } from '../charts/plane/PlaneCard.tsx';
import { loadPoints, planeRows, pointsSync, trailStops } from '../charts/plane/data.ts';
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
import { claimSlide, holdSlideDevices } from './slide-claim.ts';
import { StiffCard } from '../charts/stiff/StiffCard.tsx';
import { ScoresCard } from '../charts/scores/ScoresCard.tsx';
import { VitalsCard } from '../charts/vitals/VitalsCard.tsx';
import { engine } from '../../engine/index.ts';
import { FlowTimeCard } from '../charts/flowtime/FlowTimeCard.tsx';
import { refsOf } from '../charts/flowtime/model.ts';
import type { FlowView } from '../charts/flowtime/model.ts';
import { SaagCard } from '../charts/saag/SaagCard.tsx';
import { EvGraphCard } from '../charts/evgraph/EvGraphCard.tsx';
import { evRunFor } from '../charts/evgraph/live.ts';
import { eventGraphOf } from '../charts/evgraph/model.ts';
import { evBounds } from '../charts/evgraph/data.ts';
import { fitTrial, metricsOfFp, trialOf } from '../charts/trial/model.ts';
import { useLapse } from '../../decks/hp/lapse.ts';
import { useScope } from '../tests/endo/scope-state.ts';
import { lazyRetry } from '../../boot/lazy-retry.ts';
import { LazyBoundary } from '../shell/LazyBoundary.tsx';
import { useUi } from '../ui-store.ts';
import { useToolRoomValue } from './tool-room.ts';
import { useRoomFit } from './room-fit.ts';
import { AbdomenPane } from '../tests/abdomen/AbdomenPane.tsx';
import { BeatCard } from '../tests/slide/BeatCard.tsx';
import { setSlidePin } from '../tests/slide/pin.ts';
import { startFeed } from '../tests/feed.ts';
import { useTests } from '../tests/store.ts';
import { setDopplerProbe, useDopplerProbe, type Gate } from '../tests/doppler/probe-state.ts';
import { planOf, type InstrumentKind } from './instruments.ts';
import { paneModule } from './pane-load.ts';
import { useToolPatch, withPatch } from './tool-options.ts';
import { HvpgTool } from './HvpgTool.tsx';
import { ReadingTool } from './ReadingTool.tsx';
import '../tests/tests.css';
import { clock } from '../../clock/frame.ts';
const DopplerPane = lazyRetry(() => paneModule('doppler').then((m) => ({ default: m.DopplerPane })));   // (the panes' loaders are pane-load.ts's: the card layer waits for the same fetch before it lets a card in)
const FibroPane = lazyRetry(() => paneModule('fibroscan').then((m) => ({ default: m.FibroPane })));
const EndoPane = lazyRetry(() => paneModule('endo').then((m) => ({ default: m.EndoPane })));

/** The kinds that draw the live model's frames. */
const FRAMED = new Set(['fluid', 'stent']);

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
  const live = useStates((s) => s.results[deck.id]);
  // (every state the second engine has not yet worked out is the baked one, so no chart waits on the worker for its readings: charts/baked/view.ts)
  const results = useMemo(() => mergeStates(deck.id, live) as typeof live, [deck.id, live]);
  const [healthy, setHealthy] = useState<Fp | null>(() => bakedHealthy() as Fp | null);
  useEffect(() => { let on = true; void healthyFp().then((h) => { if (on) setHealthy(h as Fp | null); }); return () => { on = false; }; }, []);
  const cs = copied.slides[i] as CopiedSlide;
  // the patient a compare button has put the model in, if one is pressed: every chart of the slide reads it, as the words, the tiles and the figure do (shown-state.ts)
  const st = useShown(deck.id, results)?.[i];
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
  const room = useToolRoomValue() || undefined;   // (the room the data card leaves this picture, 2D --pz-room: the path card and the plane keep inside it)
  const { copied, cs, st, fp, params, healthy, results, fpOf } = env;
  const tool = (cs.tool ?? {}) as Rec;
  const kind = slide.visual && (CHART_VISUALS as readonly string[]).includes(slide.visual) ? `visual:${slide.visual}` : String(tool.kind ?? '');
  const forward = useRef(useUi.getState().dir > 0).current;   // (stepped onto from the slide before: a tracing that takes its readings one Next at a time starts at the first)
  // (only the charts of the live model follow its frames: any other kind re-rendered on every frame for nothing, and every fresh object it handed down redrew its chart)
  useEngine((s) => (FRAMED.has(kind) ? s.frames : 0));
  const frame = latest.frame;
  // The slide's state as a chart takes it: ONE object while the state is the same. The body re-renders on every engine frame (the live model's charts follow its frames), and a state object made
  // fresh each time made the curve work out its goal again and the chart redraw on every one of them: the card flickered and the main thread never rested (Mohammad, 20 Nov: slide 10/11).
  const slideState = useMemo(() => (fp ? { fp: fp as never, params, base: st?.base, snap: st?.snap, pending: !!(st as { baked?: boolean } | undefined)?.baked } : null), [fp, params, st?.base, st?.snap, st]);  // eslint-disable-line react-hooks/exhaustive-deps
  // the next two slides' curves and courses are worked out while this one is read, so they open drawn
  useEffect(() => {
    const t = clock.after(() => {
      for (let j = i + 1; j <= i + 2 && j < copied.slides.length; j++) {
        const c = copied.slides[j] as CopiedSlide, tl = (c.tool ?? {}) as Rec, r = results?.[j];
        if (tl.kind === 'curve' || tl.kind === 'course') warmCurve(tl as never, r?.fp && !(r as { baked?: boolean }).baked ? { fp: r.fp as never, params: r.params, base: r.base, snap: r.snap } : null, `${deck.id}/${c.id}`, fpOf as never);
      }
    }, 700);
    return () => clock.cancel(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, deck.id, results]);
  const stateOf = useMemo(() => { let last = 0; return copied.slides.map((s, j) => (j === 0 || changes(s as CopiedSlide) ? (last = j) : last)); }, [copied]);
  const before = useMemo(() => beforeOf(tool.from as string | boolean | undefined, { slides: copied.slides, index: i, fp, fpOf }), [tool.from, copied, i, fp, results]);  // eslint-disable-line react-hooks/exhaustive-deps

  switch (kind) {
    case 'criteria': {
      // (the slides that give a case's liver function show its Child–Pugh and MELD under the criteria: charts/scores/slides.ts)
      const sc = slide.scores;
      return sc ? <><CriteriaCard tool={tool as never} fp={fp as never} /><ScoresCard facts={sc} albumin={(fp?.salb as number | null | undefined) ?? null} note={false} /></> : <CriteriaCard tool={tool as never} fp={fp as never} />;
    }
    case 'scores': return <ScoresCard facts={(tool.facts as never) ?? {}} albumin={(fp?.salb as number | null | undefined) ?? null} />;
    case 'path': return <PathCard of={tool.of as string | undefined} patient={(tool.patient as Rec | undefined) ?? null} fp={fp as never} room={room} />;
    case 'profile': return <ProfileCard fp={fp as never} healthy={healthy as never} before={before as never} fromLabel={typeof tool.fromLabel === 'string' ? tool.fromLabel : 'Before'} spans={tool.spans as string[] | undefined} hold={!!cs.hold} blocked={catheterBlocked(cs)} room={room} />;
    case 'curve': case 'course': return <CurveCard tool={tool as never} slide={slideState} fpOf={fpOf as never} id={`${deck.id}/${slide.id}`} room={room} />;
    case 'menu': return <MenuCard rows={Array.isArray(tool.rows) ? (tool.rows as string[]) : null} slide={slideState} id={`${deck.id}/${slide.id}`} />;
    case 'fluid': return <FluidCard fp={fp as never} frame={frame as never} params={(params ?? patient.params) as never} window={!!tool.window} forces={!!tool.forces} caveat={!!tool.caveat} compare={(cs.compare as never) ?? null} />;
    case 'stent': return <StentCard vessel={tool.vessel as never} show={tool.show as never} lens={tool.lens as never} color={tool.color as never} colorSwitch={tool.colorSwitch !== false} pick={tool.pick as never} panels={tool.panels as never} to={tool.to as never} max={tool.max as number | undefined} gate={tool.gate as never} fp={fp as never} frame={frame as never} params={params ?? patient.params} />;
    case 'lumen': return <LumenCard params={(params ?? patient.params ?? null) as never} vessel={(tool.vessel as string | undefined) ?? 'PV_TRUNK'} site={(tool.site as string | undefined) ?? null} name={(tool.name as string | undefined) ?? null} ghost={typeof tool.was === 'string' ? ghostThrombus(results?.[copied.slides.findIndex((x) => x.id === tool.was)]?.params, (tool.vessel as string | undefined) ?? 'PV_TRUNK') : null} />;
    // (the slide's own fingerprint, as 2D's tool-flows reads it (fp.at.Q): never the live frame, whose flows pulse with every beat and made the bar jump between 57 % and 81 %)
    case 'flows': return <FlowsCard of={tool.of === 'inflow' ? 'inflow' : 'portal'} input={flowsInputOf(fp as never)} healthy={flowsInputOf(healthy as never)} />;
    case 'plane': return <PlaneCard plane={tool.plane as never} ring={fp as never} stops={trailStops(tool.trail as never, fpOf as never) ?? undefined} />;
    case 'trial': return typeof tool.id === 'string' ? <TrialCard id={tool.id} fit={fitFor(tool, fp, params, fpOf, results, copied.slides as CopiedSlide[])} head /> : null;
    case 'flowtime': return <FlowTime fpOf={fpOf} deck={deck} slide={slide} i={i} tool={tool} trail={(results?.[i]?.trail as never) ?? null} before={(tool.delta ?? (cs as Rec).delta) != null ? flowStartOf(tool.clock === 'days' && !cs.preset, i > 0 ? fpOf((copied.slides as CopiedSlide[])[stateOf[i - 1]!]!.id) : null, refOf(cs, i, copied.slides as CopiedSlide[], fpOf, stateOf)) : null} />;
    case 'saag': return <SaagCard rows={(((tool.of ?? cs.of) as unknown[] | undefined) ?? []).map((o) => { const x = (typeof o === 'string' ? { id: o } : o) as { id?: string; name?: string; title?: string; short?: string }; return { id: x.id, name: x.name ?? x.title ?? deck.slides.find((s) => s.id === x.id)?.title ?? x.id ?? '', short: x.short, f: x.id ? (fpOf(x.id) as never) : null }; })} extra={(tool.extra as never) ?? []} own={(tool.own as string | undefined) ?? null} room={room} />;
    case 'evgraph': return <EvGraph runKey={`${deck.id}/${slide.id}`} cs={cs} fp={fp} before={results?.[i]?.before as { fp: Fp } | undefined} opened={i > 0 ? ((results?.[i - 1]?.fp as Fp | undefined) ?? null) : null} />;
    case 'vitals': return <VitalsCard tool={tool} fp={fp as never} />;
    case 'forest': return <ForestCard ids={(tool.ids as string[] | undefined) ?? []} />;
    case 'stiffness': return <StiffCard lsm={(fp?.lsm as number | null | undefined) ?? null} plt={(fp?.plt as number | null | undefined) ?? null} note />;
    case 'trace':
      // beat by beat: the live record on EKG paper, the numbers the slide's own, the state before its event as two dotted lines (2D pressure-time.js on a slide)
      if (tool.range === 'beats') return <BeatCard fp={fp as never} before={(refOf(cs as never, i, copied.slides as never, fpOf, stateOf) as never) ?? null} deltaLabel={typeof tool.deltaLabel === 'string' ? tool.deltaLabel : undefined} ekg={tool.ekg !== false} bp={tool.bp === true} />;
      return <TraceCard chain={chainFor(copied.slides as never, stateOf, (results ?? []).map((r) => r && { fp: r.fp as never, params: r.params }), i, tool as never)} {...traceProps(tool as never)} />;
    case 'shift': return <Shift deck={deck} i={i} lit={(cs.key as string[] | undefined) ?? undefined} live={fp as never} />;
    case 'visual:plane': return <PlaneVisual deck={deck} cs={cs} fpOf={fpOf} />;
    case 'visual:ladders': return <LaddersCard slide={cs as never} deck={copied as never} />;
    case 'visual:allpatients': return <AllPatientsCard slide={cs as never} deck={copied as never} />;
    case 'visual:walls': return <WallsCard />;
    case 'doppler': case 'fibroscan': case 'abdomen': case 'hvpg': case 'scope': case 'wall': {
      const ghost = ghostOf(cs as never, i, copied.slides as never, fpOf as never, stateOf);
      return <>{ghost ? <p className="pz-ghost"><span>{ghost.label}</span><b>{ghost.value}</b></p> : null}
        {kind === 'hvpg' ? <HvpgTool fp={fp as Rec | null} cath={cs.cath} catheter={!!tool.catheter} forward={forward} /> : <Instrument kind={kind as InstrumentKind} tool={tool} slideKey={`${deck.id}/${slide.id}`} fp={fp} cs={cs} />}</>;
    }
    case 'reading': return <ReadingTool procedure={cs.procedure} of={tool.of} fp={fp as Rec | null} />;
    default: return null;
  }
}

/** A Tests-card instrument as a slide's data card: the pane of the Tests card, sized to the card's width. It reads the live model; the slide's vessel, gate, organ and view are set when it comes up
 *  (ui/talk/instruments.ts says what each kind reads of the slide's tool), and a compare button or slider that moves one option of it is laid over the slide's own (tool-options.ts). */
/** The state the slide's change started from: its delta (true: the slide before's state; a slide's id: that one's), 2D presenter-question.js refOf. */
function refOf(cs: CopiedSlide, i: number, slides: CopiedSlide[], fpOf: (id: string) => Fp | null, stateOf: readonly number[]): Fp | null {
  const tool = (cs.tool ?? {}) as Rec;
  const d = tool.delta != null ? tool.delta : (cs as Rec).delta ?? (i > 0 && !(cs as Rec).preset && changes(cs) ? true : null);
  if (d === true) return i > 0 ? fpOf(slides[stateOf[i - 1]!]!.id) : null;
  return typeof d === 'string' ? fpOf(d) : null;
}

function Instrument({ kind, tool, slideKey, fp, cs }: { kind: InstrumentKind; tool: Rec; slideKey: string; fp: Fp | null; cs: CopiedSlide }) {
  const w = useUi((s) => s.vp.w);
  const patched = useToolPatch((s) => s.patch), patchKey = useToolPatch((s) => s.key);
  const opts = useMemo(() => withPatch(tool, slideKey, { key: patchKey, patch: patched }), [tool, slideKey, patchKey, patched]);
  const plan = useMemo(() => planOf(kind, tool), [kind, tool]);
  useEffect(() => { startFeed(); }, []);
  // the slide's own options are set whenever it is shown, and a button's patch is gone with it (2D: "set to the slide's options again whenever the slide is shown")
  // (a layout effect: the pane re-renders with the slide's own options before the first paint and before the card is measured again, never a frame of the store's defaults first: a wall slide as the scope, liver as spleen)
  useLayoutEffect(() => {
    if (plan.doppler) { setDopplerProbe(plan.doppler.vessel); useDopplerProbe.getState().setGate((plan.doppler.gate as Gate | null) ?? null); }
    if (plan.view) useScope.getState().setView(plan.view);
    if (plan.organ) useTests.getState().setFibro(plan.organ);
    return claimSlide('options', () => useToolPatch.getState().set('', null));   // (a leaving card never clears the arriving card's options: slide-claim.ts)
  }, [plan, slideKey]);
  // the instrument's own device on the figure while its card is up: the ultrasound probe on the slide's vessel (none on the EUS slide, probe: 'scope': the scope is the probe), the FibroScan probe on
  // the organ, the scope down the esophagus. bind-tests.ts keeps them on whatever the Tests card does; they leave with the slide.
  const figure = !!plan.doppler?.figure, fibro = !!plan.organ, scope = !!plan.scope, points = !!plan.doppler?.points;
  // (a card that is leaving unmounts after the one that came in has mounted: its cleanup must not take the new slide's device off the figure, slide-claim.ts)
  useEffect(() => holdSlideDevices({ doppler: figure, fibro, endoscope: scope, points }), [figure, fibro, scope, points]);
  // the slide's own numbers for the pane (2D presenter-tools pin): the settled state its tiles and words show, not the beat-to-beat live value
  useLayoutEffect(() => { setSlidePin(fp); }, [fp]);
  useEffect(() => claimSlide('pin', () => setSlidePin(null)), []);
  const asked = Math.round(Math.min(220, Math.max(150, w * 0.32)));
  const room = useToolRoomValue(), host = useRef<HTMLDivElement>(null);
  const plot = useRoomFit(host, room, asked);   // (every pane on this path is fitted to the card's room, not just asked for 220 px: Endoscopy 3 ran off its card's foot)
  const p = { narrow: w < 470, plot, square: plot, roomy: false };
  return (
    <div className="dock-pane-host" data-instrument={kind} ref={host}>
      <LazyBoundary height={p.plot}>
        {kind === 'doppler' ? <DopplerPane {...p} options={opts} slide /> : kind === 'fibroscan' ? <FibroPane {...p} slide bar={tool.bar !== false} platelets={((cs.tiles as string[] | undefined) ?? []).includes('plt')} /> : kind === 'scope' || kind === 'wall' ? <EndoPane {...p} options={opts} /> : kind === 'abdomen' ? <AbdomenPane square={p.square} /> : null}
      </LazyBoundary>
    </div>
  );
}

/** Two readings over a time-lapse: the slide's days, drawn as they play (the heads follow the lapse's progress), whole once it is done or when it does not play. */
function FlowTime({ deck, slide, i, tool, trail, before, fpOf }: { deck: Deck; slide: Slide; i: number; tool: Rec; trail: never; before: Fp | null; fpOf: (id: string) => Fp | null }) {
  const mine = useLapse((s) => s.key === `${deck.id}/${slide.id}`), d = useLapse((s) => s.d), n = useLapse((s) => s.n);
  const k = slide.lapse?.plays && mine && n ? Math.min(1, d / n) : 1;
  void i;
  return <FlowTimeCard trail={trail} k={k} lines={(tool.lines as string[] | undefined) ?? undefined} clock={tool.clock === 'days' ? 'days' : 'meal'} given={(tool.given as Record<string, number> | undefined) ?? null} view={before ? { ...(tool.view as FlowView | undefined), before: before as Record<string, number> } : ((tool.view as FlowView | undefined) ?? null)} rx={Array.isArray(tool.bands) ? (tool.bands as string[]) : undefined} refs={refsOf(tool, fpOf)} />;
}

/** A procedure's graph: the two readings before the change and where the slide's settled state ends them. */
export function EvGraph({ runKey, cs, fp, before, opened }: { runKey: string; cs: CopiedSlide; fp: Fp | null; before?: { fp: Fp }; opened: Fp | null }) {
  const spec = useMemo(() => eventGraphOf(cs as never), [cs]);
  const b = spec && fp ? evBounds(spec, opened as never, { fp: fp as never, before: before as never }) : null;
  const run = useMemo(() => (spec ? evRunFor(runKey, spec) : null), [runKey, spec]);   // (the procedure link feeds it once the change is made: ui/deck/procs-link.ts)
  // The picture's box stands from the first frame, drawn or not: the card is measured and locked with whatever it holds when it lands, and a graph whose numbers had not come (the second engine still working
  // out this slide, or the readings of the slide before) left the card its header alone, 46 px, with the graph clipped away when it came (Ten years 13, capture f23a4c59). The chart's box is as tall as the
  // picture drawn in it (charts.css), so a pending graph draws an empty picture at the height the real one takes (evgraph/frame.ts evPendingFrame): the graph fills it and the card never changes.
  return spec ? <EvGraphCard spec={spec} before={b?.before ?? null} end={b?.end ?? null} run={run} /> : null;
}

/** The change-from-healthy chart: one chart over the deck's states, a state's slot once its slide is reached. */
function Shift({ deck, i, lit, live }: { deck: Deck; i: number; lit?: string[]; live: Record<string, number | null | undefined> | null }) {
  const copied = copiedOf(deck.id)!;
  const lived = useStates((s) => s.results[deck.id]);
  const results = useMemo(() => mergeStates(deck.id, lived) as typeof lived, [deck.id, lived]);
  const data = useMemo(() => shiftData(copied.slides as never, (j) => (results?.[j] ? stateOfStep(results[j] as never) : null), null), [copied, results]);
  void shiftTrail;
  return <ShiftCard stages={data.stages} vals={data.vals} trails={data.trails} at={i} lit={lit} live={live as never} />;
}

/** A summary on the plane (visual: 'plane'): one named point for each patient the slide's `of` lists. */
function PlaneVisual({ deck, cs, fpOf }: { deck: Deck; cs: CopiedSlide; fpOf: (id: string) => Fp | null }) {
  const of = cs.of as never, slides = deck.slides as never, fps = fpOf as never;
  // (the rows whose readings are known at once, from the deck's states and the patients baked at build time, are in the first drawing; only a row not worked out waits)
  const [points, setPoints] = useState<Awaited<ReturnType<typeof loadPoints>>>(() => pointsSync(of, slides, fps));
  const states = useStates((s) => s.results[deck.id]);
  useEffect(() => {
    let on = true;
    const now = pointsSync(of, slides, fps);
    if (now.length === planeRows(of, slides).length) { setPoints(now); return; }
    void loadPoints(of, slides, fps, engine() as never).then((p) => { if (on) setPoints(p); }, () => undefined);
    return () => { on = false; };
  }, [deck, cs, states]);  // eslint-disable-line react-hooks/exhaustive-deps
  return <PlaneCard plane={cs.plane as never} points={points} room={useToolRoomValue() || undefined} />;
}
