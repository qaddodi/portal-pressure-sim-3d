import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, ShaderMaterial, BoxGeometry } from 'three';
import { collectMaterials } from '../src/debug/gl-programs.ts';
import { allPrograms } from '../src/debug/gl-registry.ts';

const VS = 'void main(){ gl_Position = vec4(position, 1.0); }';
const FS = 'void main(){ gl_FragColor = vec4(1.0); }';

test('two different programs never share a name (the ?gl rows are keyed by it: React warned about two "toon opaque" children)', () => {
  const root = new Group();
  // the same shader text and the same define NAMES, different define VALUES: two programs, one old name
  for (const v of [1, 2, 3]) root.add(new Mesh(new BoxGeometry(), new ShaderMaterial({ vertexShader: VS, fragmentShader: FS, name: 'toon', defines: { LEVELS: v }, transparent: false })));
  const names = collectMaterials(root).map((p) => p.name);
  assert.equal(names.length, 3, 'three distinct programs');
  assert.equal(new Set(names).size, 3, `names are unique: ${names.join(' | ')}`);
  assert.ok(names[0]!.startsWith('toon') && names[1]!.endsWith('#2') && names[2]!.endsWith('#3'), 'the first keeps its name, repeats are numbered in scene order');
});

test('the registered programs on an empty scene have unique names too', () => {
  const names = allPrograms(new Group(), '').map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
});
