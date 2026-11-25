// Controls that looked real and did nothing (21 Nov review, next-steps step 7), each wired at its root and pinned here: the arrows step through the
// figure's stations and Shift + arrow follows the flow; Search's "Guide & shortcuts" opens the Guide; Blood > Pressure values takes the number off every label (the anatomy's and the circuit's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stationStep, stationsOf, WALK } from '../src/scene/labels/walk.ts';
import { WALK_ORGANS } from '../src/ui/action/walk-organs.ts';

const src = (f: string) => readFileSync(f, 'utf8');
const items = [...WALK.map((w) => w.id), ...WALK_ORGANS.map((o) => o.id)];

test('the stations are the 2D walk: SMV, splenic, portal, sinusoids, hepatic veins, IVC, right atrium, from the drawn stops', () => {
  const names = stationsOf(items).map((s) => s.name);
  assert.deepEqual(names, ['Superior mesenteric vein', 'Splenic vein', 'Portal vein', 'Sinusoids', 'Hepatic veins', 'Inferior vena cava', 'Right atrium']);
  assert.equal(stationsOf(items).find((s) => s.name === 'Right atrium')!.item, 'organ:heart');
});

test('an arrow steps one station on or back, never wraps, starts at the first (or last) from a stop that is no station, and a vein in pieces is one station', () => {
  const st = stationsOf(items);
  const first = stationStep(items, st[0]!.item, 1)!;
  assert.equal(first.name, 'Splenic vein'); assert.equal(first.n, 2); assert.equal(first.of, 7);
  assert.equal(stationStep(items, st[0]!.item, -1)!.name, 'Superior mesenteric vein', 'the gut end stops');
  assert.equal(stationStep(items, 'organ:heart', 1)!.name, 'Right atrium', 'the heart end stops');
  const odd = WALK.find((w) => !st.some((s) => s.item === w.id) && !/^(SMV|SV|PV_TRUNK|SIN|RHV|MHV|LHV|IVCS)/.test(w.id))!.id;
  assert.equal(stationStep(items, odd, 1)!.name, 'Superior mesenteric vein');
  assert.equal(stationStep(items, odd, -1)!.name, 'Right atrium');
  assert.equal(stationStep(items, 'PV_TRUNK_1', 1)!.name, 'Sinusoids', 'a piece of the portal trunk is the portal vein');
  assert.equal(stationStep([], null, 1), null);
});

test('the walk: Left and Right are the stations (announced), Shift keeps the old step along the flow', () => {
  const walk = src('src/scene/labels/VesselWalk.tsx');
  assert.match(walk, /if \(e\.shiftKey\) \{ const to = step\(id/);
  assert.match(walk, /stationStep\(all\(\)\.map/);
  assert.match(walk, /announce\(`Station \$\{st\.n\} of \$\{st\.of\}, \$\{st\.name\}\.`\)/);
});

test('Search > Guide & shortcuts opens the Guide (2D ctx.help), not the Help menu', () => {
  assert.match(src('src/ui/search/commands.ts'), /title === 'Guide & shortcuts'\) return \(\) => sh\(\)\.set\(\{ sheet: 'guide', helpSection: null \}\)/);
});

test('Pressure values off: a label is its name only, in the anatomy and in the circuit', () => {
  assert.match(src('src/scene/labels/controller.ts'), /s\.id !== 'HA' && \(this\.deps\.chips\?\.\(\) \?\? true\)/);
  assert.match(src('src/scene/labels/LabelLayer.tsx'), /chips: \(\) => useBlood\.getState\(\)\.chips,/);
  assert.match(src('src/scene/circuit/CircuitCaptions.tsx'), /\.value && useBlood\.getState\(\)\.chips \? v : ''/);
});

test('Esc calls off a shunt placement (capture phase, before the shell\'s own Esc), Settings > Advanced physiology has its rows, and Next during a lapse runs it out: already live, pinned', () => {
  assert.match(src('src/ui/action/shunt.ts'), /e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopImmediatePropagation\(\); cancelShunt\(\); \}/);
  assert.match(src('src/ui/action/shunt.ts'), /addEventListener\('keydown', esc, true\)/);
  assert.match(src('src/ui/settings/SettingsSheet.tsx'), /body: <Advanced \/>/);
  assert.match(src('src/ui/ui-store.ts'), /m === 'next' && lapseNext\(\)/);
});
