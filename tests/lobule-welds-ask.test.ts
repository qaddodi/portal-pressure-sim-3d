// The Lobule's baked weld plan (1.7 MB) is not part of the first download. On a page the Lobule's constructor does not ask for it and no timer does: the quiet ladder's `welds` rung asks once the cover is up,
// and the first look at the Lobule asks at once. Off a page (a test, no window) it asks at the constructor, as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { Lobule3D } from '../src/scene/micro3d/lobule3d.ts';
import { forgetWeldBytes } from '../src/scene/lobule/weld-client.ts';
import { RUNGS } from '../src/boot/warm.ts';
import { setWeldWanter } from '../src/scene/lobule/weld-want.ts';

const g = globalThis as unknown as Record<string, unknown>;

/** What reading the weld file asks of the network, with the page's own globals stood in (a window, fetch, an unzipper) for as long as `fn` runs. */
async function onAPage<T>(fn: (asked: () => number) => Promise<T> | T): Promise<T> {
  const was = { window: g.window, fetch: g.fetch, DecompressionStream: g.DecompressionStream };
  let n = 0;
  g.window = {}; g.DecompressionStream = class {};
  // (the file is "not there": a 404 is answered at once and is not retried (src/boot/fetch-bin.ts). A fake that REJECTED made fetchBin ask once more 600 ms later, a second request that was not a
  // second ask and, when it fired in the NEXT test, was counted there: tests/fetch-bin.test.ts pins that a 404 leaves no timer behind)
  g.fetch = async (url: unknown) => { if (String(url).includes('welds.bin')) n++; return new Response('gone', { status: 404 }); };
  forgetWeldBytes();
  try { return await fn(() => n); } finally { for (const k of Object.keys(was)) { if (was[k as keyof typeof was] === undefined) delete g[k]; else g[k] = was[k as keyof typeof was]; } forgetWeldBytes(); }
}
const lazyLobule = (): Lobule3D => { const flat = new LobuleView(createShared()); return new Lobule3D(flat, createShared()); };
const settle = (): Promise<void> => new Promise((ok) => setTimeout(ok, 20));

test('on a page the Lobule does not ask for the weld plan when it is built or later on a timer; being asked for it (the ladder, a dive) does', async () => {
  await onAPage(async (asked) => {
    const l3 = lazyLobule();
    await settle();
    assert.equal(asked(), 0, 'built, not asked');
    assert.equal(l3.weldsWait, true, 'and the dive still waits for it');
    l3.wantWelds();
    await settle();
    assert.equal(asked(), 1, 'asked once when wanted');
    l3.wantWelds();
    await settle();
    assert.equal(asked(), 1, 'never twice');
  });
});

test('a Lobule that is wanted and was never asked for the plan asks as it comes into use', async () => {
  await onAPage(async (asked) => {
    const flat = new LobuleView(createShared()), l3 = new Lobule3D(flat, createShared());
    flat.setVisible(true);
    l3.update(true, 0, 1000, 1, true);
    await settle();
    assert.equal(asked(), 1, 'in use, so it asks at once');
  });
});

test('off a page a Lobule asks for the weld plan as it is built, as before', async () => {
  assert.equal(typeof window, 'undefined');
  const l3 = lazyLobule();
  assert.equal(l3.weldsWait, false, 'nothing to wait for off a page');
  await settle();
  assert.equal(l3.weldsProgress, 1, 'it asked as it was built, and the ask is over');
});

test('the quiet ladder has a welds rung after the talk\'s modules that reads the file in after the cover and then asks for the plan', async () => {
  const at = RUNGS.findIndex((r) => r.id === 'welds');
  assert.ok(at > RUNGS.findIndex((r) => r.id === 'module:talk'), 'after the modules');
  let wanted = 0;
  setWeldWanter(() => { wanted++; });
  try { RUNGS[at]!.run(); } finally { setWeldWanter(null); }
  assert.equal(wanted, 1, 'the rung\'s run asks for the plan');
  assert.equal(typeof RUNGS[at]!.load, 'function', 'the file is read in ahead of the slot');
});
