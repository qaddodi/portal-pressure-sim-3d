// The Lobule's baked weld plan (1.7 MB) is not part of the first download (review D3, 25 Nov): on a page the Lobule does not ask for it when it is built; the quiet ladder (boot/warm.ts) or the first dive asks;
// until it is in, `weldsWait` holds the micro views' preparation (scene.ts) and so the dive, behind the cue, which says how far the file has come. Node only: a fake page, a fake fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const baked = new URL('../public/lobule/welds.bin', import.meta.url);
const g = globalThis as Record<string, unknown>;
const before = { window: g.window, fetch: g.fetch };
g.window = {};   // (a page: the weld client and the Lobule look for it when they are asked, not when they load)

const { createShared } = await import('../src/scene/materials/cel.ts');
const { LobuleView } = await import('../src/scene/lobule/view.ts');
const { Lobule3D } = await import('../src/scene/micro3d/lobule3d.ts');
const { weldBytes, forgetWeldBytes } = await import('../src/scene/lobule/weld-client.ts');
const { waitCue, cueWords } = await import('../src/ui/shell/wait-cue.ts');

test('a Lobule built on a page asks for nothing and waits; asked, it reads the file, reports how far it came, and lets the preparation go on when the plan is in', { skip: !existsSync(baked) }, async () => {
  const body = readFileSync(baked);
  let asked = 0;
  g.fetch = async (url: string) => {
    asked++; assert.match(String(url), /lobule\/welds\.bin$/);
    // (in three pieces, as a link brings it)
    const cut = [Math.floor(body.length / 3), Math.floor((2 * body.length) / 3)];
    const parts = [body.subarray(0, cut[0]), body.subarray(cut[0], cut[1]), body.subarray(cut[1])];
    return new Response(new ReadableStream({ async start(c) { for (const p of parts) { c.enqueue(new Uint8Array(p)); await new Promise((r) => setImmediate(r)); } c.close(); } }), { status: 200, headers: { 'content-length': String(body.length) } });
  };
  const l3 = new Lobule3D(new LobuleView(createShared()), createShared(), true);
  assert.equal(asked, 0, 'nothing asked for in the constructor');
  assert.equal(l3.weldsWait, true, 'a page waits for its plan');
  const shares: number[] = []; let settled = 0;
  l3.onWeldProgress = (k) => shares.push(k);
  l3.onWeldsSettled = () => { settled++; };
  const done = new Promise<void>((ok) => { const was = l3.onWeldsSettled; l3.onWeldsSettled = () => { was?.(); ok(); }; });
  l3.wantWelds(); l3.wantWelds();   // (asked twice: read once)
  await done;
  assert.equal(asked, 1, 'one read however often it is asked');
  assert.equal(settled, 1);
  assert.equal(l3.weldsWait, false, 'the preparation may go on');
  assert.ok(shares.length >= 3 && shares.every((k, i) => i === 0 || k >= shares[i - 1]!) && shares[shares.length - 1] === 1, `progress only grows and ends at 1: ${shares.join(' ')}`);
  assert.ok(shares.some((k) => k > 0 && k < 1), 'and says how far it came on the way');
  await new Promise((r) => setImmediate(r));
  assert.ok(l3.weldCount > 100, `the baked plan is laid in (${l3.weldCount} welds)`);
  assert.equal(gunzipSync(body).readUInt32LE(0), 0x3242574c, 'the file is the second layout');
});

test('a Lobule whose file cannot be read stops waiting at once: a person is never held for ten seconds of planning, the dive goes on with round-ended tubes', async () => {
  forgetWeldBytes();
  g.fetch = async () => new Response('gone', { status: 404 });
  const l3 = new Lobule3D(new LobuleView(createShared()), createShared(), true);
  const done = new Promise<void>((ok) => { l3.onWeldsSettled = ok; });
  l3.wantWelds();
  await done;
  assert.equal(l3.weldsWait, false);
  assert.equal(l3.weldCount, 0, 'no plan yet (a worker, where there is one, lays it in later while the Lobule is out of sight)');
});

test('a failed read is not kept: the next ask reads the file again', { skip: !existsSync(baked) }, async () => {
  forgetWeldBytes();
  let n = 0;
  g.fetch = async () => { n++; if (n === 1) throw new Error('offline'); return new Response(new Uint8Array(readFileSync(baked)), { status: 200 }); };
  assert.equal(await weldBytes(), null, 'offline: nothing');
  const b = await weldBytes();
  assert.ok(b instanceof ArrayBuffer && b.byteLength > 1000, 'back online: the file');
  assert.equal(n, 2);
  assert.equal(await weldBytes(), b, 'and then kept');
  assert.equal(n, 2);
});

test('the cue says how far a file has come, in fives of a hundred, and plain words without it', async () => {
  const body: { children: unknown[] } = { children: [] };
  assert.equal(cueWords('the lobule'), 'Preparing the lobule…');
  assert.equal(cueWords('the lobule', 0.4), 'Preparing the lobule… 40%');
  assert.equal(cueWords('the lobule', 1.7), 'Preparing the lobule… 100%');
  assert.equal(cueWords('the lobule', -1), 'Preparing the lobule… 0%');
  void body;
  const done = waitCue('the lobule', { after: 10_000 });   // (no document here: a cue that cannot show still takes the calls)
  done.progress?.(0.33); done.progress?.(null); done();
});

test.after(() => { g.window = before.window; g.fetch = before.fetch; });
