// The Tests card's pictures ease to a new card size, they never snap (owner, 27 Nov, iPhone: the scope picture jumped when the sheet was swiped up to Full).
// Root cause: the card is laid out once at its new size and only its edge eased; every figure sized by the card's height jumped. One shared rule (tests/dock/figure-glide.ts) now eases every figure of
// every pane, from its old box to its new one, on `translate` and `scale` alone. This file pins the maths, the choice of figures, and that every way the card changes size goes through it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { flip, flipAt, FIGURES, FLIP_EPS } from '../src/ui/tests/dock/figure-glide.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('a figure that grew is put back where and how big it stood, and eases home', () => {
  // the scope at Half (a 160 px circle) and at Full (a 300 px circle), its corner 12 px higher in the card
  const f = flip({ x: 40, y: 80, w: 160, h: 160 }, { x: 20, y: 68, w: 300, h: 300 })!;
  assert.deepEqual(f, { tx: 20, ty: 12, sx: 160 / 300, sy: 160 / 300 });
  assert.deepEqual(flipAt(f, 0), { translate: '20px 12px', scale: `${160 / 300} ${160 / 300}` }, 'k = 0: where it stood');
  assert.deepEqual(flipAt(f, 1), { translate: '0px 0px', scale: '1 1' }, 'k = 1: where it stands');
  const mid = flipAt(f, 0.5).scale.split(' ').map(Number);
  assert.ok(mid[0]! > 160 / 300 && mid[0]! < 1 && mid[0] === mid[1], 'a circle stays a circle on the way (equal scale both ways)');
});

test('a figure that shrank is eased the same way; one that did not change is left alone; an empty box is never eased', () => {
  const g = flip({ x: 0, y: 0, w: 300, h: 300 }, { x: 0, y: 0, w: 150, h: 150 })!;
  assert.equal(g.sx, 2);
  assert.equal(flip({ x: 5, y: 5, w: 100, h: 50 }, { x: 5 + FLIP_EPS / 2, y: 5, w: 100, h: 50 }), null);
  assert.equal(flip({ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 100, h: 100 }), null, 'a box that was not laid out has nothing to ease from');
  assert.equal(flip({ x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 0, h: 100 }), null);
});

test('every box a Tests pane draws its picture in is one the glide eases', () => {
  const walk = (d: string, out: string[] = []): string[] => {
    for (const n of readdirSync(new URL(`../${d}`, import.meta.url))) {
      const p = `${d}/${n}`;
      if (n === 'copied') continue;
      if (statSync(new URL(`../${p}`, import.meta.url)).isDirectory()) walk(p, out); else if (/(Pane|View)\.tsx$/.test(n)) out.push(p);
    }
    return out;
  };
  const named = /\.(?:chart-box|pt-box|ab-dial-box)/g;
  const inSel = new Set(FIGURES.match(named));
  assert.ok(inSel.size >= 3);
  const boxes = new Set<string>();
  for (const f of walk('src/ui/tests')) for (const m of read(f).matchAll(/className="([^"]*-box[^"]*)"/g)) for (const c of m[1]!.split(/\s+/)) if (/^(chart|pt|ab-dial)-box$/.test(c)) boxes.add(`.${c}`);
  assert.ok(boxes.size >= 3, 'the panes draw in these boxes');
  for (const b of boxes) assert.ok(inSel.has(b), `${b} is a figure box of a pane and is in FIGURES`);
  // (any other `*-box` a pane draws a picture in must be added here and to FIGURES: a new figure box that is not eased snaps again)
  const others = new Set<string>();
  for (const f of walk('src/ui/tests')) for (const m of read(f).matchAll(/className="([^"]*)"/g)) for (const c of m[1]!.split(/\s+/)) if (/-box$/.test(c) && !/^(chart|pt|ab-dial)-box$/.test(c) && !/^(fibroscan|hvpg|dop|wall|svg-gl)/.test(c)) others.add(c);
  assert.deepEqual([...others], [], 'no other picture box in a pane');
});

test('every way the Tests card changes size lays it out inside the figure glide', () => {
  const src = read('src/ui/tests/TestsLayer.tsx');
  // the sheet's pull, its grab handle and the divider (a sheet's height, a side card's width)
  assert.match(src, /setSize: \(to, curve\) => \{ glideFigures\(cardRef\.current, \(\) => flushSync\(\(\) => useTests\.getState\(\)\.setSheetSize\(SIZE_OF\[to\]\)\), \{ curve \}\); \}/);
  assert.match(src, /glideFigures\(cardRef\.current, \(\) => flushSync\(\(\) => useTests\.getState\(\)\.setSheetSize\(n\)\)\);\s*\n\s*if \(!reduced\(\)\) easeBack/);
  assert.match(src, /set: \(o\) => glideFigures\(cardRef\.current, \(\) => flushSync\(\(\) => useTests\.getState\(\)\.setSize\(o\)\)\)/);
  const bare = src.split('\n').filter((l) => /useTests\.getState\(\)\.(setSheetSize|setSize)\(/.test(l) && !/glideFigures/.test(l));
  assert.deepEqual(bare, [], 'no resize of the card outside the glide');
  // the pull hands its settle curve to the pictures, so the edge and the picture ease together
  const pull = read('src/ui/surface/sheet-pull.ts');
  assert.match(pull, /api\.setSize\(to, curveOf\(/);
  assert.match(src, /setSize: \(to, curve\) => \{ glideFigures\(cardRef\.current, [^\n]*\{ curve \}\); \}/);
});

test('the glide writes `translate` and `scale` only, on the one clock, and every chart measures itself at once for it', () => {
  const g = read('src/ui/tests/dock/figure-glide.ts');
  assert.ok(!/requestAnimationFrame|setTimeout|performance\.now/.test(g), 'the one clock');
  assert.ok(!/style\.transform\b/.test(g), 'translate and scale, which a chart divides out and a size-style check ignores');
  assert.match(g, /flushSync\(\(\) => resyncNow\(\)\)/);
  assert.match(read('src/ui/charts/Chart.tsx'), /onResync\(measure\)/);
  assert.match(read('src/ui/tests/Cv.tsx'), /onResync\(again\)/);
  assert.match(read('src/ui/tests/Cv.tsx'), /closest\('\[data-figure-glide\]'\)/);
});
