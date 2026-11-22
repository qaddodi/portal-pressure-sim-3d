// The `.visible =` ratchet (polish C, 22 Nov 2026). A scene object that is switched with a raw boolean pops in and out in one frame; DeviceObject.show / setAlpha ease it (devices/device-object.ts).
// This counts the raw `.visible =` writes per file under src/scene (comments left out) and compares them with scripts/visible-allowance.json: a count may fall, never rise.
//   node scripts/visible-ratchet.mjs            prints the counts that are above their allowance (exit 1) and the ones below it
//   node scripts/visible-ratchet.mjs --update   writes the allowance down to today's counts (it never writes one up)
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ALLOW = join(ROOT, 'scripts', 'visible-allowance.json');

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
export function countVisible(src) { return (strip(src).match(/\.visible\s*=(?!=)/g) || []).length; }

function walk(dir, out) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js)$/.test(n)) out.push(p);
  }
  return out;
}
/** { 'src/scene/…': count } for every file under src/scene that writes `.visible =` at least once. */
export function countAll(root = ROOT) {
  const counts = {};
  for (const f of walk(join(root, 'src', 'scene'), [])) {
    const n = countVisible(readFileSync(f, 'utf8'));
    if (n) counts[relative(root, f).split('\\').join('/')] = n;
  }
  return counts;
}
export const readAllowance = () => JSON.parse(readFileSync(ALLOW, 'utf8'));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const now = countAll(), was = readAllowance(), over = [], under = [];
  for (const f of new Set([...Object.keys(now), ...Object.keys(was)])) {
    const a = was[f] ?? 0, n = now[f] ?? 0;
    if (n > a) over.push(`${f}: ${n} > ${a}`); else if (n < a) under.push(`${f}: ${n} < ${a}`);
  }
  if (process.argv.includes('--update')) {
    const next = {};
    for (const f of Object.keys(now).sort()) next[f] = Math.min(now[f], was[f] ?? now[f]);
    writeFileSync(ALLOW, JSON.stringify(next, null, 2) + '\n');
    console.log(`wrote ${Object.keys(next).length} files, ${Object.values(next).reduce((a, b) => a + b, 0)} writes`);
  } else {
    for (const u of under) console.log(`below its allowance (run --update to lower it): ${u}`);
    for (const o of over) console.log(`ABOVE its allowance: ${o}`);
    process.exit(over.length ? 1 : 0);
  }
}
