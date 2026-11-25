// A copied 2D stylesheet (src/ui/styles) preceded by the 3D app's own changes to it (src/ui/css3d-over-2d.css, loaded right after), so a test
// that asserts what a 2D rule says on the page reads the pair, in the order the browser applies them.
import { readFileSync } from 'node:fs';
export const merged2d = (name: string): string => readFileSync(new URL('../src/ui/css3d-over-2d.css', import.meta.url), 'utf8') + '\n' + readFileSync(new URL(`../src/ui/styles/${name}`, import.meta.url), 'utf8');
