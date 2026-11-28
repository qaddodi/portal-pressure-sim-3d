// Mohammad, 28 Nov (capture 3903f116, Variceal bleed 14: the teaching card changed size on Next, "1 of 2" / "2 of 2"): no slide's card pages and no instrument card scrolls. When the words do not fit,
// the slide is cut into a new slide with its own card (decks/overlay.ts); a card lands at its final size and keeps it.
// Node only: the rule is held where it is made. What the real text measures is the headless walk's (scripts/paging-probe.mjs, 28 Nov: iPhone, iPad and Mac, every slide of every talk).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { stopsOf, viewAt, lastSlideShot } from '../src/ui/deck/presenter-machine.ts';
import { maxPages, sentences } from '../src/ui/cards/pages.ts';
import { SPLIT_PAGES, partId, amendSplitPages, splitExtra } from '../src/decks/overlay.ts';
import { loadSource } from '../src/decks/source.ts';
import { AG_LOADERS } from '../src/decks/ag/raw.ts';
import { HP_LOADERS } from '../src/decks/hp/raw.ts';
import { RW_LOADERS } from '../src/decks/rw/copied/index.ts';

const uncut = async (id: string): Promise<CopiedDeck> => ({ ...AG_LOADERS, ...HP_LOADERS, ...RW_LOADERS } as Record<string, () => Promise<unknown>>)[id]!() as Promise<CopiedDeck>;
import type { CopiedDeck } from '../src/decks/hp/types.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('no card of any slide of any talk can page: the most pages a card of every stop and beat of every deck can have is one (the title and the quick check are not slides)', async () => {
  let looked = 0;
  for (const { id } of UI.decks) {
    const deck = (await loadBuiltin(id))!, stops = stopsOf(deck), shot = lastSlideShot(stops);
    stops.forEach((st, stop) => {
      if (st.kind !== 'slide') return;
      for (let beat = 0; beat < st.beats; beat++) {
        const v = viewAt(stops, { stop, beat }, shot);
        if (v.words === 'title' || v.words === 'check') continue;
        const items = v.words === 'visual' ? v.slide?.table?.of.length ?? 0 : 0;
        assert.equal(maxPages(v.words, v.slide?.line, items), 1, `${id}/${st.slide.id} beat ${beat}: a ${v.words} card that can page`);
        looked++;
      }
    });
  }
  assert.ok(looked > 400, `${looked} cards looked at`);
});

test('the slide cards carry no page counter, and the layer asks for no page of them', () => {
  const teach = src('src/ui/cards/TeachingCard.tsx'), vis = src('src/ui/cards/VisualCard.tsx'), table = src('src/ui/cards/TableCard.tsx');
  assert.doesNotMatch(teach, /pz-pageno/);
  assert.doesNotMatch(vis, /pz-pageno/);
  assert.doesNotMatch(table, /pz-pageno/);
});

test('no card of a slide scrolls: no card rule of the slides makes a box scroll (the quick check\'s list and the Tests pane\'s own exception excepted)', () => {
  const allowed = [/^\.pz-check\b/, /^\.tcp?-body\b/, /^\.pzj-list\b/];   // (the quick check's list, the Tests pane, the slide jump list: none is a slide's instrument card)
  for (const f of ['src/ui/styles/app-05-presenter-cards.css', 'src/ui/styles/app-08-cards.css', 'src/ui/deck-ui.css']) {
    for (const m of src(f).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/overflow(-y)?:\s*(auto|scroll)/.test(m[2]!)) continue;
      const sel = m[1]!.trim().split(',').map((x) => x.trim().replace(/^.*\*\//, '').trim());
      for (const s of sel) assert.ok(allowed.some((a) => a.test(s)), `${f}: "${s}" scrolls`);
    }
  }
});

test('a slide cut by split-pages keeps every word: the parts say, in order, exactly what the one slide said; the patient stays on the first and the foot and the buttons on the last', async () => {
  let cut = 0;
  for (const [key, n] of Object.entries(SPLIT_PAGES)) {
    const deckId = key.slice(0, key.indexOf('/')), slideId = key.slice(key.indexOf('/') + 1);
    const was = (await uncut(deckId)).slides.find((s) => s.id === slideId)!, now = ((await loadSource(deckId)) as CopiedDeck).slides;
    const parts = Array.from({ length: n }, (_, i) => now.find((s) => s.id === partId(slideId, i))!);
    parts.forEach((p, i) => assert.ok(p, `${key}: part ${i + 1} is missing`));
    // the parts stand in a row, where the one slide stood
    const at = now.findIndex((s) => s.id === slideId);
    assert.deepEqual(now.slice(at, at + n).map((s) => s.id), parts.map((p) => p.id), `${key}: the parts are not in a row`);
    for (const [i, p] of parts.entries()) {
      for (const k of ['preset', 'params', 'action', 'days', 'lapse', 'procedure', 'question', 'vignette', 'eq']) if (i > 0) assert.equal(p[k] ?? undefined, undefined, `${key}: ${k} on part ${i + 1}`);
      for (const k of ['caveat', 'cite', 'controls', 'whatIf', 'compare']) if (i < n - 1) assert.equal(p[k] ?? undefined, undefined, `${key}: ${k} before the last part`);
      assert.equal(p.title, was.title, `${key}: one title`);
      assert.equal(p.notes, was.notes, `${key}: the same notes`);
      assert.deepEqual(p.tool, parts[0]!.tool, `${key}: the same instrument`);
    }
    for (const k of ['preset', 'params', 'action', 'days', 'lapse', 'procedure', 'question', 'vignette', 'eq']) assert.deepEqual(parts[0]![k], was[k], `${key}: ${k} stays on the first`);
    for (const k of ['caveat', 'cite']) assert.deepEqual(parts[n - 1]![k], was[k], `${key}: ${k} stands on the last`);
    if (was.visual === 'table') {
      const rows = (was.of as unknown[]).length, seen = parts.flatMap((p) => { const w = p.window as [number, number]; return Array.from({ length: w[1] - w[0] }, (_, k) => w[0] + k); });
      assert.deepEqual(seen, Array.from({ length: rows }, (_, i) => i), `${key}: every row on one slide`);
      for (const p of parts) assert.equal(p.line, was.line, `${key}: the words stand on every slide`);
    } else {
      assert.deepEqual(parts.flatMap((p) => sentences(p.line ?? '')), sentences(was.line ?? ''), `${key}: the sentences, in order, none lost`);
      for (const [i, p] of parts.entries()) assert.ok(sentences(p.line ?? '').length >= 1, `${key}: part ${i + 1} has words`);
    }
    cut++;
  }
  assert.equal(cut, Object.keys(SPLIT_PAGES).length);
});

test('laying the cut on twice changes nothing, a key that names no slide is an error, and the menu count adds the new slides', async () => {
  const d = (await loadSource('variceal-bleed')) as CopiedDeck;
  assert.deepEqual(amendSplitPages(d).slides.map((s) => s.id), d.slides.map((s) => s.id));
  assert.throws(() => amendSplitPages(d, { 'variceal-bleed/nope': 2 }), /no such slide/);
  assert.equal(splitExtra('variceal-bleed'), 3);
  assert.equal(splitExtra('gastric-varices'), 3);   // (brto 1, summary 2)
});
