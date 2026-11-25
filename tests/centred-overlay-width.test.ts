// An overlay centred with `left: 50%` and a translate has only the other half of its container to size itself in, so with no width of its own it shrinks to that half and wraps its words
// one to a line (the update toast on an iPhone read "A new / version / of the…"; the Compare banner and badge had the same cause). Every such rule names a width.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files: string[] = [];
const walk = (d: string): void => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.css')) files.push(p); } };
walk('src');

/** src/ui/styles began as 2D's sheet; its centred rules are listed here only where 2D's markup gives the element a width (or it never wraps), checked by hand. */
const COPIED_OK = new Set<string>();

test('every rule that centres an overlay with left: 50% and a translate also sets a width', () => {
  const bad: string[] = [];
  for (const f of files) {
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1]!.trim().replace(/\s+/g, ' '), body = m[2]!;
      if (!/(^|[;\s])left:\s*50%/.test(body) || !/(^|[;\s])(transform|translate):[^;]*translate(X)?\(?-?50%|(^|[;\s])translate:\s*-50%/.test(body)) continue;
      if (!/position:\s*(absolute|fixed)/.test(body)) continue;
      if (/(^|[;\s])(width|inline-size):/.test(body) || /\bright:/.test(body)) continue;   // a width, or both edges, sizes it
      if (/::?(before|after)/.test(sel)) continue;                                          // a pseudo-element with no text
      const key = `${f}: ${sel}`;
      if (!COPIED_OK.has(key)) bad.push(key);
    }
  }
  assert.deepEqual(bad.filter((b) => !b.includes('/styles/')), [], 'add `width: max-content` (and a max-width) to these');
});
