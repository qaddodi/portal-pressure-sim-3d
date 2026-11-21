// ?gl > "Throw a fault" (the preview copy and a local run only): throws uncaught errors from timers and one unhandled rejection, so the global error net (boot/crash-net.ts) can be tried on a phone:
// enough of them inside its window show the "Something went wrong behind the scenes" note with Reload, Copy details and Keep going. The faults are named as a test in the report.
import { BROKEN_COUNT } from '../boot/crash-net.ts';

import { clock } from '../clock/frame.ts';
export const TEST_FAULT = 'Test fault from ?gl';
/** Throws BROKEN_COUNT uncaught errors from timers (a handler's own failure, which no boundary sees), the last of them an unhandled rejection. Returns how many it started. */
export function throwFaults(later: (fn: () => void, ms: number) => unknown = (fn, ms) => clock.after(fn, ms)): number {
  for (let i = 1; i <= BROKEN_COUNT; i++) {
    later(() => { if (i === BROKEN_COUNT) void Promise.reject(new Error(`${TEST_FAULT} (${i}/${BROKEN_COUNT}, a rejected promise)`)); else throw new Error(`${TEST_FAULT} (${i}/${BROKEN_COUNT}, a timer)`); }, i * 150);
  }
  return BROKEN_COUNT;
}
