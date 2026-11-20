// The R3F canvas around the cel scene. Frames are drawn only by the one clock (ClockBridge calls R3F's advance() in the render phase); this
// file wires the scene into the clock's phases and the settings, and owns taps and drags on the canvas.
//   engine phase  the engine's newest frame goes into the vessel data texture (the scene samples it)
//   camera phase  the scene steps its tweens (shot, highlight, flow marks) and says whether it needs another frame
//   render phase  one gl.render of the cel scene (a useFrame with a render priority, so R3F does not draw its own empty scene)
import { tapFigure } from '../ui/action/tap.ts';
import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Raycaster } from 'three';
import { ClockBridge } from '../clock/r3f.tsx';
import { clock } from '../clock/frame.ts';
import { VesselData, latest } from '../engine/index.ts';
import { useEngine } from '../engine/store.ts';
import { resolveLook } from '../looks/looks.ts';
import { useDeck } from '../state/deck.ts';
import { useSettings } from '../state/settings.ts';
import { figureDpr, msaaFor } from './quality.ts';
import { aaMode } from './post-aa.ts';
import { installShaderGuard } from '../debug/shader-guard.ts';
import { setRenderer } from '../debug/gl-ref.ts';
import { sinusoidTap } from './sinusoid/explain-store.ts';
import { lookCapture } from '../debug/look-hook.ts';
import { lobulePicked } from './lobule/pick-store.ts';
import { lobuleSel } from './lobule/pick.ts';
import { bindOrganSettings } from './organs/organ-settings.ts';
import { bindAtlasSettings } from './atlas-art/index.ts';
import { cel, frames, gesturesRef, sceneApi } from './api.ts';
import { useLens } from './lenses/store.ts';
import { dragToOrbit } from './camera/rig.ts';
import { installTilt } from './camera/tilt-input.ts';
import { reduced } from '../ui/a11y/motion.ts';
import { type GestureTarget, createGestures } from './gesture/controller.ts';
import { type Sel, selectStructure, useSelection } from '../ui/action/selection.ts';
import { tapSelect } from '../ui/action/tap-select.ts';
import { labelHit } from '../ui/action/label-tap.ts';
import { labelAt } from './labels/hit.ts';

const vesselData = new VesselData();
cel.bindData(vesselData.texture);
clock.on('engine', () => { if (vesselData.update(latest.frame, latest.version)) { cel.dataChanged(); clock.invalidate('vessel-data'); } }, 0);
clock.on('tween', (f) => frames.run(f.time), 0);
clock.on('camera', (f) => { if (cel.update(f.time)) clock.invalidate('scene'); }, 0);
export { vesselData };

/** A phone is the small side under 500 CSS px (portrait or landscape): its ink is 0.2 px lighter on organs (spec section 3). */
const isPhone = () => Math.min(innerWidth, innerHeight) < 500;

function SceneBridge() {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const raycaster = useRef(new Raycaster());

  // the one draw of the frame: the cel scene on the R3F renderer (a positive priority stops R3F drawing its own)
  useFrame(() => {
    cel.render(gl);
    lookCapture.run(gl.domElement);   // (the look board reads the canvas in this task, when it asked)
    // the canvas comes in once, with its first drawn frame (until then the page's own ground shows, never the context's black); a reduced-motion viewer gets it at once
    const el = gl.domElement;
    if (el.style.opacity !== '1') { el.style.transition = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'opacity 200ms ease-out'; el.style.opacity = '1'; }
  }, 1);

  useEffect(() => {
    cel.resize(size.width, size.height);
    cel.setPhone(isPhone());
  }, [size.width, size.height]);

  // fail loud, not invisible (WP10): a program the device's driver refuses is drawn plain, and the ?perf bar says so; ?gl borrows this renderer to compile every program once
  useEffect(() => {
    if (gl.domElement.style.opacity !== '1') gl.domElement.style.opacity = '0';   // (comes in with the first drawn frame, below)
    setRenderer(gl);
    const off = installShaderGuard(gl, cel.scene, () => clock.invalidate('shader-failed'), () => [cel.post.material, ...cel.post.dof.materials]);
    return () => { off(); setRenderer(null); };
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

  // look and flow-mark style follow the settings (and the device's light/dark when the look is "System")
  useEffect(() => {
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const paint = () => {
      const look = resolveLook(useSettings.getState().look, dark.matches);
      cel.applyLook(look);
      gl.setClearColor(cel.background);
      clock.invalidate('look');
    };
    paint();
    const un = useSettings.subscribe(paint);
    dark.addEventListener('change', paint);
    return () => { un(); dark.removeEventListener('change', paint); };
  }, [gl]);

  // Settings > Figure depth: Organ depth and Organ fill drive the organs live (the layer eases them on the clock)
  useEffect(() => bindOrganSettings(cel.disease.organs, useSettings, (why) => clock.invalidate(why)), []);

  // Settings > Figure depth > Atlas art: Classic (nothing loaded) or Atlas (the artist's organs and vessel courses, fetched when chosen)
  useEffect(() => bindAtlasSettings(cel.atlas, useSettings), []);

  // Settings > Figure detail caps the pixel ratio; with Sharp while moving off, the figure drops to 1x while a gesture or a camera move runs and comes back sharp when it settles (2D's rule)
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    let was = -1, settle = 0;
    const apply = () => {
      const st = useSettings.getState();
      const moving = !!(cel.rig.isMoving || gesturesRef.current?.active);
      const d = figureDpr(st.figureDetail, st.sharpMoving, moving, window.devicePixelRatio || 1);
      if (d !== was) { was = d; setDpr(d); clock.invalidate('figure-detail'); }
      // (no frame runs once everything has stopped, so a motion that ended between frames is looked at again shortly)
      window.clearTimeout(settle);
      if (moving && !st.sharpMoving) settle = window.setTimeout(apply, 200);
    };
    apply();
    const off = clock.on('camera', apply, 1);
    const un = useSettings.subscribe(apply);
    return () => { off(); un(); window.clearTimeout(settle); };
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
      orbit: () => cel.rig.orbitAngle,
      setOrbit: (rad) => { const changed = cel.rig.setOrbit(rad); if (changed) clock.invalidate('orbit'); return changed; },
      // a tap picks what 2D's does (src/ui/action/tap-select.ts): a vessel, an organ (liver with its lobe, heart, spleen) or the belly's fluid; a tap on nothing puts the selection away
      tap: (x, y, touch) => {
        if (cel.view === 'sinusoid' && sinusoidTap(x, y, useDeck.getState().mode === 'deck')) return;   // (2D's explain rule: a tap on a sinusoid name, in a talk: sinusoid/explain-store.ts)
        if (useDeck.getState().mode !== 'free') return;
        if (cel.view === 'lobule') { const h = cel.pickLobule(x, y, raycaster.current); lobulePicked(h ? lobuleSel(h) : null); return; }   // (the lobule's parts, by 2D's own rule: lobule/pick.ts)
        // a station's label above the figure takes the tap first and opens the structure it stands for (2D's label is a button over the stage: src/ui/action/label-tap.ts)
        const node = cel.view === 'body' ? labelAt(x, y) : null;
        tapSelect((node ? labelHit(node) : null) ?? cel.pickTargetAt(x, y, raycaster.current, !!touch), { picked: cel.highlight.picked, pick: (id) => sceneApi.pick(id), body: cel.view === 'body' });
      },
      picked: () => useSelection.getState().sel,
      setPicked: (sel) => selectStructure(sel as Sel | null),
      // right click and long press open the card of what is under the pointer and never close it (2D's contextmenu)
      context: (x, y, touch) => { const hit = cel.pickTargetAt(x, y, raycaster.current, !!touch); if (hit) tapSelect(hit, { picked: cel.highlight.picked, pick: (id) => sceneApi.pick(id), body: true }, false); },
    }, {
      now: () => performance.now(),
      ask: frames.ask, cancel: frames.cancel,
      timer: (fn, ms) => window.setTimeout(fn, ms), clearTimer: (id) => window.clearTimeout(id),
      reduceMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      locked: () => useDeck.getState().mode === 'deck',   // (in a talk the camera is the slide's: the figure is not turned, panned or zoomed by hand)
      viewport: () => cel.rig.stageSize,
    }, window as unknown as GestureTarget);
    gesturesRef.current = g;
    return () => { g.dispose(); gesturesRef.current = null; };
  }, [gl]);

  // Gentle tilt (camera/tilt.ts): the pointer or the device's orientation turns the figure a few degrees, as an offset added when the camera is written (the hand's state and Fit never see it).
  // Locked (it eases to square) while a gesture runs or the view is not the body; a camera move locks it in the rig itself.
  useEffect(() => {
    const rig = cel.rig;
    rig.tiltGate = { on: () => useSettings.getState().tilt, locked: () => !!gesturesRef.current?.active || cel.view !== 'body' || cel.circuit.t > 0 || useDeck.getState().mode === 'deck' };
    const off = installTilt({
      rig, wake: (tag) => clock.invalidate(tag), on: () => useSettings.getState().tilt, reduced,
      onSwitch: (fn) => { let was = useSettings.getState().tilt; return useSettings.subscribe((s) => { if (s.tilt !== was) { was = s.tilt; fn(was); } }); },
    });
    return () => { off(); rig.tiltGate = null; };
  }, []);

  return null;
}

export function Stage() {
  useEffect(() => { clock.invalidate('stage-mounted'); }, []);
  // the pixel ratio the figure rests at, and so whether the context is multisampled (off from 2x: msaaFor); the canvas is made again only when that answer changes
  const detail = useSettings((s) => s.figureDetail);
  const rest = figureDpr(detail, true, false, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  // (the anti-aliasing pass, the default, does the canvas's job: the context is multisampled only when the address asks for `?aa=msaa`, and then only below 2x)
  const msaa = aaMode() === 'msaa' && msaaFor(rest);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-stage)' as unknown as number, touchAction: 'none' }}>
      <Canvas key={msaa ? 'msaa' : 'no-msaa'} flat frameloop="never" dpr={rest} gl={{ antialias: msaa, alpha: false, stencil: true, powerPreference: 'high-performance' }}>
        <ClockBridge />
        <SceneBridge />
      </Canvas>
    </div>
  );
}
