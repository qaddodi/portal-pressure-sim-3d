#!/usr/bin/env node
// Bakes the Lobule's weld plan (src/scene/lobule/welds.ts) into public/lobule/welds.bin at BUILD time, so a phone plans nothing: it fetches this one file (gzip) and unpacks it. About ten seconds
// of CPU here. The build runs it before the bundler (scripts/build.mjs); a failure only warns, and the page then plans in a worker as before. `--check` plans nothing and only says whether
// the file on disk is the one for the current network (its digest).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/lobule/welds.bin', import.meta.url));
const { createShared } = await import('../src/scene/materials/cel.ts');
const { LobuleView } = await import('../src/scene/lobule/view.ts');
const { weldRequest } = await import('../src/scene/micro3d/lobule3d.ts');
const { planWelds } = await import('../src/scene/lobule/welds.ts');
const { encodePlan, decodePlan, weldDigest } = await import('../src/scene/lobule/weld-codec.ts');

const req = weldRequest(new LobuleView(createShared()).net), digest = weldDigest(req);
if (process.argv.includes('--check')) {
  const ok = existsSync(out) && (() => { const b = gunzipSync(readFileSync(out)); return !!decodePlan(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), digest); })();
  console.log(ok ? 'baked welds: current' : 'baked welds: missing or for other numbers');
  process.exit(ok ? 0 : 1);
}
const t = Date.now(), plan = planWelds(req.courses, { avoid: req.avoid });
mkdirSync(fileURLToPath(new URL('../public/lobule/', import.meta.url)), { recursive: true });
const gz = gzipSync(encodePlan(plan, digest), { level: 9 });
writeFileSync(out, gz);
console.log(`baked welds: ${plan.skins.length} skins, ${plan.skipped.length} left as tubes, ${(gz.length / 1048576).toFixed(2)} MB gzip, ${((Date.now() - t) / 1000).toFixed(1)} s`);
process.exit(0);
