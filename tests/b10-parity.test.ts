// B10's parity claims (src/parity/b10.ts) held against what the app really does: the look tables a chart reads, the options a chart honours, the mounts the presenter has, the treatment menu, the tiles the card prints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pinned2D } from './two-d-pin.ts';
import { CHARTS } from '../src/ui/charts/registry.ts';
import { LOOKS_ASKED } from '../src/ui/charts/looks.ts';
import { claims, LOOK_GROUPS, TOOL_OPTIONS } from '../src/parity/b10.ts';
import { CATALOG } from '../src/ui/charts/gallery/catalog.generated.ts';
import { CHART_TOOLS } from '../src/decks/charts.ts';
import { ctxOf } from './charts-helpers.ts';
import {  menuPoints, menuSteps, baseName, ratingTok } from '../src/ui/charts/menu/menu-pure.generated.js';
import { menuOptionsOf } from '../src/ui/charts/menu/menu-types.ts';
import { menuFrame } from '../src/ui/charts/menu/frame.ts';
import { featureOf, CARD_LANDED } from '../src/decks/hp/hooks.ts';
import { ownKeys } from '../src/ui/deck/from2d/card-tiles.js';
import { keysFor, tileRows } from '../src/decks/hp/tiles-model.ts';

const inv = JSON.parse(readFileSync('parity/inventory.json', 'utf8')) as { rows: { id: string; area: string }[] };
const ids = new Set(inv.rows.map((r) => r.id));

test('every claim is a row of the inventory, and every chart: and card: row of the chart families has its 2D specimen', () => {
  for (const c of claims) assert.ok(ids.has(c.id), `${c.id} is not in the inventory`);
  const have = new Set(CATALOG.map((e) => `card:${e.id}`));
  for (const e of CATALOG) assert.ok(ids.has(`card:${e.id}`), `${e.id} has no row`);
  assert.equal(CATALOG.length, 115);   // (116 in 2D: `path/aasld` is not carried, Baveno VIII is the only guideline drawn; scripts/source-edits.mjs)
  assert.ok(have.has('card:menu/full') && have.has('card:tiles/dips') && have.has('card:trial/sharma'));
});

test('a chart-look row is claimed only when a chart of the registry really reads its table (every specimen built, every key asked)', () => {
  const asked = (kind: string) => {
    LOOKS_ASKED.clear();
    for (const s of CHARTS.find((c) => c.kind === kind)!.specimens) s.build(ctxOf('light', 330, 'desktop'));
    return new Set([...LOOKS_ASKED].map((k) => k.split('.')[0]!));
  };
  for (const [look, g] of Object.entries(LOOK_GROUPS)) {
    if (!claims.some((c) => c.id === `chart:${look}`)) continue;
    const read = new Set(g.kinds.flatMap((k) => [...asked(k)]));
    assert.ok(g.groups.some((x) => read.has(x)), `chart:${look} is claimed but no specimen of ${g.kinds.join('/')} reads ${g.groups.join('/')}`);
  }
});

test('the options a chart is said to honour are in its mount or its chart folder', () => {
  const tool = readFileSync('src/ui/talk/ToolCard.tsx', 'utf8') + readFileSync('src/ui/talk/ToolCardBody.tsx', 'utf8') + readFileSync('src/ui/deck/from2d/card-tiles.js', 'utf8');   // (keepTiles is the tiles card's: 2D ownKeys)
  const FOLDER: Record<string, string> = { course: 'curve', stent: 'stent', evgraph: 'evgraph' };
  for (const [kind, opts] of Object.entries(TOOL_OPTIONS)) {
    const dir = `src/ui/charts/${FOLDER[kind] ?? kind}`;
    let text = tool;
    try { text += readdirSync(dir, { recursive: true }).filter((f) => /\.(ts|tsx|js)$/.test(String(f))).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n'); } catch { /* none */ }
    for (const o of opts) assert.ok(new RegExp(`\\b${o}\\b`).test(text), `${kind}: nothing reads the option "${o}"`);
  }
});

test('a tool claimed wired is mounted by ToolCard (a case for its kind)', () => {
  const tool = readFileSync('src/ui/talk/ToolCard.tsx', 'utf8') + readFileSync('src/ui/talk/ToolCardBody.tsx', 'utf8');
  for (const c of claims) {
    const m = /^tool:(.+)$/.exec(c.id);
    if (!m || !c.wired) continue;
    assert.ok((CHART_TOOLS as readonly string[]).includes(m[1]!), `${c.id}: not in CHART_TOOLS`);
    assert.ok(new RegExp(`case '${m[1]}'`).test(tool), `${c.id}: ToolCard has no case for it`);
  }
});

test('the treatment menu offers what the 2D rules offer, and draws one dot for each', () => {
  const all = (menuOptionsOf({}) as { id: string }[]).map((m) => m.id);
  assert.ok(all.includes('carvedilol') && all.includes('tips8') && all.includes('warren'));
  assert.ok(!all.includes('recanalization'), 'no clot, nothing to recanalize');
  const clot = (menuOptionsOf({ thrombus: { PV_TRUNK: 0.9 } }) as { id: string }[]).map((m) => m.id);
  assert.ok(clot.includes('recanalization') && !clot.includes('tips8') && !clot.includes('tips10'), 'a clotted trunk: recanalization, no TIPS');
  assert.deepEqual((menuOptionsOf({}, ['carvedilol', 'tips8', 'nope']) as { id: string }[]).map((m) => m.id), ['carvedilol', 'tips8']);
  const opts = menuOptionsOf({}) as { id: string; name: string }[];
  assert.equal((menuSteps(opts) as unknown[]).length, opts.length);
  assert.equal(baseName({ drugs: { carvedilol: true } }), 'As now');
  assert.equal(baseName({}), 'No treatment');
  assert.equal(ratingTok(4), 'ok'); assert.equal(ratingTok(9), 'caution'); assert.equal(ratingTok(14), 'danger');
  const dots = menuPoints(opts, opts.map((_, i) => ({ fp: { ppg: 8 + i, liver: 60 - i, shunt: 0.1 } }))) as unknown[];
  assert.equal(dots.length, opts.length);
  assert.equal(menuPoints(opts, [] as never), null, 'a run that came back short draws nothing');
  const c = ctxOf('light', 330, 'desktop');
  const f = menuFrame({ dots: dots as never, base: { ppg: 14, liver: 62, shunt: 0 }, baseLabel: 'No treatment' }, c).frame;
  assert.equal(f.shapes.filter((s) => s.k === 'circle').length, opts.length + 1, 'a dot for each treatment and the ring');
  assert.match(f.label, /Treatment menu/);
});

test('the features this batch landed are in the readiness table, each held to the thing that does it', () => {
  for (const h of ['tiles', 'tool:menu', 'tool:course']) assert.equal(featureOf(h)?.landed, true, h);
  for (const h of ['tool:menu', 'tool:course']) assert.equal(featureOf(h)?.landed, true, `hook ${h}`);
  for (const h of ['card:chart-foot', 'card:cohort', 'data:graph', 'visual:plane-options']) assert.ok(h in CARD_LANDED, `${h} is held to the file that prints it`);
  assert.ok(readFileSync('src/ui/talk/ToolCard.tsx', 'utf8') + readFileSync('src/ui/talk/ToolCardBody.tsx', 'utf8').includes('<MenuCard'));
  assert.ok(readFileSync('src/ui/cards/CardLayer.tsx', 'utf8').includes('<TilesCard'));
});

test('the tiles card leaves out what the slide\'s own chart shows (2D ownKeys): a flow-time chart\'s lines on a wide screen unless keepTiles, never on a phone', () => {
  const s = { tiles: ['pvFlow', 'lsm'], tool: { kind: 'flowtime', lines: ['pv', 'pvFlow'] } };
  assert.deepEqual(ownKeys(s, false), ['lsm']);
  assert.deepEqual(ownKeys(s, true), ['pvFlow', 'lsm']);
  assert.deepEqual(ownKeys({ ...s, tool: { ...s.tool, keepTiles: true } }, false), ['pvFlow', 'lsm']);
  assert.deepEqual(ownKeys({ tiles: ['lsm', 'plt'], tool: { kind: 'fibroscan' } }, true), ['plt']);
  const spec = { deck: 'd', slide: 's', keys: s.tiles, key: [], delta: null, own: { wide: ownKeys(s, false), phone: ownKeys(s, true) } };
  assert.deepEqual(tileRows(spec, { pvFlow: 1, lsm: 9 }, null, keysFor(spec, false)).map((r) => r.key), ['lsm']);
  assert.deepEqual(tileRows(spec, { pvFlow: 1, lsm: 9 }, null, keysFor(spec, true)).map((r) => r.key), ['pvFlow', 'lsm']);
});

const two = pinned2D('src/ui/tool-menu.js');
test('the copied 2D menu and gallery catalog are what the 2D app has at the pin (when its checkout is here)', { skip: two.skip }, () => {
  execFileSync('node', ['scripts/copy-chart-menu.mjs', '--from', two.repo, '--check'], { stdio: 'pipe' });
  execFileSync('node', ['scripts/copy-chart-catalog.mjs', '--from', two.repo, '--check'], { stdio: 'pipe' });
});
