// The bridge between React Three Fiber and the one clock. The Canvas is created with frameloop="never"; this component, mounted inside
// it, draws a frame (R3F's advance(): useFrame subscribers, then the render) in the clock's render phase and nowhere else, and asks
// for a frame when the canvas is resized or its context comes back.
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { clock } from './frame.ts';

export function ClockBridge() {
  const advance = useThree((s) => s.advance);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  useEffect(() => clock.on('render', (f) => advance(f.time / 1000), 0), [advance]);
  useEffect(() => { clock.invalidate('resize'); }, [size.width, size.height]);
  useEffect(() => {
    const el = gl.domElement;
    const again = () => clock.invalidate('context-restored');
    el.addEventListener('webglcontextrestored', again);
    return () => el.removeEventListener('webglcontextrestored', again);
  }, [gl]);
  return null;
}
