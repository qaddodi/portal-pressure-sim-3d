#!/usr/bin/env node
// Bakes the organs (src/scene/organs/prepare.ts: the rim, the welds, the smoothed normals, the depth term: about 2 s of CPU on a laptop, the same on every start) into public/anatomy/organs-baked.bin at BUILD time,
// gzipped, so the page reads the finished organs and does none of it. scripts/build.mjs runs it before the bundler; a failure only warns, and the page then builds them live from organs.bin as before.
// `--check` builds nothing and says whether the file on disk is the one for the current inputs (its digest).
// The approved placement's organs (src/scene/anatomy/source.ts PLACED: `?anatomy=new`, re-inflated organs, gut tubes, the caudate egg) bake to their own file, public/anatomy/organs-baked-placed.bin, with their own digest
// (organs-digest.mjs organsDigest(true)), so today's is untouched: this script bakes today's, then runs itself once more with PPS_ANATOMY=placed for those (`--one` bakes only the switch's own).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { organsDigest } from './organs-digest.mjs';

import { bakeSig, isCurrent, writeSig } from './bake-sig.mjs';

const placed = process.env.PPS_ANATOMY === 'placed';
const name = placed ? 'organs-baked-placed.bin' : 'organs-baked.bin';
/** Today's run hands on to the placed one, and its exit code is the worse of the two. */
const andPlaced = (code) => {
  if (placed || process.argv.includes('--one')) process.exit(code);
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2), '--one'], { stdio: 'inherit', env: { ...process.env, PPS_ANATOMY: 'placed' } });
  process.exit(code || (r.status ?? 1));
};
const out = fileURLToPath(new URL(`../public/anatomy/${name}`, import.meta.url));
const digest = organsDigest(placed);
// Plan 50: unchanged inputs (the signature in <out>.sig, on top of the digest the page checks) mean nothing to do.
const sig = bakeSig(fileURLToPath(import.meta.url), ['public/anatomy/organs.bin', 'src/scene/organs/organs-manifest.json', ...(placed ? ['src/scene/anatomy/placement.generated.ts'] : [])]);
if (!process.argv.includes('--check') && !process.argv.includes('--force') && isCurrent([out], sig)) { console.log(`organs: unchanged since the last bake (signature), skipped; digest ${digest}`); andPlaced(0); }
else {
  const { encodeOrgans, decodeOrgans } = await import('../src/scene/organs/baked.ts');
  if (process.argv.includes('--check')) {
    const ok = existsSync(out) && (() => { const b = gunzipSync(readFileSync(out)); return decodeOrgans(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))?.digest === digest; })();
    console.log(ok ? `${name} is for ${digest}` : `${name} is missing or not for ${digest}`);
    andPlaced(ok ? 0 : 1);
  } else {
    const { setOrganData, ORGAN_MESHES } = await import('../src/scene/organs/meshes.ts');
    const { caudateGeometry } = await import('../src/scene/organs/caudate.ts');
    const { prepareOrgans } = await import('../src/scene/organs/prepare.ts');
    const { RAW_IDS } = await import('../src/scene/organs/baked.ts');
    const f = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
    setOrganData(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength));
    const t = Date.now();
    const made = prepareOrgans({ ...ORGAN_MESHES, caudate: caudateGeometry });   // (the page's own table: layer.ts build())
    const raw = encodeOrgans(made, digest, RAW_IDS.map((id) => [id, ORGAN_MESHES[id]()])), gz = gzipSync(raw, { level: 9 });
    writeFileSync(out, gz);
    writeSig([out], sig);
    console.log(`organs${placed ? ' (placed)' : ''}: ${made.length} organs prepared in ${Date.now() - t} ms, ${Math.round(raw.length / 1024)} kB, ${Math.round(gz.length / 1024)} kB gzipped, digest ${digest} -> public/anatomy/${name}`);
    andPlaced(0);
  }
}
