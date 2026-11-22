// The R3F canvas around the cel scene. Frames are drawn only by the one clock (ClockBridge calls R3F's advance() in the render phase); this
// file wires the scene into the clock's phases and the settings, and owns taps and drags on the canvas.
//   engine phase  the engine's newest frame goes into the vessel data texture (the scene samples it)
//   camera phase  the scene steps its tweens (shot, highlight, flow marks) and says whether it needs another frame
//   render phase  one gl.render of the cel scene (a useFrame with a render priority, so R3F does not draw its own empty scene)
import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Raycaster, WebGLRenderTarget } from 'three';
import { ClockBridge } from '../clock/r3f.tsx';
import { clock, type TimerId } from '../clock/frame.ts';
import { VesselData, latest } from '../engine/index.ts';
import { useEngine } from '../engine/store.ts';
import { lookGlide } from '../looks/glide.ts';
import { figureDrawn, rendererFailed, splashHeld } from '../boot/ready.ts';
import { watchContext } from './context-loss.ts';
import { setGlLoss } from './gl-loss.ts';
import { firstDraw, spanAsync } from '../boot/spans.ts';
import { talkOn } from '../state/deck.ts';
import { useSettings } from '../state/settings.ts';
import { figureDpr } from './quality.ts';
import { aaMode } from './post-aa.ts';
import { installShaderGuard } from '../debug/shader-guard.ts';
import { setRenderer } from '../debug/gl-ref.ts';
import { frameBegin, frameEnd, renderStats } from '../clock/render-stats.ts';
import { sinusoidTap } from './sinusoid/explain-store.ts';
import { lookCapture } from '../debug/look-hook.ts';
import { lobulePicked } from './lobule/pick-store.ts';
import { lobuleSel } from './lobule/pick.ts';
import { bindOrganSettings } from './organs/organ-settings.ts';
import { cel, frames, gesturesRef, sceneApi } from './api.ts';
import { useLens } from './lenses/store.ts';
import { dragToOrbit } from './camera/rig.ts';
import { installTilt } from './camera/tilt-input.ts';
import { reduced } from '../ui/a11y/motion.ts';
import { K_MAX, zoomLimits } from './gesture/view.ts';
import { SHOTS } from './camera/shots.ts';
import { circuitShot } from './circuit/shots.ts';
import { type GestureTarget, createGestures } from './gesture/controller.ts';
import { type Sel, selectStructure, useSelection } from '../ui/action/selection.ts';
import { tapSelect } from '../ui/action/tap-select.ts';
import { labelHit } from '../ui/action/label-tap.ts';
import { labelAt } from './labels/hit.ts';
import { GeometryUploader, warmPrograms, type UploadRenderer, type WarmRenderer } from './materials/warm.ts';

const vesselData = new VesselData();
cel.bindData(vesselData.texture);
clock.on('engine', (f) => { if (vesselData.update(latest.frame, latest.version, f.time)) { if (vesselData.fresh) cel.dataChanged(); clock.invalidate('vessel-data'); } if (vesselData.easing) clock.invalidate('patient-glide'); }, 0);
clock.on('tween', (f) => frames.run(f.time), 0);
clock.on('camera', (f) => { if (cel.update(f.time)) clock.invalidate('scene'); }, 0);
let gestureTimerN = 0;
const gestureTimers = new Map<number, TimerId>();
export { vesselData };

/** A phone is the small side under 500 CSS px (portrait or landscape): its ink is 0.2 px lighter on organs (spec section 3). */
/** The hand view that frames the whole figure here (the body's play shot, the Circuit's whole map) seen from the shot now up: what the zoom limits and a zoomed-out view's resting place are measured on. Null when the shot is that, or the view has none. */
const wholeHome = () => (cel.view === 'body' ? cel.rig.wholeView(SHOTS.play) : cel.view === 'circuit' ? cel.rig.wholeView(circuitShot(cel.circuit.upright)) : null);

const isPhone = () => Math.min(innerWidth, innerHeight) < 500;

/** The longest the first warm-up may hold the late build of the lobule and sinusoid back. */
export const WARM_CAP_MS = 4000;

function SceneBridge() {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const raycaster = useRef(new Raycaster());
  const warmed = useRef(false);
  // The renderer lost its context. Before the first picture the splash cannot wait for a figure that will not come (boot/ready.ts says so, with Reload and the 2D link). After it, the figure is kept and brought back
  // (scene/context-loss.ts): the render phase pauses, a note fades in, and on restore the warm-up runs again (three re-sends its own textures, targets and geometry; it does not know which programs were warm).
  const rewarm = useRef<() => void>(() => undefined);
  useEffect(() => watchContext(gl.domElement, {
    early: splashHeld, onEarly: () => rendererFailed('The graphics context was lost before the first picture.'),
    lost: () => { setGlLoss('lost'); clock.invalidate('context-lost'); },
    stuck: () => setGlLoss('stuck'),
    rebuild: () => { vesselData.texture.needsUpdate = true; rewarm.current(); },
    restored: () => { setGlLoss('ok'); clock.invalidate('context-restored'); },
  }), [gl]);

  // the one draw of the frame: the cel scene on the R3F renderer (a positive priority stops R3F drawing its own)
  useFrame(() => {
    frameBegin(gl.info);
    firstDraw(cel.view, () => cel.render(gl));   // (the first drawn frame of each view is timed: boot/spans.ts, ?perf)
    frameEnd(gl.info);
    lookCapture.run(gl.domElement);   // (the look board reads the canvas in this task, when it asked)
    // the canvas comes in once, with its first drawn frame (until then the page's own ground shows, never the context's black); a reduced-motion viewer gets it at once
    const el = gl.domElement;
    if (el.style.opacity !== '1') { el.style.transition = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'opacity 200ms ease-out'; el.style.opacity = '1'; }
    if (cel.rig.placed) figureDrawn();   // (the splash waits for this: the first frame WITH the figure, then the labels it places; boot/ready.ts. A frame that only cleared (the camera has no room yet) is not the figure)
    // every program of every view (the lobule, the sinusoid, the Circuit, the devices, the hidden ones) is built once, off the frame, a moment after the first picture, so the first show of a view never stalls on a driver
    // compile (the ?gl check does the same on request, debug/gl-check-run.ts): three builds them in parallel where the driver can
    if (!warmed.current) {
      warmed.current = true;
      const warmP = (): Promise<unknown> => spanAsync('compile:warm', () => warmPrograms(gl as unknown as WarmRenderer, cel.scene, cel.rig.camera, cel.post.target(gl))).catch(() => undefined);
      const warm = () => { void warmP(); };   // (into the post pass's target when the figure is drawn into one: programs are keyed on the output colour space, materials/warm.ts)
      rewarm.current = () => { warm(); cel.onMicroPrimed?.(); };   // (after a lost context: the programs and the geometry again, off the frame)
      cel.onMicroBuilt = warm;
      // (then, once the views are built and primed: every geometry no frame has drawn is sent to the GPU one per idle slice, so a view's first frame uploads nothing: materials/warm.ts GeometryUploader)
      cel.onMicroPrimed = () => {
        const up = new GeometryUploader(gl as unknown as UploadRenderer, cel.rig.camera, new WebGLRenderTarget(1, 1));
        for (const r of cel.uploadRoots) up.add(r);
        const ric = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
        const next = () => { let more = false; try { more = up.step(); } catch { /* a geometry the driver refuses is left to its own first frame */ } if (more) { if (ric) ric(next, { timeout: 300 }); else clock.after(next, 60); } else up.dispose(); };
        spanAsync('upload:geometries', () => Promise.resolve()).catch(() => undefined);
        if (ric) ric(next, { timeout: 300 }); else clock.after(next, 60);
      };   // (the 3D lobule and sinusoid are built after the first picture, or at the first dive: their programs are compiled here, off the frame, the moment they exist)
      // One thing at a time (release review 21 Nov #8): the warm-up's compiles finish (or give up after WARM_CAP_MS) BEFORE the micro views are built, never both in the same slot: on a low-budget device the two together were one long hitch.
      clock.after(() => { void Promise.race([warmP(), new Promise((r) => clock.after(r, WARM_CAP_MS))]).then(() => cel.buildMicroIdle()); }, 400);   // (and each vessel and skin program in its other blend state too: materials/warm.ts)
    }
  }, 1);

  useEffect(() => {
    cel.resize(size.width, size.height);
    cel.setPhone(isPhone());
  }, [size.width, size.height]);

  // fail loud, not invisible (WP10): a program the device's driver refuses is drawn plain, and the ?perf bar says so; ?gl borrows this renderer to compile every program once
  useEffect(() => {
    if (gl.domElement.style.opacity !== '1') gl.domElement.style.opacity = '0';   // (comes in with the first drawn frame, below)
    setRenderer(gl);
    clock.setProbe(renderStats);
    const off = installShaderGuard(gl, cel.scene, () => clock.invalidate('shader-failed'), () => [cel.post.material, ...cel.post.dof.materials]);
    return () => { off(); clock.setProbe(null); setRenderer(null); };
  }, [gl]);

  // the colour lens's healthy reference loads once the engine is up; the Blood menu's choices apply from the first frame
  useEffect(() => {
    sceneApi.setBlood({});
    sceneApi.setLens(useLens.getState().lens, true);
    let loaded = false;
    const load = () => { if (!loaded && useEngine.getState().status === 'ready') { loaded = true; void sceneApi.loadHealthy(); } };
    load();
    return useEngine.subscribe(load);
  }, []);

  // the figure's look follows the page's: one change runs the page's colours and the figure's together, eased (looks/glide.ts); the first paint is at once
  useEffect(() => lookGlide.onLook((look) => {
    cel.applyLook(look);
    gl.setClearColor(cel.background);
    clock.invalidate('look');
  }), [gl]);

  // Settings > Figure depth: Organ depth and Organ fill drive the organs live (the layer eases them on the clock)
  useEffect(() => bindOrganSettings(cel.disease.organs, useSettings, (why) => clock.invalidate(why)), []);

  // Settings > Figure detail caps the pixel ratio; with Sharp while moving off, the figure drops to 1x while a gesture or a camera move runs and comes back sharp when it settles (2D's rule)
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    let was = -1, settle: TimerId | null = null;
    const apply = () => {
      const st = useSettings.getState();
      const moving = !!(cel.rig.isMoving || gesturesRef.current?.active);
      const d = figureDpr(st.figureDetail, st.sharpMoving, moving, window.devicePixelRatio || 1);
      if (d !== was) { was = d; setDpr(d); clock.invalidate('figure-detail'); }
      // (no frame runs once everything has stopped, so a motion that ended between frames is looked at again shortly)
      clock.cancel(settle);
      if (moving && !st.sharpMoving) settle = clock.after(apply, 200);
    };
    apply();
    const off = clock.on('camera', apply, 1);
    const un = useSettings.subscribe(apply);
    return () => { off(); un(); clock.cancel(settle); };
  }, [setDpr]);

  // the figure's gestures (src/scene/gesture/): turn, pinch, pan, wheel and trackpad, the 2D app's pan and zoom ported
  useEffect(() => {
    const el = gl.domElement;
    const g = createGestures(el as unknown as GestureTarget, {
      hand: () => cel.rig.handView,
      setHand: (v) => { cel.rig.setHand(v); clock.invalidate('hand'); },
      holdHand: () => cel.rig.holdHand(),
      centre: () => cel.rig.roomCentre(),
      fitRect: () => cel.rig.fitRect(),
      // (the sinusoid and the lobule keep their subject framed, and Anatomy never rests zoomed out past its fit (owner, 20 Nov: "spring back zoom to fit when i try to zoom out"): a pinch out stretches a little and springs back on release)
      // Zoom limits are 2D's, measured on the WHOLE figure (the body, the whole Circuit map), not on the shot now up: from a close shot (a pick, a Tests shot, a Circuit slide's box) a pinch or − reaches the whole figure and
      // no further (the least rests at its fit), and the most is 6 x its fit, never 6 x the close-up. The lobule and the sinusoid keep their own subject framed (limits on their own fit).
      kMin: () => (cel.view === 'sinusoid' || cel.view === 'lobule' ? 1 : zoomLimits(wholeHome(), 1).kMin),
      kMax: () => (cel.view === 'sinusoid' || cel.view === 'lobule' ? K_MAX : zoomLimits(wholeHome(), 1).kMax),
      home: () => wholeHome(),
      fitToggles: () => cel.view === 'circuit',
      recentre: () => cel.view === 'sinusoid',
      orbit: () => cel.rig.orbitAngle,
      setOrbit: (rad) => { const changed = cel.rig.setOrbit(rad); if (changed) clock.invalidate('orbit'); return changed; },
      free: () => cel.rig.free,
      holdTurn: () => cel.rig.inspectOn,
      orbitPitch: () => cel.rig.pitchAngle,
      setOrbitPitch: (rad) => { const changed = cel.rig.setOrbitPitch(rad); if (changed) clock.invalidate('orbit'); return changed; },
      // a tap picks what 2D's does (src/ui/action/tap-select.ts): a vessel, an organ (liver with its lobe, heart, spleen) or the belly's fluid; a tap on nothing puts the selection away
      tap: (x, y, touch) => {
        if (cel.view === 'sinusoid' && sinusoidTap(x, y, talkOn())) return;   // (2D's explain rule: a tap on a sinusoid name, in a talk: sinusoid/explain-store.ts)
        if (talkOn()) return;
        if (cel.view === 'lobule') { const h = cel.pickLobule(x, y, raycaster.current); lobulePicked(h ? lobuleSel(h) : null, h); return; }   // (the lobule's parts, by 2D's own rule: lobule/pick.ts)
        // a station's label above the figure takes the tap first and opens the structure it stands for (2D's label is a button over the stage: src/ui/action/label-tap.ts)
        const node = cel.view === 'body' ? labelAt(x, y) : null;
        tapSelect((node ? labelHit(node) : null) ?? cel.pickTargetAt(x, y, raycaster.current, !!touch), { picked: cel.highlight.picked, pick: (id) => sceneApi.pick(id), body: cel.view === 'body' });
      },
      picked: () => useSelection.getState().sel,
      setPicked: (sel) => selectStructure(sel as Sel | null),
      // right click and long press open the card of what is under the pointer and never close it (2D's contextmenu)
      context: (x, y, touch) => { const hit = cel.pickTargetAt(x, y, raycaster.current, !!touch); if (hit) tapSelect(hit, { picked: cel.highlight.picked, pick: (id) => sceneApi.pick(id), body: true }, false); },
    }, {
      now: () => clock.now(),
      ask: frames.ask, cancel: frames.cancel,
      // (the controller keeps numeric handles, as its tests do; the clock's own handles are opaque, so they are kept here by number)
      timer: (fn, ms) => { const n = ++gestureTimerN; gestureTimers.set(n, clock.after(() => { gestureTimers.delete(n); fn(); }, ms)); return n; },
      clearTimer: (id) => { clock.cancel(gestureTimers.get(id)); gestureTimers.delete(id); },
      reduceMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      locked: () => talkOn(),   // (in a talk the camera is the slide's: the figure is not turned, panned or zoomed by hand)
      viewport: () => cel.rig.stageSize,
    }, window as unknown as GestureTarget);
    gesturesRef.current = g;
    return () => { g.dispose(); gesturesRef.current = null; };
  }, [gl]);

  // Gentle tilt (camera/tilt.ts): the pointer or the device's orientation turns the figure a few degrees, as an offset added when the camera is written (the hand's state and Fit never see it).
  // Locked (it eases to square) while a gesture runs or the view is not the body; a camera move locks it in the rig itself.
  useEffect(() => {
    const rig = cel.rig;
    // (owner, 20 Nov: no 'Tilt all around'. Every device turns and tilts within the limits in shots.ts (TURN_LIMIT, TILT_LIMIT), mouse drag or two fingers; one finger pans.
    //  Body and lobule turn; the Circuit's map and the flat sinusoid do not, and a talk's camera is the slide's.)
    rig.freeGate = () => (cel.view === 'body' || cel.view === 'lobule') && !talkOn();
    const offFree = () => {};
    rig.tiltGate = { on: () => useSettings.getState().tilt, locked: () => !!gesturesRef.current?.active || cel.view !== 'body' || cel.circuit.t > 0 || talkOn() };
    const off = installTilt({
      rig, wake: (tag) => clock.invalidate(tag), on: () => useSettings.getState().tilt, reduced,
      onSwitch: (fn) => { let was = useSettings.getState().tilt; return useSettings.subscribe((s) => { if (s.tilt !== was) { was = s.tilt; fn(was); } }); },
    });
    return () => { off(); offFree(); rig.tiltGate = null; rig.freeGate = null; };
  }, []);

  return null;
}

export function Stage() {
  useEffect(() => { clock.invalidate('stage-mounted'); }, []);
  // the pixel ratio the figure rests at, and whether the context is multisampled (only on ?aa=msaa, at any ratio); the canvas is made again only when that answer changes
  const detail = useSettings((s) => s.figureDetail);
  const rest = figureDpr(detail, true, false, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  // (the anti-aliasing pass, the default, does the canvas's job: the context is multisampled only when the address asks for `?aa=msaa`, and then at ANY pixel ratio: the post pass is off in that mode, so
  // refusing the samples at 2x left the figure with no anti-aliasing at all)
  const mode = aaMode();
  const msaa = mode === 'msaa';
  const post = mode === 'fxaa';
  // (with the anti-aliasing pass on, the figure is drawn into the pass's own target, which has its depth and stencil, and the canvas only receives the filtered picture: no depth or stencil on the canvas then, about 12 MB less on a 3x phone; `?aa=msaa` and `?aa=off` draw straight to the canvas and keep both)
  return (
    <div className="stage-root" style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-stage)' as unknown as number, touchAction: 'none' }}>
      <Canvas key={`${msaa ? 'msaa' : 'no-msaa'}-${post ? 'post' : 'direct'}`} flat frameloop="never" dpr={rest} gl={{ antialias: msaa, alpha: false, depth: !post, stencil: !post, powerPreference: 'high-performance' }}>
        <ClockBridge />
        <SceneBridge />
      </Canvas>
    </div>
  );
}
