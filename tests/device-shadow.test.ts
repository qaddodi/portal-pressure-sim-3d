// The soft contact shadow under the catheters, the balloon tube, the stent sleeve and the scopes (Mohammad, 21 Nov 2026: "a soft shadow under the catheter and the scopes onto the tissue so it gives it some depth").
// No shadow map: the part's own tube drawn once more, before the devices, blurred, pushed away from the light, low in alpha. These pin that it is cheap, soft, eased, shared with the device's own fades, and a switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { DEVICE_RENDER_ORDER, DeviceObject } from '../src/scene/devices/device-object.ts';
import { ContactShadow, SHADOW_ALPHA, shadowColour } from '../src/scene/devices/contact-shadow.ts';
import { LOOKS, LOOK_IDS } from '../src/looks/looks.ts';
import { PALETTES } from '../src/scene/palette.ts';
import { ProcCatheter } from '../src/scene/devices/catheters/proc-catheter.ts';
import { EndoScope } from '../src/scene/devices/probes/scope.ts';
import { Tamponade } from '../src/scene/devices/balloons/tamponade.ts';
import { StentDevice } from '../src/scene/devices/stent/stent-device.ts';
import { route3d } from '../src/scene/procedures/route3d.ts';
import { DEFAULTS, DEPTH_KEYS, parseSettings, FIGURE_SETTINGS_VERSION as V } from '../src/state/settings.ts';
import { DEPTH_ROWS } from '../src/ui/settings/depth-rows.ts';

const tube = (): BufferGeometry => { const g = new CylinderGeometry(1, 1, 10, 12, 4).rotateZ(Math.PI / 2); g.setAttribute('tang', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 3), 3)); return g; };

test('a part with a shadow radius draws its tube once more, under every device, with no depth test and no depth write', () => {
  const sh = createShared(), o = new DeviceObject(tube(), 'poly', sh, { order: 9, shadow: 0.5 });
  assert.ok(o.shadow instanceof ContactShadow);
  assert.ok(o.group.children.includes(o.shadow.mesh));
  assert.ok(o.shadow.mesh.renderOrder < DEVICE_RENDER_ORDER, 'below the first device, whatever its order');
  assert.ok(o.shadow.mesh.renderOrder > 100, 'but above the anatomy');
  const m = o.shadow.material;
  assert.equal(m.transparent, true); assert.equal(m.depthTest, false); assert.equal(m.depthWrite, false);
  assert.equal(o.shadow.mesh.geometry, o.toonMesh.geometry, 'the same geometry: no copy, no second mesh to build');
  assert.equal(new DeviceObject(tube(), 'poly', sh, { order: 1 }).shadow, null, 'a part without a radius casts none');
});

test('it is soft: alpha falls to nothing at the tube edge (n.v), is capped low, and the strip is blurred and pushed away from the upper-left light', () => {
  const sh = createShared(), o = new DeviceObject(tube(), 'poly', sh, { shadow: 0.5 });
  const m = o.shadow!.material;
  assert.match(m.fragmentShader, /pow\(clamp\(vNV, 0\.0, 1\.0\), 2\.2\)/, 'the edge falls off by n.v');
  assert.match(m.vertexShader, /fatN \* blurPx/, 'blurred in screen px');
  assert.doesNotMatch(m.fragmentShader, /\bstep\(/, 'no hard step in the shadow');
  assert.ok(SHADOW_ALPHA.light <= 0.15 && SHADOW_ALPHA.dark <= 0.25, 'low opacity');
  const push = m.uniforms.push!.value as { x: number; y: number };
  assert.ok(push.x > 0 && push.y < 0, 'down and to the right on screen, away from the light at the upper left');
  assert.ok(m.uniforms.grow!.value as number > 0 && (m.uniforms.blurPx!.value as number) > 0);
});

test('it follows the device: the same tail fade, hole, reveal and dissolve, its alpha with the device\'s, so it never pops', () => {
  const sh = createShared(), o = new DeviceObject(tube(), 'poly', sh, { shadow: 0.5 });
  const u = o.shadow!.material.uniforms;
  for (const k of ['tailFade', 'holeU', 'reveal', 'fade']) assert.equal(u[k], o.toon.uniforms[k], `${k} is the device's own uniform`);
  o.setTailFade(0.3); assert.equal(u.tailFade!.value, 0.3);
  o.setReveal(0.4); assert.equal(u.reveal!.value, 0.4);
  o.setFade(0.5); assert.equal(u.fade!.value, 0.5);
  o.setAlpha(0.6); assert.equal(u.alpha!.value, 0.6); assert.equal(o.shadow!.mesh.visible, true);
  o.setAlpha(0); assert.equal(o.shadow!.mesh.visible, false);
  o.setAlphas(0.2, 0.7); assert.equal(u.alpha!.value, 0.7);
  o.setShadowAlpha(0.35); assert.equal(u.alpha!.value, 0.35);
  assert.match(o.shadow!.material.fragmentShader, /tailK\(vU\)/); assert.match(o.shadow!.material.fragmentShader, /smoothstep\(reveal - 0\.02, reveal, vU\)/);
});

test('the master amount is the shared one: the Settings switch glides it, 0 draws nothing', () => {
  const sh = createShared(), o = new DeviceObject(tube(), 'poly', sh, { shadow: 0.5 });
  assert.equal(sh.shadow.value, 1);
  assert.equal(o.shadow!.material.uniforms.shadowAmt, sh.shadow, 'the one shared uniform');
  assert.match(o.shadow!.material.fragmentShader, /shadowAmt \* alpha \* fade/);
});

test('the colour is the look\'s own 2D --shadow-rgb, a touch stronger on the dark looks, painted with the palette', () => {
  for (const id of LOOK_IDS) {
    const c = shadowColour(id), [r, g, b] = LOOKS[id].shadowRgb.split(/\s+/).map(Number) as [number, number, number];
    assert.ok(Math.abs(c.r - r / 255) < 1e-6 && Math.abs(c.g - g / 255) < 1e-6 && Math.abs(c.b - b / 255) < 1e-6, id);
  }
  const sh = createShared(), o = new DeviceObject(tube(), 'poly', sh, { shadow: 0.5 });
  o.applyPalette(PALETTES.dark); assert.equal(o.shadow!.material.uniforms.shadowA!.value, SHADOW_ALPHA.dark);
  o.applyPalette(PALETTES.light); assert.equal(o.shadow!.material.uniforms.shadowA!.value, SHADOW_ALPHA.light);
});

test('every kind of device casts one: the catheters (HVPG and the procedures), the balloon tube, the stent sleeve, the insertion tube, the bending section and the silver housing of both scopes', () => {
  const sh = createShared();
  for (const kind of ['hvpg', 'tips']) { const r3 = route3d(kind); if (r3) assert.ok(new ProcCatheter(r3, sh).objects.some((o) => o.shadow), `${kind} catheter`); }
  const scope = new EndoScope(sh), cast = scope.parts.filter((p) => p.shadow);
  assert.equal(cast.length, 3, 'tube, bend, tip');
  assert.ok(cast.every((p) => (p.shadow!.radius) > 0));
  assert.ok(new Tamponade(sh).tube.shadow, 'tamponade tube');
  const st = new StentDevice('TIPS', sh);
  assert.ok(st.graft.shadow, 'stent sleeve');
  assert.equal(st.wires.shadow, null, 'the thin wires cast none: they would double the sleeve\'s');
});

test('Device shadows is a Figure depth switch: on by default, saved, with a row', () => {
  assert.ok((DEPTH_KEYS as readonly string[]).includes('deviceShadow'));
  assert.equal(DEFAULTS.deviceShadow, true);
  assert.equal(parseSettings(`{"figureV":${V},"deviceShadow":false}`).deviceShadow, false);
  assert.equal(parseSettings(`{"figureV":${V}}`).deviceShadow, true, 'an older save without it has it on');
  assert.ok(DEPTH_ROWS.some((r) => r.key === 'deviceShadow' && r.label === 'Device shadows'));
});
