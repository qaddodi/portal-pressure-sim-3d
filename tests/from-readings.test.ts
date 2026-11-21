// From readings (Work backward): the 2D app's files are copied whole (scripts/copy-from-readings.mjs), so a hand edit fails here; the search they run gives the textbook
// cases their leaders; and a scenario opened as a patient is one the engine loads ("Yours").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { TRY_CASES } from '../src/engine/hales/portal/inverse-try-cases.js';
import { yoursRecord } from '../src/engine/hales/portal/yours.js';
import { createInverseRemote } from '../src/ui/readings/copied/inverse-remote.copied.js';
import { saveYours, readYours, removeYours } from '../src/ui/readings/copied/yours-store.copied.js';
import { isYours, yoursName } from '../src/ui/readings/yours.ts';
import { pinned2D } from './two-d-pin.ts';

const dir = 'src/ui/readings/copied';
const src = JSON.parse(readFileSync(`${dir}/SOURCE.json`, 'utf8')) as { source: string; hashes: Record<string, string> };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex').slice(0, 16);

test('every copied file is the 2D file, unedited, and its imports are files of this repo', () => {
  assert.deepEqual(Object.keys(src.hashes).sort(), ['fold-slide.copied.js', 'from-readings.copied.js', 'inverse-remote.copied.js', 'inverse-worker.copied.js', 'yours-store.copied.js']);
  for (const [f, hash] of Object.entries(src.hashes)) {
    const buf = readFileSync(`${dir}/${f}`);
    assert.equal(sha(buf), hash, `${f} was edited by hand: change the 2D repo and run scripts/copy-from-readings.mjs`);
    for (const m of buf.toString('utf8').matchAll(/from '(\.[^']+)'/g)) assert.ok(existsSync(resolve(dirname(`${dir}/${f}`), m[1])), `${f} imports ${m[1]}`);
  }
});

const two = pinned2D('src/ui/from-readings.js');
test('the copy is what the 2D app has at the pin (PPS_2D_REPO)', { skip: two.skip }, () => {
  assert.match(execFileSync('node', ['scripts/copy-from-readings.mjs', '--from', two.repo, '--check'], { encoding: 'utf8' }), /is current/);
});

test('the shim gives the copied flow every helper it imports', () => {
  const shim = readFileSync('src/ui/readings/dom2d.ts', 'utf8');
  for (const f of Object.keys(src.hashes)) {
    for (const m of readFileSync(`${dir}/${f}`, 'utf8').matchAll(/import \{([^}]+)\} from '\.\.\/dom2d\.ts'/g)) {
      for (const name of m[1].split(',').map((x) => x.trim()).filter(Boolean)) assert.match(shim, new RegExp(`export (function|const)[^\\n]*\\b${name}\\b`), `${f} needs ${name}`);
    }
  }
});

test('the search on the page (no worker) leads each textbook case with its own lesion', () => {
  const remote = createInverseRemote(null);
  assert.equal(remote.status(), 'library');
  assert.equal(remote.peek({ whvp: 18 }).ready, false, 'one reading is not enough to search');
  for (const c of TRY_CASES as unknown as { id: string; leads: string[]; readings: Record<string, number> }[]) {
    const res = remote.peek(c.readings);
    assert.ok(res.ready, c.id);
    const play = (res.play.length ? res.play : res.families.slice(0, 1)).map((f: { id: string }) => f.id);
    assert.ok(c.leads.some((id) => play.includes(id)), `${c.id}: ${play.join(', ')} should hold one of ${c.leads.join(', ')}`);
  }
});

test('"Open as patient": the scenario is kept on this device as Yours and the engine loads it', async () => {
  const remote = createInverseRemote(null);
  const c = (TRY_CASES as unknown as { id: string; readings: Record<string, number> }[]).find((x) => x.id === 'compensated')!;
  const res = remote.peek(c.readings), f = res.families[0];
  const { list, rec } = saveYours(f.id, f.best.p, res.readings);   // (no storage in node: the list is kept in memory, as in a private window)
  assert.ok(rec && rec.id.startsWith('yours-'));
  assert.deepEqual(rec, yoursRecord(f.id, f.best.p, res.readings, rec.at));
  assert.equal(readYours()[0].id, rec.id);
  assert.equal(isYours(rec.id), true);
  assert.equal(yoursName(rec.id), rec.label);
  assert.equal(isYours('csph'), false);
  assert.equal(yoursName('csph'), '');

  const got: { type: string; id?: string; params?: unknown; presets?: { id: string; group: string }[]; result?: Record<string, number> }[] = [];
  const core = createCore((m: never) => got.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'yours', list, reqId: 1 });
  assert.ok(got.find((m) => m.type === 'presets')!.presets!.some((p) => p.id === rec.id && p.group === 'Yours'));
  await core.handle({ type: 'preset', id: rec.id, reqId: 2 });
  assert.equal(got.find((m) => m.type === 'presetLoaded')!.id, rec.id);
  await core.handle({ type: 'metrics', reqId: 3 });
  core.dispose();
  const m = got.find((x) => x.type === 'metrics')!.result!;
  assert.ok(Math.abs(m.whvp - c.readings.whvp) < 4, `the patient's WHVP (${m.whvp.toFixed(1)}) is near the reading it was made from (${c.readings.whvp})`);

  removeYours(rec.id);
  assert.equal(isYours(rec.id), false);
});

test('loading a patient accepts one made from readings, and the bars name it', () => {
  const load = readFileSync('src/ui/patients/index.ts', 'utf8');
  assert.match(load, /const yours = isYours\(id\)/);
  assert.match(load, /if \(yours\) await syncYours\(\)/);
  assert.match(readFileSync('src/ui/timeline/index.ts', 'utf8'), /\|\| yoursName\(id\) \|\| 'Custom'/);
  assert.match(readFileSync('src/ui/shell/TopBar.tsx', 'utf8'), /\?\? yoursName\(patientId\)/);
});
