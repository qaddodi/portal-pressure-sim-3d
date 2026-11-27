// G5 (Plan 39, Audit 5 finding 4 and 7): nothing the app owns comes or goes in one frame. (a) `hidden={…}`, `.hidden =`, `style.display =`, `style.visibility =` and `.remove()` /
// `removeChild` are a display swap or a node that vanishes: they belong only in src/ui/fade.tsx (the one fade) or a file listed in tests/pop-allow.json, whose per-file counts only go down.
// (b) A 3D-owned CSS rule that sets `display: none` under a state selector needs a transition partner (an opacity ease on that class) or a listed reason. (c) A 3D-owned rule that changes
// colour, background, opacity, shadow, fill or stroke on a state selector (:hover, aria-pressed, .on…) needs a transition on that element, its own or ease.css's list.
// The two lists are the starting allowance (22 Nov 2026) and only go down. Source-reading, node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseCss, splitSel, stylesheets } from './css-parse.ts';

const allow = JSON.parse(readFileSync(new URL('./pop-allow.json', import.meta.url), 'utf8')) as { code: Record<string, number>; display: string[]; state: string[] };
const walk = (d: string, out: string[] = []): string[] => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) { if (e.name !== 'engine' && e.name !== 'decks') walk(p, out); } else if (/\.(tsx?|js)$/.test(e.name) && !e.name.includes('.copied.')) out.push(p); } return out; };

// (`hidden={…}` the attribute or a component's prop: not `aria-hidden={…}`, which only tells a screen reader, and not `data-hidden={…}`, a state a rule eases)
const SWAP = /(?<![\w-])hidden=\{|\.hidden\s*=[^=]|\.style\.display\s*=[^=]|\.style\.visibility\s*=[^=]|\.remove\(\)|\.removeChild\(/g;
test('(a) hidden, style.display, style.visibility and .remove() only in fade.tsx or the listed files, and the counts only go down', () => {
  const counts: Record<string, number> = {};
  for (const f of walk('src')) {
    if (f.endsWith('src/ui/fade.tsx') || f.includes('/debug/') || f.includes('/perf/')) continue;
    const n = (readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').match(SWAP) ?? []).length;
    if (n) counts[f.replace('src/', '')] = n;
  }
  const over = Object.entries(counts).filter(([f, n]) => n > (allow.code[f] ?? 0)).map(([f, n]) => `${f}: ${n} (allowed ${allow.code[f] ?? 0})`);
  assert.deepEqual(over, [], 'use <Fade> / fadeAttrs from src/ui/fade.tsx, or (a node that must go) ease it first; never raise tests/pop-allow.json');
  const down = Object.entries(allow.code).filter(([f, n]) => (counts[f] ?? 0) < n).map(([f, n]) => `${f}: now ${counts[f] ?? 0}, allowed ${n}`);
  assert.deepEqual(down, [], 'lower these counts in tests/pop-allow.json (the allowance only goes down)');
});

const own = () => stylesheets().filter(([p]) => !p.startsWith('ui/styles/') && !p.includes('.copied.')).flatMap(([p, css]) => parseCss(p, css));
const STATE = /\[data-[\w-]+|\[aria-|\[hidden|\.on\b|\.open\b|:not\(|:hover|:active|:focus|\.is-|\.shown/;
const subjectOf = (one: string): string => one.trim().replace(/::?[\w-]+(\([^()]*\))?$/g, '').split(/[\s>+~]+/).pop() ?? '';
const classesOf = (s: string): string[] => [...s.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);

test('(b) a 3D-owned `display: none` under a state selector has an opacity ease on that class, or is listed', () => {
  const rules = own();
  const eased = new Set<string>(); for (const r of rules) if (r.decls.some((d) => d.prop === 'transition' && /opacity|all/.test(d.value))) for (const one of splitSel(r.sel)) for (const c of classesOf(subjectOf(one))) eased.add(c);
  const hits = new Set<string>();
  for (const r of rules) {
    if (!r.decls.some((d) => d.prop === 'display' && d.value === 'none')) continue;
    for (const one of splitSel(r.sel)) {
      if (!STATE.test(one)) continue;
      const cls = classesOf(subjectOf(one));
      if (cls.some((c) => eased.has(c))) continue;
      hits.add(`${r.file} | ${one.replace(/\s+/g, ' ').slice(0, 110)}`);
    }
  }
  const fresh = [...hits].filter((h) => !allow.display.includes(h)).sort();
  assert.deepEqual(fresh, [], 'a state that is display: none is a pop: give the class an opacity ease (and let the state set opacity: 0), or list it with a reason');
  const stale = allow.display.filter((h) => !hits.has(h));
  assert.deepEqual(stale, [], 'no longer hits: delete from tests/pop-allow.json');
});

test('(c) a 3D-owned state rule that changes colour, fill, opacity or shadow is covered by a transition', () => {
  const rules = own();
  const ease = readFileSync('src/ui/shell/ease.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const listed = new Set<string>(); for (const m of ease.matchAll(/:where\(([^{]*?)\)\s*\{/g)) for (const one of splitSel(m[1]!)) for (const c of classesOf(one)) listed.add(c);
  const transitioned = new Set<string>(listed); for (const r of rules) if (r.decls.some((d) => d.prop === 'transition' && !/^none\b/.test(d.value) && /color|background|opacity|shadow|fill|stroke|all/.test(d.value))) for (const one of splitSel(r.sel)) for (const c of classesOf(subjectOf(one))) transitioned.add(c);
  const hits = new Set<string>();
  for (const r of rules) {
    const changes = r.decls.filter((d) => /^(color|background(-color)?|opacity|box-shadow|fill|stroke|border-color)$/.test(d.prop));
    if (!changes.length) continue;
    for (const one of splitSel(r.sel)) {
      if (!/:hover|\[aria-(pressed|expanded|selected|checked)|\.on\b|\.open\b|\[data-(on|open|state|active)/.test(one)) continue;
      const cls = classesOf(subjectOf(one));
      if (!cls.length || cls.some((c) => transitioned.has(c))) continue;
      hits.add(`${r.file} | ${one.replace(/\s+/g, ' ').slice(0, 110)}`);
    }
  }
  const fresh = [...hits].filter((h) => !allow.state.includes(h)).sort();
  assert.deepEqual(fresh, [], 'a control that changes colour on a state needs a transition: add its class to ui/shell/ease.css or give it one');
  const stale = allow.state.filter((h) => !hits.has(h));
  assert.deepEqual(stale, [], 'no longer hits: delete from tests/pop-allow.json');
});
