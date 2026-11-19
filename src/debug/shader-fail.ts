// A shader the driver refused, remembered for the page: the ?perf bar's red pill, the ?gl page and the bug packet read it. Pure (no three.js, no DOM), so a node test loads it.
// The guard that fills it is shader-guard.ts; a program is reported once, however many meshes wore it.
export interface ShaderFailure {
  /** what broke, for the pill: 'vessel' for a tube's program, else the material's name */
  kind: string;
  /** how many meshes were drawing with it (they are drawn plain now) */
  meshes: number;
  /** the driver's own words, trimmed */
  log: string;
  at: number;
}

const failures: ShaderFailure[] = [];
const listeners = new Set<() => void>();

export function reportShaderFailure(f: Omit<ShaderFailure, 'at'>, now = Date.now()): void {
  failures.push({ ...f, log: f.log.slice(0, 1200), at: now });
  for (const l of [...listeners]) l();
}
export const shaderFailures = (): readonly ShaderFailure[] => failures;
export function clearShaderFailures(): void { failures.length = 0; for (const l of [...listeners]) l(); }
export function onShaderFailure(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** The words on the pill, 'vessel shader failed: 2'; '' when nothing failed. One item per kind, counting programs. */
export function shaderFailureLine(list: readonly ShaderFailure[] = failures): string {
  const by = new Map<string, number>();
  for (const f of list) by.set(f.kind, (by.get(f.kind) ?? 0) + 1);
  return [...by].map(([k, n]) => `${k} shader failed: ${n}`).join(' · ');
}
