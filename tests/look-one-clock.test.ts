// A look change has ONE clock (owner, 22 Nov: "labels change colour before the palette; everything should change at once and fade"): every component that draws in the look reads it from looks/use-look.ts
// (what lookGlide has painted, notified inside the View Transition after the page and figure appliers), never from the settings store, which changes ahead of the transition.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createLookGlide, type GlideEnv } from '../src/looks/glide.ts';
import type { LookId } from '../src/looks/looks.ts';

test('watchers are told after every applier, inside the transition, so React redraws with the figure', async () => {
  const log: string[] = [];
  const env: GlideEnv = { still: () => false, drawn: async () => { log.push('drawn'); }, transition: (apply) => { log.push('transition'); void apply(); } };
  const g = createLookGlide(env);
  g.onLook((l) => log.push(`page:${l}`)); g.onLook((l) => log.push(`figure:${l}`));
  g.watch(() => log.push(`watch:${g.current}`));
  g.change('dark' as LookId); assert.deepEqual(log, ['page:dark', 'figure:dark', 'watch:dark'], 'first paint at once');
  log.length = 0; g.change('navy' as LookId); await Promise.resolve();
  assert.deepEqual(log, ['transition', 'page:navy', 'figure:navy', 'watch:navy', 'drawn']);
  log.length = 0; g.change('navy' as LookId); assert.deepEqual(log, [], 'a repeat tells nobody');
});

test('a watcher can be removed', () => {
  const g = createLookGlide({ still: () => true, drawn: async () => {} });
  let n = 0; const off = g.watch(() => { n++; });
  g.change('light' as LookId); off(); g.change('dark' as LookId); assert.equal(n, 1);
});

test('no component reads the look from the settings store: they all use looks/use-look.ts', () => {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : /\.tsx$/.test(e.name) ? [`${d}/${e.name}`] : []);
  const bad: string[] = [];
  for (const f of walk('src')) {
    if (f.startsWith('src/debug') || f.startsWith('src/ui/debug') || f.endsWith('SettingsSheet.tsx')) continue;   // (the Settings tiles show the CHOICE, which is the press itself, and it eases as a control)
    if (/useSettings\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.look\s*\)/.test(readFileSync(f, 'utf8'))) bad.push(f);
  }
  assert.deepEqual(bad, [], 'a component that reads useSettings(s => s.look) changes ahead of the figure: use useLookId()');
});

test('the labels, captions, key, legend, charts and cards draw in the glided look', () => {
  for (const f of ['src/scene/labels/LabelLayer.tsx', 'src/scene/sinusoid/SinusoidCaptions.tsx', 'src/scene/circuit/CircuitCaptions.tsx', 'src/scene/lobule/LobuleCaptions.tsx', 'src/ui/shell/LensKey.tsx', 'src/ui/action/ActionCard.tsx'])
    assert.match(readFileSync(f, 'utf8'), /useLookId\(\)/, f);
  assert.match(readFileSync('src/ui/charts/Chart.tsx', 'utf8'), /use-look\.ts/);
  assert.match(readFileSync('src/scene/lenses/Legend.tsx', 'utf8'), /use-look\.ts/);
  assert.match(readFileSync('src/looks/use-look.ts', 'utf8'), /lookGlide\.watch/);
});

test('the fade has one duration: the group and both pictures use --d-look, with a selector that outranks the copied 2D rule', () => {
  const css = readFileSync('src/ui/shell/global.css', 'utf8');
  const rules = css.match(/[^\n{}]*::view-transition-(?:group|old|new)\([^{]*\{[^}]*\}/g) ?? [];
  assert.equal(rules.length, 2, 'the group rule and the old/new rule');
  for (const r of rules) { assert.match(r, /^\s*html::/, r); assert.match(r, /animation-duration: var\(--d-look\)/); assert.ok(!/--d-surface/.test(r)); }
  assert.match(readFileSync('src/looks/glide.ts', 'utf8'), /GLIDE_MS = 320/);
  assert.match(css, /--d-look: 320ms/);
});
