// Plan 37 gate (c): the cascade resolver (scripts/css-cascade.mjs) decides what the stylesheets finally say, so a stronger old 2D rule cannot silently place or fill a 3D element.
// Node only. stretch-allow.json lists the classes that really are full-width absolute/fixed (bars, tracks, veils); the list may only shrink.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRules, resolve } from '../scripts/css-cascade.mjs';

const rules = loadRules();
const CONTEXTS: Record<string, string[]> = { rest: ['html'], stack: ['html', 'div.pz.stack'], noglass: ['html[data-noglass]'], thumb: ['html.thumb-ui', 'div.app.thumb'] };
const allow: string[] = JSON.parse(readFileSync(new URL('./stretch-allow.json', import.meta.url), 'utf8'));
const set = (v: string | null) => (v ?? '').trim();

function stretchers(): Map<string, string[]> {
  const classes = new Set<string>();
  for (const r of rules) { const last = r.selector.trim().split(/[\s>]+/).pop() as string; for (const m of last.matchAll(/\.([\w-]+)/g)) classes.add(m[1]); }
  const hits = new Map<string, string[]>();
  for (const c of classes) for (const [cn, pre] of Object.entries(CONTEXTS)) {
    const o = resolve(rules, [...pre, 'div.' + c], ['position', 'left', 'right', 'width']) as Record<string, string | null>;
    if (/^(absolute|fixed)$/.test(set(o.position)) && set(o.left) && set(o.right) && set(o.left) !== 'auto' && set(o.right) !== 'auto' && (!set(o.width) || set(o.width) === 'auto')) hits.set(c, [...(hits.get(c) ?? []), cn]);
  }
  return hits;
}

test('an absolute or fixed element with left and right both set and width auto stretches across: only the listed bars may', () => {
  const hits = stretchers();
  const extra = [...hits].filter(([c]) => !allow.includes(c)).map(([c, v]) => `${c} (${v.join(', ')})`);
  assert.deepEqual(extra, [], `a new full-width absolute element (the Protein legend bar class of bug): ${extra.join('; ')}`);
  const gone = allow.filter((c) => !hits.has(c));
  assert.deepEqual(gone, [], `no longer stretches, remove from stretch-allow.json: ${gone.join(', ')}`);
});

test('the Protein legend resolves to no background, with and without glass', () => {
  for (const root of ['html', 'html[data-noglass]', 'html.thumb-ui']) assert.equal((resolve(rules, [root, 'div.sv-legend'], ['background']) as Record<string, string | null>).background, 'none', root);
});

test('a choice group inside a teaching card sits in the card\'s flow (position static), on every layout', () => {
  for (const pre of [['html'], ['html', 'div.pz.stack'], ['html[data-noglass]'], ['html.thumb-ui', 'div.app.thumb']]) {
    const o = resolve(rules, [...pre, 'div.pz-text', 'div.pz-ab'], ['position']) as Record<string, string | null>;
    assert.ok(!set(o.position) || set(o.position) === 'static', `${pre.join(' ')}: ${o.position} from ${o['position:rule']}`);
  }
});
