// What a bake remembers of each junction's remesh ladder (src/scene/vessels/net/junction/mesh.ts `ladderKey`): the rung that took, by a digest of everything the build reads. A rung that folds costs its whole remesh to find out
// (about half the net bake), so the same build starts on the rung that took last time; the meshes are the same. The file is committed so a cold checkout (the deploy) keeps the saving; it is tied to the mesher's source text, so
// editing the remesher empties it and the next bake relearns it (tests/net-ladder.test.ts fails until the new file is committed).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('../src/scene/vessels/net/junction/', import.meta.url);
const FILE = fileURLToPath(new URL('./net-ladder.json', import.meta.url));
export const LADDER_SOURCES = ['mesh.ts', 'sheet.ts', 'sheet-caps.ts', 'sdf.ts'];

/** A hash of the remesher's source text: a change to it can change which rung a junction needs. */
export function sourceHash() {
  const h = createHash('sha1');
  for (const f of LADDER_SOURCES) h.update(f).update(readFileSync(fileURLToPath(new URL(f, dir))));
  return h.digest('hex').slice(0, 16);
}
/** The saved file as `{ code, rungs }`, or an empty one when it is missing. */
export function readLadderFile() {
  try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return { code: '', rungs: {} }; }
}
/** The ladder memory for a bake: the saved rungs when they are for this source, else none. */
export function loadLadder() {
  const f = readLadderFile();
  return new Map(f.code === sourceHash() ? Object.entries(f.rungs) : []);
}
/** Write the memory back (sorted, so the file is stable); only rungs above 0 are kept: rung 0 is where a build starts anyway. */
export function saveLadder(map) {
  const rungs = Object.fromEntries([...map].filter(([, r]) => r > 0).sort(([a], [b]) => (a < b ? -1 : 1)));
  const next = JSON.stringify({ code: sourceHash(), rungs }, null, 1) + '\n';
  if (!existsSync(FILE) || readFileSync(FILE, 'utf8') !== next) { writeFileSync(FILE, next); return true; }
  return false;
}
