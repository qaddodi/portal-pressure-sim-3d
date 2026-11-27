// Across the lobule (charts/lobule): numbers in, strip out. The zone lines cut the strip in thirds, the pressure line's dots stand at the three stations at heights in the order of their
// pressures, the numbers are the model's, the sentence says where the fall lies, and both views draw the same pieces at one height, so a switch or a new patient glides (morph.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure } from '../src/ui/charts/measure.ts';
import { compatible } from '../src/ui/charts/morph.ts';
import { lobuleLayout, fallOf, viewOf, fmtP, FALL_WORDS, LITTLE, type LobuleIn } from '../src/ui/charts/lobule/model.ts';
import { lobuleFrame } from '../src/ui/charts/lobule/frame.ts';
import { amendLobule, LOBULE_SLIDES } from '../src/decks/overlay/lobule.ts';
import { loadSource } from '../src/decks/source.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';

const HEALTHY = { pv: 8.1, sin: 7.3, cv: 5.2 }, CIRR = { pv: 22.7, sin: 22.1, cv: 6.9 }, SCHISTO = { pv: 20.6, sin: 9.5, cv: 5.9 };
const P = (p: typeof HEALTHY): LobuleIn => ({ view: 'pressure', ...p });

test('the sentence is chosen by where the fall lies', () => {
  assert.equal(fallOf(HEALTHY), 'little');
  assert.equal(fallOf(CIRR), 'sinusoid');
  assert.equal(fallOf(SCHISTO), 'portal');
  assert.equal(fallOf({ pv: 10, sin: 9, cv: 10 - LITTLE + 0.01 }), 'little');
  assert.equal(fallOf({ pv: null, sin: 7, cv: 5 }), null);
  assert.match(FALL_WORDS.sinusoid, /sinusoids/);
  for (const s of Object.values(FALL_WORDS)) assert.doesNotMatch(s, /AASLD|EASL|Baveno/);
});

test('the view follows the figure\'s lens, and any other lens shows the slide\'s own', () => {
  assert.equal(viewOf('oxygen', 'pressure'), 'oxygen');
  assert.equal(viewOf('pressure', 'oxygen'), 'pressure');
  assert.equal(viewOf('drop', undefined), 'pressure');
  assert.equal(viewOf('origin', 'oxygen'), 'oxygen');
  assert.equal(viewOf('origin', undefined), 'pressure');
});

test('the layout: zone lines at thirds, dots at the three stations in the order of their pressures, the numbers, and one height for both views', () => {
  for (const [W, f] of [[300, 13.6], [540, 17.9], [280, 12]] as const) {
    const h = lobuleLayout(W, f, measure, P(HEALTHY)), c = lobuleLayout(W, f, measure, P(CIRR)), o = lobuleLayout(W, f, measure, { ...P(HEALTHY), view: 'oxygen' });
    assert.deepEqual(h.zones, [W / 3, (2 * W) / 3]);
    const d = c.dots!;
    assert.equal(d.length, 3);
    assert.ok(d[0]![0] < W / 3 && Math.abs(d[1]![0] - W / 2) < 1e-9 && d[2]![0] > (2 * W) / 3, 'portal end, mid-sinusoid, central end');
    // higher pressure stands higher (smaller y); inside the strip
    assert.ok(d[0]![1] <= d[1]![1] && d[1]![1] < d[2]![1]);
    for (const [, y] of d) assert.ok(y > c.strip.y && y < c.strip.y + c.strip.h);
    // a healthy lobule's line is nearly flat, a cirrhotic one falls across zone 3's half
    assert.ok(h.dots![2]![1] - h.dots![0]![1] < (c.dots![2]![1] - c.dots![1]![1]) / 3);
    const nums = c.texts.filter((t) => t.word === 'num').map((t) => t.t);
    assert.deepEqual(nums, ['22.7 mmHg', '22.1 mmHg', '6.9 mmHg']);
    assert.equal(c.say.filter(Boolean).join(' '), FALL_WORDS.sinusoid);
    assert.equal(h.say.filter(Boolean).join(' '), FALL_WORDS.little);
    assert.equal(h.H, c.H, 'a new patient keeps the height');
    assert.equal(h.H, o.H, 'a switch of view keeps the height');
    assert.ok(o.texts.some((t) => t.t === 'Injured first' && t.only === 'oxygen'));
  }
  assert.equal(fmtP(null), '—');
});

test('the frame: both views and every patient draw the same pieces (they glide), the other view\'s words are clear, and it is sound in every look', () => {
  for (const [w, dev] of [[300, 'phone-portrait'], [330, 'desktop'], [280, 'phone-landscape'], [480, 'tablet-portrait']] as const) eachLook((look) => {
    const c = ctxOf(look, w, dev);
    const a = lobuleFrame(P(HEALTHY), c), b = lobuleFrame(P(CIRR), c), o = lobuleFrame({ ...P(HEALTHY), view: 'oxygen' }, c), n = lobuleFrame(P({ pv: null, sin: null, cv: null } as never), c);
    assert.ok(compatible(a, b) && compatible(a, o) && compatible(a, n), `${look} ${w}: every frame pairs piece by piece`);
    assert.equal(a.h, o.h);
    const shown = (f: typeof a) => f.shapes.filter((s): s is TextShape => s.k === 'text' && (s.alpha ?? 1) > 0 && s.s !== '').map((s) => s.s);
    assert.ok(shown(o).includes('Injured first') && !shown(o).includes('8.1 mmHg'));
    assert.ok(shown(a).includes('8.1 mmHg') && !shown(a).includes('Most oxygen'));
    for (const f of [a, b, o, n]) judge(f, look, { onCard: false });
  });
});

test('the overlay lays the card on its four slides only where they have no card, and twice changes nothing', async () => {
  for (const [key, tool] of Object.entries(LOBULE_SLIDES)) {
    const [deck, id] = key.split('/') as [string, string];
    const d = await loadSource(deck);
    const s = d.slides.find((x) => x.id === id);
    assert.ok(s, `${key} exists`);
    assert.deepEqual(s!.tool, tool, key);
    assert.deepEqual(amendLobule(d), d, `${key}: twice changes nothing`);
  }
  // the slide with Oxygen | Pressure buttons follows them; the two-inflows slide keeps oxygen under Origin
  const z = (await loadSource('lobule')).slides.find((x) => x.id === 'zones')!;
  assert.deepEqual((z.compare as { lens: string }[]).map((o) => o.lens), ['oxygen', 'pressure']);
  assert.equal(LOBULE_SLIDES['two-inflows/meet']!.view, 'oxygen');
});
