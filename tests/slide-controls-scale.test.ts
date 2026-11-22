// Plan 37 gate (b): the Scale choices are an in-card choice group (pz-ab), never 2D's floating pill (pz-scales, placed by variables only 2D's presenter sets: on a phone it landed over the words).
// Source-read (node cannot load .tsx): ScalePill is the one place every slide with `controls.scales` (decks/hp/fields.ts) is drawn, so its root's class list is the class list of all of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadRules, resolve } from '../scripts/css-cascade.mjs';

const src = readFileSync(new URL('../src/ui/cards/SlideControls.tsx', import.meta.url), 'utf8');

test('ScalePill\'s root is pz-ab and never carries pz-scales; no component in src/ renders pz-scales', () => {
  const body = /export function ScalePill\([\s\S]*?\n}\n/.exec(src)?.[0] ?? '';
  const cls = /<div className="([^"]*)"/.exec(body)?.[1].split(/\s+/) ?? [];
  assert.ok(cls.includes('pz-ab') && !cls.includes('pz-scales'), `ScalePill root class: ${cls.join(' ')}`);
  const walk = (d: URL): URL[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'engine' ? [] : walk(new URL(e.name + '/', d))) : /\.tsx?$/.test(e.name) ? [new URL(e.name, d)] : []);
  const users = walk(new URL('../src/', import.meta.url)).filter((f) => /pz-scales/.test(readFileSync(f, 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''))).map((f) => f.pathname);
  assert.deepEqual(users, [], 'a 3D component renders 2D\'s floating pill class');
});

test('the Scale choices resolve to position static (in the card\'s flow) inside the teaching card, on every layout', () => {
  const rules = loadRules();
  for (const pre of [['html'], ['html', 'div.pz.stack'], ['html[data-noglass]'], ['html.thumb-ui', 'div.app.thumb']]) {
    const o = resolve(rules, [...pre, 'div.pz-text', 'div.pz-ab'], ['position']) as Record<string, string | null>;
    assert.ok(!o.position || o.position === 'static', `${pre.join(' ')}: ${o.position} from ${o['position:rule']}`);
  }
});
