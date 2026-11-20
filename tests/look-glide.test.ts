// A change of look is eased, never an instant swap (owner, 20 Nov): the page and the figure change together inside one View Transition; the first paint, Reduce Motion and a repeat are at once or nothing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createLookGlide, type GlideEnv } from '../src/looks/glide.ts';
import type { LookId } from '../src/looks/looks.ts';

const rig = (over: Partial<GlideEnv> = {}) => {
  const log: string[] = [];
  const env: GlideEnv = { still: () => false, drawn: async () => { log.push('drawn'); }, transition: (apply) => { log.push('transition'); void apply(); }, ease: () => { log.push('ease'); }, ...over };
  const g = createLookGlide(env);
  g.onLook((l) => log.push(`page:${l}`)); g.onLook((l) => log.push(`figure:${l}`));
  return { g, log };
};

test('the first look is applied at once, a change goes through the transition with both appliers inside it', async () => {
  const { g, log } = rig();
  g.change('dark' as LookId);
  assert.deepEqual(log, ['page:dark', 'figure:dark'], 'first paint: no transition');
  log.length = 0;
  g.change('navy' as LookId);
  await Promise.resolve();
  assert.deepEqual(log, ['transition', 'page:navy', 'figure:navy', 'drawn']);
});

test('the same look again does nothing; Reduce Motion and a hidden page apply at once', () => {
  const { g, log } = rig({ still: () => true });
  g.change('light' as LookId); log.length = 0;
  g.change('light' as LookId); assert.deepEqual(log, []);
  g.change('dark' as LookId); assert.deepEqual(log, ['page:dark', 'figure:dark']);
});

test('without View Transitions the page\'s colours ease and the figure changes at once', () => {
  const { g, log } = rig({ transition: undefined });
  g.change('light' as LookId); log.length = 0;
  g.change('soft' as LookId);
  assert.deepEqual(log, ['ease', 'page:soft', 'figure:soft']);
});

test('a late applier (the figure mounting after the page) gets the look in force', () => {
  const { g } = rig(); g.change('black' as LookId);
  let got = ''; g.onLook((l) => { got = l; });
  assert.equal(got, 'black');
});

test('the page and the figure are wired to it, and the stylesheet eases the fade', () => {
  assert.match(readFileSync('src/main.tsx', 'utf8'), /lookGlide\.change\(/);
  assert.match(readFileSync('src/scene/Stage.tsx', 'utf8'), /lookGlide\.onLook\(/);
  const css = readFileSync('src/ui/shell/global.css', 'utf8');
  assert.match(css, /::view-transition-group\(root\)[^}]*animation-duration: 320ms/);
  assert.match(css, /html\.look-glide/);
});

test('a new patient eases (organs, disease, collaterals), the colour key cross-fades, controls ease their states', () => {
  const sc = readFileSync('src/scene/scene.ts', 'utf8');
  assert.ok(!/instant: first \|\| f\.jump/.test(sc) && !/instant \|\| f\.jump/.test(sc) && !/\}, f\.jump\);/.test(sc), 'a jump frame no longer forces the disease, presence or shapes to snap');
  const key = readFileSync('src/ui/shell/LensKey.tsx', 'utf8');
  assert.match(key, /useLeaving/); assert.match(key, /lens-key/);
  const ease = readFileSync('src/ui/shell/ease.css', 'utf8');
  assert.match(ease, /:where\(/); assert.match(ease, /background-color var\(--d-small/);
  assert.match(readFileSync('src/main.tsx', 'utf8'), /shell\/ease\.css/);
});
