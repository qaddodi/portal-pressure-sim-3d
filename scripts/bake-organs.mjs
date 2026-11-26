#!/usr/bin/env node
// Bakes the organs (src/scene/organs/prepare.ts: the rim, the welds, the smoothed normals, the depth term: about 2 s of CPU on a laptop, the same on every start) into public/anatomy/organs-baked.bin at BUILD time,
// gzipped, so the page reads the finished organs and does none of it. scripts/build.mjs runs it before the bundler; a failure only warns, and the page then builds them live from organs.bin as before.
// `--check` builds nothing and says whether the file on disk is the one for the current inputs (its digest).
// The organs are the approved placement's (re-inflated organs, gut tubes, the caudate egg; docs/approved/anatomy-placement.md), with the digest of every input that makes them (organs-digest.mjs).
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { BAKED_ORGANS_FILE, ORGAN_DATA, bakedOrgansCurrent, organsDigest } from './organs-digest.mjs';

import { bakeSig, isCurrent, writeSig } from './bake-sig.mjs';

const name = 'organs-baked.bin';
const out = BAKED_ORGANS_FILE;
const digest = organsDigest();
// Plan 50: unchanged inputs (the signature in <out>.sig, on top of the digest the page checks) mean nothing to do.
const sig = bakeSig(fileURLToPath(import.meta.url), ORGAN_DATA);
const { encodeOrgans } = await import('../src/scene/organs/baked.ts');
// (whether the file on disk carries this build's digest: what the page itself checks, meshes.ts, so a skip can never ship a file the page throws away)
const current = () => bakedOrgansCurrent(digest);
// (the signature alone is never trusted: the skip also asks the page's own question, a fraction of a second)
if (!process.argv.includes('--check') && !process.argv.includes('--force') && isCurrent([out], sig) && (await current())) { console.log(`organs: unchanged since the last bake (signature and digest), skipped; digest ${digest}`); process.exit(0); }
else {
  if (process.argv.includes('--check')) {
    const ok = await current();
    console.log(ok ? `${name} is for ${digest}` : `${name} is missing or not for ${digest}`);
    process.exit(ok ? 0 : 1);
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
    console.log(`organs: ${made.length} organs prepared in ${Date.now() - t} ms, ${Math.round(raw.length / 1024)} kB, ${Math.round(gz.length / 1024)} kB gzipped, digest ${digest} -> public/anatomy/${name}`);
    process.exit(0);
  }
}
