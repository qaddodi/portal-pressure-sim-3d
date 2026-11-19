// The R3F canvas. The scene thread owns this file and everything under src/scene/. This placeholder shows the contract:
//   • frameloop="never": the ONE clock draws (ClockBridge), only when something moved
//   • the vessel data texture is filled in the clock's engine phase (VesselData.update), and the scene reads it
import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { ClockBridge } from '../clock/r3f.tsx';
import { clock } from '../clock/frame.ts';
import { VesselData, latest } from '../engine/index.ts';

const vesselData = new VesselData();
clock.on('engine', () => { if (vesselData.update(latest.frame, latest.version)) clock.invalidate('vessel-data'); }, 0);
export { vesselData };

export function Stage() {
  useEffect(() => { clock.invalidate('stage-mounted'); }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-stage)' as unknown as number }}>
      <Canvas frameloop="never" dpr={[1, 2]} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} camera={{ position: [0, 0, 6], fov: 35 }}>
        <ClockBridge />
        <mesh>
          <icosahedronGeometry args={[1, 3]} />
          <meshBasicMaterial color="#B8326F" />
        </mesh>
      </Canvas>
    </div>
  );
}
