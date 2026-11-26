// The parity claims of the 2D gallery's sheets, toasts, teaching-card variants and visuals (src/parity/b12x.ts): each is derived from the copied specimen and the 3D code that draws it, so this reads
// what the claim says against the source it stands on, and holds the rows left open to the reason they are open.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { claims } from '../src/parity/b12x.ts';
import { claims as b12 } from '../src/parity/b12.ts';
import { CARD_CATALOG } from '../src/ui/cards/gallery/catalog.generated.ts';
import { readiness } from '../src/decks/hp/hooks.ts';
import { unclassified } from '../src/decks/hp/fields.ts';
import { camPlan } from '../src/decks/hp/cams.ts';
import { tileKeys } from '../src/ui/deck/from2d/card-tiles.js';
import { tileRows } from '../src/decks/hp/tiles-model.ts';
import { useShell } from '../src/ui/shell/store.ts';
import { pinned2D } from './two-d-pin.ts';
import inventory from '../parity/inventory.json' with { type: 'json' };

const byId = new Map(claims.map((c) => [c.id, c]));
const spec = (id: string) => CARD_CATALOG.find((e) => e.id === id)!;
const inv = new Set((inventory as { rows: { id: string }[] }).rows.map((r) => r.id));
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('every claim is a row of the 2D inventory, once, and none is a row b12.ts has', () => {
  assert.equal(new Set(claims.map((c) => c.id)).size, claims.length);
  for (const c of claims) assert.ok(inv.has(c.id), c.id);
  const mine = new Set(b12.map((c) => c.id));
  for (const c of claims) assert.ok(!mine.has(c.id), `${c.id} is b12.ts's`);
});

test('the specimens the gallery lists are the ones the claims cover: 21 sheet rows, 18 teaching, 7 visual (less what is left open)', () => {
  const rows = (fam: string) => [...inv].filter((id) => id.startsWith(`card:${fam}/`));
  assert.equal(rows('sheet').length, 22);   // (11 sheets and toasts, each listed twice)
  assert.equal(rows('teaching').length, 18);
  assert.equal(rows('visual').length, 8);
  for (const id of ['card:sheet/menu-present#2', 'card:sheet/treat', 'card:sheet/treat#2', 'card:teaching/vignette', 'card:visual/walls']) assert.ok(byId.has(id), id);
  assert.ok(!byId.has('card:sheet/menu-present'), 'b12.ts has the first one');
});

test('what is left open is open for the reason the report gives', () => {
  for (const id of ['teaching/scope-tile', 'visual/scale', 'visual/quadrant']) assert.ok(!byId.has(`card:${id}`), id);
  // visual/scale: its `scale` field is one the slide classifier does not know; visual/quadrant: the readiness table has no owner for it
  const cs = (id: string) => ({ id: 'x', kicker: '', title: '', line: '', notes: '', preset: 'healthy', cam: 'fit', ...spec(id).slide }) as never;
  assert.deepEqual(unclassified(cs('visual/scale') as Record<string, unknown>), ['scale']);
  assert.deepEqual(readiness(cs('visual/quadrant')).unowned, ['visual:quadrant']);
  // teaching/scope-tile: the card asks for a `scope` tile and the tiles card prints only readings it knows, so it is dropped
  const s = spec('teaching/scope-tile').slide as { tiles: string[] };
  const keys = tileKeys(s, false) as string[];
  assert.ok(keys.includes('scope'));
  assert.ok(!tileRows({ deck: 'g', slide: 'x', keys, key: [], delta: null }, {}, null).some((r) => r.key === 'scope'));
});

test('the what-if specimen is present but not wired while its camera is a Circuit region on an anatomy slide', () => {
  const c = byId.get('card:teaching/what-if')!;
  assert.ok(c);
  assert.throws(() => camPlan(spec('teaching/what-if').slide!.cam as string), /no region "tips"/);
  assert.equal(c.wired, false);
});

test('the toasts are the shell\'s own: a line, a line in the bad tone, a line with one button; the card draws the tone and the button', () => {
  const sh = useShell.getState();
  const keep = globalThis.setTimeout;
  mock.timers.enable({ apis: ['setTimeout'] });   // (the shell's toast timer is the mock's: nothing is left running)
  try {
    sh.say('plain'); assert.equal(useShell.getState().toast?.tone, 'info');
    sh.say('bad', 'bad'); assert.equal(useShell.getState().toast?.tone, 'bad');
    sh.say('act', 'info', { label: 'Undo', run: () => undefined }); assert.equal(useShell.getState().toast?.action?.label, 'Undo');
  } finally { useShell.setState({ toast: null }); mock.timers.reset(); }
  assert.equal(globalThis.setTimeout, keep);
  assert.equal(byId.get('card:sheet/toast')?.wired, true);
  for (const id of ['toast-bad', 'toast-action']) for (const sfx of ['', '#2']) { const c = byId.get(`card:sheet/${id}${sfx}`); assert.ok(c, id); assert.equal(c.wired, false, `${id}: 2D's note differs (warning mark, role alert, two buttons)`); }
  const tsx = src('src/ui/shell/Toast.tsx'), css = src('src/ui/shell/shell.css');
  assert.match(tsx, /data-tone=/);
  assert.match(tsx, /sh-toast-act/);
  assert.match(css, /\.sh-toast\[data-tone="bad"\]/);
});

test('the sheets open from the 2D buttons: each opener is in the top bar\'s table and each sheet is mounted', () => {
  const sheets = src('src/ui/shell/Sheets.tsx');
  for (const m of ['<TreatCard', '<HistorySheet', '<DifferencesSheet', '<SettingsSheet', '<UMenu', '<SearchSheet']) assert.ok(sheets.includes(m), m);
  assert.match(src('src/ui/tests/TestsLayer.tsx'), /registerFeature\('tests'/);
  for (const id of ['sheet/treat', 'sheet/history', 'sheet/compare', 'sheet/settings', 'sheet/menu-patients', 'sheet/palette', 'sheet/tests']) assert.equal(byId.get(`card:${id}`)?.wired, true, id);
});

test('Send feedback stays out of this file: its row is b1.ts\'s, claimed only in a build that has the address, and no address is in the repo', () => {
  assert.ok(!byId.has('settings:Top/Send feedback'));
  assert.match(src('src/parity/b1.ts'), /row\.label === 'Send feedback' && !feedbackEmail\(\)/);
  for (const f of ['src/parity/b12x.ts', 'src/ui/cards/gallery/catalog.generated.ts', 'scripts/copy-card-catalog.mjs']) assert.doesNotMatch(src(f), /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, f);
});

const two = pinned2D('src/ui/gallery/catalog.js');
test('the copied specimens are what the 2D app has at the pin (when its checkout is here)', { skip: two.skip }, () => {
  execFileSync('node', ['scripts/copy-card-catalog.mjs', '--from', two.repo, '--check'], { stdio: 'pipe' });
});
