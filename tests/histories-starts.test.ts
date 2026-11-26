// Each history comes in with its own patient (14, capture 0bc14020: the three decompensated cases opened on one identical patient, the preset's, so the fluid, the pressures and the albumin on Day 0 said
// nothing of their stories). The rule is general: a history defines its own start (courses.ts `start`, played by play.ts startPreset), and no two histories start from the same patient, whatever preset family they
// share. Checked on the baked record (what the page opens), and on the course (a ramp begins where the patient starts, so nothing jumps on Day 0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES } from '../src/ui/histories/courses.ts';
import { playCourse, startPreset } from '../src/ui/histories/play.ts';
import { deepMerge, defaultParams } from '../src/engine/hales/portal/scenario.js';
import type { Baked } from '../src/ui/histories/types.ts';

const played = COURSES.map((c) => ({ c, b: playCourse(c) as Baked }));
const day0 = (b: Baked) => b.days[0]!.v;
const settings = (b: Baked) => b.entries[0]!.params as Record<string, unknown>;

test('no two histories start from the same patient (settings and the model on Day 0)', () => {
  for (let i = 0; i < played.length; i++) for (let j = i + 1; j < played.length; j++) {
    const a = played[i]!, z = played[j]!;
    assert.notDeepEqual(settings(a.b), settings(z.b), `${a.c.id} and ${z.c.id} start with the same settings`);
    assert.notDeepEqual(day0(a.b), day0(z.b), `${a.c.id} and ${z.c.id} start with the same readings on Day 0`);
  }
});

test('histories of one family (a shared engine preset) differ in the patient itself: the gradient and the fluid on Day 0 each say something different', () => {
  const families = new Map<string, typeof played>();
  for (const p of played) families.set(p.c.preset, [...(families.get(p.c.preset) ?? []), p]);
  for (const [preset, group] of families) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = day0(group[i]!.b), z = day0(group[j]!.b);
      const apart = Math.abs(a.hvpg! - z.hvpg!) >= 0.5 || Math.abs(a.asc! - z.asc!) >= 0.2;
      assert.ok(apart, `${group[i]!.c.id} and ${group[j]!.c.id} (both ${preset}) open on a patient with the same HVPG and fluid`);
    }
    // (a family of more than one gives each its own `start`, never the preset's bare patient to two stories)
    for (const { c } of group) assert.ok(c.start || c.init, `${c.id} shares "${preset}" with another history and defines no start of its own`);
  }
});

test('a history that starts from its own patient says it in its settings (the decompensated family: severity and albumin each their own)', () => {
  const ids = ['hist-ascites', 'hist-tips-narrowed', 'hist-bleed-tips', 'hist-alcohol'];
  const rows = ids.map((id) => { const s = settings(played.find((p) => p.c.id === id)!.b); return `${s.cirrhosis}/${s.albumin}`; });
  assert.equal(new Set(rows).size, ids.length, `the four decompensated histories start with their own severity and albumin: ${rows.join(', ')}`);
});

test('a ramp begins where its patient starts: Day 0 is the start, not a jump', () => {
  for (const { c, b } of played) for (const r of c.ramps ?? []) {
    if (r.from !== 0) continue;
    const got = r.key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], settings(b));
    assert.equal(got, r.a, `${c.id}: the ${r.key} ramp starts at ${r.a} on Day 0 but the patient has ${String(got)}`);
  }
});

test('a start is a patch on the preset and its disease clock, and the preset itself is left as the engine has it', () => {
  for (const { c } of played) {
    const pre = startPreset(c), base = deepMerge(defaultParams(), {});
    const made = pre.apply(structuredClone(base)) as Record<string, unknown>;
    if (!c.start) { assert.equal(pre.id, c.preset); continue; }
    for (const [k, v] of Object.entries(c.start.patch)) assert.deepEqual(made[k], v, `${c.id}: start ${k}`);
  }
});
