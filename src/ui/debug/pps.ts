// `window.pps`: the one handle the debug tools hang their functions on (the 2D app's `pps.*`), so a play-test thread on the owner's Mac can call them from the console
// (`pps.packet()`, `pps.watch.findings()`, `pps.report()`). Only the debug mount fills it, so the live site has none.
export type Pps = Record<string, unknown>;
export function pps(win: Window & { pps?: Pps } = window as Window & { pps?: Pps }): Pps { return (win.pps ??= {}); }
export function attach(name: string, value: unknown, win?: Window & { pps?: Pps }): void { pps(win)[name] = value; }
