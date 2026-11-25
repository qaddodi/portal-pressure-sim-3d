// The organs finished at build time (22 Nov splash review, item 3): prepare.ts is the one function that makes them (the page runs it only without the baked file), the file is that function's output in a compact
// form, and a page lays it in only for the digest of its own build. These tests pin that the baked organs are the live ones (within the file's resolution), that a stale file is told apart, and that the layer takes them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { BufferGeometry } from 'three';
import { organsDigest } from '../scripts/organs-digest.mjs';

const { setOrganData, ORGAN_MESHES, setBakedOrgans, bakedOrgans } = await import('../src/scene/organs/meshes.ts');
const f = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer);
const { caudateGeometry } = await import('../src/scene/organs/caudate.ts');
const { prepareOrgans } = await import('../src/scene/organs/prepare.ts');
const { encodeOrgans, decodeOrgans, BAKED_Q, RAW_IDS } = await import('../src/scene/organs/baked.ts');

const live = prepareOrgans({ ...ORGAN_MESHES, caudate: caudateGeometry });
const bytes = encodeOrgans(live, 'test-digest', RAW_IDS.map((id) => [id, ORGAN_MESHES[id]!()]));
const back = decodeOrgans(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)!;
const arr = (g: BufferGeometry, k: string) => g.getAttribute(k).array as ArrayLike<number>;

test('the baked organs are the live ones: same organs in the same order, same triangles, positions to the file\'s resolution', () => {
  assert.ok(back && back.digest === 'test-digest');
  assert.deepEqual(back.organs.map(([id]) => id), live.map(([id]) => id));
  for (let k = 0; k < live.length; k++) {
    const [id, a] = live[k]!, b = back.organs[k]![1];
    assert.deepEqual(Array.from(b.index!.array), Array.from(a.index!.array), `${id} triangles`);
    const pa = arr(a, 'position'), pb = arr(b, 'position');
    let worst = 0; for (let i = 0; i < pa.length; i++) worst = Math.max(worst, Math.abs(pa[i]! - pb[i]!));
    assert.ok(worst <= 0.5 / BAKED_Q + 1e-6, `${id} positions move by at most half a step of the file's grid (${worst})`);
  }
});

test('the baked attributes equal the live ones: depth and rim steps exactly, outline normals within 2.5e-3 (the file keeps a normal to 1/1023), the tail fade exactly', () => {
  for (let k = 0; k < live.length; k++) {
    const [id, a] = live[k]!, b = back.organs[k]![1];
    assert.deepEqual(Array.from(arr(b, 'depthAo')), Array.from(arr(a, 'depthAo')), `${id} depthAo`);
    assert.deepEqual(Array.from(arr(b, 'ringD')), Array.from(arr(a, 'ringD')), `${id} ringD`);
    for (const n of ['shadeN', 'hullN']) { const x = arr(a, n), y = arr(b, n); let worst = 0; for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i]! - y[i]!)); assert.ok(worst < 2.5e-3, `${id} ${n} ${worst}`); }
    assert.equal(!!a.getAttribute('esoA'), !!b.getAttribute('esoA'), `${id} esoA`);
    if (a.getAttribute('esoA')) assert.deepEqual(Array.from(arr(b, 'esoA')), Array.from(arr(a, 'esoA')));
    const na = arr(a, 'normal'), nb = arr(b, 'normal'); let dot = 1; for (let i = 0; i < na.length; i += 3) dot = Math.min(dot, na[i]! * nb[i]! + na[i + 1]! * nb[i + 1]! + na[i + 2]! * nb[i + 2]!);
    assert.ok(dot > 0.99, `${id} surface normals ${dot}`);
  }
});

test('the raw stomach for the scope comes from the file when organs.bin is not loaded', () => {
  const raw = back.raw.stomach!();
  const orig = ORGAN_MESHES.stomach!();
  assert.equal(raw.getAttribute('position').count, orig.getAttribute('position').count);
  assert.deepEqual(Array.from(raw.index!.array), Array.from(orig.index!.array));
});

test('a file that is not an organs file decodes to null, and the digest names its inputs', () => {
  assert.equal(decodeOrgans(new ArrayBuffer(4)), null);
  assert.equal(decodeOrgans(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer), null);
  assert.equal(organsDigest(), organsDigest());
  assert.match(organsDigest(), /^p?[0-9a-f]+-\d+$/);
});

const ON_DISK = new URL('../public/anatomy/organs-baked.bin', import.meta.url);
test('the file on disk (when the build or the pretest made one) is for the current inputs', { skip: !existsSync(ON_DISK) }, () => {
  const b = gunzipSync(readFileSync(ON_DISK));
  const d = decodeOrgans(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  assert.equal(d?.digest, organsDigest(), 'public/anatomy/organs-baked.bin is stale: node scripts/bake-organs.mjs');
});

test('the layer takes the baked organs when the page has them, and builds the same set live', async () => {
  const { OrganLayer } = await import('../src/scene/organs/layer.ts');
  const { createShared } = await import('../src/scene/materials/cel.ts');
  const liveLayer = new OrganLayer(createShared()); liveLayer.build();
  assert.equal(bakedOrgans(), null);
  setBakedOrgans(back);
  const bakedLayer = new OrganLayer(createShared()); bakedLayer.build();
  assert.deepEqual([...bakedLayer.byId.keys()], [...liveLayer.byId.keys()]);
  assert.ok(bakedLayer.byId.size >= 9);
});

test('the raw stomach the scope fits to is the finished stomach\'s own arrays, stored once (25 Nov): the file has no second copy, and what the raw organ makes is what the file always held', () => {
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes.buffer, bytes.byteOffset + 8, new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true))));
  assert.deepEqual(head.raw.map((r: { id: string; of?: string }) => [r.id, r.of]), [['stomach', 'stomach']], 'the raw stomach points at the finished one');
  assert.ok(!head.raw[0].a, 'and holds no arrays of its own');
  const raw = back.raw.stomach!(), fin = back.organs.find(([id]) => id === 'stomach')![1], src = ORGAN_MESHES.stomach!();
  assert.deepEqual(Array.from(raw.index!.array), Array.from(src.index!.array), 'the raw triangles are the organ file\'s');
  const pa = arr(raw, 'position'), pb = arr(src, 'position');
  let worst = 0; for (let i = 0; i < pa.length; i++) worst = Math.max(worst, Math.abs(pa[i]! - pb[i]!));
  assert.ok(worst <= 0.5 / BAKED_Q + 1e-6, `the raw positions are the file's to its grid (${worst})`);
  assert.deepEqual(Array.from(arr(raw, 'position')), Array.from(arr(fin, 'position')), 'and are the finished stomach\'s positions exactly');
});
