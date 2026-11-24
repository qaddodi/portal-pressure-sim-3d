// The card layer is rendered, for real, on every stop and beat of every built-in talk at three screen sizes, and nothing may throw.
// (24 Nov 2026: a push read `settleLeft` above its declaration in CardLayer; every render threw a ReferenceError and no slide showed a card. The tests then only read the source text, so none of them ran it.)
// No browser: Vite's own transform loads the components into node and react-dom/server renders them. Two things stand in for the page, and only these two:
//   - a store read on the server normally returns the store's first state (no talk open), so the snapshot asked for is the live one;
//   - cards enter the stack in a layout effect, which a server render does not run, so `useStack` hands the wanted card over on the first render.
// What this covers: every line a render runs in CardLayer, CardFrame and each card (title, case, teaching, ladder, tiles, check, table, visual, instrument). What it does not: effects, measuring and motion.
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

test('every stop and beat of every talk renders its cards without throwing, at every screen size', { timeout: 120_000 }, async () => {
  const live = React.useSyncExternalStore;
  (React as { useSyncExternalStore: typeof live }).useSyncExternalStore = (sub, get) => live(sub, get, get);
  const server = await createServer({ configFile: false, root: new URL('..', import.meta.url).pathname, logLevel: 'error', appType: 'custom', plugins: [stackNow], server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { CardLayer } = await server.ssrLoadModule('/src/ui/cards/CardLayer.tsx');
    const { useUi } = await server.ssrLoadModule('/src/ui/ui-store.ts');
    const reg = await server.ssrLoadModule('/src/decks/registry.ts');
    const { stopsOf, first, next, isLast } = await server.ssrLoadModule('/src/ui/deck/presenter-machine.ts');
    const ids: string[] = [...reg.builtinDecks().map((d: { id: string }) => d.id), ...reg.lazyDecks().map((d: { id: string }) => d.id)];
    assert.ok(ids.length >= 40, `the talks are registered (${ids.length})`);
    const threw: string[] = [], bare: string[] = [], seen = new Set<string>();
    let renders = 0;
    for (const id of ids) {
      const deck = await reg.loadBuiltin(id);
      assert.ok(deck, `${id} loads`);
      const stops = stopsOf(deck);
      for (const size of SIZES) {
        useUi.getState().setViewport({ w: size.w, h: size.h, safe: { top: 0, right: 0, bottom: 0, left: 0 } });
        useUi.getState().setStops(stops);
        // (walked as Next walks it: every stop, and every beat of a slide that has more than one)
        for (let pos = first(), guard = 0; guard < 2000; pos = next(stops, pos), guard++) {
          const where = `${id} stop ${pos.stop} beat ${pos.beat} (${size.name})`;
          useUi.setState({ pos });
          let html = '';
          try { html = renderToString(createElement(CardLayer, { deck })); renders++; }
          catch (e) { if (threw.length < 12) threw.push(`${where}: ${String(e).slice(0, 200)}`); if (isLast(stops, pos)) break; continue; }
          const cards = [...html.matchAll(/data-card="([^"]+)"/g)].map((m) => m[1]);
          for (const c of cards) seen.add(c);
          if (!cards.length && bare.length < 12) bare.push(where);
          if (isLast(stops, pos)) break;
        }
      }
    }
    assert.deepEqual(threw, [], 'a render threw: no card shows on that slide');
    assert.deepEqual(bare, [], 'a slide rendered no card at all');
    assert.ok(renders > 2000, `every stop was rendered (${renders})`);
    for (const kind of ['title', 'case', 'teach', 'check']) assert.ok(seen.has(kind), `a ${kind} card was rendered (saw ${[...seen].join(', ')})`);
  } finally {
    (React as { useSyncExternalStore: typeof live }).useSyncExternalStore = live;
    await server.close();
  }
});
