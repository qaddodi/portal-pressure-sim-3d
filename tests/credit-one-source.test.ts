// One copyright line, with the MD (owner, 26 Nov 2026): CREDIT in src/ui/shell/words.ts is its only source (scripts/credit.mjs).
// Every place the app or its papers print a "© <year> ..." line reads it from there: the corner credit and card foot (Credit.tsx, CardFrame.tsx import CREDIT),
// the page's <meta name="copyright"> (index.html's placeholder, filled by vite.config.ts), the About page (scripts/source-edits.mjs) and the Hales flyer (render.cjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { CREDIT, RIGHTS, CREDIT_TOKEN, withCredit } from '../scripts/credit.mjs';
import { uiTextEdits } from '../scripts/source-edits.mjs';

const root = new URL('../', import.meta.url);
const read = (f: string) => readFileSync(new URL(f, root), 'utf8');
/** A typed copyright line: the sign (or its entity or escape) and a year. */
const LINE = /(?:©|&copy;|\\u00a9)\s*\d{4}[^"'`<\n]*/g;
/** The 2D About's line, without the MD: what source-edits.mjs turns into RIGHTS. */
const TWO_D = '© 2026 Mohammad Almeqdadi. All rights reserved.';
const TEXT = /\.(ts|tsx|js|mjs|cjs|html|css|json|svg|webmanifest|py)$/;

test('the line is the owner\'s, with the MD', () => {
  assert.equal(CREDIT, '© 2026 Mohammad Almeqdadi, MD');
  assert.equal(RIGHTS, `${CREDIT}. All rights reserved.`);
});

test('nothing the app ships types a copyright line of its own: every one is CREDIT, and only words.ts writes it out', () => {
  const files = execFileSync('git', ['ls-files', 'src', 'scripts', 'public', 'art', 'index.html'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter((f) => TEXT.test(f) && !f.startsWith('src/engine/hales/'));
  const typed: string[] = [];
  for (const f of files) {
    for (const m of read(f).matchAll(LINE)) {
      // Generated copies of RIGHTS (about.copied.ts by source-edits.mjs, the flyer's built-from.json by render.cjs; both pinned elsewhere) and the 2D About's own
      // line, which source-edits.mjs names in order to replace it, are the only other places a line may stand.
      const generated = (f === 'src/ui/shell/about.copied.ts' || f === 'art/hales-flyer/built-from.json') && m[0].startsWith(RIGHTS);
      const replaced = f === 'scripts/source-edits.mjs' && m[0] === TWO_D;
      if (f !== 'src/ui/shell/words.ts' && !generated && !replaced) typed.push(`${f}: ${m[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(typed, [], 'read the line from CREDIT (src/ui/shell/words.ts or scripts/credit.mjs) instead');
});

test('the About page prints RIGHTS: the copy of the 2D About is turned to it by source-edits.mjs, so a re-copy keeps the MD', () => {
  assert.equal(uiTextEdits(`${TWO_D} Fonts`), `${RIGHTS} Fonts`);
  const about = read('src/ui/shell/about.copied.ts');
  assert.equal(about.match(LINE)?.length, 1);
  assert.ok(about.includes(RIGHTS));
  assert.equal(uiTextEdits(about), about, 'about.copied.ts is not what the edits make of it');
});

test('the page\'s copyright meta is filled from CREDIT in the dev server and the build alike', () => {
  const html = read('index.html');
  assert.ok(html.includes(`<meta name="copyright" content="${CREDIT_TOKEN}">`));
  assert.ok(withCredit(html).includes(`<meta name="copyright" content="${CREDIT}">`));
  assert.ok(!withCredit(html).includes(CREDIT_TOKEN));
  const vite = read('vite.config.ts');
  assert.match(vite, /name: 'credit', transformIndexHtml: \{ order: 'pre', handler: \(html\) => withCredit\(html\) \}/);
  assert.match(vite, /plugins: \[[^\]]*\bcredit\(\)/);
});

test('the corner credit and the cards\' foot print CREDIT itself', () => {
  for (const f of ['src/ui/shell/Credit.tsx', 'src/ui/cards/CardFrame.tsx']) {
    assert.match(read(f), /import \{ CREDIT \} from '[./]*(?:shell\/)?words\.ts'/, f);
    assert.match(read(f), /\{CREDIT\}/, f);
  }
});
