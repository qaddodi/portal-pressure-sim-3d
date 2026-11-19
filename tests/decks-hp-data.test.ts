// Batch B13b (decks H to P): the copied decks are the 2D app's, every slide is planned (a shot, a lens, its needs), and every need has an owner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { HP_DECKS, HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import { planDeck } from '../src/decks/hp/plan.ts';
import { FEATURES, needsOf, readiness } from '../src/decks/hp/hooks.ts';
import { camPlan, boxToShot, sceneX, sceneY, PLATE } from '../src/decks/hp/cams.ts';
import { REGIONS } from '../src/decks/hp/regions.copied.ts';
import { tokensOf } from '../src/decks/hp/numbers.ts';
import type { CopiedDeck } from '../src/decks/hp/types.ts';
import { pinned2D } from './two-d-pin.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
interface Inv { decks: { id: string; title: string; slides: { id: string }[]; checks: number; objectives: number }[]; rows: { id: string }[] }
const inventory = JSON.parse(readFileSync(join(root, 'parity/inventory.json'), 'utf8')) as Inv;
const mine = inventory.decks.filter((d) => /^[h-p]/i.test(d.id));
const decks = new Map<string, CopiedDeck>();
for (const id of HP_IDS) decks.set(id, await loadHpDeck(id));

test('the batch owns every 2D deck whose id runs from H to P, and no other', () => {
  assert.deepEqual([...HP_IDS].sort(), mine.map((d) => d.id).sort());
  assert.equal(HP_IDS.length, 12);
  assert.ok(!HP_IDS.some((id) => /^[a-gr-w]/i.test(id)), 'a deck of A to G or R to W is another thread\'s');
});

test('every slide of the inventory is copied, in the 2D order, with the 2D words', () => {
  let n = 0;
  for (const inv of mine) {
    const d = decks.get(inv.id)!;
    assert.equal(d.title, inv.title);
    assert.deepEqual(d.slides.map((s) => s.id), inv.slides.map((s) => s.id), `${inv.id}: the slide ids and order are the 2D app's`);
    assert.equal(d.checks.length, inv.checks, `${inv.id}: the quick check`);
    assert.equal(d.objectives.length, inv.objectives, `${inv.id}: the objectives`);
    for (const s of d.slides) { n++; assert.ok(inventory.rows.some((r) => r.id === `slide:${inv.id}/${s.id}`), `slide:${inv.id}/${s.id} is an inventory row`); }
  }
  assert.equal(n, 138);
});

test('the copied files carry their own hash: a hand edit of the words fails here (words are copied by script, never typed)', () => {
  for (const id of HP_IDS) {
    const text = readFileSync(join(root, `src/decks/hp/data/${id}.copied.ts`), 'utf8');
    const json = text.slice(text.indexOf('export const DECK: CopiedDeck = ') + 'export const DECK: CopiedDeck = '.length, text.indexOf(';\n\nexport const DECK_HASH'));
    const hash = /DECK_HASH = '([0-9a-f]+)'/.exec(text)![1];
    assert.equal(createHash('sha256').update(json).digest('hex').slice(0, 12), hash, `${id}.copied.ts was edited by hand: run scripts/port-decks-hp.mjs again`);
  }
});

const two = pinned2D('src/ui/decks.js');
test('the copies equal what the 2D checkout at the pin gives (PPS_2D_REPO)', { skip: two.skip }, () => {
  const out = execFileSync('node', [join(root, 'scripts/port-decks-hp.mjs'), '--from', two.repo, '--check'], { encoding: 'utf8' });
  assert.match(out, /match the 2D app/);
});

test('Baveno VIII only: no copied word cites Baveno VII', () => {
  for (const d of decks.values()) assert.ok(!/Baveno VII(?!I)/.test(JSON.stringify(d)), `${d.id} names Baveno VII`);
});

test('every slide has its words, and every brace in them is a reading, a reading at a slide of its deck, a cut-off or a typed number', () => {
  for (const d of decks.values()) {
    const ids = new Set(d.slides.map((s) => s.id));
    for (const s of d.slides) {
      for (const f of ['kicker', 'title', 'line', 'notes'] as const) assert.ok(typeof s[f] === 'string' && s[f].trim(), `${d.id}/${s.id} has no ${f}`);
      assert.equal(s.ask.length, 2, `${d.id}/${s.id} ask`);
      for (const { raw, token } of tokensOf(`${s.line} ${s.vignette ?? ''}`)) {
        if (token.kind === 'literal') assert.ok(/[\d%<>≥≤]|\s/.test(raw), `${d.id}/${s.id}: ${raw} is no reading, and reads like a mistyped one`);
        if (token.kind === 'value' && token.at) assert.ok(ids.has(token.at), `${d.id}/${s.id}: ${raw} names a slide the deck lacks`);
      }
    }
    for (const [q, a] of d.checks) for (const { raw, token } of tokensOf(`${q} ${a}`)) if (token.kind === 'value' && token.at) assert.ok(d.slides.some((s) => s.id === token.at), `${d.id} check ${raw}`);
  }
});

test('every slide has a camera: a region, a box, the plate or a lobule view, framed in the shared body frame', () => {
  for (const d of decks.values()) for (const s of d.slides) {
    const c = camPlan(s.cam, s.view);
    assert.ok(c.kind === 'lobule' || c.kind === 'body' || c.kind === 'circuit');
    if (c.kind === 'body') {
      const [x0, y0, x1, y1] = c.box;
      assert.ok(x1 > x0 && y1 > y0, `${d.id}/${s.id} box`);
      const sh = c.shot;
      // the box's corners sit inside the shot's half extents around its target (nothing the 2D camera frames is cut off)
      for (const [x, y] of [[x0, y0], [x1, y1]] as const) {
        assert.ok(Math.abs(sceneX(x) - sh.target[0]) <= sh.half[0] + 1e-9 && Math.abs(sceneY(y) - sh.target[1]) <= sh.half[1] + 1e-9, `${d.id}/${s.id} corner in the shot`);
      }
    }
  }
  assert.deepEqual(boxToShot(PLATE).half.map((v) => +v.toFixed(3)), [1.367, 1.533]);
  for (const name of Object.keys(REGIONS)) assert.ok(camPlan(name).kind === 'body');
});

test('every slide is planned; every need has an owner batch; a landed feature has its file', () => {
  const owners = new Map<string, number>();
  let wired = 0, total = 0;
  for (const d of decks.values()) {
    for (const p of planDeck(d)) {
      total++;
      assert.deepEqual(p.needs, needsOf(d.slides[p.index]!));
      for (const id of p.needs) {
        const f = FEATURES.get(id);
        assert.ok(f, `${d.id}/${p.id} needs "${id}", which no batch owns: add it to src/decks/hp/hooks.ts with its batch`);
        owners.set(f.batch, (owners.get(f.batch) ?? 0) + (f.landed ? 0 : 1));
        if (f.landed) assert.ok(existsSync(join(root, f.evidence!)), `${id} is landed but ${f.evidence} is not there`);
      }
      if (readiness(d.slides[p.index]!).wired) wired++;
    }
  }
  assert.equal(total, 138);
  console.log(`B13b: ${total} slides planned, ${wired} wired now; open needs by batch ${[...owners].filter(([, n]) => n).map(([b, n]) => `${b} ${n}`).join(', ')}`);
});

test('the decks the menu lists are the ids and slide counts of the copies', () => {
  for (const m of HP_DECKS) assert.equal(decks.get(m.id)!.slides.length, m.slides, m.id);
});
