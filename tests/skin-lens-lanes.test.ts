// Mohammad, 20 Nov: "this lens is broken now" (the Origin lens, slide 2): the junction skins drew solid SMV orange where the tubes draw the lens's lanes (SMV orange, IMV teal, spleen purple side by side ACROSS the vessel), so the portal
// vein was one orange band with stripes on the short tube pieces between the skins, a pink smear at the SV/SMV confluence and a hard colour cut where the splenic purple met it. Root cause (skin/shaders.ts): the body colour asked the lens for the
// lane at across 0.0, the centre of every arm, as if a skin had no across. The Blood origin and First pass lenses are lane lenses; the pressure, oxygen and other lenses are ramps along the vessel and never read across. Each arm's lane
// colour is now read at that arm's own across (the dot of the normal with the arm's side, the tube's own rule), and the arms are blended by weight, so on a seam ring (one weight 1) the skin is the tube's pixel and the lanes run on
// through the junction. A shader cannot run here, so the invariant is held as the rule the two stages share: no program asks a lens for a constant across, the skin's across and its derivative are taken in the uniform block before the first
// discard (whatever marks are left out), and both lens sets read them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
const ROOT = new URL('../src/', import.meta.url).pathname.replace(/\/$/, '');

test('no program asks a lens for a constant across: a lane lens reads the place across the vessel in every stage that draws a vessel', () => {
  let calls = 0;
  for (const f of walk(ROOT)) {
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/lensOfAt\(([^;]*?)\)(?=[,;\s])/g)) {
      if (!/lensGrad[AB]|grad,/.test(m[1]!)) continue;
      calls++;
      const across = m[1]!.split(',').pop()!.trim();
      assert.ok(!/^-?[0-9.]+$/.test(across), `${f.replace(ROOT, 'src')}: lensOfAt(...) is given a constant across (${across}): a skin or a tube would draw the lane's middle at every pixel`);
    }
  }
  assert.ok(calls >= 4, `${calls} lens calls found`);
});

test('the skin reads each arm\'s lane at that arm\'s own across, for both lens sets, with the lane edge softness from a derivative taken before the first discard and whatever marks are left out', () => {
  const calls = [...SKIN_FS.matchAll(/lensOfAt\(armData\[i\]\.w, armAF\[i\]\.x, lensGrad([AB]), lensLane\1, lensMode\1, laneCol\1, acA\[i\]\)/g)];
  assert.equal(calls.length, 2, 'both lens sets are read at acA[i]');
  assert.match(SKIN_FS, /lensAcrossFw = fwLn\[i\];\s*\n\s*vec4 la = lensOfAt/, 'the lane edge is softened by this arm\'s own derivative');
  const main = SKIN_FS.indexOf('void main()'), first = SKIN_FS.indexOf('discard;', main), block = SKIN_FS.indexOf('fwLn[i] = fwidth(acA[i] * 0.5 + 0.5)');   // (the first discard in main: the inspector's DROP macro above it holds one)
  assert.ok(main > 0 && block > main && block < first, 'the across derivative is taken in the top block, before the first discard (a derivative after a discard is garbage on a device that drops the lane)');
  // the block is outside the marks' ifdef: with ?joins=nomarks the lanes must still run through the skin
  const open = SKIN_FS.lastIndexOf('#ifndef SKIN_NOMARKS', block), close = SKIN_FS.indexOf('#endif', open);
  assert.ok(open < 0 || close < block || open < main, 'the across block is not inside #ifndef SKIN_NOMARKS');
  assert.ok(!/lensOfAt\([^)]*, 0\.0\)/.test(SKIN_FS), 'no lane read at a constant');
});
