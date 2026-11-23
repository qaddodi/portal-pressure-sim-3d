// Plays the five model patients' courses (src/ui/histories/courses.ts) on the vendored engine and writes what the Histories tab loads:
//   src/ui/histories/baked/<id>.generated.ts   one history: the days the chart draws, History's entries, the model's state today (a snapshot the worker restores)
//   src/ui/histories/index.generated.ts        what the menu keeps eagerly: each row, its little course, and the loaders of the baked files
// Usage: node scripts/gen-histories.mjs        (tests/histories-baked.test.ts plays the courses again and fails when these files differ: run this after a course or an engine re-sync)
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COURSES } from '../src/ui/histories/courses.ts';
import { playCourse, metaOf } from '../src/ui/histories/play.ts';
import { render } from '../src/ui/histories/render.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'src/ui/histories');
mkdirSync(resolve(out, 'baked'), { recursive: true });
const files = render(COURSES.map((c) => { const b = playCourse(c); return { c, b, meta: metaOf(c, b) }; }));
for (const [name, text] of Object.entries(files)) { writeFileSync(resolve(out, name), text); console.log('wrote', name, text.length); }
