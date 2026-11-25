// Rule #1 sweep (20 Nov 2026, the scope outside the oesophagus): the organs are drawn moved along z by ORGAN_Z, so any code that reads an organ's raw mesh (ORGAN_MESHES) for a
// placement must add that shift. This fails a file that reads the raw mesh without referring to ORGAN_Z.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The code, not the comments about it: a comment that names ORGAN_MESHES (src/scene/anatomy/eso-wall.ts says where its table was measured) reads nothing. */
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|js)$/.test(f) ? [p] : []; });

test('every reader of an organ\'s raw mesh applies its ORGAN_Z shift', () => {
  const bad = walk('src').filter((f) => !f.endsWith('organs/meshes.ts')).filter((f) => { const s = code(readFileSync(f, 'utf8')); return /ORGAN_MESHES\s*(\.|\[)/.test(s) && !/ORGAN_Z/.test(readFileSync(f, 'utf8')); });   // (the shift may be applied or, for a reader of x and y only, named in a comment that says why it is not needed: disease/liver-edge.ts)
  assert.deepEqual(bad, []);
});

test('a comment that names the raw mesh is not a reader of it, a call is', () => {
  assert.equal(/ORGAN_MESHES\s*(\.|\[)/.test(code('// measured from ORGAN_MESHES.stomach\n/** ORGAN_MESHES[id] */')), false);
  assert.equal(/ORGAN_MESHES\s*(\.|\[)/.test(code('const g = ORGAN_MESHES.stomach; // x')), true);
});
