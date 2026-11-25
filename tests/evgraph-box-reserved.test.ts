// Ten years 13 (capture f23a4c59, iPhone): the data card stood 46 px tall, its header alone, and the graph that came after was clipped away. The card is measured and locked with whatever it holds when it lands,
// and the procedure's graph drew NOTHING until the second engine had worked out its slide (no numbers: no box), so the card landed as a title strip. Two roots, both pinned here, node only:
// (1) the graph's box stands from the first frame, with or without numbers, and it is the very box the drawn graph takes (same class: the same height from the same rule);
// (2) the wait for the slide's numbers is real time, so the audit's speed cannot cut it short (see tests/outside-waits-real.test.ts for the site).
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

test('the procedure graph reserves its box while its numbers are not in, and the drawn graph stands in the same box', { timeout: 120_000 }, async () => {
  const live = React.useSyncExternalStore;
  (React as { useSyncExternalStore: typeof live }).useSyncExternalStore = (sub, get) => live(sub, get, get);
  const server = await createServer({ configFile: false, root: new URL('..', import.meta.url).pathname, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null } as never });
  try {
    const { EvGraph } = await server.ssrLoadModule('/src/ui/talk/ToolCardBody.tsx');
    const slide = { id: 'tips', procedure: 'tips', tiles: ['ppg', 'liver'], tool: { kind: 'evgraph', title: 'PPG and sinusoidal flow after TIPS' } };
    const pending = renderToString(createElement(EvGraph, { runKey: 'ten-years/tips', cs: slide, fp: null, opened: null }));
    assert.match(pending, /class="pz-flowtime pz-evgraph"/, 'no numbers yet: the graph\'s own box, mounted');
    assert.match(pending, /data-chart/, 'with its chart host, so the box takes the height of an empty picture');
    const fp = { ppg: 19.3, liver: 61, hvpg: 19, whvp: 24, fhvp: 5 };
    const drawn = renderToString(createElement(EvGraph, { runKey: 'ten-years/tips', cs: slide, fp, opened: fp }));
    assert.match(drawn, /class="pz-flowtime pz-evgraph"/, 'numbers in: the same box, drawn');
    assert.match(drawn, /data-chart/);
  } finally { await server.close(); }
});

test('the empty picture is exactly as tall as the drawn one in the same box', { timeout: 120_000 }, async () => {
  const server = await createServer({ configFile: false, root: new URL('..', import.meta.url).pathname, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null } as never });
  try {
    const { evGraphFrame, evPendingFrame } = await server.ssrLoadModule('/src/ui/charts/evgraph/frame.ts');
    const { eventGraphOf } = await server.ssrLoadModule('/src/ui/charts/evgraph/model.ts');
    const { chartType } = await server.ssrLoadModule('/src/ui/charts/type.ts');
    const { paletteOf } = await server.ssrLoadModule('/src/ui/charts/palette.ts');
    const spec = eventGraphOf({ procedure: 'tips', tiles: ['ppg', 'liver'] });
    for (const w of [300, 342, 390, 600]) {
      const c = { w, pal: paletteOf('light'), type: chartType('phone-portrait'), look: 'light', fit: 1 };
      const empty = evPendingFrame(spec, c), full = evGraphFrame({ spec, before: [19.3, 61], end: [11, 32] }, 0, c);
      assert.equal(empty.h, full.h, `width ${w}`);
      assert.equal(empty.w, full.w);
      assert.equal(empty.shapes.length, 0);
    }
  } finally { await server.close(); }
});

test('the wait for a slide\'s numbers runs in real time', async () => {
  const { readFileSync } = await import('node:fs');
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /clock\.afterReal\(\(\) => setGaveUp\(numbersKey\), GIVE_UP_MS\)/);
  assert.doesNotMatch(layer, /clock\.after\(\(\) => setGaveUp/);
});
