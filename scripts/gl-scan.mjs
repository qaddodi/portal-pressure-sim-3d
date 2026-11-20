// Which source files hold GLSL: the one scan the GLSL compile test (tests/glsl-compile.test.ts) and the build (vite.config.ts, the `virtual:gl-modules` module the ?gl page reads) both use,
// so a new shader file is found by both with nothing to register by hand (src/debug/gl-auto.ts says how its programs are taken from it).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MARKER = /gl_Position|gl_FragColor|#version 300 es/;
const SKIP = [join('src', 'engine', 'hales'), join('src', 'engine', 'host'), join('src', 'debug')];

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const f = join(dir, n);
  return statSync(f).isDirectory() ? walk(f) : /\.(ts|tsx|js|mjs)$/.test(n) ? [f] : [];
});

/** Every file under `src/` that holds GLSL, as a path under src/ with forward slashes (the engine copies and src/debug are not the app's shaders). */
export function glslFiles(root = 'src') {
  return walk(root)
    .filter((f) => !SKIP.some((s) => f.startsWith(root === 'src' ? s : s.replace(/^src/, root))))
    .filter((f) => MARKER.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(root.length + 1).split('\\').join('/'))
    .sort();
}
