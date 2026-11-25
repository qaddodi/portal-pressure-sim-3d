// On a page the micro views' preparation (scene.ts microStep) builds the Lobule's vessels once, welded, so it stands down at that step until the baked weld plan is in (a dive asks for it by itself and waits behind the cue); when the plan
// settles, the preparation goes on and the views are primed. Off a page (every other test) nothing waits. Node only: a fake page and fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const baked = new URL('../public/lobule/welds.bin', import.meta.url);
const g = globalThis as Record<string, unknown>;
const before = { window: g.window, fetch: g.fetch };
let reads = 0;
// (the page's own modules decide at load whether they are on a page: the scene is imported first, off one, and the page is faked only for the steps under test)
const { CelScene } = await import('../src/scene/scene.ts');
type Priv = { microStep(): boolean; microPrimedNow: boolean; lobule3d: { weldsWait: boolean; weldCount: number; onWeldsSettled: (() => void) | null }; buildMicroIdle(u?: boolean): void; wantWelds(): void; microJob: unknown };

test('the preparation stands down at the Lobule\'s vessels until the weld plan is in, then goes on and primes', { skip: !existsSync(baked) }, async () => {
  const s = new CelScene() as unknown as Priv;
  g.window = { requestAnimationFrame: (f: () => void) => setTimeout(f, 16), cancelAnimationFrame: (h: number) => clearTimeout(h) };
  g.fetch = async () => { reads++; return new Response(new Uint8Array(readFileSync(baked)), { status: 200 }); };
  let parked = false, guard = 0;
  while (!parked && guard++ < 20000) { parked = s.microStep(); }
  assert.ok(parked, 'the job ended (it stood down)');
  assert.equal(s.microPrimedNow, false, 'but the views are not primed');
  assert.equal(s.lobule3d.weldsWait, true, 'for the plan');
  assert.equal(reads, 0, 'which nobody has asked for: a boot reads nothing');
  s.buildMicroIdle = () => {};   // (the slot is driven by hand: the settle's resume is the call under test)
  let resumed = 0; s.buildMicroIdle = () => { resumed++; };
  const done = new Promise<void>((ok) => { const was = s.lobule3d.onWeldsSettled; s.lobule3d.onWeldsSettled = () => { was?.(); ok(); }; });
  s.wantWelds();
  await done;
  assert.equal(reads, 1);
  assert.equal(resumed, 1, 'the plan being in takes the preparation up again');
  guard = 0; while (!s.microStep() && guard++ < 200000) { /* the rest of the steps */ }
  assert.ok(s.microPrimedNow, 'primed once the plan is in');
  assert.ok(s.lobule3d.weldCount > 100, 'and the vessels are the welded ones');
});

test.after(() => { g.window = before.window; g.fetch = before.fetch; });
