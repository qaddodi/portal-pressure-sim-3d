// What exists, read from the app in node: the talks with their slide counts, the cases, lenses, looks and sizes (the `World` the request is resolved against, src/ui/debug/request/resolve.ts),
// and which build this is. Nothing here starts a browser.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export async function readWorld() {
  const { appWorld } = await import('../../src/ui/debug/request/world.ts');
  return appWorld();
}

const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; } };
/** The build the run is of: commit, branch, the engine pin, and whether tracked files differ from the commit. */
export function readBuild() {
  const pin = JSON.parse(readFileSync(`${ROOT}src/engine/PINNED.json`, 'utf8'));
  return { commit: git('rev-parse', 'HEAD') || 'unknown', branch: git('rev-parse', '--abbrev-ref', 'HEAD') || 'unknown', engine: pin.engine?.commit ?? 'unknown', dirty: git('status', '--porcelain', '--untracked-files=no') !== '' };
}
