// three.js's own console messages, sent through one place so the two a dependency makes on every page load can be named and dropped, and nothing else is.
//
// React Three Fiber 9.8.2 (the latest 9.x) builds a `THREE.Clock` in every store (`createStore`: `clock: new THREE.Clock()`), and three.js 0.187 warns that Clock is deprecated for
// Timer (r183) each time one is made. The app never reads that clock: it draws with `frameloop="never"`, hands R3F the page's own time (`clock.now()`, src/clock/frame.ts) and
// takes frames from `<ClockBridge/>`. The warning is therefore the library's, not ours, and there is no app code to change; it goes away when R3F stops making a Clock (v10).
// Every other three.js message (log, warn, error) goes to the console exactly as three.js would send it.
import { setConsoleFunction } from 'three';

/** The library messages known to be R3F's own and harmless here. Exact start of the text, so a Clock made by our own code would still be told. */
export const KNOWN_LIBRARY_NOISE: readonly string[] = ['THREE.Clock: This module has been deprecated'];

type Kind = 'log' | 'warn' | 'error';
interface Sink { log(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void }

/** Three.js's default routing, plus the drop: a stack trace as the first extra goes out as the error it carries (what three.js does itself). */
export function threeConsole(sink: Sink = console): (kind: Kind, message: string, ...rest: unknown[]) => void {
  return (kind, message, ...rest) => {
    if (kind === 'warn' && KNOWN_LIBRARY_NOISE.some((k) => message.startsWith(k))) return;
    const trace = rest[0] as { isStackTrace?: boolean; getError?: (m: string) => unknown } | undefined;
    if (kind !== 'log' && trace?.isStackTrace && trace.getError) sink[kind](trace.getError(message));
    else sink[kind](message, ...rest);
  };
}

let routed = false;
/** Called once, before the first R3F store is made (Stage.tsx imports this file ahead of its Canvas). */
export function routeThreeConsole(): void {
  if (routed) return;
  routed = true;
  // (the sink is looked up at each message, so a console the page has wrapped later, boot/crash-net.ts, still sees it)
  setConsoleFunction((kind, message, ...rest) => threeConsole(console)(kind as Kind, message as string, ...rest));
}
routeThreeConsole();
