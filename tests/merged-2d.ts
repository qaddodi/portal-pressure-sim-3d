// A copied 2D stylesheet (src/ui/css2d, never edited) preceded by the 3D app's own changes to it (src/ui/css2d-3d.css, loaded right after), so a test
// that asserts what a 2D rule says on the page reads the pair, in the order the browser applies them.
import { readFileSync } from 'node:fs';
export const merged2d = (name: string): string => readFileSync(new URL('../src/ui/css2d-3d.css', import.meta.url), 'utf8') + '\n' + readFileSync(new URL(`../src/ui/css2d/${name}`, import.meta.url), 'utf8');
