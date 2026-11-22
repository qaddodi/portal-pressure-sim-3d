// plan 21b: an element drawn at its length by `scaleX` (a line 1 px wide) must carry no box-shadow, outline, filter or horizontal border:
// the transform scales them with the box, so a 0.5 px shadow became 0.5 x length past each end (the long black lines through the discs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/scene/labels/labels.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}@]+)\{([^{}]+)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));
/** the one list of lines the code draws by scaleX (figure-cards.ts, probe-labels.ts, LabelLayer.tsx, waist-bracket.ts) */
const SCALEX_LINES = ['.lb-lead', '.cl-cal-line', '.cl-span-seg', '.pl-dl', '.pl-dl-rim', '.pl-dl-line', '.cl-lead-line', '.lz-co-line'];

test('every scaleX-drawn line is declared, and none carries box-shadow, outline, filter or a side border', () => {
  for (const cls of SCALEX_LINES) {
    const mine = rules.filter((r) => r.sel.split(',').some((s) => new RegExp(`(^|[\\s>])${cls.replace('.', '\\.')}(\\[[^\\]]*\\])?$`).test(s.trim().replace(/:.*$/, ''))));
    assert.ok(mine.length, `${cls} has a rule`);
    for (const r of mine) assert.doesNotMatch(r.body, /box-shadow|outline|filter|drop-shadow|border-(left|right|inline)/, `${cls} (${r.sel}) is scaled in x: no shadow, outline, filter or side border`);
  }
});
test('a line is found by its transform-origin: any 1px-wide rule scaled from the left is on the list', () => {
  for (const r of rules) if (/width:\s*1px/.test(r.body) && /transform-origin:\s*0 50%/.test(r.body))
    for (const s of r.sel.split(',')) assert.ok(SCALEX_LINES.includes(s.trim()), `${s.trim()} is drawn by scaleX: add it to SCALEX_LINES`);
});
test('the leader\'s halo is a vertical gradient inside its own height, and its extent is its length', () => {
  const line = rules.find((r) => r.sel === '.cl-lead-line')!.body;
  assert.match(line, /linear-gradient\(to bottom/);
  const h = Number(/height:\s*([\d.]+)px/.exec(line)![1]), mt = Number(/margin-top:\s*(-[\d.]+)px/.exec(line)![1]);
  assert.equal(mt, -h / 2, 'centred on the line');
  assert.match(line, /width:\s*1px/);
  const stops = [...line.matchAll(/([\d.]+)px/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...stops.filter((n) => n !== 1 && n !== h && n <= h)) <= h, 'every stop lies inside the height');
});
