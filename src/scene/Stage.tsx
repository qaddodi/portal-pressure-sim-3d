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
import { cel, sceneApi } from './api.ts';
import { useLens } from './lenses/store.ts';
import { dragToOrbit } from './camera/rig.ts';

const vesselData = new VesselData();
cel.bindData(vesselData.texture);
clock.on('engine', () => { if (vesselData.update(latest.frame, latest.version)) { cel.dataChanged(); clock.invalidate('vessel-data'); } }, 0);
clock.on('camera', (f) => { if (cel.update(f.time)) clock.invalidate('scene'); }, 0);
export { vesselData };

/** A phone is the small side under 500 CSS px (portrait or landscape): its ink is 0.2 px lighter on organs (spec section 3). */
const isPhone = () => Math.min(innerWidth, innerHeight) < 500;
const TAP_PX = 6;

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

  // a tap on a vessel picks it (free play only); a drag turns the figure a little (±25°)
  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number; orbit: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, orbit: cel.rig.orbitAngle, moved: false }; el.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > TAP_PX || Math.abs(e.clientY - down.y) > TAP_PX) down.moved = true;
      if (down.moved && cel.rig.setOrbit(dragToOrbit(down.orbit, dx))) clock.invalidate('orbit');
    };
    const onUp = (e: PointerEvent) => {
      const d = down; down = null;
      if (!d || d.moved || useDeck.getState().mode !== 'free') return;
      const r = el.getBoundingClientRect();
      const hit = cel.pickAt(e.clientX - r.left, e.clientY - r.top, raycaster.current);
      sceneApi.pick(hit && hit === cel.highlight.picked ? null : hit);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', () => { down = null; });
    return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); };
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
