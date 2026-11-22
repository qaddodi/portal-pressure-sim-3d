// The talk drives the figure's procedures: a slide's `procedure` (the 2D app's catheters, needles, balloons, the scope and the graft, played on the figure by its own choreography,
// scene/procedures), its `stented` veins, the lobule's `layers`, the sinusoid's `wash`, and the blocked hepatic vein's catheter. It follows the presenter's position as linkScene does
// and clears everything a slide put on the figure when the slide is left. The scene never reads the deck; this and scene-link.ts are the only places that tell it.
//
// A procedure is guided by Next, as the 2D app does it (presenter.js procNext / procBack, "guided by Next", his ask 29 Oct): the first Next turns the figure to the anatomy and puts the catheter in (to step 1's
// stop, the camera following its tip), each Next after it plays exactly one step and holds at its stop, Back runs the step before it backwards (from step 1, back to before the start: the slide as it was), and
// the Next after the last step moves on. The live model takes the change as the sequence passes the procedure's `apply` time (a patient who already has the result has it taken back first, and put back).
// The presenter's move asks this link first (ui/deck/proc-step.ts, called from ui/ui-store.ts move); a slide that says `auto` starts as it lands going forward, like a time-lapse.
import { sceneApi } from '../../scene/api.ts';
import { clock, type TimerId } from '../../clock/frame.ts';
import { useUi } from '../ui-store.ts';
import { useShell } from '../shell/store.ts';
import { viewAt } from './presenter-machine.ts';
import { copiedOf } from '../../decks/hp/deck.ts';
import { currentParams, updateParams } from '../action/params.ts';
import { latestMetrics } from '../../decks/hp/figure-engine.ts';
import { useStates } from '../../decks/hp/calc.ts';
import { engine } from '../../engine/index.ts';
import { useProbes } from '../../scene/devices/probes/state.ts';
import { route3d } from '../../scene/procedures/route3d.ts';
import { CATH_END } from '../../scene/procedures/copied/cath-arrival.js';
import { OSTIUM_U } from '../../scene/procedures/ostium.ts';
import { UNITS_PER_SCENE } from '../../scene/frame2d.ts';
import { Vector3 } from 'three';
import { ARRIVE_MS } from './scene-link.ts';
import { slideLanded, onLanded } from './landing.ts';
import { askOf, layersWant, procKey, specFor, stepsOfPlan, stopOf, tipShot, type ProcCursor, type ProcPhase, type ProcPlan } from './procs-plan.ts';
import { setProcStep } from './proc-step.ts';
import { clearProc, setProc, useProc } from './procs-state.ts';
import type { CopiedSlide } from '../../decks/hp/types.ts';

/** The camera's glide to a step's shot, and the beat after it lands before the step moves (2D LAND_MS): no step starts with the camera on its way. */
export const GLIDE_MS = 1100, LAND_MS = 160;
/** The dive between the body and the lobule takes this long (scene/api.ts DIVE_MS): layers and the wash wait for it where they must. */
const DIVE_MS = 1250;
/** The three short pushes the catheter makes against a blocked vein (stage-cath.js probe): how long they take, how hard (in catheter widths of the vein) and how far (of the route). */
export const PROBE_MS = 3600;

const V = new Vector3();
/** The kinds whose last step stands on the figure until the slide is left (2D holdEnd with a parked device): the glue slide's scope stays over the varix with its coil and cast in it, and fades as the slide moves on; its play ends at its last stop, not on the fade-out leg. */
export const HOLD_KINDS: ReadonlySet<string> = new Set(['eusglue']);

/** How long the engine takes to move from one state to the other when a procedure that is an engine action (a band, a tap) makes its change (the figure's own easing follows: the bands fade in one by one, the ascites and the IAP dial fall). */
export const MORPH_MS = 2200, MORPH_BACK_MS = 900;

export function linkProcs(): () => void {
  let key = '';                      // `${deck}/${slide}` of the slide whose features are on the figure
  let gen = 0;                       // a play's generation: a newer play or a slide change ends the older one's callbacks
  let timers: TimerId[] = [];
  let playing = false;               // a procedure of this link is on the figure
  let held = false;                  // a procedure that holds its last frame (HOLD_KINDS) is standing on the figure
  let washLand = 0, washKey = '', ringKey = '', layersOn = false, layerTimer: TimerId | undefined, lastView = 'body';
  let probeOff: (() => void) | null = null, probeHold: { release(): void } | null = null;
  let plan: ProcPlan | null = null;
  let auto: { g: number; key: string } | null = null;   // a slide whose procedure starts by itself once the slide has landed (2D procPlay, after the camera and the cards)
  const later = (fn: () => void, ms: number) => { const t = clock.after(fn, ms); timers.push(t); return t; };
  const room = () => useUi.getState().boxes.free;

  // ── the playing: guided by Next (2D presenter.js procPlay / procNext / procBack) ──
  // `ctl` is the run on the figure: its kind, the card's index of its first step, how many steps it has, the step Next or Back has navigated to (`at`, the ring) and whether it is still going to that step's stop.
  // The first Next puts the catheter in (to step 1's stop), each Next after it plays the next step, Back runs the step before it backwards, and the Next after the last moves on. The figure's own clock runs
  // the sequence (scene/procedures/layer.ts drive/aimAt: a time that runs to a stop, turns round without a jump); this link only says which stop.
  interface Ctl { kind: string; base: number; n: number; at: number; hold: boolean; applied: boolean; original: unknown; last: { name: string; at: number }; snaps: { before: unknown; own: unknown } | null }
  let ctl: Ctl | null = null;
  let phase: ProcPhase = 'wait';
  let starting = false;              // the figure is turning to the anatomy before the first step: a Next waits with it
  const cursor = (): ProcCursor => ({ phase, run: !!ctl, at: ctl?.at ?? -1, n: ctl?.n ?? 0, moving: !!sceneApi.procedure.driven?.moving });

  function stopPlay(): void {
    gen++;
    timers.forEach((t) => clock.cancel(t)); timers = [];
    sceneApi.follow(null);
    if (playing || held) { sceneApi.procedure.stop(); playing = false; held = false; }
    ctl = null; starting = false; phase = 'wait';
    useProbes.getState().setEndoscope({ on: false });
  }

  /** The step's shot, glided to once; nothing moves while the camera is on its way (2D `still`: a step starts with its shot landed). */
  function camera(shot: string, last: { name: string; at: number }, kind: string): void {
    if (!shot) return;
    const tip = sceneApi.procedure.tip(V);
    if (!tip) return;
    // the way in follows the tip as one smooth glide (the rig eases its aim after the point every frame: scene/camera/rig.ts follow); a stop's shot is one move, taken once
    if (shot === 'way') {
      if (last.name !== 'way') {
        const sh = tipShot(shot, tip, kind);
        if (!sh) return;
        last.name = shot; last.at = clock.now();
        sceneApi.goTo(sh, room(), 1100);
        sceneApi.procedure.pause(GLIDE_MS + LAND_MS);
      }
      sceneApi.follow([tip.x, tip.y, tip.z]);
      return;
    }
    if (shot === last.name) return;
    const sh = tipShot(shot, tip, kind);
    if (!sh) return;
    sceneApi.follow(null);
    last.name = shot; last.at = clock.now();
    sceneApi.goTo(sh, room(), 1100);
    sceneApi.procedure.pause(GLIDE_MS + LAND_MS);
  }

  /** The card: the step the figure is on (the fill), the step Next navigated to (the ring) and the phase. */
  const paint = (): void => {
    if (!ctl) return;
    setProc({ ring: ctl.base + ctl.at, phase: phase === 'run' ? 'play' : phase === 'done' ? 'done' : 'wait' });
  };

  /** Start one kind of the slide's procedure standing before its first step, then send it to a stop. `base` is the card's index of the kind's first step. */
  function begin(kind: string, base: number, g: number, onOver: (done: boolean) => void, params0: unknown): void {
    const sp = specFor(kind)!, eus = kind === 'eus', hold = HOLD_KINDS.has(kind), n = sp.steps.length;
    const morph = !!(sp as { morph?: boolean }).morph, scope = (sp as { scope?: 'band' }).scope ?? null, snaps = morph ? snapsOfSlide() : null;
    const c: Ctl = { kind, base, n, at: -1, hold, applied: false, original: params0, last: { name: '', at: 0 }, snaps };
    // (a morph procedure's change is the engine's: from the state before the slide to the slide's own, or back)
    const change = (on: boolean): void => { if (c.snaps) engine().send({ type: 'morph', snap: on ? c.snaps.own : c.snaps.before, ms: on ? MORPH_MS : MORPH_BACK_MS }); else updateParams((p) => (on ? sp.apply(p) : sp.undo(p)) as never, { history: false, label: on ? sp.name : `${sp.name} undone` }); };
    ctl = c; playing = true; phase = 'run';
    sceneApi.procedure.drive(kind, {
      keep: hold,
      onFrame: (rec) => {
        if (g !== gen || ctl !== c) return;
        if (rec.step >= 0 && base + rec.step !== useProc.getState().at) setProc({ at: base + rec.step });
        const t = sceneApi.procedure.driven?.t ?? 0;
        // the live model takes the change as the sequence passes the procedure's `apply` time, and gives it back going back past it
        if (!c.applied && t >= sp.T.apply) { c.applied = true; change(true); }
        else if (c.applied && t < sp.T.apply) { c.applied = false; change(false); }
        if (scope) { const e = useProbes.getState().endoscope, want = t < (sp.T.back ?? sp.T.end); if (e.on !== want || (want && e.mode !== scope)) useProbes.getState().setEndoscope({ on: want, mode: scope }); }
        if (eus && rec.step >= 0) useProbes.getState().setEndoscope({ on: true, mode: 'eus', station: sp.steps[rec.step]?.[0] === 'hv' ? 'hv' : 'pv' });
        camera(String(rec.shot || ''), c.last, kind);
      },
      onArrive: () => {
        if (g !== gen || ctl !== c) return;
        // a kind that holds its last frame (the glue slide's scope over the varix) is played through on reaching its last stop: it stands there until the slide is left
        if (c.hold && c.at === n - 1) { held = true; phase = 'done'; setProc({ phase: 'done', at: base + n - 1, ring: base + n - 1 }); }
      },
      onEnd: ({ done, rewound }) => {
        if (g !== gen || ctl !== c) return;
        playing = false; held = false; ctl = null; sceneApi.follow(null);
        if (rewound) {
          // Back from the first step: the slide as it was (the patient who had the result has it again)
          if (c.snaps) engine().send({ type: 'morph', snap: c.snaps.own, ms: MORPH_BACK_MS });   // (the slide's own state, as it landed)
          else if (c.original) updateParams(() => c.original as never, { history: false, label: sp.name });   // (the patient as he was, who may have had the result: unapply took it off as the sequence went back past it)
          if (eus || scope) useProbes.getState().setEndoscope({ on: false });   // (the scope goes out with the run it was part of)
          phase = base > 0 ? 'between' : 'wait'; setProc({ phase: 'wait', at: base - 1, ring: base - 1 });
        } else if (done) {
          if (!c.applied) { c.applied = true; change(true); }
          if (scope) useProbes.getState().setEndoscope({ on: false });
        }
        const v = viewNow();
        if (v) sceneApi.goTo(v.shot, room());
        onOver(!rewound);
      },
      // (replaced on the figure by another run, a Tests card's for one: this slide's run is over, so its state goes with it; the stopPlay path has already moved `gen` on)
      onStop: () => {
        if (g !== gen || ctl !== c) return;
        playing = false; held = false; ctl = null; starting = false; phase = 'wait'; sceneApi.follow(null);
      },
    });
    aimStep(0);
  }

  /** Send the run to step k's stop (the ring on it at once; the fill follows the catheter). */
  function aimStep(k: number, rush = false): void {
    const c = ctl;
    if (!c) return;
    c.at = k; phase = 'run';
    const goal = k < 0 ? 0 : stopOf(c.kind, k);
    if (goal === null) return;
    sceneApi.procedure.aim(goal, rush);
    paint();
  }

  /** Whether the slide's procedure can play on this patient now: the spec's own refusal ('why') stands on the card. */
  function ready(): { p: ProcPlan; params: unknown } | null {
    if (!plan || !key) return null;
    const s = slideNow();
    if (!s) return null;
    const sp = specFor(plan.kind);
    if (!sp) return null;
    if ((sp as { morph?: boolean }).morph && !snapsOfSlide()) return null;   // (the deck's states are still being worked out: the slide moves on)
    const params = currentParams(), m = latestMetrics() as never;
    // (A patient who already has the result has it taken back first, and the play puts it back.)
    const had = !!params && sp.had(params);
    const before = had ? (sp.undo(structuredClone(params)) as unknown) : params;
    const why = params ? sp.can(before, m) || '' : '';
    if (why) { setProc({ why, phase: 'idle' }); return null; }
    return { p: plan, params };
  }

  /** The first Next: the figure turns to the anatomy, the catheter goes in. Returns whether the key was spent (a procedure that cannot play lets the slide move on). */
  function start(): boolean {
    const r = ready();
    if (!r) return false;
    const view = viewNow()?.scene?.view ?? 'body';
    if (view !== 'body') return false;
    stopPlay();
    const g = gen, sp = specFor(r.p.kind)!, params = r.params;
    const go = (): void => {
      if (g !== gen) return;
      starting = false;
      const had = !!params && sp.had(params), sn = (sp as { morph?: boolean }).morph ? snapsOfSlide() : null;
      if (sn) engine().send({ type: 'morph', snap: sn.before, ms: MORPH_BACK_MS });   // (an engine action cannot be taken back: the run starts from the state before the slide)
      else if (had) updateParams((q) => sp.undo(q) as never, { history: false, label: `${sp.name} undone` });
      setProc({ why: '', phase: 'play', at: -1, ring: 0 });
      const then = r.p.then && specFor(r.p.then) ? r.p.then : null;
      begin(r.p.kind, 0, g, (done) => {
        if (g !== gen || !done) return;
        if (then) { phase = 'between'; setProc({ phase: 'wait', at: sp.steps.length - 1, ring: sp.steps.length }); return; }
        phase = 'done'; setProc({ phase: 'done', at: useProc.getState().steps.length - 1, ring: -1 });
      }, params);
    };
    // (the figure may still be turning back from the lobule: a Next waits with it, for a few seconds at most, rather than leaving)
    if (sceneApi.figureView === 'body') go();
    else { starting = true; let tries = 0; const poll = (): void => { if (g !== gen) return; if (sceneApi.figureView === 'body') go(); else if (++tries > 40) { starting = false; } else later(poll, 100); }; later(poll, 100); }
    return true;
  }

  /** The reading after the main run (TIPS, then its gradient): one more run on the same card. */
  function startThen(): boolean {
    const then = plan?.then && specFor(plan.then) ? plan.then : null, sp = plan ? specFor(plan.kind) : null;
    if (!plan || !then || !sp) return false;
    const w = specFor(then)!.can(currentParams(), latestMetrics() as never);
    if (w) { phase = 'done'; setProc({ phase: 'done' }); return false; }
    const g = gen;
    setProc({ phase: 'play', ring: sp.steps.length });
    begin(then, sp.steps.length, g, (done) => {
      if (g !== gen) return;
      if (!done) { phase = 'between'; setProc({ phase: 'wait', at: sp.steps.length - 1, ring: sp.steps.length - 1 }); return; }
      phase = 'done'; setProc({ phase: 'done', at: useProc.getState().steps.length - 1, ring: -1 });
    }, currentParams());
    return true;
  }

  /** Next (dir 1) or Back (dir -1) on a slide that has a procedure: true when the procedure took the key, false when the slide moves on. Registered with the presenter's move (ui/deck/proc-step.ts). */
  function onKey(dir: 1 | -1): boolean {
    if (!plan || !key) return false;
    if (starting) return dir > 0;   // (the figure is turning to the anatomy: a Next waits with it, a Back leaves)
    const a = procKey(cursor(), dir);
    switch (a.act) {
      case 'pass': return false;
      case 'start': return start();
      case 'then': return startThen();
      case 'aim': aimStep(a.at); return true;
      case 'rush': aimStep(ctl!.n - 1, true); return true;
      case 'rewind': aimStep(-1); return true;
    }
  }

  /** The card's button: the first press starts the procedure, each press after it plays the next step (the same as Next); on a played-through slide it plays it again from the start. */
  function press(): void {
    if (phase === 'done') { stopPlay(); start(); return; }
    onKey(1);
  }

  const viewNow = () => { const { stops, pos } = useUi.getState(); return stops.length ? viewAt(stops, pos) : null; };
  const slideNow = (): CopiedSlide | null => {
    const { deck, stops, pos } = useUi.getState();
    const st = stops[pos.stop];
    if (!deck || st?.kind !== 'slide') return null;
    const i = deck.slides.indexOf(st.slide);
    return i < 0 ? null : copiedOf(deck.id)?.slides[i] ?? null;
  };

  /** The two states a morph procedure runs between: the one before the slide (the slide before it in the deck's chain) and the slide's own. */
  function snapsOfSlide(): { before: unknown; own: unknown } | null {
    const { deck, stops, pos } = useUi.getState(), st = stops[pos.stop];
    if (!deck || st?.kind !== 'slide') return null;
    const i = deck.slides.indexOf(st.slide), res = useStates.getState().results[deck.id];
    const own = res?.[i]?.snap, before = i > 0 ? res?.[i - 1]?.snap : null;
    return own && before ? { before, own } : null;
  }

  // ── what a slide puts on the figure and what leaving it takes away ──
  function stopProbe(): void { probeOff?.(); probeOff = null; probeHold?.release(); probeHold = null; }
  /** The blocked hepatic vein: once the tip is at the ostium it pushes three times against the clot, each easing in and back out (stage-cath.js: 0.9 of the vein's radius x 1.6). */
  function probe(): void {
    const r3 = route3d('hvpg');
    if (!r3) return;
    const r = r3.route, push = (1.6 * 0.9 * (r3.lumen(r.free) * UNITS_PER_SCENE)) / (r.free - r.start || 1), t0 = clock.now();
    probeHold = clock.hold('probe'); probeOff = clock.on('tween', () => {
      const k = Math.min(1, (clock.now() - t0) / PROBE_MS), u = OSTIUM_U + Math.sin(k * 3 * Math.PI) ** 2 * push;
      sceneApi.setCatheter({ advance: u, balloon: 0 });
      if (k >= 1) stopProbe();
    });
  }

  /** The slide's own procedure starts when its slide has landed (the camera still, the cards in), like a time-lapse: a Next before that moves on to the next slide. */
  function tryAuto(): void {
    const a = auto;
    if (!a) return;
    if (a.g !== gen || a.key !== key) { auto = null; return; }
    if (!slideLanded()) return;
    auto = null; start();
  }

  /** Take a slide's features off the figure. `keepLayers`: moving to another slide, which sets its own (the zone bands stay through a way out of the lobule). */
  function release(keepLayers = false): void {
    stopPlay(); stopProbe(); clearProc();
    if (key) { sceneApi.setStented([]); }
    if (washKey) { sceneApi.setWash(false); washKey = ''; }
    if (ringKey) { sceneApi.setCatheterRing(null); ringKey = ''; }
    if (layersOn && !keepLayers) { clock.cancel(layerTimer); const f = useShell.getState().figure; sceneApi.setLobuleLayers({ lymph: f.lymph, zones: f.zones, bile: f.bile }); layersOn = false; }
    plan = null; key = ''; auto = null;
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
      clock.cancel(layerTimer);
      const apply = () => sceneApi.setLobuleLayers(want);
      if (view === 'body' && wasView !== 'body') layerTimer = clock.after(apply, DIVE_MS); else apply();
      plan = ask.procedure;
      if (plan) {
        const sp = specFor(plan.kind), steps = stepsOfPlan(plan);
        // (why: the spec's own refusal for this patient, on the card from the start, as 2D's procEl)
        const params = currentParams(), why = sp && params && !sp.had(params) ? sp.can(params, latestMetrics() as never) || '' : '';
        setProc({ key: k, steps, at: dir < 0 ? steps.length - 1 : -1, ring: dir < 0 ? -1 : 0, phase: dir < 0 ? 'done' : 'wait', why, name: sp?.name ?? plan.kind });
        // (Back onto a played-through slide: it stands done; Next moves on, the button plays it again.) Going forward the first Next starts it; `auto` starts it as the slide lands, after the camera and the cards have settled.
        phase = dir < 0 ? 'done' : 'wait';
        if (dir > 0 && sp && plan.auto) { auto = { g: gen, key: k }; tryAuto(); }
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
      if (cath === 'blocked') { later(probe, ARRIVE_MS + 300); }
    }
    // the wedge's wash, counted from when the view has landed
    if (askOf(s).wash && washKey !== key && (sceneApi.figureView === 'lobule' || sceneApi.figureView === 'sinusoid')) { washKey = key; sceneApi.setWash(true, clock.now() + washLand); }
  };

  sync();
  const off = useUi.subscribe((s, prev) => { if (s.pos !== prev.pos || s.stops !== prev.stops || s.boxes.free !== prev.boxes.free) sync(); });
  const offLanded = onLanded(tryAuto);
  const offPlay = onPlay(() => press());
  setProcStep(onKey);
  return () => { off(); offPlay(); offLanded(); setProcStep(null); release(); };
}

// The card's Play button asks the link to play (the link is one per talk; the card does not hold it).
const askers = new Set<() => void>();
function onPlay(fn: () => void): () => void { askers.add(fn); return () => { askers.delete(fn); }; }
/** The teaching card's Play button: plays the slide's procedure from its start. */
export function playProcedure(): void { askers.forEach((f) => f()); }
