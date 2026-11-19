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
import { StiffCard } from '../charts/stiff/StiffCard.tsx';
import { engine } from '../../engine/index.ts';

type Rec = Record<string, unknown>;
type Fp = Record<string, number | null | undefined>;

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
    case 'fluid': return <FluidCard fp={fp as never} frame={frame as never} params={(params ?? patient.params) as never} window={!!tool.window} forces={!!tool.forces} caveat={!!tool.caveat} compare={(cs.compare as never) ?? null} />;
    case 'stent': return <StentCard vessel={tool.vessel as never} show={tool.show as never} lens={tool.lens as never} color={tool.color as never} colorSwitch={tool.colorSwitch !== false} pick={tool.pick as never} panels={tool.panels as never} to={tool.to as never} max={tool.max as number | undefined} gate={tool.gate as never} fp={fp as never} frame={frame as never} params={params ?? patient.params} />;
    case 'lumen': return <LumenCard params={(params ?? patient.params ?? null) as never} vessel={(tool.vessel as string | undefined) ?? 'PV_TRUNK'} site={(tool.site as string | undefined) ?? null} name={(tool.name as string | undefined) ?? null} />;
    case 'flows': return frame ? <FlowsCard of={tool.of === 'inflow' ? 'inflow' : 'portal'} input={{ Q: frame.Q, shunt: ((patient.params as { shunt?: number } | null)?.shunt ?? 0) as number, customShunts: ((patient.params as { customShunts?: Rec } | null)?.customShunts ?? null) as never }} /> : null;
    case 'plane': return <PlaneCard plane={tool.plane as never} ring={fp as never} stops={trailStops(tool.trail as never, fpOf as never) ?? undefined} />;
    case 'trial': return typeof tool.id === 'string' ? <TrialCard id={tool.id} fit={null} head /> : null;
    case 'forest': return <ForestCard ids={(tool.ids as string[] | undefined) ?? []} />;
    case 'stiffness': return <StiffCard lsm={(fp?.lsm as number | null | undefined) ?? null} plt={(fp?.plt as number | null | undefined) ?? null} note />;
    case 'trace': return <TraceCard chain={chainFor(copied.slides as never, stateOf, (results ?? []).map((r) => r && { fp: r.fp as never, params: r.params }), i, tool as never)} {...traceProps(tool as never)} />;
    case 'shift': return <Shift deck={deck} i={i} lit={(cs.key as string[] | undefined) ?? undefined} live={fp as never} />;
    case 'visual:plane': return <PlaneVisual deck={deck} cs={cs} fpOf={fpOf} />;
    case 'visual:ladders': return <LaddersCard slide={cs as never} deck={copied as never} />;
    case 'visual:allpatients': return <AllPatientsCard slide={cs as never} deck={copied as never} />;
    default: return null;
  }
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
