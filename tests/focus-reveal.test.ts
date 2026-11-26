// The focus reveal (docs/approved/focus-reveal.md, src/scene/focus-reveal/): Mohammad, 26 Nov: "the esophagus is not being seen through the liver edge ... give some fade to the tip of the
// liver (slowly
// fade it, transition to fade, not abruptly), and ... when we zoom into this area, maybe activate the fade if we're trying to look at the GE junction". ONE rule keyed to what is looked at: these pin
// that it eases over time, applies only round the focus, is off away from it, that a slide about the varices and a hand's zoom are the same rule, and that the organs draw it as the rule says.
// Run: node --test tests/focus-reveal.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AlwaysStencilFunc, EqualStencilFunc, Mesh, MeshBasicMaterial, Raycaster, ReplaceStencilOp, ShaderMaterial, Vector3, ZeroStencilOp, DoubleSide } from 'three';
import { FOCI, FOCUS_TAU, easeReveal, focusOfStations, lookShare, occluderLeft, revealAt, segDist } from '../src/scene/focus-reveal/config.ts';
import { FocusReveal, lookOf } from '../src/scene/focus-reveal/reveal.ts';
import { FOCUS_REVEAL_DECL, revealPassFs } from '../src/scene/focus-reveal/glsl.ts';
import { FOCUS_REVEAL_U } from '../src/scene/focus-reveal/uniforms.ts';
import { ORGAN_FS } from '../src/scene/organs/organ-shader.ts';
import { INK_FS } from '../src/scene/materials/shaders.ts';
import { ORGAN_MESHES, setOrganData } from '../src/scene/organs/meshes.ts';
import { OrganLayer, REVEAL_STENCIL } from '../src/scene/organs/layer.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { PALETTES } from '../src/scene/palette.ts';
import { reconcile, type ReconcileTarget } from '../src/scene/reconcile.ts';
import { EMPTY_INTENT } from '../src/scene/intent.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { figureCalls } from '../src/ui/deck/figure-calls.ts';
import { RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import type { CopiedDeck } from '../src/decks/hp/types.ts';
import { loadSource } from '../src/decks/source.ts';

const GEJ = FOCI.find((r) => r.id === 'gej')!;

test('looked at: off at the whole figure, on when the camera frames the junction close, off when it stands at the room\'s edge', () => {
  // (measured in the app, 26 Nov: the whole figure is zoom 0.96 to 1.12 with the junction 0.3 to 0.45 from the middle; the bleed, feeder and GE junction frames 1.5 to 2.5 with it within 0.4)
  for (const z of [0.9, 1, 1.1]) assert.equal(lookShare(GEJ, 0.4, z), 0, `whole figure at zoom ${z}`);
  for (const z of [1.5, 1.8, 2.5, 4]) assert.equal(lookShare(GEJ, 0.2, z), 1, `framed at zoom ${z}`);
  for (const u of [0.8, 0.95, 1.4]) assert.equal(lookShare(GEJ, u, 3), 0, `at ${u} of the room's half: not what is looked at`);
  // (smooth, never a step: between the ends it rises monotonically with the zoom and falls with the distance from the middle)
  let prev = 0;
  for (let z = 1; z <= 2; z += 0.01) { const k = lookShare(GEJ, 0.2, z); assert.ok(k >= prev - 1e-12 && k - prev < 0.1, `rises gently at ${z.toFixed(2)}`); prev = k; }
  prev = 1;
  for (let u = 0; u <= 1; u += 0.01) { const k = lookShare(GEJ, u, 3); assert.ok(k <= prev + 1e-12 && prev - k < 0.1, `falls gently at ${u.toFixed(2)}`); prev = k; }
  assert.equal(lookShare(GEJ, Number.NaN, 2), 0); assert.equal(lookShare(GEJ, 0.2, 0), 0);
});

test('a slide about the varices reveals the junction whenever it is in the room, however wide its frame; off the room it does not', () => {
  // (the varices frames stand only 1.2 times the whole figure close: the zoom alone would leave them dark, so the slide's own word counts)
  assert.equal(lookShare(GEJ, 0.35, 1.0, true), 1);
  assert.equal(lookShare(GEJ, 0.95, 1.0, true), 0, 'a slide about the varices that does not show the junction: nothing');
  assert.deepEqual(focusOfStations(['VAR', 'AZY']), ['gej']);
  assert.deepEqual(focusOfStations(['RA', 'IVC']), []);
});

test('every slide that labels the varices is about the junction (figure plan to the scene\'s call), and the reconciler hands it on once', async () => {
  const deck = (await loadSource('variceal-bleed')) as CopiedDeck;
  let about = 0;
  for (const s of deck.slides) {
    // (the stations the figure labels: the slide's own and those its words name, figure-plan.ts)
    const plan = figurePlan(s), calls = figureCalls(plan, {} as never);
    assert.deepEqual(calls.focus, plan.labels.includes('VAR') || plan.labels.includes('AZY') ? ['gej'] : [], `${s.id}`);
    if (calls.focus.length) about++;
  }
  assert.ok(about >= 5, `the bleed talk is about the junction on ${about} slides`);
  const got: string[][] = [];
  const to = { setNamedVessels() {}, pinOrgans() {}, setSinceRef() {}, markVessels() {}, pick() {}, setResistors() {}, setCaudatePin() {}, setSlideFocus(ids: readonly string[]) { got.push([...ids]); } } as ReconcileTarget;
  const a = reconcile(EMPTY_INTENT, { ...EMPTY_INTENT, focus: ['gej'] }, to);
  reconcile(a, { ...a, named: ['x'] }, to);
  reconcile(a, { ...EMPTY_INTENT }, to);
  assert.deepEqual(got, [['gej'], []], 'called when the focus changes, and only then');
});

test('it eases in over time (never a jump), lands, and eases back out when the camera leaves', () => {
  const dt = 1 / 60;
  let v = 0, t = 0, prev = 0;
  v = easeReveal(v, 1, dt);
  assert.ok(v > 0 && v < 0.05, `the first frame takes a little only: ${v}`);
  for (t = dt; v < 0.95; t += dt) { prev = v; v = easeReveal(v, 1, dt); assert.ok(v >= prev && v - prev < 0.05, 'small steps, always on'); }
  assert.ok(t > 1.2 && t < 2.0, `about a second and a half to 95%: ${t.toFixed(2)} s (tau ${FOCUS_TAU})`);
  for (let i = 0; i < 600 && v !== 1; i++) v = easeReveal(v, 1, dt);
  assert.equal(v, 1, 'lands');
  v = easeReveal(v, 0, dt);
  assert.ok(v < 1 && v > 0.95, 'out: as gently');
  // (frame-rate free: two half steps are one step)
  assert.ok(Math.abs(easeReveal(easeReveal(0.2, 1, 0.01), 1, 0.01) - easeReveal(0.2, 1, 0.02)) < 1e-9);
});

test('FocusReveal follows the look: the camera on the junction eases it in, away eases it out; nothing looked at, nothing moves', () => {
  const fr = new FocusReveal();
  assert.equal(fr.step(1 / 60, () => ({ u: 0.4, zoom: 1 })), false, 'the whole figure: nothing to do');
  assert.equal(fr.strength, 0); assert.equal(fr.active, null);
  let moving = true, n = 0;
  while (moving && n < 1000) { moving = fr.step(1 / 60, () => ({ u: 0.1, zoom: 2 })); n++; if (n === 1) assert.ok(fr.strength > 0 && fr.strength < 0.05, 'eased, not switched'); }
  assert.equal(fr.strength, 1); assert.equal((fr as { active: { id: string } | null }).active?.id, 'gej');
  assert.equal(fr.step(1 / 60, () => null), true, 'the camera leaves: it eases out');
  assert.ok(fr.strength > 0.9);
  fr.setAbout(['gej']);
  for (let i = 0; i < 600; i++) fr.step(1 / 60, () => ({ u: 0.3, zoom: 1 }));
  assert.equal(fr.strength, 1, 'a slide about it at a wide frame');
  fr.setAbout([]);
  for (let i = 0; i < 600; i++) fr.step(1 / 60, () => ({ u: 0.3, zoom: 1 }));
  assert.equal(fr.strength, 0, 'the next slide is not: gone');
});

test('lookOf measures the focus in the room the cards leave, not the whole canvas', () => {
  const rig = (x: number, y: number, room = { x: 400, y: 0, w: 800, h: 800 }) => ({ project: () => ({ x, y }), pose: { room }, stageSize: { w: 1200, h: 800 }, zoomOverWhole: 1.7 });
  assert.deepEqual(lookOf(rig(800, 400), GEJ), { u: 0, zoom: 1.7 });
  assert.equal(lookOf(rig(1200, 400), GEJ)!.u, 1, 'on the room\'s right edge');
  assert.equal(lookOf(rig(600, 200), GEJ)!.u, 0.5);
  assert.equal(lookOf(rig(Number.NaN, 0), GEJ), null);
});

test('local: whole over the focus, a soft band round it, nothing beyond; the liver keeps 15% and its place reads', () => {
  const inner = 30, outer = 90;
  assert.equal(revealAt(1, 0, inner, outer), 1); assert.equal(revealAt(1, inner, inner, outer), 1);
  assert.equal(revealAt(1, outer, inner, outer), 0); assert.equal(revealAt(1, 500, inner, outer), 0);
  assert.equal(revealAt(0, 0, inner, outer), 0, 'strength 0: nothing anywhere');
  assert.ok(Math.abs(revealAt(0.5, 0, inner, outer) - 0.5) < 1e-12);
  let prev = 1;
  for (let d = inner; d <= outer; d += 1) { const k = revealAt(1, d, inner, outer); assert.ok(k <= prev + 1e-12 && prev - k < 0.05, `a soft band at ${d} px`); prev = k; }
  assert.ok(Math.abs(occluderLeft(GEJ, 1, 0, inner, outer) - (1 - GEJ.fadeMax)) < 1e-12);
  assert.equal(occluderLeft(GEJ, 1, 200, inner, outer), 1, 'the rest of the liver is untouched');
  assert.equal(segDist(5, 5, 0, 0, 10, 0), 5); assert.equal(segDist(-3, 4, 0, 0, 10, 0), 5); assert.equal(segDist(3, 4, 0, 0, 0, 0), 5);
});

test('the focus is where the liver hides it: the junction behind the left lobe\'s tip, the esophagus above it clear', async () => {
  const bin = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  const m = new MeshBasicMaterial({ side: DoubleSide }), liver = new Mesh(ORGAN_MESHES.liver!(), m), stomach = new Mesh(ORGAN_MESHES.stomach!(), m), rc = new Raycaster();
  const hit = (o: Mesh, x: number, y: number) => { rc.set(new Vector3(x, y, 5), new Vector3(0, 0, -1)); return rc.intersectObject(o)[0]?.point.z ?? null; };
  const [bx, by] = GEJ.b, [ax, ay] = GEJ.a;
  const lz = hit(liver, bx, by), sz = hit(stomach, bx, by);
  assert.ok(lz !== null && sz !== null && lz > sz, `at the cardia the liver lies in front of the stomach (${lz}, ${sz})`);
  assert.equal(hit(liver, ax, ay), null, 'the upper end stands above the liver: the band runs from the esophagus the viewer already sees into the part hidden');
  assert.ok(hit(stomach, ax, ay) !== null, 'and lies on the esophagus');
});

test('the organs draw the rule: the liver\'s fill reads the fade, the stomach is drawn under it once per pixel inside the liver\'s silhouette, all off until a rule is on', async () => {
  const bin = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  const layer = new OrganLayer(createShared(), ORGAN_MESHES);
  layer.applyLook(PALETTES.light);
  const liver = layer.byId.get('liver')!, stomach = layer.byId.get('stomach')!;
  const parts = (o: typeof liver, name: string) => o.group.children.filter((c) => c.name === name) as Mesh[];
  const [cover] = parts(liver, 'reveal-silhouette'), [fill] = parts(stomach, 'reveal-fill'), [line] = parts(stomach, 'reveal-line');
  assert.ok(cover && fill && line, 'the three passes are built');
  for (const p of [cover, fill, line]) assert.equal(p.visible, false, `${p.name}: off until a rule is on`);
  assert.equal(liver.toon.uniforms.frvOcc!.value, 0);
  layer.setFocusReveal('gej');
  for (const p of [cover, fill, line]) assert.equal(p.visible, true, `${p.name}: on`);
  assert.equal(liver.toon.uniforms.frvOcc!.value, 1, 'the liver fades');
  assert.equal(stomach.toon.uniforms.frvOcc!.value, 0, 'the stomach does not');
  // the order: the silhouette, then the stomach's fill and line, all before the liver's fill, so its wash lies over them
  assert.ok(cover.renderOrder < fill.renderOrder && fill.renderOrder < line.renderOrder && line.renderOrder < liver.toonMesh.renderOrder);
  const cm = cover.material as MeshBasicMaterial, fm = fill.material as ShaderMaterial, lm = line.material as ShaderMaterial;
  assert.ok(!cm.colorWrite && !cm.depthWrite && !cm.depthTest && cm.stencilFunc === AlwaysStencilFunc && cm.stencilZPass === ReplaceStencilOp && cm.stencilWriteMask === REVEAL_STENCIL, 'the silhouette marks bit 8 only');
  for (const x of [fm, lm]) {
    assert.ok(x.stencilFunc === EqualStencilFunc && x.stencilRef === REVEAL_STENCIL && x.stencilFuncMask === REVEAL_STENCIL && x.stencilZPass === ZeroStencilOp && x.stencilWriteMask === REVEAL_STENCIL, `${x.name}: once per pixel, inside the silhouette`);
    assert.equal(x.depthWrite, false, `${x.name}: writes no depth (the organs after it draw as ever)`);
  }
  assert.equal(fm.uniforms, stomach.toon.uniforms, 'the fill shares the stomach\'s own uniforms: its paint, its pool, its fade reach it');
  assert.equal(lm.uniforms, stomach.ink.uniforms);
  assert.equal(fm.uniforms.frvP, FOCUS_REVEAL_U.frvP, 'and the one shared reveal');
  // (the organs' own art is in it: the pass copies the finished program)
  assert.equal(fm.vertexShader, stomach.toon.vertexShader);
  assert.ok(fm.fragmentShader.startsWith(stomach.toon.fragmentShader.slice(0, stomach.toon.fragmentShader.lastIndexOf('}'))));
  layer.setFocusReveal(null);
  for (const p of [cover, fill, line]) assert.equal(p.visible, false);
  assert.equal(liver.toon.uniforms.frvOcc!.value, 0);
});

test('the shaders: every organ\'s fill reads the reveal through the one chunk; the see-through pass lays its result by the same function, last', () => {
  assert.ok(ORGAN_FS.includes(FOCUS_REVEAL_DECL), 'the organ fill declares the chunk');
  assert.match(ORGAN_FS, /lay \*= 1\.0 - frvOcc \* frvP\.w \* frvAt\(gl_FragCoord\.xy\);/);
  const p = revealPassFs(ORGAN_FS);
  assert.equal(p.split('float frvAt(').length, 2, 'declared once');
  assert.match(p, /gl_FragColor\.a \*= frvAt\(gl_FragCoord\.xy\);\n {2}if \(gl_FragColor\.a < 0\.002\) discard;\n\}$/);
  const q = revealPassFs(INK_FS);
  assert.ok(q.startsWith(FOCUS_REVEAL_DECL) && q.split('float frvAt(').length === 2, 'the line gets the chunk');
});

const parserName = '@shaderfrog/glsl-parser';
let parse: ((s: string) => unknown) | null = null;
try { const mod = await import(parserName); parse = (s) => mod.parser.parse(s.replace(/^#include.*$/gm, ''), { quiet: true }); } catch { /* not installed */ }
test('the reveal\'s programs parse', { skip: !parse }, () => {
  parse!(ORGAN_FS.replace(/^\n/, ''));
  parse!(revealPassFs(ORGAN_FS).replace(/^\n/, ''));
  parse!(revealPassFs(INK_FS).replace(/^\n/, ''));
});
