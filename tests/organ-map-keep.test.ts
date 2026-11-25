// The organ map is kept while nothing it is drawn from moves (review P1, the part that is exact): same key, no draw; a moved camera, a changed organ or a changed size, a draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Color, PerspectiveCamera, Scene, Mesh, BoxGeometry, ShaderMaterial, Vector3 } from 'three';
import { OrganMap } from '../src/scene/organ-veil/organ-map.ts';
import { sceneKey } from '../src/scene/organ-veil/scene-key.ts';
import { ORGAN_MAP_LAYER } from '../src/scene/layers.ts';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { bodyTargets } from '../src/scene/disease/targets.ts';
import { fixedSource } from '../src/scene/model-source.ts';
import { presetState } from './b4-presets.ts';

/** A renderer that only counts: the map's own targets are made by three without a GL context. */
function fakeGl() {
  let rt: unknown = null; const clear = new Color(0x123456); let alpha = 1, renders = 0;
  return {
    gl: {
      getClearColor: (t: Color) => t.copy(clear), getClearAlpha: () => alpha, setClearColor: (c: Color | number, a?: number) => { clear.set(c as never); if (a !== undefined) alpha = a; },
      getRenderTarget: () => rt, setRenderTarget: (r: unknown) => { rt = r; }, autoClear: true, render: () => { renders++; },
    } as never,
    renders: () => renders, setClear: (c: number) => clear.set(c),
  };
}
function sceneWithOrgan() {
  const scene = new Scene(), cam = new PerspectiveCamera(40, 1, 1, 100);
  cam.position.set(0, 0, 10); cam.updateMatrixWorld();
  const m = new ShaderMaterial({ uniforms: { tone: { value: new Color(1, 0, 0) }, time: { value: 0 } }, vertexShader: 'void main(){gl_Position=vec4(0.);}', fragmentShader: 'void main(){gl_FragColor=vec4(1.);}' });
  const organ = new Mesh(new BoxGeometry(1, 1, 1), m); organ.layers.enable(ORGAN_MAP_LAYER); scene.add(organ);
  return { scene, cam, organ, m };
}
const want = { veil: true, see: false };

test('the map is drawn twice (the back mask settles), then kept while nothing moves; per-frame uniforms the organ program never reads do not move the key', () => {
  const f = fakeGl(), map = new OrganMap(), { scene, cam, m } = sceneWithOrgan();
  for (let i = 0; i < 10; i++) { m.uniforms.time!.value = i; map.render(f.gl, cam, scene, 400, 300, want); }
  assert.equal(map.stats.drawn, 2, 'two draws, then kept');
  assert.equal(map.stats.kept, 8);
  assert.equal(f.renders(), 2);
  map.dispose();
});

test('a moved camera, a changed organ colour, a moved organ, a new size or the clear colour each draw again', () => {
  const f = fakeGl(), map = new OrganMap(), { scene, cam, organ, m } = sceneWithOrgan();
  const settle = () => { for (let i = 0; i < 4; i++) map.render(f.gl, cam, scene, 400, 300, want); };
  settle();
  const again = (what: string, change: () => void, w = 400) => {
    const before = map.stats.drawn; change();
    map.render(f.gl, cam, scene, w, 300, want);
    assert.equal(map.stats.drawn, before + 1, what); settle();
  };
  again('camera moved', () => { cam.position.x += 0.1; cam.updateMatrixWorld(); });
  again('organ colour changed', () => { (m.uniforms.tone!.value as Color).setRGB(0, 1, 0); });
  again('organ moved', () => { organ.position.add(new Vector3(0.1, 0, 0)); });
  again('size changed', () => undefined, 500);
  again('clear colour changed', () => f.setClear(0x654321));
  map.dispose();
});

test('a program that reads time is not kept: its uniform stays in the key', () => {
  const f = fakeGl(), map = new OrganMap(), { scene, cam, m } = sceneWithOrgan();
  m.fragmentShader = 'uniform float time; void main(){gl_FragColor=vec4(time);}';
  for (let i = 0; i < 6; i++) { m.uniforms.time!.value = i; map.render(f.gl, cam, scene, 400, 300, want); }
  assert.equal(map.stats.drawn, 6);
  map.dispose();
});

test('a key it cannot make (an unknown uniform kind) is NaN: that frame is always drawn', () => {
  const { scene, cam, m } = sceneWithOrgan();
  m.uniforms.odd = { value: { weird: 1 } };
  assert.ok(Number.isNaN(sceneKey(scene, cam, 1 << ORGAN_MAP_LAYER, 10, 10)));
});

test('the maps are drawn again at least every KEEP_MAX frames even when the key never moves', () => {
  const f = fakeGl(), map = new OrganMap(), { scene, cam } = sceneWithOrgan();
  for (let i = 0; i < 200; i++) map.render(f.gl, cam, scene, 400, 300, want);
  assert.ok(map.stats.drawn >= 2 + 3 && map.stats.drawn <= 8, `drawn ${map.stats.drawn}`);
  map.dispose();
});

test('the real figure: the key of the organ layers stands still at rest while the engine ticks, and moves when the patient changes', async () => {
  const p = await presetState('cirr-decomp'), p2 = await presetState('healthy').catch(() => null);
  const src = fixedSource({ ...p.frame, running: true } as never, p.params, { P: p.healthyP, Q: p.frame.Q as never });
  const s = new CelScene({ source: src });
  s.disease.organs.setBody(bodyTargets(p.frame, p.params, p.healthyP), true);
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  await organsReady; await new Promise((r) => setTimeout(r, 0));
  s.dataChanged();
  let now = 1000;
  const step = (n: number, tick: boolean) => { for (let i = 0; i < n; i++) { now += 16; if (tick && i % 2 === 0) { src.set({ ...p.frame, running: true, t: now / 1000 } as never); s.dataChanged(); } s.update(now); } };
  step(400, false);
  const cam = s.rig.camera, layers = (1 << ORGAN_MAP_LAYER) | (1 << 4);
  const key = () => { cam.updateMatrixWorld(); s.scene.updateMatrixWorld(true); return sceneKey(s.scene, cam, layers, 800, 600); };
  const k0 = key(); assert.ok(!Number.isNaN(k0), 'the organs can be keyed (every uniform kind is known)');
  step(120, true);
  assert.equal(key(), k0, 'engine ticks, flow marks and the pool ripple do not move the organ key');
  if (p2) {
    src.set({ ...p2.frame, running: true, jump: true } as never, p2.params);
    s.disease.organs.setBody(bodyTargets(p2.frame, p2.params, p2.healthyP), false); s.dataChanged(); step(5, false);
    assert.notEqual(key(), k0, 'a different patient changes the organs, so the key moves');
  }
  s.dispose();
});
