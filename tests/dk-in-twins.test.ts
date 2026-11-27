// The 2D card rules name a card's contents as its direct children; here they sit in `.dk-in` (CardFrame.tsx). scripts/dk-in-twins.mjs makes each such rule's twin where the CSS is built, so none is lost.
// (27 Nov, the 2D-plate audit; the header readings were the first one found, d1a30038.) This holds the plugin's rule, and that no lifted rule is left without a twin in the sheets it reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import postcss from 'postcss';
import { dkInTwin, dkInTwins } from '../scripts/dk-in-twins.mjs';

test('a card\'s direct-child step goes through .dk-in, at the same specificity', () => {
  assert.equal(dkInTwin('.pz-data > .pz-tool'), '.pz-data > :where(.dk-in) > .pz-tool');
  assert.equal(dkInTwin('.pz .pz-data.has-tool > .pz-dh > .pz-hr:not([data-n="0"])'), '.pz .pz-data.has-tool > :where(.dk-in) > .pz-dh > .pz-hr:not([data-n="0"])');
  assert.equal(dkInTwin('.pz.pz .pz-data.pz-data[data-tool^="criteria:"]:has(.pz-crit.has-zones) > .pz-dh'), '.pz.pz .pz-data.pz-data[data-tool^="criteria:"]:has(.pz-crit.has-zones) > :where(.dk-in) > .pz-dh');
  assert.equal(dkInTwin('.pz-panel>.pz-grid'), '.pz-panel > :where(.dk-in) > .pz-grid');
  assert.equal(dkInTwin('.a .pz-data > .pz-tool .x'), '.a .pz-data > :where(.dk-in) > .pz-tool .x', 'a descendant after it stays');
});

test('what is already right is left alone: .dk-in, the card\'s own children, descendants, the words card', () => {
  for (const s of ['.pz .pz-data > .dk-in > .pz-dh', '.pz-data > .pz-grip', '.pz-data > .pz-cred', '.pz-data .pz-tool', '.pz-data > *', '.pz-shade > .pz-text', '.pz-text > .pz-leave', '.x:not(.pz-data) > .pz-dh']) {
    assert.equal(dkInTwin(s), null, s);
  }
});

async function run(css: string): Promise<string> { return (await postcss([dkInTwins()]).process(css, { from: undefined })).css; }

test('the twin follows its rule, with the same declarations; a rule with a zoom is not carried; at-rules and keyframes are kept', async () => {
  const out = await run('.pz-data > .pz-tool { width: 100%; }\n.pz-data > .pz-dh { zoom: var(--pz-z); }\n@media (max-width: 759px) { .pz.low .pz-data > .pz-tool { gap: 4px; } }\n@keyframes k { from { opacity: 0; } }');
  assert.match(out, /\.pz-data > \.pz-tool \{ width: 100%; \}\s*\.pz-data > :where\(\.dk-in\) > \.pz-tool \{ width: 100%; \}/);
  assert.ok(!/:where\(\.dk-in\) > \.pz-dh/.test(out), 'a zoom is the card\'s own work');
  assert.match(out, /@media \(max-width: 759px\) \{[^}]*\.pz\.low \.pz-data > \.pz-tool \{ gap: 4px; \}\s*\.pz\.low \.pz-data > :where\(\.dk-in\) > \.pz-tool \{ gap: 4px; \}/);
  assert.equal(await run(out), out, 'idempotent: a twin is not twinned');
});

test('every lifted 2D card rule in src/ui has its twin once built (a new one is picked up with no hand-written copy)', async () => {
  const dirs = ['src/ui/styles', 'src/ui'];
  const files = [...new Set(dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.css')).map((f) => `${d}/${f}`)))];
  let twinned = 0;
  for (const f of files) {
    const css = readFileSync(f, 'utf8'), out = await run(css), root = postcss.parse(out);
    root.walkRules((r) => {
      if (r.parent?.type === 'atrule' && /keyframes$/i.test((r.parent as { name: string }).name)) return;
      for (const sel of r.selectors) {
        const t = dkInTwin(sel);
        if (!t || r.some((d) => d.type === 'decl' && d.prop === 'zoom')) continue;
        // the rule's twin stands right after it
        let n = r.next(), found = false;
        while (n && n.type === 'rule') { if ((n as { selectors: string[] }).selectors.includes(t)) { found = true; break; } n = n.next(); }
        assert.ok(found, `${f}: ${sel} has no twin ${t}`);
        twinned++;
      }
    });
  }
  assert.ok(twinned >= 25, `${twinned} direct-child selectors are twinned`);
});
