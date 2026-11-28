// A procedure slide's graph card (tool.kind 'evgraph') stays off the screen while its procedure has not played and comes in once it is done (Mohammad, 28 Nov: "that space is for the TIPS procedure").
// Every stop of every built-in talk is rendered at four screen sizes with the procedure waiting, then done: the graph card is absent, then present; no other slide's cards change with the procedure.
// No browser: the same server-render stand-ins as tests/card-layer-mounts.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer, type Plugin } from 'vite';

const SIZES = [{ name: 'mac', w: 1440, h: 900 }, { name: 'iphone', w: 390, h: 844 }, { name: 'iphone on its side', w: 844, h: 390 }, { name: 'ipad', w: 1180, h: 820 }];
const stackNow: Plugin = {
  name: 'stack-now', enforce: 'pre',
  load(id) {
    if (!id.split('?')[0].endsWith('/src/ui/cards/useStack.ts')) return undefined;
    return "import { reconcile } from './stack.ts';\nexport function useStack(wanted) { return { entries: reconcile([], wanted ? { key: wanted.key, id: wanted.id } : null), gone() {} }; }";
  },
};

test('the procedure graph card waits for its procedure on every slide of every talk, at every size', { timeout: 240_000 }, async () => {
  const live = React.useSyncExternalStore;
  (React as { useSyncExternalStore: typeof live }).useSyncExternalStore = (sub, get) => live(sub, get, get);
  const server = await createServer({ configFile: false, root: new URL('..', import.meta.url).pathname, logLevel: 'error', appType: 'custom', plugins: [stackNow], server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { CardLayer } = await server.ssrLoadModule('/src/ui/cards/CardLayer.tsx');
    const { useUi } = await server.ssrLoadModule('/src/ui/ui-store.ts');
    const { setProc, clearProc } = await server.ssrLoadModule('/src/ui/deck/procs-state.ts');
    const { gatedSlide } = await server.ssrLoadModule('/src/ui/cards/proc-gate.ts');
    const dl = await server.ssrLoadModule('/src/scene/labels/deck-link.ts');
    const reg = await server.ssrLoadModule('/src/decks/registry.ts');
    const { stopsOf, first, next, isLast } = await server.ssrLoadModule('/src/ui/deck/presenter-machine.ts');
    const ids: string[] = [...reg.builtinDecks().map((d: { id: string }) => d.id), ...reg.lazyDecks().map((d: { id: string }) => d.id)];
    const wrong: string[] = [], gatedSeen = new Set<string>();
    const dataCard = (html: string) => /data-card="(ladder|table)"/.test(html);
    for (const id of ids) {
      const deck = await reg.loadBuiltin(id);
      const stops = stopsOf(deck);
      for (const size of SIZES) {
        useUi.getState().setViewport({ w: size.w, h: size.h, safe: { top: 0, right: 0, bottom: 0, left: 0 } });
        useUi.getState().setStops(stops);
        for (let pos = first(), guard = 0; guard < 2000; pos = next(stops, pos), guard++) {
          const st = stops[pos.stop];
          const slide = st.kind === 'slide' && pos.beat === 0 ? st.slide : null;
          if (slide && gatedSlide(slide, dl.copiedSlideOf(deck.id, slide))) {
            gatedSeen.add(`${id}/${slide.id}`);
            const key = `${id}/${slide.id}`, where = `${key} (${size.name})`;
            useUi.setState({ pos });
            clearProc();
            const before = renderToString(createElement(CardLayer, { deck }));
            setProc({ key, phase: 'play', at: 0, ring: 0 });
            const playing = renderToString(createElement(CardLayer, { deck }));
            setProc({ key, phase: 'done', at: 0, ring: -1 });
            const done = renderToString(createElement(CardLayer, { deck }));
            setProc({ key: '', phase: 'wait' });
            const otherSlide = renderToString(createElement(CardLayer, { deck }));
            // the lens colour key never waits in the hidden card: it stands in the dock (labelsAt) and the card's key row is off, before and after
            const lab = dl.labelsAt(stops, pos, id);
            const own = dl.keyAtStop(stops, pos.stop, 0);
            if (own && !lab.key) wrong.push(`${where}: the lens key ${own} has no home while the graph card waits`);
            if (dataCard(before)) wrong.push(`${where}: graph card shown before the procedure`);
            if (dataCard(playing)) wrong.push(`${where}: graph card shown while the procedure plays`);
            if (!dataCard(done)) wrong.push(`${where}: no graph card once the procedure is done`);
            if (dataCard(otherSlide)) wrong.push(`${where}: another slide's finished procedure let this graph card in`);
            if (!/data-card="teach"/.test(before)) wrong.push(`${where}: the words card is missing while the graph waits`);
            clearProc();
          }
          if (isLast(stops, pos)) break;
        }
      }
    }
    assert.deepEqual(wrong.slice(0, 12), [], 'the graph card must wait for its procedure');
    assert.ok(gatedSeen.size >= 7, `the procedure-graph slides were found (${[...gatedSeen].join(', ')})`);
  } finally { await server.close(); }
});

test('the freed room is the camera\'s: the plan without the graph card frames a taller room, at every size', async () => {
  const server = await createServer({ configFile: false, root: new URL('..', import.meta.url).pathname, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { planLayout } = await server.ssrLoadModule('/src/ui/layout/plan.ts');
    const rows: string[] = [];
    const { layoutOf } = await server.ssrLoadModule('/src/ui/layout/rules2d.ts');
    for (const size of [...SIZES, { name: 'ipad upright', w: 820, h: 1180 }, { name: 'small iphone', w: 375, h: 667 }]) {
      const vp = { w: size.w, h: size.h, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
      const words = { id: 'teach', slot: 'words', h: 260 }, data = { id: 'ladder', slot: 'data', h: 320, want: 320 };
      const withData = planLayout(vp, [words, data]), alone = planLayout(vp, [words]);
      const a = withData.free, b = alone.free;
      rows.push(`${size.name}: room with the card ${Math.round(a.w)} x ${Math.round(a.h)} at (${Math.round(a.x)}, ${Math.round(a.y)}); without ${Math.round(b.w)} x ${Math.round(b.h)} at (${Math.round(b.x)}, ${Math.round(b.y)})`);
      // (stacked layouts, where the data card sits above the figure: the figure's room is the freed card's height taller; the side-by-side ones keep their column, which stays empty)
      const stacked = layoutOf(size.w, size.h) === 'stack' || layoutOf(size.w, size.h) === 'tab';
      if (stacked) assert.ok(b.h >= a.h + 200, `the camera's room grows by the card's height when it is not there (${rows.at(-1)})`);
      assert.ok(b.w * b.h >= a.w * a.h, `the room never shrinks (${rows.at(-1)})`);
    }
    console.log(rows.join('\n'));
  } finally { await server.close(); }
});
