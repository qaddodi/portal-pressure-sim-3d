// The R3F canvas around the cel scene. Frames are drawn only by the one clock (ClockBridge calls R3F's advance() in the render phase); this
// file wires the scene into the clock's phases and the settings, and owns taps and drags on the canvas.
//   engine phase  the engine's newest frame goes into the vessel data texture (the scene samples it)
//   camera phase  the scene steps its tweens (shot, highlight, flow marks) and says whether it needs another frame
//   render phase  one gl.render of the cel scene (a useFrame with a render priority, so R3F does not draw its own empty scene)
import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Raycaster, WebGLRenderTarget } from 'three';
import { ClockBridge } from '../clock/r3f.tsx';
import { whenQuiet } from '../clock/idle.ts';
import { clock, type TimerId } from '../clock/frame.ts';
import { VesselData, latest } from '../engine/index.ts';
import { useEngine } from '../engine/store.ts';
import { lookGlide } from '../looks/glide.ts';
import { compileDone, figureDrawn, rendererFailed, setRevealHooks, splashHeld, watchStall } from '../boot/ready.ts';
import { easeArrive } from '../clock/tween.ts';
import { watchContext } from './context-loss.ts';
import { setGlLoss } from './gl-loss.ts';
import { firstDraw, spanAsync } from '../boot/spans.ts';
import { stamp } from '../boot/timeline.ts';
import { lateProgramCheck, rebaseLateWatch } from '../boot/late-programs.ts';
import { talkOn } from '../state/deck.ts';
import { useSettings } from '../state/settings.ts';
import { figureDpr } from './quality.ts';
import { govern, newGovernor } from './detail-governor.ts';
import { aaMode, canvasBuffers } from './post-aa.ts';
import { INSPECT } from './vessels/debug-view.ts';
import { installShaderGuard } from '../debug/shader-guard.ts';
import { setRenderer } from '../debug/gl-ref.ts';
import { frameBegin, frameEnd, renderStats } from '../clock/render-stats.ts';
import { sinusoidTap } from './sinusoid/explain-store.ts';
import { lookCapture } from '../debug/look-hook.ts';
import { figureShot, copyOfCanvas } from './figure-shot.ts';
import { pictureScale } from '../ui/shell/figure-image.ts';
import { lobulePicked } from './lobule/pick-store.ts';
import { lobuleSel } from './lobule/pick.ts';
import { bindOrganSettings } from './organs/organ-settings.ts';
import { cel, frames, gesturesRef, sceneApi } from './api.ts';
import { useLens } from './lenses/store.ts';
import { dragToOrbit } from './camera/rig.ts';
import { installTilt } from './camera/tilt-input.ts';
import { reduced } from '../ui/a11y/motion.ts';
import { D_SMALL, EASE_ARRIVE } from '../ui/motion.ts';
import { K_MAX, zoomLimits } from './gesture/view.ts';
import { SHOTS } from './camera/shots.ts';
import { circuitShot } from './circuit/shots.ts';
import { type GestureTarget, createGestures } from './gesture/controller.ts';
import { type Sel, selectStructure, useSelection } from '../ui/action/selection.ts';
import { tapSelect } from '../ui/action/tap-select.ts';
import { labelHit } from '../ui/action/label-tap.ts';
import { labelAt } from './labels/hit.ts';
import { bindSplit, splitLook, splitPhone, splitResize } from './twin/split.ts';
import { SplitLabels } from './twin/SplitLabels.tsx';
import { GeometryUploader, passMaterials, passWarmScene, warmPrograms, type UploadRenderer, type WarmRenderer } from './materials/warm.ts';

const vesselData = new VesselData();
cel.bindData(vesselData.texture);
clock.on('engine', (f) => { if (vesselData.update(latest.frame, latest.version, f.time)) { if (vesselData.fresh) cel.dataChanged(); clock.invalidate('vessel-data'); } if (vesselData.easing) clock.invalidate('patient-glide'); }, 0);
clock.on('tween', (f) => frames.run(f.time), 0);
clock.on('camera', (f) => { if (cel.update(f.time)) clock.invalidate('scene'); }, 0);
let gestureTimerN = 0;
const gestureTimers = new Map<number, TimerId>();
export { vesselData };

/** A phone is the small side under 500 CSS px (portrait or landscape): its ink is 0.2 px lighter on organs (spec section 3). */
/**
 * The hand view that frames the whole figure here (the body's play shot, the Circuit's whole map) seen from the shot now up: what the zoom limits and a zoomed-out view's
 * resting place are measured on. Null when the shot is that, or the view has none.
 */
const wholeHome = () => (cel.view === 'body' ? cel.rig.wholeView(SHOTS.play) : cel.view === 'circuit' ? cel.rig.wholeView(circuitShot(cel.circuit.upright)) : null);

const isPhone = () => Math.min(innerWidth, innerHeight) < 500;


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

  // Under the splash, before the first frame (L3, 21 Nov): the 3D lobule and sinusoid are constructed (their materials, no geometry) and every program of the scene graph, those two views, the hidden devices and the
  // stand-ins for what is made later (materials/prototypes.ts) is compiled, into the post pass's target when the figure is drawn into one: programs are keyed on the output colour space, materials/warm.ts. three builds
  // them in parallel where the driver can.
  // The first frame waits for this (let go when no stage of the start has been stamped for BOOT_STALL_MS: boot/ready.ts watchStall; the clock does not decide),
  // and so does the cover's lift (boot/ready.ts compileDone), so nothing compiles in front of the viewer.
  const compiled = useRef(false);
  useEffect(() => {
    let alive = true;
    cel.constructMicro();
    // (the passes drawn outside the scene graph compile in the same breath: the DoF and glow quads and the uploader's plain material into the post target, the anti-aliasing quad into the canvas's colour space)
    const pm = passMaterials(cel.post, cel.glowFx), warmPass = passWarmScene(pm.target), warmAa = passWarmScene(pm.canvas);
    const wgl = gl as unknown as WarmRenderer;
    const warmP = (): Promise<unknown> => spanAsync('compile:warm', () => Promise.all([
      warmPrograms(wgl, cel.scene, cel.rig.camera, cel.post.target(gl)),
      warmPrograms(wgl, warmPass, cel.rig.camera, cel.post.target(gl)),
      warmPrograms(wgl, warmAa, cel.rig.camera, null),
    ])).catch(() => undefined).finally(() => stamp('compile'));
    rewarm.current = () => {
      cel.contextRestored();
      rebaseLateWatch(); void warmP().then(rebaseLateWatch); cel.onMicroPrimed?.();
    };   // (after a lost context: the programs and the geometry again, off the frame; what a restore rebuilds is not late)
    // (the organs arrive after their geometry and art files do, and are the largest set of programs: the compile waits for them, within the cap; one that comes in after the cap is compiled when it does)
    const all = cel.organsBuilt.then(() => warmP());
    void Promise.race([all, new Promise<void>((r) => { watchStall(() => r(), undefined, () => alive && !compiled.current); })]).then(() => {
      if (!alive || compiled.current) return;
      compiled.current = true; compileDone(); clock.invalidate('compiled');
    });
    return () => { alive = false; };
  }, [gl]);

  // The boot reveal (boot/ready.ts, splash plan A2): the camera a little closer than rest under the cover, then the rig's own glide home as the cover lifts (crisp at full resolution, the labels following by projection).
  useEffect(() => {
    setRevealHooks({ prime: (zoom) => cel.primeReveal(zoom), play: (ms) => { cel.playReveal(clock.now(), ms, easeArrive); clock.invalidate('boot-reveal'); } });
    return () => setRevealHooks(null);
  }, []);

  // Copy / Save figure (ui/shell/figure-image-dom.ts): the stage drawn once at `want` times its CSS size, in this task (the canvas is read before anything else can clear it), then put back at the pixel
  // ratio it rests at and drawn again in the same task, so the screen never shows the other size. The size is kept inside what the device can draw (figure-image.ts pictureScale).
  useEffect(() => {
    figureShot.bind((want) => {
      const el = gl.domElement, r = el.getBoundingClientRect();
      if (r.width <= 0 || !cel.rig.placed) return null;
      const rest = gl.getPixelRatio(), s = pictureScale({ w: r.width, h: r.height }, want, gl.capabilities.maxTextureSize);
      let out: HTMLCanvasElement;
      try {
        gl.setPixelRatio(s); cel.render(gl);
        out = copyOfCanvas(el);
      } finally { gl.setPixelRatio(rest); cel.render(gl); clock.invalidate('figure-shot'); }
      return { canvas: out, css: { x: r.left, y: r.top, w: r.width, h: r.height } };
    });
    return () => figureShot.bind(null);
  }, [gl]);

  // the one draw of the frame: the cel scene on the R3F renderer (a positive priority stops R3F drawing its own)
  useFrame(() => {
    if (!compiled.current) return;   // (the first frame waits for the compile above)
    frameBegin(gl.info);
    const drawAt = clock.now();
    firstDraw(cel.view, () => cel.render(gl));   // (the first drawn frame of each view is timed: boot/spans.ts, ?perf)
    frameEnd(gl.info);
    lateProgramCheck(gl.info.programs, cel.view, clock.now() - drawAt, drawAt);   // (a program built after the splash lifted is named here: boot/late-programs.ts)
    lookCapture.run(gl.domElement);   // (the look board reads the canvas in this task, when it asked)
    // the canvas comes in once, with its first drawn frame (until then the page's own ground shows, never the context's black); a reduced-motion viewer gets it at once
    const el = gl.domElement;
    if (el.style.opacity !== '1') { el.style.transition = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : `opacity ${D_SMALL}ms ${EASE_ARRIVE}`; el.style.opacity = '1'; }
    if (cel.rig.placed) figureDrawn();   // (the splash waits for this: the first frame WITH the figure, then the labels it places; boot/ready.ts. A frame that only cleared (the camera has no room yet) is not the figure)
    if (!warmed.current) {
      warmed.current = true;
      // (the micro views' meshes are built in the idle slices after the first picture, one small step at a time, L4; once built and primed, every geometry no frame has drawn is sent to the GPU,
      // one per idle slice, so a view's first frame uploads nothing: materials/warm.ts GeometryUploader)
      cel.onMicroPrimed = () => {
        stamp('micro');
        const up = new GeometryUploader(gl as unknown as UploadRenderer, cel.rig.camera, new WebGLRenderTarget(1, 1));
        for (const r of cel.uploadRoots) up.add(r);
        spanAsync('upload:geometries', () => Promise.resolve()).catch(() => undefined);
        // (one geometry per step in the background slot, as many as fit its budget: never while anything moves)
        whenQuiet(() => { let more = false; try { more = up.step(); } catch { /* a geometry the driver refuses is left to its own first frame */ } if (!more) up.dispose(); return !more; }, { tag: 'upload' });
      };
      cel.startCircuitSkins();   // (the Circuit's baked skins are fetched in the background slot, after the first picture: they are not on the boot path)
      clock.after(() => cel.buildMicroIdle(), 400);   // (the programs are all compiled already: nothing to wait for but the reveal's first moments)
    }
  }, 1);

  useEffect(() => {
    cel.resize(size.width, size.height);
    cel.setPhone(isPhone());
    splitResize(size.width, size.height); splitPhone(isPhone());   // (the split orbit's twin, when one stands)
  }, [size.width, size.height]);

  // the split orbit (twin/split.ts): the slides ask for it; nothing is built until they do
  useEffect(() => { bindSplit({ scene: cel, stage: () => ({ w: cel.rig.stageSize.w, h: cel.rig.stageSize.h }), look: () => cel.currentLook, phone: isPhone }); return () => bindSplit(null); }, []);

  // fail loud, not invisible (WP10): a program the device's driver refuses is drawn plain, and the ?perf bar says so; ?gl borrows this renderer to compile every program once
  useEffect(() => {
    if (gl.domElement.style.opacity !== '1') gl.domElement.style.opacity = '0';   // (comes in with the first drawn frame, below)
    setRenderer(gl);
    clock.setProbe(renderStats);
    const off = installShaderGuard(gl, cel.scene, () => clock.invalidate('shader-failed'), () => [cel.post.material, ...cel.post.dof.materials, ...cel.glowFx.materials, ...cel.organGlowFx.materials]);
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
    cel.applyLook(look); splitLook(look);
    gl.setClearColor(cel.background);
    clock.invalidate('look');
  }), [gl]);

  // Settings > Figure depth: Organ depth and Organ fill drive the organs live (the layer eases them on the clock)
  useEffect(() => bindOrganSettings(cel.disease.organs, useSettings, (why) => clock.invalidate(why)), []);

  // Settings > Figure detail caps the pixel ratio; with Sharp while moving off, the figure drops to 1x while a gesture or a camera move runs and comes back sharp when it settles (2D's rule)
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    let was = -1, settle: TimerId | null = null, applied = 0;
    // N1: the governor judges the frames that are drawn (detail-governor.ts); a notch it asks for is taken at rest, so the figure never changes size under a move
    const gov = newGovernor(clock.now());
    const apply = () => {
      const st = useSettings.getState();
      const moving = !!(cel.rig.isMoving || gesturesRef.current?.active);
      if (!moving) applied = st.autoDetail ? gov.drop : 0;
      const d = figureDpr(Math.max(0, st.figureDetail - applied), st.sharpMoving, moving, window.devicePixelRatio || 1);
      if (d !== was) { was = d; setDpr(d); clock.invalidate('figure-detail'); document.documentElement.dataset.detailDrop = String(applied); }
      // (no frame runs once everything has stopped, so a motion that ended between frames is looked at again shortly)
      clock.cancel(settle);
      if (moving && (!st.sharpMoving || (st.autoDetail ? gov.drop : 0) !== applied)) settle = clock.after(apply, 200);
    };
    apply();
    const off = clock.on('camera', apply, 1);
    const offGov = clock.on('tags', (f) => { if (!useSettings.getState().autoDetail) return; const was = gov.drop; if (govern(gov, f.time, f.dt) !== was) { clock.cancel(settle); settle = clock.after(apply, 200); } }, 90);
    const un = useSettings.subscribe(apply);
    return () => { off(); offGov(); un(); clock.cancel(settle); };
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
  const buffers = canvasBuffers(mode, INSPECT);   // (the inspector's live FXAA switch may draw straight to this canvas: it keeps its depth and stencil then, post-aa.ts)
  // (with the anti-aliasing pass on, the figure is drawn into the pass's own target, which has its depth and stencil, and the canvas only receives the filtered picture:
  // no depth or stencil on the canvas then, about 12 MB less on a 3x phone; `?aa=msaa`, `?aa=off` and the inspector page draw (or may draw) straight to the canvas and keep both)
  return (
    <div className="stage-root" style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-stage)' as unknown as number, touchAction: 'none' }}>
      <Canvas key={`${msaa ? 'msaa' : 'no-msaa'}-${post ? 'post' : 'direct'}`} flat frameloop="never" dpr={rest} gl={{ antialias: msaa, alpha: false, depth: buffers.depth, stencil: buffers.stencil, powerPreference: 'high-performance' }}>
        <ClockBridge />
        <SceneBridge />
      </Canvas>
      <SplitLabels />
    </div>
  );
}
