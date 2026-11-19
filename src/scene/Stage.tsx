// The R3F canvas around the cel scene. Frames are drawn only by the one clock (ClockBridge calls R3F's advance() in the render phase); this
// file wires the scene into the clock's phases and the settings, and owns taps and drags on the canvas.
//   engine phase  the engine's newest frame goes into the vessel data texture (the scene samples it)
//   camera phase  the scene steps its tweens (shot, highlight, flow marks) and says whether it needs another frame
//   render phase  one gl.render of the cel scene (a useFrame with a render priority, so R3F does not draw its own empty scene)
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
import { cel, frames, gesturesRef, sceneApi } from './api.ts';
import { useLens } from './lenses/store.ts';
import { dragToOrbit } from './camera/rig.ts';
import { type GestureTarget, createGestures } from './gesture/controller.ts';

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
  useFrame(() => { cel.render(gl); }, 1);

  useEffect(() => {
    cel.resize(size.width, size.height);
    cel.setPhone(isPhone());
  }, [size.width, size.height]);

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
      cel.setFlowMode(useSettings.getState().flowMarks);
      clock.invalidate('look');
    };
    paint();
    const un = useSettings.subscribe(paint);
    dark.addEventListener('change', paint);
    return () => { un(); dark.removeEventListener('change', paint); };
  }, [gl]);

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
      tap: (x, y) => {
        if (useDeck.getState().mode !== 'free') return;
        const hit = cel.pickAt(x, y, raycaster.current);
        sceneApi.pick(hit && hit === cel.highlight.picked ? null : hit);
      },
      picked: () => cel.highlight.picked,
      setPicked: (id) => sceneApi.pick(id),
      context: (x, y) => { const hit = cel.pickAt(x, y, raycaster.current); if (hit) sceneApi.pick(hit); },
    }, {
      now: () => performance.now(),
      ask: frames.ask, cancel: frames.cancel,
      timer: (fn, ms) => window.setTimeout(fn, ms), clearTimer: (id) => window.clearTimeout(id),
      reduceMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      viewport: () => cel.rig.stageSize,
    }, window as unknown as GestureTarget);
    gesturesRef.current = g;
    return () => { g.dispose(); gesturesRef.current = null; };
  }, [gl]);

  return null;
}

export function Stage() {
  useEffect(() => { clock.invalidate('stage-mounted'); }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-stage)' as unknown as number, touchAction: 'none' }}>
      <Canvas flat frameloop="never" dpr={[1, 2]} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}>
        <ClockBridge />
        <SceneBridge />
      </Canvas>
    </div>
  );
}
