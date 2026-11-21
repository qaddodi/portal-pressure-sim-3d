import { clock } from '../clock/frame.ts';
// ?gl > "Lose context": drops the scene's WebGL context through WEBGL_lose_context and gives it back after a wait, so the recovery (scene/context-loss.ts) can be tried on a phone without waiting for the system to do it.
export const LOSE_MS = 2000;
interface LoseExt { loseContext(): void; restoreContext(): void }
export interface LoseGl { getExtension(name: string): unknown }
/** Loses the context now and restores it `ms` later. Returns false where the browser has no such extension. */
export function loseContextFor(gl: LoseGl | null | undefined, ms = LOSE_MS, later: (fn: () => void, ms: number) => unknown = (fn, t) => clock.after(fn, t)): boolean {
  const ext = gl?.getExtension('WEBGL_lose_context') as LoseExt | null | undefined;
  if (!ext) return false;
  ext.loseContext();
  later(() => ext.restoreContext(), ms);
  return true;
}
