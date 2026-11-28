// J6 and J8 (28 Nov review): the skin bake says what it did, so it can be audited. A seam cut under the clearance slack is listed (node, vessel, ring, share), merges and the vessels they hide are listed, dropped arms and lost nodes are listed,
// and a planner loop that ran out of rounds is listed as NOT SETTLED. The files the bake wrote (public/anatomy/skins.bin, circuit-skins.bin) are read back: none of their loops is unsettled and every seam under slack is in the report.
// Run: node --test tests/skin-bake-report.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { bakeReport, slackSeams } from '../src/scene/vessels/skin/bake-report.ts';
import { decodeSkins, type BakedSkins } from '../src/scene/vessels/skin/baked.ts';
import type { SkinJunction } from '../src/scene/vessels/skin/types.ts';

const arm = (vesselId: string, end: 0 | 1) => ({ vesselId, end, courseIndex: 0, dataIndex: 0, lensIndex: 0, baseD: 1, widthKind: 0, restR: 0.02 });
const skin = (node: string, cuts: { vesselId: string; end: 0 | 1; ring: number; slack?: number }[], extra: { hidden?: string[]; merged?: string[] } = {}) => ({
  plan: { junction: { node, J: [0, 0, 0], arms: cuts.map((c) => arm(c.vesselId, c.end)) } as SkinJunction, cuts: cuts.map((c) => ({ ...c, u: c.ring / 40 })), hidden: extra.hidden ?? [], ...(extra.merged ? { merged: extra.merged } : {}) },
}) as unknown as BakedSkins['skins'][number];

test('the report lists every seam under slack, every merge and hidden vessel, dropped arms, lost nodes and unsettled loops', () => {
  const b: BakedSkins = {
    digest: '', lost: [{ node: 'X', message: 'skin: junction X: no ring' }], dropped: ['SVD:C2'], unsettled: ['joinUncuttable: A+B still needs a join after 8 joins'],
    skins: [
      skin('PLAIN', [{ vesselId: 'a', end: 1, ring: 5 }, { vesselId: 'b', end: 0, ring: 6 }]),
      skin('SLACKY', [{ vesselId: 'a', end: 1, ring: 5, slack: 0.8 }, { vesselId: 'b', end: 0, ring: 6 }]),
      skin('M1+M2', [{ vesselId: 'a', end: 1, ring: 5 }, { vesselId: 'c', end: 0, ring: 6 }], { hidden: ['h'] }),
    ],
  };
  assert.deepEqual(slackSeams(b), [{ node: 'SLACKY', vesselId: 'a', end: 1, ring: 5, slack: 0.8 }]);
  const text = bakeReport(b, 'test').join('\n');
  assert.match(text, /3 skins, 1 seam\(s\) under clearance slack, 1 merged, 1 arm\(s\) dropped, 1 lost, 1 loop\(s\) not settled/);
  assert.match(text, /SLACKY: slack a:1 ring 5 x0\.8/);
  assert.match(text, /M1\+M2: merged M1\+M2; hides h/);
  assert.match(text, /dropped: SVD:C2/);
  assert.match(text, /LOST X/);
  assert.match(text, /NOT SETTLED: joinUncuttable: A\+B/);
  assert.doesNotMatch(text, /PLAIN/, 'a skin that merged nothing, hid nothing and used no slack has no line of its own');
});

test('the baked files on disk: no planner loop ran out of rounds, and every slack seam is in the report', () => {
  for (const file of ['skins.bin', 'circuit-skins.bin']) {
    const path = new URL(`../public/anatomy/${file}`, import.meta.url);
    if (!existsSync(path)) continue;   // (the bake writes it: pre-push and the build run it before the tests)
    const g = gunzipSync(readFileSync(path));
    const b = decodeSkins(g.buffer.slice(g.byteOffset, g.byteOffset + g.byteLength));
    assert.ok(b, `${file} decodes`);
    assert.deepEqual(b.unsettled, [], `${file}: a loop of the planner ran out of rounds`);
    const text = bakeReport(b, file).join('\n');
    for (const s of slackSeams(b)) assert.ok(text.includes(`${s.vesselId}:${s.end} ring ${s.ring}`), `${file}: the report lists the slack seam ${s.node} ${s.vesselId}`);
  }
});
