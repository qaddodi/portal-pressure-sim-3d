// Production review, bug 3: the printed notes had no pictures. As in 2D (handout.js), each slide's block opens with the slide's picture, a file per slide under brand/handout/
// (scripts/copy-handout.mjs), set beside its words; a table or chart slide prints its card's picture across the page. The pictures are never part of the first load or of an install.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { builtinDecks, lazyDecks, loadBuiltin } from '../src/decks/registry.ts';
import { handoutHTML, figureSrc, withoutFigure } from '../src/ui/deck/handout.ts';
import { HANDOUT_FIGURES } from '../src/ui/deck/handout-figures.generated.ts';
import { userDeck } from '../src/ui/deck/user-deck.ts';
import { listFiles } from '../scripts/pwa.mjs';
import { copyAll } from '../scripts/copy-handout.mjs';
import { pinned2D } from './two-d-pin.ts';
import type { Deck } from '../src/decks/schema.ts';

const IDS = [...new Set([...builtinDecks().map((d) => d.id), ...lazyDecks().map((d) => d.id)])];
const all = async (): Promise<Deck[]> => Promise.all(IDS.map(async (id) => (await loadBuiltin(id))!));
/** The slides 2D itself has no picture of at the pin (its own test only warns; they print their words until pictures are taken, docs/handouts.md): five whole talks, and slides
 *  added to other talks after 2D's pictures were last drawn. A slide that joins this list by accident (a renamed id) fails here; a picture taken shortens it. */
const NO_PICTURE: Record<string, string[]> = {
  gradients: ['*'], 'same-gradient': ['*'], 'two-lesions': ['*'], 'tips-candidacy': ['*'], 'tips-complete': ['*'],
  hvpg: ['wedge-sinusoid', 'eus-ladder'], lobule: ['wedge-sinusoid'], prehepatic: ['anticoag-lumen', 'pvt-anticoag-lumen'], ncph: ['eus-ladder'], masld: ['regress-lobule'], kidney: ['confirm'],
  'landmark-trials': ['predesci-test', 'groszmann', 'bleed', 'who-tips', 'earlytips', 'lvtips', 'monescillo', 'rifaximin', 'forest', 'summary'], albumin: ['answer', 'macht', 'attire', 'confirm'],
  ascites: ['overrun', 'balance'], 'budd-chiari': ['stent-lumen'], carvedilol: ['rise-path'], 'cause-treated': ['year2-lobule', 'year2-plane', 'high2-plane'], 'choose-treatment': ['a2-fluid', 'a3-lumen', 'a4-lumen'],
  encephalopathy: ['embolize-flows'], stiffness: ['fibrosis-lobule'], shunts: ['gradient'], tipping: ['injury-card', 'antibiotic-card'],
  varices: ['gastric', 'redwale', 'primary', 'secondary'],   // the four slides added on 23 Nov (gastric varices, red wale, primary and secondary prophylaxis)
};

test('every slide that has a picture prints it, beside its words, for every talk; no picture is asked for that is not there', async () => {
  let printed = 0;
  for (const d of await all()) {
    const html = handoutHTML(d, [], 'https://x.test/app/brand/handout/');
    assert.equal(html.match(/<article/g)!.length, d.slides.length + (d.checks.length ? 1 : 0), d.id);
    const want = d.slides.filter((s) => HANDOUT_FIGURES[d.id]?.includes(s.id));
    assert.equal((html.match(/<figure>/g) ?? []).length, want.length, d.id);
    for (const s of want) {
      const src = `https://x.test/app/brand/handout/${d.id}/${s.id}.webp`;
      assert.ok(html.includes(`<figure><img src="${src}"`), `${d.id}/${s.id}`);
      assert.ok(existsSync(`public/brand/handout/${d.id}/${s.id}.webp`), `${d.id}/${s.id}.webp is served`);
      // the picture comes first in the slide's own block, then its words
      const at = html.indexOf(src), art = html.lastIndexOf('<article', at), title = html.indexOf('<h2>', at);
      assert.ok(art >= 0 && title > at && !html.slice(art, at).includes('</article>'), `${d.id}/${s.id}: in its block`);
      printed++;
    }
    for (const s of d.slides) if (s.visual && want.includes(s)) assert.ok(html.includes(`<article class="wide">\n  <figure><img src="https://x.test/app/brand/handout/${d.id}/${s.id}.webp"`), `${d.id}/${s.id}: a table or chart slide prints its card across the page`);
    assert.equal(withoutFigure(d).length, d.slides.length - want.length);
  }
  assert.equal(printed, 410);
});

test('which slides print without a picture is known exactly (106 of 516: the ones 2D has no picture of), and no picture is left over', async () => {
  const decks = await all();
  const bare: Record<string, string[]> = {};
  let n = 0, slides = 0;
  for (const d of decks) { const w = withoutFigure(d); slides += d.slides.length; n += w.length; if (w.length) bare[d.id] = w.length === d.slides.length ? ['*'] : w; }
  assert.deepEqual(bare, Object.fromEntries(Object.entries(NO_PICTURE).sort(([a], [b]) => Object.keys(bare).indexOf(a) - Object.keys(bare).indexOf(b))), 'a slide lost its picture (a renamed slide id?) or gained one: run scripts/copy-handout.mjs and bring this list up to date');
  assert.equal(slides - n, 410); assert.equal(n, 106);
  const byId = new Map(decks.map((d) => [d.id, new Set(d.slides.map((s) => s.id))]));
  for (const [deck, ids] of Object.entries(HANDOUT_FIGURES)) for (const id of ids) assert.ok(byId.get(deck)?.has(id), `${deck}/${id}.webp is no slide's`);
});

test('a script of your own, a talk without a base, and an id that is not a file name print no picture and stay safe', () => {
  const d = builtinDecks().find((x) => x.id === 'hvpg')!;
  assert.ok(!handoutHTML(d).includes('<figure>'), 'no base, no picture');
  assert.equal(figureSrc('b/', d, d.slides[0]!), `b/hvpg/${d.slides[0]!.id}.webp`);
  assert.equal(figureSrc('b/', { id: 'hvpg', mine: true }, d.slides[0]!), '');
  assert.equal(figureSrc('b/', { id: '../hvpg' }, d.slides[0]!), ''); assert.equal(figureSrc('b/', d, { id: 'x"><script>' }), ''); assert.equal(figureSrc('b/', { id: '__proto__' }, { id: 'a' }), '');
  const mine = userDeck({ id: 'm1', title: 'Mine', summary: 's', steps: [{ title: 'One', preset: 'healthy', notes: 'n' }] } as never);
  assert.ok(!handoutHTML(mine, [], 'b/').includes('<figure>'));
  const evil = handoutHTML(d, [], 'b/"onerror="alert(1)');
  assert.ok(!/src="b\/"onerror/.test(evil), 'the base is escaped');
});

test('the pictures are served but never held offline or fetched at first load (14 MB, asked for only by the notes\' own page)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pwa-'));
  mkdirSync(join(dir, 'brand/handout/hvpg'), { recursive: true });
  for (const f of ['index.html', 'brand/icon-192.png', 'brand/handout/hvpg/route.webp']) writeFileSync(join(dir, f), 'x');
  assert.deepEqual(listFiles(dir), ['brand/icon-192.png', 'index.html']);
  // nothing in the app imports a picture: the notes' page asks for them by address
  assert.ok(statSync('public/brand/handout').isDirectory());
});

const pin = pinned2D('brand/handout/hvpg/route.webp');
test('the pictures and their list are the 2D app\'s own at the pin', { skip: pin.skip }, () => {
  assert.deepEqual(copyAll(pin.repo, true), []);
});
