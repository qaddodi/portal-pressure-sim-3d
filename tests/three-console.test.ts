// Console warnings the page makes on every load (review 25 Nov, F6): the THREE.Material 'defines' undefined warning is fixed at its source (a key left out, not set to undefined),
// and R3F's own deprecated THREE.Clock is the one library message dropped, by name, in src/scene/three-console.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Clock, ShaderMaterial, getConsoleFunction } from 'three';
import { KNOWN_LIBRARY_NOISE, routeThreeConsole, threeConsole } from '../src/scene/three-console.ts';
import { AscitesLayer } from '../src/scene/disease/ascites.ts';
import { paintFieldTile } from '../src/scene/lobule/field.ts';

const rec = () => { const seen: string[] = []; const f = (k: string) => (...a: unknown[]) => { seen.push(`${k}:${a.join(' ')}`); }; return { seen, sink: { log: f('log'), warn: f('warn'), error: f('error') } }; };

test('three.js sends its Clock deprecation (R3F builds one) nowhere, and every other message as it would have gone', () => {
  const { seen, sink } = rec();
  const route = threeConsole(sink);
  route('warn', 'THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.');
  route('warn', 'THREE.WebGLRenderer: Context Lost.');
  route('error', 'THREE.WebGLProgram: Shader Error');
  route('log', 'THREE.thing');
  assert.deepEqual(seen, ['warn:THREE.WebGLRenderer: Context Lost.', 'error:THREE.WebGLProgram: Shader Error', 'log:THREE.thing']);
  const trace = { isStackTrace: true, getError: (m: string) => `E(${m})` };
  route('warn', 'THREE.x', trace);
  assert.equal(seen.at(-1), 'warn:E(THREE.x)');
  assert.deepEqual([...KNOWN_LIBRARY_NOISE], ['THREE.Clock: This module has been deprecated'], 'one library message is named; a new one must be named here, in a line of its own');
});

test('the page routes three.js through it, and a Clock made while it is routed is silent', () => {
  routeThreeConsole();   // (the import does it already; calling again changes nothing)
  assert.ok(getConsoleFunction(), 'three.js messages are routed');
  const seen: string[] = []; const w = console.warn; console.warn = (...a: unknown[]) => { seen.push(a.join(' ')); };
  try { void new Clock(); } finally { console.warn = w; }
  assert.deepEqual(seen, []);
  const src = readFileSync(new URL('../src/scene/Stage.tsx', import.meta.url), 'utf8');
  assert.ok(src.includes("import './three-console.ts'") && src.indexOf("import './three-console.ts'") < src.indexOf('<Canvas'), 'Stage.tsx imports the routing before the Canvas makes R3F\'s store');
});

test('no material is made with a key set to undefined (three.js warns "parameter defines has value of undefined")', () => {
  const warned: string[] = []; const w = console.warn; console.warn = (...a: unknown[]) => { warned.push(a.join(' ')); };
  try { new AscitesLayer(); void new ShaderMaterial({ name: 'ok' }); } finally { console.warn = w; }
  assert.deepEqual(warned, []);
});

test('the lobule tile, painted and then read back for its blur, is a canvas kept for reading ("GPU stall due to ReadPixels")', () => {
  const asked: unknown[] = [];
  const stub = { getContext: (_k: string, o?: unknown) => { asked.push(o); return null; } } as unknown as HTMLCanvasElement;
  paintFieldTile('classic' as never, { su: 0, pre: 0, post: 0, sin: 0, cong: 0 } as never, () => stub);
  assert.ok(asked.length > 0 && asked.every((o) => (o as { willReadFrequently?: boolean } | undefined)?.willReadFrequently === true), `every getContext('2d') on the tile asks willReadFrequently: ${JSON.stringify(asked)}`);
});
