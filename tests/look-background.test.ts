// Plan 29: the look never follows the device while the page is hidden (iOS's app-switcher snapshot flips light then dark); on return it settles at once, never glides.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createLookGlide } from '../src/looks/glide.ts';
import { followDevice } from '../src/looks/follow-device.ts';
import type { LookChoice } from '../src/looks/looks.ts';

const rig = (choice: LookChoice, dark: boolean) => {
  const log: string[] = [];
  let t = 1000;
  const lis: Record<string, Array<() => void>> = {};
  const target = { addEventListener: (k: string, fn: () => void) => { (lis[k] ??= []).push(fn); } };
  const doc = { visibilityState: 'visible', ...target };
  const mq = { matches: dark, ...target };
  const g = createLookGlide({ still: () => doc.visibilityState !== 'visible', drawn: async () => {}, transition: (a) => { log.push('transition'); void a(); } });
  g.onLook((l) => log.push(`apply:${l}`));
  g.change(choice === 'system' ? (dark ? 'dark' : 'light') : choice as never);
  log.length = 0;
  followDevice({ doc: doc as never, win: target, mq: mq as never, glide: g, choice: () => choice, now: () => t });
  const fire = (k: string) => (lis[k] ?? []).forEach((f) => f());
  return {
    log, advance: (ms: number) => { t += ms; },
    hide: () => { doc.visibilityState = 'hidden'; fire('visibilitychange'); },
    show: () => { doc.visibilityState = 'visible'; fire('visibilitychange'); },
    device: (d: boolean) => { mq.matches = d; fire('change'); },
  };
};

test('System, device dark: hidden light then dark events, return: 0 applies, no transition', () => {
  const r = rig('system', true);
  r.hide(); r.device(false); r.device(true); r.show();
  assert.deepEqual(r.log, []);
});

test('System, device dark: the light event only, held to the return: still 0 applies once dark is back', () => {
  const r = rig('system', true);
  r.hide(); r.device(false); r.device(true); r.show(); r.advance(100); r.device(true);
  assert.deepEqual(r.log, []);
});

test('the device really went light while away: one instant apply, no transition', () => {
  const r = rig('system', true);
  r.hide(); r.device(false); r.show();
  assert.deepEqual(r.log, ['apply:light']);
});

test('a stale device event just after return is applied at once, not glided', () => {
  const r = rig('system', true);
  r.hide(); r.show(); r.advance(50); r.device(false);
  assert.deepEqual(r.log, ['apply:light']);
});

test('visible, a real device switch glides: one transition', () => {
  const r = rig('system', true);
  r.advance(60000); r.device(false);
  assert.deepEqual(r.log, ['transition', 'apply:light']);
});

test('a chosen Dark: no events, hidden or shown, apply anything', () => {
  const r = rig('dark', true);
  r.device(false); r.hide(); r.device(false); r.device(true); r.show(); r.advance(60000); r.device(false);
  assert.deepEqual(r.log, []);
});

test('main.tsx uses followDevice and no longer listens to the device directly', () => {
  const src = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.ok(src.includes('followDevice('));
  assert.ok(!/dark\.addEventListener\('change'/.test(src));
});
