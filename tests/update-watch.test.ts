// A new deploy reaches an open tab (owner, 22 Nov: a tab kept an old build through the service worker and he tested stale code): the page learns of a newer build by itself (build-info.txt, and the worker's signal),
// says so on the pill and in a sticky note, and moves onto it at a safe moment, eased: out of sight at once, in front on a preview once the screen has been quiet 4 s with no finger down and no talk playing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUpdater, parseBuildCommit, newerBuild, whenToApply, takesOverNow, IDLE_APPLY_MS, FADE_MS, type UpdaterEnv } from '../src/pwa/update.ts';
import { useUpdate } from '../src/pwa/update-state.ts';
import { updateText, buildLabel } from '../src/ui/shell/build-pill.ts';
import { buildSw } from '../scripts/pwa.mjs';

const INFO = (c: string) => `version 1.0.0-beta.1\nbranch claude/project-thread-ge1swr\ncommit ${c}\nbuilt 2026-11-22T00:00:00.000Z\nchecks ok\n`;

/** A fake page: a clock the test moves by hand, timers, and the page's state. */
function world(o: Partial<{ mine: string; auto: boolean; info: string | null; hidden: boolean; talk: boolean }> = {}) {
  let now = 0; const timers: { at: number; fn: () => void; id: number }[] = []; let nid = 0;
  const log: string[] = []; const st = { hidden: o.hidden ?? false, talk: o.talk ?? false, info: o.info === undefined ? INFO('bbbbbbbb') : o.info };
  const env: UpdaterEnv = {
    mine: o.mine ?? 'aaaaaaaa', auto: o.auto ?? true, now: () => now, hidden: () => st.hidden, talk: () => st.talk,
    fetchInfo: async () => st.info, reload: () => { log.push('reload'); }, fade: (on) => { log.push(on ? 'fade-out' : 'fade-in'); },
    after: (fn, ms) => { const id = ++nid; timers.push({ at: now + ms, fn, id }); return id as never; }, cancel: (id) => { const i = timers.findIndex((t) => t.id === (id as unknown as number)); if (i >= 0) timers.splice(i, 1); },
    offer: () => { log.push('offer'); },
  };
  const advance = (ms: number, u: ReturnType<typeof createUpdater>) => { const to = now + ms; while (now < to) { const next = Math.min(to, now + 1000); now = next; for (const t of timers.filter((t) => t.at <= now)) { timers.splice(timers.indexOf(t), 1); t.fn(); } u.tick(); } };
  return { env, st, log, advance, setNow: (n: number) => { now = n; } };
}

test('build-info.txt names the build; a different commit is a newer build, the same one or an unreadable one is not', () => {
  assert.equal(parseBuildCommit(INFO('abc12345')), 'abc12345');
  assert.equal(parseBuildCommit('no commit here'), '');
  assert.equal(newerBuild('aaaaaaaa', INFO('bbbbbbbb')), 'bbbbbbbb');
  assert.equal(newerBuild('aaaaaaaa', INFO('aaaaaaaa')), null);
  assert.equal(newerBuild('', INFO('bbbbbbbb')), null, 'a local run has no commit to compare');
  assert.equal(newerBuild('aaaaaaaa', ''), null);
});

test('a tab in front on a preview learns of the new build, says so (pill + note), and moves only after 4 s of quiet, fading first', async () => {
  useUpdate.setState({ commit: null });
  const w = world(); const u = createUpdater(w.env);
  await u.check();
  assert.equal(u.pending, true); assert.equal(useUpdate.getState().commit, 'bbbbbbbb'); assert.deepEqual(w.log, ['offer'], 'told at once; not moved yet');
  w.advance(IDLE_APPLY_MS - 1000, u); assert.deepEqual(w.log, ['offer'], 'still quiet for less than 4 s');
  w.advance(1000, u); assert.deepEqual(w.log, ['offer', 'fade-out'], 'eased out first');
  w.advance(FADE_MS, u); assert.deepEqual(w.log, ['offer', 'fade-out', 'reload']);
});

test('a touch during the quiet restarts it, a finger held down keeps it waiting, and a touch during the fade takes the fade back', async () => {
  useUpdate.setState({ commit: null });
  const w = world(); const u = createUpdater(w.env); await u.check();
  w.advance(3000, u); u.input('other'); w.advance(3000, u);
  assert.deepEqual(w.log, ['offer'], 'a touch restarted the quiet');
  u.input('down'); w.advance(20000, u);
  assert.deepEqual(w.log, ['offer'], 'a finger down for 20 s: never mid-gesture');
  u.input('up'); w.advance(IDLE_APPLY_MS, u);
  assert.deepEqual(w.log, ['offer', 'fade-out']);
  u.input('down');
  assert.deepEqual(w.log, ['offer', 'fade-out', 'fade-in'], 'the fade was taken back');
  u.input('up'); w.advance(FADE_MS * 3, u);
  assert.equal(w.log.includes('reload'), false, 'and the reload that was coming did not happen');
  w.advance(IDLE_APPLY_MS, u);
  assert.equal(w.log.at(-1), 'fade-out', 'after the quiet again it fades out once more');
});

test('never in a talk, in front or out of sight; after the talk it goes', async () => {
  useUpdate.setState({ commit: null });
  const w = world({ talk: true }); const u = createUpdater(w.env); await u.check();
  w.advance(60_000, u); assert.deepEqual(w.log, ['offer']);
  w.st.hidden = true; w.advance(10_000, u); assert.deepEqual(w.log, ['offer'], 'out of sight too: a talk is not interrupted');
  w.st.talk = false; w.advance(1000, u); assert.deepEqual(w.log, ['offer', 'reload'], 'out of sight, the talk over: at once, no fade');
});

test('out of sight it moves at once; a tab found stale while hidden is moved without a fade', async () => {
  useUpdate.setState({ commit: null });
  const w = world({ hidden: true }); const u = createUpdater(w.env); await u.check();
  assert.deepEqual(w.log, ['offer', 'reload']);
});

test('the live site never moves a tab in front by itself (auto off): the note stays and the pill (where there is one) says so', async () => {
  useUpdate.setState({ commit: null });
  const w = world({ auto: false }); const u = createUpdater(w.env); await u.check();
  w.advance(120_000, u); assert.deepEqual(w.log, ['offer']);
  w.st.hidden = true; w.advance(1000, u); assert.deepEqual(w.log, ['offer', 'reload'], 'out of sight it still takes it');
});

test('no newer build, an unreadable build-info or an offline check leaves the tab alone, and the check is asked again', async () => {
  useUpdate.setState({ commit: null });
  const same = world({ info: INFO('aaaaaaaa') }); const a = createUpdater(same.env); await a.check();
  assert.equal(a.pending, false); assert.equal(useUpdate.getState().commit, null);
  const bad = world({ info: null }); const b = createUpdater(bad.env); await b.check(); assert.equal(b.pending, false);
  const off = world(); off.env.fetchInfo = async () => { throw new Error('offline'); }; const c = createUpdater(off.env); await c.check(); assert.equal(c.pending, false);
  off.env.fetchInfo = async () => INFO('bbbbbbbb'); await c.check(); assert.equal(c.pending, true, 'asked again when back online');
});

test('the worker\'s signal (commit unknown) does the same, once, however often it is repeated', () => {
  useUpdate.setState({ commit: null });
  const w = world(); const u = createUpdater(w.env);
  u.found(''); u.found(''); u.found('cccccccc');
  assert.deepEqual(w.log, ['offer']); assert.equal(useUpdate.getState().commit, '');
});

test('the safe-moment rule in one table', () => {
  const base = { pending: true, hidden: false, talk: false, down: false, idleMs: IDLE_APPLY_MS, auto: true };
  assert.equal(whenToApply(base), 'now');
  for (const [k, v] of [['pending', false], ['talk', true], ['down', true], ['idleMs', IDLE_APPLY_MS - 1], ['auto', false]] as const) assert.equal(whenToApply({ ...base, [k]: v }), 'wait', k);
  assert.equal(whenToApply({ ...base, hidden: true, auto: false, idleMs: 0 }), 'now');
  assert.equal(takesOverNow({ pending: true, hidden: true, mode: 'deck' }), false);
});

test('the pill always names the build this page RUNS, also when a newer one is out; the update state is its own words and colour', () => {
  assert.equal(updateText('abc12345', '', null), 'PREVIEW · abc12345');
  assert.equal(updateText('abc12345', 'types: 1 error', null), 'PREVIEW · abc12345 · types: 1 error');
  for (const newer of ['', 'def67890']) assert.match(updateText('abc12345', '', newer), /NEW BUILD · TAP TO UPDATE · on abc12345/);
  assert.equal(buildLabel('claude/x@abc12345'), 'abc12345');
  const pill = readFileSync('src/ui/shell/BuildPill.tsx', 'utf8');
  assert.match(pill, /updateText\(label, checks, newer\)/); assert.match(pill, /VITE_BUILD/);
  assert.match(pill, /newer !== null \? '#0b7a3b'/);
  assert.match(readFileSync('src/App.tsx', 'utf8'), /VITE_CHANNEL === 'preview' && <BuildPill \/>/);
});

test('the wiring: the worker\'s takeover tells the updater, the page asks the host itself, only a preview moves by itself, and build-info.txt is never served by the worker', async () => {
  const reg = readFileSync('src/pwa/register.ts', 'utf8');
  assert.match(reg, /startUpdateWatch\(\(\) => offerReload\(\)\)/); assert.match(reg, /watching\.found\(''\)/);
  assert.match(reg, /\}, true\);/, 'the note is sticky: one that fades is one he misses');
  const up = readFileSync('src/pwa/update.ts', 'utf8');
  assert.match(up, /auto: import\.meta\.env\.VITE_CHANNEL === 'preview'/);
  assert.match(up, /build-info\.txt'[^\n]*cache: 'no-store'/);
  assert.match(up, /visibilitychange[\s\S]*addEventListener\('pageshow', ask\); addEventListener\('online', ask\)/);
  // the worker leaves build-info.txt to the network (it is neither held nor under assets/)
  const sw = buildSw({ build: 'x', files: ['index.html'], boot: ['index.html'], later: [] });
  const on: Record<string, (e: unknown) => void> = {};
  new Function('self', 'caches', 'fetch', 'setTimeout', sw)({ registration: { scope: 'https://x.test/app/' }, addEventListener: (t: string, f: (e: unknown) => void) => { on[t] = f; } }, {}, async () => undefined, setTimeout);
  let answered = false;
  on.fetch!({ request: { method: 'GET', url: 'https://x.test/app/build-info.txt', mode: 'cors' }, respondWith: () => { answered = true; }, waitUntil() {} });
  assert.equal(answered, false);
});
