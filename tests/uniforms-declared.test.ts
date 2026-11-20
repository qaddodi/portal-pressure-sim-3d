// A ShaderMaterial must give every uniform its shaders declare. Three.js skips a uniform the material lacks, so the GL program keeps the value the last material drawn with the same
// program uploaded: the stomach's seat (no hiOn) drew with the tapped spleen's hiOn = 1, and the esophagus lit white (iPhone and Mac, 20 Nov: "when i select spleen; i see every organ highlighted").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ShaderMaterial } from 'three';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { liveSource } from '../src/debug/gl-programs.ts';

const BUILT_IN = new Set(['modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition', 'isOrthographic', 'modelViewProjectionMatrix']);
// (a block behind a define the material does not carry, the inspector's VDBG hooks on a page without ?inspect, is not part of its program: liveSource reads the material's own defines first)
const declared = (src: string, defines: Record<string, unknown> = {}): string[] => [...liveSource(Object.keys(defines).map((k) => `#define ${k}`).join('\n') + '\n' + src).matchAll(/^\s*uniform\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+(\w+)(?:\[[^\]]*\])?\s*;/gm)].map((m) => m[1]!);

test('every ShaderMaterial in the scene (organs, seats, vessels, devices) gives every uniform its vertex and fragment shaders declare', async () => {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const s = new CelScene();
  s.resize(900, 700);
  await organsReady; await new Promise((r) => setTimeout(r, 0));
  s.update(0); s.update(1000);
  const missing: string[] = [];
  let n = 0;
  s.scene.traverse((o) => {
    const m = (o as { material?: unknown }).material;
    if (!(m instanceof ShaderMaterial)) return;
    n++;
    for (const u of new Set([...declared(m.vertexShader, m.defines), ...declared(m.fragmentShader, m.defines)])) {
      if (!BUILT_IN.has(u) && !(u in m.uniforms)) missing.push(`${o.name || o.type} (${(o.parent as { name?: string } | null)?.name ?? ''}): ${u}`);
    }
  });
  assert.ok(n >= 40, `${n} organ materials checked`);
  assert.deepEqual(missing, []);
  s.dispose?.();
});
