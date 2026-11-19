// B13c: one dependency test per slide. A slide lists what it needs from other batches (hooks.ts); each hook is a feature with an owner; and the slide is playable exactly
// when every one has landed. These tests fail (never skip) when a 2D slide uses a field nobody has classified, when a hook names no owner, and when the claimed state of a
// slide differs from what the registry says, so a batch that lands a feature moves the slides that wait on it and nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hooksOf, missingHooks, registerHook, hasHook } from '../src/decks/rw/hooks.ts';
import { registerBuiltinHooks } from '../src/decks/rw/hooks-builtin.ts';
import { dependencies, playable } from '../src/decks/rw/plan.ts';
import { claims } from '../src/parity/b13c.ts';
import { RW_IDS, DECKS, built } from './decks-rw-helpers.ts';
import { LENS_IDS, SINCE_BASELINE_FED } from '../src/scene/lenses/model.ts';
import { CHARTS } from '../src/ui/charts/registry.ts';

registerBuiltinHooks();
const BATCHES = new Set(['S1', 'S3', 'B3', 'B5', 'B6', 'B7', 'B8', 'B10', 'B11', 'B12']);

for (const id of RW_IDS) {
  const d = built(id);
  for (const s of d.slides) {
    test(`${id}/${s.id}: every feature it needs has an owner, and it is claimed ${missingHooks(s.hooks).length ? 'waiting on ' + missingHooks(s.hooks).map((h) => h.id).join(', ') : 'whole'}`, () => {
      assert.ok(s.hooks.some((h) => h.id === 'presenter:deck'), 'every slide needs the presenter');
      for (const h of s.hooks) { assert.ok(BATCHES.has(h.owner), `${h.id}: owner ${h.owner} is no batch`); assert.match(h.id, /^[a-z]+(:[\w-]+)+$/); assert.ok(h.what.length > 10); }
      const claim = claims.find((c) => c.id === `slide:${id}/${s.id}`);
      assert.ok(claim, 'the slide is claimed in the parity rows');
      assert.equal(claim.wired, missingHooks(s.hooks).length === 0, 'wired means every hook landed');
      assert.deepEqual(hooksOf(s.copied).map((h) => h.id), s.hooks.map((h) => h.id));
    });
  }
}

test('what exists today is read from its own tables: the twelve lenses, the done charts, the catheter\'s four states and the lobule views', () => {
  for (const l of LENS_IDS) assert.equal(hasHook(`lens:${l}`), l !== 'since' || SINCE_BASELINE_FED, l);   // (Since waits for a slide to hand it its baseline: scene/lenses/model.ts)
  for (const c of CHARTS) assert.equal(hasHook(`tool:${c.kind}`), c.status === 'done', c.kind);
  for (const c of ['route', 'free', 'wedge', 'result']) assert.ok(hasHook(`device:hvpg-catheter:${c}`));
  assert.ok(!hasHook('device:hvpg-catheter:blocked'), 'the blocked catheter (Budd–Chiari) is B5\'s');
  for (const v of ['view:lobule', 'view:sinusoid']) assert.ok(hasHook(v));
});

test('no deck can be offered by the menu until the presenter, the engine runner and every feature of every slide have landed', () => {
  const decks = RW_IDS.map(built);
  // (a deck plays when every hook of every slide has landed: those that are left waiting have a missing hook, the others play whole)
  const open = (d: ReturnType<typeof built>) => d.slides.some((s) => s.hooks.some((h) => !hasHook(h.id)));
  assert.deepEqual(Object.keys(playable(decks)).sort(), decks.filter((d) => !open(d)).map((d) => d.id).sort(), 'only a deck with nothing left to land plays');
  assert.equal(Object.keys(playable(decks, () => false)).length, 0, 'with nothing registered nothing plays');
  // land everything: every deck becomes playable with the slide count the presenter shows (outline and quick check come with a deck)
  const all = new Set(decks.flatMap((d) => d.slides.flatMap((s) => s.hooks.map((h) => h.id))));
  const has = (id: string) => all.has(id) || hasHook(id);
  const p = playable(decks, has);
  assert.equal(Object.keys(p).length, 16);
  for (const d of decks) assert.equal(p[d.id], d.slides.length + 2);
});

test('landing a feature moves exactly the slides that wait on it (a hook registered at run time, and taken away again)', () => {
  const d = built('two-lesions');
  const wanted = dependencies(d).flatMap((x) => x.missing.map((h) => h.id))[0]!;   // (a feature still to land: the first one this deck waits on)
  const waits = () => dependencies(d).filter((x) => x.missing.some((h) => h.id === wanted)).length;
  const before = waits();
  assert.ok(before > 0);
  const off = registerHook(wanted);
  const during = waits();
  off();
  assert.equal(during, 0);
  assert.equal(waits(), before);
});

test('a field nobody classified fails loudly, so a new 2D field is never skipped quietly', () => {
  assert.throws(() => hooksOf({ id: 'x', brandNewField: 1 } as never), /brandNewField/);
  assert.throws(() => hooksOf({ id: 'x', tool: { kind: 'hologram' } } as never), /hologram/);
});

test('the sixteen decks need only features the plan gives to a batch (the list the parity page shows)', () => {
  const need = new Map<string, string>();
  for (const id of RW_IDS) for (const s of built(id).slides) for (const h of s.hooks) need.set(h.id, h.owner);
  for (const [, o] of need) assert.ok(BATCHES.has(o));
  assert.ok(need.size >= 20 && need.size <= 60, `${need.size} different features: an unreasonable list`);
  void DECKS;
});
