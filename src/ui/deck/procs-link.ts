// The talk drives the figure's procedures: a slide's `procedure` (the 2D app's catheters, needles, balloons, the scope and the graft, played on the figure by its own choreography,
// scene/procedures), its `stented` veins, the lobule's `layers`, the sinusoid's `wash`, and the blocked hepatic vein's catheter. It follows the presenter's position as linkScene does
// and clears everything a slide put on the figure when the slide is left. The scene never reads the deck; this and scene-link.ts are the only places that tell it.
//
// A procedure plays as the 2D app plays it (presenter-proc.js procPlay): the figure turns to the anatomy, the catheter goes in with the camera following its tip, each step holds at
// its stop, and the live model takes the change as the sequence passes the procedure's `apply` time (a patient who already has the result has it taken back first). The slide's card
// lists the steps and has the Play button (ui/cards/ProcRow.tsx); a slide that says `auto` plays as it lands going forward, and so does any procedure going forward here (the
// presenter has no per-step Next yet), after the camera and the cards have settled.
import { sceneApi } from '../../scene/api.ts';
import { clock } from '../../clock/frame.ts';
import { useUi } from '../ui-store.ts';
import { useShell } from '../shell/store.ts';
import { viewAt } from './presenter-machine.ts';
import { copiedOf } from '../../decks/hp/deck.ts';
import { currentParams, updateParams } from '../action/params.ts';
import { latestMetrics } from '../../decks/hp/figure-engine.ts';
import { useProbes } from '../../scene/devices/probes/state.ts';
import { route3d } from '../../scene/procedures/route3d.ts';
import { CATH_END } from '../../scene/procedures/copied/cath-arrival.js';
import { OSTIUM_U } from '../../scene/procedures/ostium.ts';
import { UNITS_PER_SCENE } from '../../scene/frame2d.ts';
import { Vector3 } from 'three';
import { ADVANCE_MS } from './scene-link.ts';
import { askOf, layersWant, legsOf, specFor, stepsOfPlan, tipShot, type ProcPlan } from './procs-plan.ts';
import { clearProc, setProc, useProc } from './procs-state.ts';
import type { CopiedSlide } from '../../decks/hp/types.ts';

/** How long after a slide lands (its camera, its cards) a procedure starts by itself. */
export const PLAY_DELAY_MS = 1800;
/** How long a step holds at its stop before the next goes on (2D AUTO_HOLD). */
export const STEP_HOLD_MS = 1600;
/** The dive between the body and the lobule takes this long (scene/api.ts DIVE_MS): layers and the wash wait for it where they must. */
const DIVE_MS = 1250;
/** The three short pushes the catheter makes against a blocked vein (stage-cath.js probe): how long they take, how hard (in catheter widths of the vein) and how far (of the route). */
export const PROBE_MS = 3600;

const V = new Vector3();
/** The kinds whose last step stands on the figure until the slide is left (2D holdEnd with a parked device): the glue slide's scope stays over the varix with its coil and cast in it, and fades as the slide moves on; its play ends at its last stop, not on the fade-out leg. */
export const HOLD_KINDS: ReadonlySet<string> = new Set(['eusglue']);

export function linkProcs(): () => void {
  let key = '';                      // `${deck}/${slide}` of the slide whose features are on the figure
  let gen = 0;                       // a play's generation: a newer play or a slide change ends the older one's callbacks
  let timers: ReturnType<typeof setTimeout>[] = [];
  let playing = false;               // a procedure of this link is on the figure
  let held = false;                  // a procedure that holds its last frame (HOLD_KINDS) is standing on the figure
  let washLand = 0, washKey = '', ringKey = '', layersOn = false, layerTimer: ReturnType<typeof setTimeout> | undefined, lastView = 'body';
  let probeOff: (() => void) | null = null, probeHold: { release(): void } | null = null;
  let plan: ProcPlan | null = null;
  const later = (fn: () => void, ms: number) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const room = () => useUi.getState().boxes.free;

  // ── the playing ──
  function stopPlay(): void {
    gen++;
    timers.forEach(clearTimeout); timers = [];
    sceneApi.follow(null);
    if (playing || held) { sceneApi.procedure.stop(); playing = false; held = false; }
    useProbes.getState().setEndoscope({ on: false });
  }

  function camera(shot: string, last: { name: string; at: number }): void {
    if (!shot) return;
    const tip = sceneApi.procedure.tip(V);
    if (!tip) return;
    // the way in follows the tip as one smooth glide (the rig eases its aim after the point every frame: scene/camera/rig.ts follow); a stop's shot is one move, taken once
    if (shot === 'way') {
      if (last.name !== 'way') {
        const sh = tipShot(shot, tip);
        if (!sh) return;
        last.name = shot; last.at = performance.now();
        sceneApi.goTo(sh, room(), 1100);
      }
      sceneApi.follow([tip.x, tip.y, tip.z]);
      return;
    }
    if (shot === last.name) return;
    const sh = tipShot(shot, tip);
    if (!sh) return;
    sceneApi.follow(null);
    last.name = shot; last.at = performance.now();
    sceneApi.goTo(sh, room(), 1100);
  }

  /** One kind, move by move: each step plays to its stop and holds there; the model takes the change as T.apply passes. `base` is the card's index of the kind's first step. */
  function playKind(kind: string, base: number, g: number, done: () => void): void {
    const sp = specFor(kind)!, hold = HOLD_KINDS.has(kind), legs = hold ? legsOf(kind).slice(0, -1) : legsOf(kind), last = { name: '', at: 0 };
    let applied = false, li = 0;
    const eus = kind === 'eus';
    const leg = (): void => {
      if (g !== gen) return;
      const [from, to] = legs[li]!, final = li === legs.length - 1;
      playing = true;
      sceneApi.procedure.play(kind, {
        from, to, keep: !final || hold,
        onFrame: (rec) => {
          if (g !== gen) return;
          if (rec.step >= 0 && base + rec.step !== useProc.getState().at) setProc({ at: base + rec.step });
          const t = sceneApi.procedure.playing?.t ?? 0;
          if (!applied && t >= sp.T.apply) { applied = true; updateParams((p) => sp.apply(p) as never, { history: false, label: sp.name }); }
          if (eus && rec.step >= 0) useProbes.getState().setEndoscope({ on: true, mode: 'eus', station: sp.steps[rec.step]?.[0] === 'hv' ? 'hv' : 'pv' });
          camera(String(rec.shot || ''), last);
        },
        onEnd: () => {
          if (g !== gen) return;
          if (!final) { later(() => { li++; leg(); }, STEP_HOLD_MS); return; }
          playing = false; held = hold;
          if (!applied) { applied = true; updateParams((p) => sp.apply(p) as never, { history: false, label: sp.name }); }
          done();
        },
      });
    };
    leg();
  }

  /** Play the slide's procedure from its start (the Play button, and the landing). */
  function play(): void {
    if (!plan || !key) return;
    const s = slideNow();
    if (!s || sceneApi.figureView !== 'body') return;
    stopPlay();
    const g = gen, p = plan, sp = specFor(p.kind);
    if (!sp) return;
    const params = currentParams(), m = latestMetrics() as never;
    // (A patient who already has the result has it taken back first, and the play puts it back.)
    const had = !!params && sp.had(params);
    const before = had ? (sp.undo(structuredClone(params)) as unknown) : params;
    const why = params ? sp.can(before, m) || '' : '';
    if (why) { setProc({ why, phase: 'idle' }); return; }
    if (had) updateParams((q) => sp.undo(q) as never, { history: false, label: `${sp.name} undone` });
    setProc({ why: '', phase: 'play', at: -1 });
    const chain = (kind: string, base: number, next: (() => void) | null): void => {
      playKind(kind, base, g, () => {
        if (g !== gen) return;
        if (next) { next(); return; }
        setProc({ phase: 'done', at: useProc.getState().steps.length - 1 });
        const v = viewNow();
        if (v) sceneApi.goTo(v.shot, room());
      });
    };
    const then = p.then && specFor(p.then) ? p.then : null;
    chain(p.kind, 0, then ? () => { const w = specFor(then)!.can(currentParams(), m); if (w) { setProc({ phase: 'done' }); return; } chain(then, sp.steps.length, null); } : null);
  }

  const viewNow = () => { const { stops, pos } = useUi.getState(); return stops.length ? viewAt(stops, pos) : null; };
  const slideNow = (): CopiedSlide | null => {
    const { deck, stops, pos } = useUi.getState();
    const st = stops[pos.stop];
    if (!deck || st?.kind !== 'slide') return null;
    const i = deck.slides.indexOf(st.slide);
    return i < 0 ? null : copiedOf(deck.id)?.slides[i] ?? null;
  };

  // ── what a slide puts on the figure and what leaving it takes away ──
  function stopProbe(): void { probeOff?.(); probeOff = null; probeHold?.release(); probeHold = null; }
  /** The blocked hepatic vein: once the tip is at the ostium it pushes three times against the clot, each easing in and back out (stage-cath.js: 0.9 of the vein's radius x 1.6). */
  function probe(): void {
    const r3 = route3d('hvpg');
    if (!r3) return;
    const r = r3.route, push = (1.6 * 0.9 * (r3.lumen(r.free) * UNITS_PER_SCENE)) / (r.free - r.start || 1), t0 = performance.now();
    probeHold = clock.hold('probe'); probeOff = clock.on('tween', () => {
      const k = Math.min(1, (performance.now() - t0) / PROBE_MS), u = OSTIUM_U + Math.sin(k * 3 * Math.PI) ** 2 * push;
      sceneApi.setCatheter({ advance: u, balloon: 0 });
      if (k >= 1) stopProbe();
    });
  }

  /** Take a slide's features off the figure. `keepLayers`: moving to another slide, which sets its own (the zone bands stay through a way out of the lobule). */
  function release(keepLayers = false): void {
    stopPlay(); stopProbe(); clearProc();
    if (key) { sceneApi.setStented([]); }
    if (washKey) { sceneApi.setWash(false); washKey = ''; }
    if (ringKey) { sceneApi.setCatheterRing(null); ringKey = ''; }
    if (layersOn && !keepLayers) { clearTimeout(layerTimer); const f = useShell.getState().figure; sceneApi.setLobuleLayers({ lymph: f.lymph, zones: f.zones, bile: f.bile }); layersOn = false; }
    plan = null; key = '';
  }

  const sync = (): void => {
    const { deck, stops, pos, dir } = useUi.getState();
    const v = stops.length ? viewAt(stops, pos) : null;
    const s = deck && v?.slide && v.words === 'teach' ? slideNow() : null;
    const k = s && deck && v?.slide ? `${deck.id}/${v.slide.id}` : '';
    if (k !== key) {
      const wasView = lastView;
      release(!!k);
      key = k;
      if (!s || !k) { lastView = 'body'; return; }
      const ask = askOf(s), view = v!.scene?.view ?? 'body';
      lastView = view; washLand = view !== wasView ? DIVE_MS : 0;
      sceneApi.setStented(ask.stented);
      // the lobule's layers: the viewer's own, zones off, and the slide's on; where the slide leaves the lobule they wait for the way out (2D slideLayers)
      const f = useShell.getState().figure, want = layersWant({ lymph: f.lymph, zones: f.zones, bile: f.bile }, s);
      layersOn = true;
      clearTimeout(layerTimer);
      const apply = () => sceneApi.setLobuleLayers(want);
      if (view === 'body' && wasView !== 'body') layerTimer = setTimeout(apply, DIVE_MS); else apply();
      plan = ask.procedure;
      if (plan) {
        const sp = specFor(plan.kind), steps = stepsOfPlan(plan);
        setProc({ key: k, steps, at: dir < 0 ? steps.length - 1 : -1, phase: dir < 0 ? 'done' : 'wait', why: '', name: sp?.name ?? plan.kind });
        // (Back onto a played-through slide: it stands done, the Play button plays it again.)
        if (dir > 0 && sp) { const g = gen; later(() => { if (g === gen) play(); }, PLAY_DELAY_MS); }
      }
    }
    if (!key || !s) return;
    // the catheter's ring and the blocked vein's pushes follow the slide's state
    const cath = v!.cath, rk = cath ? `${key}|${cath}` : '';
    if (rk !== ringKey) {
      ringKey = rk;
      const ring = cath ? (CATH_END[cath as keyof typeof CATH_END]?.ring ?? null) : null;
      sceneApi.setCatheterRing(ring as 'free' | 'wedge' | 'bad' | null);
      stopProbe();
      if (cath === 'blocked') { later(probe, ADVANCE_MS + 300); }
    }
    // the wedge's wash, counted from when the view has landed
    if (askOf(s).wash && washKey !== key && (sceneApi.figureView === 'lobule' || sceneApi.figureView === 'sinusoid')) { washKey = key; sceneApi.setWash(true, performance.now() + washLand); }
  };

  sync();
  const off = useUi.subscribe((s, prev) => { if (s.pos !== prev.pos || s.stops !== prev.stops || s.boxes.free !== prev.boxes.free) sync(); });
  const offPlay = onPlay(() => play());
  return () => { off(); offPlay(); release(); };
}

// The card's Play button asks the link to play (the link is one per talk; the card does not hold it).
const askers = new Set<() => void>();
function onPlay(fn: () => void): () => void { askers.add(fn); return () => { askers.delete(fn); }; }
/** The teaching card's Play button: plays the slide's procedure from its start. */
export function playProcedure(): void { askers.forEach((f) => f()); }
