// The Protein legend is a bare word (humanized.css: background none), never glass: no later, stronger rule may fill it, and on a phone it hangs under the pill
// from the right edge only (Plan 36 A: the black bar across the top, 22 Nov). Source-reading, node only; the cascade is checked by specificity, not by running a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../src/', import.meta.url);
const walk = (u: URL): URL[] => readdirSync(u, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === 'engine' ? [] : walk(new URL(d.name + '/', u))) : d.name.endsWith('.css') ? [new URL(d.name, u)] : []);
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// [selector, body] of every plain rule (media blocks flattened).
const rules = (css: string) => [...strip(css).matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const);

// Specificity (ids, classes/attrs/pseudo-classes, types) of one complex selector; :is/:not take their strongest argument.
function spec(sel: string): [number, number, number] {
  let s = sel, a = 0, b = 0, c = 0;
  for (;;) {
    const m = /:(is|not|where|has)\(([^()]*)\)/.exec(s); if (!m) break;
    const inner = m[2].split(',').map((x) => spec(x.trim()));
    if (m[1] !== 'where') { const top = inner.sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0]; a += top[0]; b += top[1]; c += top[2]; }
    s = s.replace(m[0], '');
  }
  a += (s.match(/#[\w-]+/g) ?? []).length;
  b += (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  c += (s.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return [a, b, c];
}
const gt = (x: number[], y: number[]) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

test('no rule fills the Protein legend more strongly than humanized.css\'s background: none', () => {
  const human = rules(readFileSync(new URL('ui/humanized.css', root), 'utf8')).find(([s, b]) => /^html:root \.sv-legend$/.test(s) && /background: none/.test(b));
  assert.ok(human, 'humanized.css keeps the legend bare');
  const floor = spec(human![0]);
  const bad: string[] = [];
  for (const f of walk(root)) for (const [sel, body] of rules(readFileSync(f, 'utf8'))) {
    if (!/background(-color)?\s*:\s*(?!none|transparent)/.test(body) && !/\bbackground\s*:\s*(?!none|transparent)/.test(body)) continue;
    for (const one of sel.split(/,(?![^()]*\))/)) {
      // a selector whose subject is the legend itself (not a descendant such as `.sv-legend i.alb`)
      const subject = one.trim().replace(/::?[\w-]+(\([^()]*\))?$/, '');
      if (/\.sv-legend(?![\w-])/.test(one) && /(^|[\s>+~])(\.sv-legend|[^\s>+~]*\.sv-legend[^\s>+~]*)(\[[^\]]*\]|:[\w-]+(\([^()]*\))?)*$/.test(subject) && gt(spec(one.trim()), floor) > 0) bad.push(`${f.pathname.split('/src/')[1]}: ${one.trim()}`);
    }
  }
  assert.deepEqual(bad, [], 'these fill the legend over humanized.css (the black bar)');
});

test('no :is() list in any stylesheet that fills glass names the legend', () => {
  const bad: string[] = [];
  for (const f of walk(root)) for (const [sel, body] of rules(readFileSync(f, 'utf8'))) if (/\.sv-legend/.test(sel) && /\bbackground\s*:\s*var\(--(surface|glass|frost)/.test(body) && /:is\([^)]*\.sv-legend/.test(sel)) bad.push(`${f.pathname.split('/src/')[1]}: ${sel.slice(0, 80)}`);
  assert.deepEqual(bad, []);
});

test('on a phone the legend hangs under the pill from the right edge only, left cleared', () => {
  const css = readFileSync(new URL('scene/sinusoid/legend.css', root), 'utf8');
  const r = rules(css).find(([s]) => /^\.app\.thumb \.topbar \.stage-bar\.top > \.sv-legend$/.test(s));
  assert.ok(r, 'phone rule present');
  assert.match(r![1], /position: absolute/);
  assert.match(r![1], /left: auto/);
  assert.match(r![1], /right: 0/);
  assert.match(r![1], /top: calc\(100% \+ 8px\)/);
});
