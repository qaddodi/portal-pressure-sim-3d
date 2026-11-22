// A hand-turned clock for the tests that watch device parts fade (DeviceObject.show: 240 ms; a part is out of the draw list only when it has faded). `import` it for its effect: the clock is installed on DeviceObject;
// `fadeFrames(n)` turns n frames of 16 ms.
import { createClock, type Env } from '../src/clock/frame.ts';
import { DeviceObject } from '../src/scene/devices/device-object.ts';

let t = 1000, id = 0;
const q = new Map<number, (t: number) => void>();
const env: Env = { raf: (cb) => { q.set(++id, cb); return id; }, cancel: (i) => { q.delete(i); }, now: () => t };
DeviceObject.clock = createClock(env);
export const fadeFrames = (n = 25): void => { for (let i = 0; i < n; i++) { t += 16; const cbs = [...q.values()]; q.clear(); cbs.forEach((cb) => cb(t)); } };
