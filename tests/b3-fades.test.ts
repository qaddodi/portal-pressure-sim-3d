// The free ends of the vessels fade as the 2D figure draws them (tables copied from the 2D app): the veins that end in the organ they drain, the hepatic artery's ends, the veins that leave the plate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fadeOf, companionEnd, CAVA_RECEDE, cavaEndSpan } from '../src/scene/vessels/fades.ts';
import { CelScene } from '../src/scene/scene.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';

import { HEP_FADE_IN } from '../src/scene/vessels/fades.ts';
import { alongVeinStretch, startInOrganShare } from '../src/scene/vessels/starts.ts';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';
import { treeOf } from '../src/scene/vessels/liver-branches.ts';
import { alongVein } from '../src/scene/vessels/starts.ts';

test('a vein that ends in its organ fades in from nothing over the 2D share of its length', () => {
  const spl = fadeOf('V_SPL', false)!;
  // (the splenic vein is carried on into the spleen, so its fade-in covers that carried-on stretch: solid where it leaves the organ; see starts.ts)
  assert.deepEqual([spl.mode, spl.from, spl.a0, spl.a1, spl.keep], [1, 0, 0, 1, false]);
  assert.ok(spl.to > 0.05 && spl.to < 0.5, `fade-in covers the stretch inside the spleen (${spl.to})`);
  assert.equal(spl.to, startInOrganShare('V_SPL', EDGE_PATH_2D.V_SPL!));
  for (const id of ['V_INT', 'V_COL', 'V_KID_L', 'LGV_CONF']) assert.ok(fadeOf(id, false), id);
  assert.deepEqual([...fadeOf('LGV_CONF', false)!.connect], ['C1a'], 'the coronary vein fades out at its upper end, never a blunt stub, until the varices are open (Mohammad, 20 Nov)');
});

test('the hepatic artery fades in at its start and its branches out at their ends, in both views', () => {
  const a = fadeOf('A_HEP', true)!, r = fadeOf('A_HR', true)!;
  assert.deepEqual([a.from, a.to, a.a0, a.a1, a.keep], [0, HEP_FADE_IN, 0, 1, true]);
  assert.deepEqual([r.a0, r.a1, r.keep], [1, 0, false]);
  // (the artery runs on to its bed's node: the fade starts where it did along the portal branch, 40% of the old course in, so at that share of the longer one)
  assert.ok(Math.abs(r.from - 0.4 * alongVeinStretch('A_HR', EDGE_PATH_2D)) < 1e-12 && r.from < 0.4 && r.from > 0.2, 'the right artery fades out over the last stretch, as the portal branch beside it does');
});

test('the veins that run on out of the plate fade out down it', () => {
  const d = fadeOf('ILI_IVC', false)!;
  assert.equal(d.mode, 2);
  assert.ok(d.a0 === CAVA_RECEDE && d.a1 === 0 && d.from !== d.to, 'the cava is faint (CAVA_RECEDE) and fades out down the plate');
});

test('the vessels that have a free end in the 2D figure all have a fade in the scene, blended in its zone (and nowhere else)', () => {
  const s = new CelScene();
  const faded = NETWORK.filter((v) => !v.feeder && fadeOf(v.id, v.tone === 'artery'));
  assert.ok(faded.length >= 9);
  for (const v of faded) {
    const o = s.vesselObject(v.id)!;
    assert.equal(o.toon.uniforms.fadeMode!.value > 0, true, v.id);
    assert.equal(o.toon.transparent, true, v.id);
  }
  // a vessel with no fade stays opaque
  assert.equal(s.vesselObject('PV_TRUNK')!.toon.transparent, false);
  assert.equal(s.vesselObject('V_SPL')!.toon.uniforms.fadeMode!.value, 1);
  s.dispose();
});

test('the shader carries the fade into both the body and the ink, and lets go of it in the Circuit', () => {
  assert.match(VESSEL_VS, /vFade = fa;/);
  assert.doesNotMatch(VESSEL_VS, /swell \*= mix\([^;]*fa\)/, 'a fade never thins the tube: full width to the end');
  assert.match(VESSEL_VS, /fa = mix\(fa, 1\.0, circT\)/, "the Circuit lets go of every fade, the artery's too: no vessel is faint on the map");
  assert.match(VESSEL_FS, /gl_FragColor = vec4\(c, fadeHere \* cavA\);/, 'the body fades by its alpha');
  assert.match(VESSEL_FS, /c = mix\(c, mix\(inkH, inkColorCirc, circT\), inkT\);[\s\S]*gl_FragColor = vec4\(c, fadeHere \* cavA\);/, 'the outline is painted into the body\'s colour, so it has the body\'s alpha: no ink ring floats at a faded end');
});

test('the superior cava runs into the right atrium as solid as the inferior cava meets it: no fade to 0.3 at the atrium (a hard step in colour there)', () => {
  for (const id of ['SVC_RA', 'SVC_RA_1']) { const f = fadeOf(id, false); assert.ok(!f || !f.ivcJoin, `${id} is the cava, not a vein joining it`); }
});

test('the renal veins are drawn receded: a constant share of their opacity along their whole length, blended with the fade they already have', async () => {
  const { fadeOf, RECEDE } = await import('../src/scene/vessels/fades.ts');
  for (const id of Object.keys(RECEDE)) {
    const f = fadeOf(id, false);
    assert.ok(f, `${id} has a fade`);
    assert.ok(f!.a0 <= RECEDE[id]! + 1e-9 && f!.a1 <= RECEDE[id]! + 1e-9 && Math.max(f!.a0, f!.a1) > 0.3, `${id} is at most ${RECEDE[id]} opaque, never a step`);
  }
});

test('the cava is a background vessel: faint everywhere but where the superior cava arrives whole, the hepatic veins ease to its alpha at its wall, and all of it rises to whole when the cava is named', () => {
  for (const id of ['IVC_IS', 'IVC_IS_1']) { const f = fadeOf(id, false)!; assert.ok(f && f.a0 === CAVA_RECEDE && f.a1 === CAVA_RECEDE, id); }
  const ra = fadeOf('IVCS_RA', false)!;
  assert.deepEqual([ra.a0, ra.a1], [CAVA_RECEDE, 1], 'it climbs back to full at the right atrium');
  for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']) { assert.equal(cavaEndSpan(id), 0, `${id} has no end ramp: it is a solid vein to the cava's wall (Mohammad, 20 Nov: a pale, flat, see-through wedge)`); assert.equal(fadeOf(id, false)!.a1, 1, `${id} keeps its opacity to the wall`); }
  assert.equal(cavaEndSpan('RHV_IVC_1'), 0, 'the first piece of the right hepatic vein ends at the TIPS junction, mid-vein: it is not a vein into the cava (a rule keyed by the vein\'s name broke its outline at the join)');
  assert.equal(cavaEndSpan('PV_TRUNK'), 0);
  assert.equal(cavaEndSpan('LRV_IVC'), 0, 'the renal veins are receded to the same tone already');
  const s = new CelScene();
  const u = (id: string) => s.vesselObject(id)!.toon.uniforms as unknown as { fadeA: { value: { z: number; w: number } }; cavaEnd: { value: { x: number; y: number } } };
  assert.equal(u('RHV_IVC').cavaEnd.value.x, 0, 'no end ramp on a vein into the cava');
  assert.ok(Math.abs(u('IVC_IS').fadeA.value.z - CAVA_RECEDE) < 1e-9, 'the cava rests faint');
  s.setNamedVessels(['IVC_IS']);
  for (let t = 0; t <= 3000; t += 16) s.update(t);
  assert.ok(u('IVC_IS').fadeA.value.z > 0.999 && u('IVC_IS').fadeA.value.w > 0.999 && u('RHV_IVC').cavaEnd.value.y > 0.999, 'named, the cava and the hepatic ends are whole');
  s.dispose();
});

test('a lobar artery is gone where the portal branch it runs beside is gone: its fade ends at its companion\'s end, not at its bed (Mohammad, 20 Nov: "fade them earlier")', () => {
  for (const [a, host] of [['A_HR', 'PVH_R_2'], ['A_HL', 'PVH_L_1']] as const) {
    const f = fadeOf(a, true)!, hf = fadeOf(host, false)!, art = alongVein(a, EDGE_PATH_2D)!, th = treeOf(host)!.through;
    assert.equal(f.to, companionEnd(a));
    assert.ok(f.to < 0.95 && f.to > f.from + 0.05, `${a} ends its fade before its bed's node (${f.to}), over a real stretch (from ${f.from})`);
    // the artery's point at the end of its fade lies at the portal branch's point where it reaches nothing (within the gap the artery keeps beside the vein, 8 units, and its drift toward its bed), so neither outlives the other
    const pa = art[Math.round(f.to * (art.length - 1))]!, pv = th[Math.round(hf.to * (th.length - 1))]!;
    assert.ok(Math.hypot(pa[0] - pv[0], pa[1] - pv[1]) < 20, `${a} ends beside ${host}'s fade end`);
    assert.equal(f.a1, 0, 'it fades to nothing, so what is left past it is not drawn (no dotted stub)');
  }
});
