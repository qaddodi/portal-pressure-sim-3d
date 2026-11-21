// The built stylesheet drops the rules that style something the app never makes (production review 21 Nov, P2-12), and only those: a class named anywhere in src/, a name built at run time
// ('row-' + x, `${kind}-card`), a rule that merely excludes a class (:not) and every non-class rule stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { namer, prune } from '../scripts/css-unused.mjs';

const used = namer("el.className = 'live-box'; const c = 'row-' + k; const d = `${kind}-card`; $('#main-bar'); const e = 'x'; ");
const css = '.live-box{a:1}.dead-one{b:2}.dead-one,.live-box>.live-box{c:3}.row-open{d:4}.a-card{e:5}.zz-card .dead-two{f:6}#main-bar,#gone{g:7}.live-box:not(.never-set){h:8}@media (min-width:1px){.dead-three{i:9}}@keyframes k{from{opacity:0}}body{j:10}';

test('prune removes only the rules that need a class nobody makes', () => {
  const { css: out, rules, dead } = prune(css, used);
  assert.ok(rules >= 8 && dead >= 5);
  assert.match(out, /\.live-box\{a:1\}/);
  assert.doesNotMatch(out, /dead-one\{b:2\}/);
  assert.match(out, /\.live-box>\.live-box\{c:3\}/, 'the live selector of a list stays');
  assert.match(out, /\.row-open/, 'a name built from a prefix stays');
  assert.match(out, /\.a-card/, 'a name built from a suffix stays');
  assert.doesNotMatch(out, /dead-two/);
  assert.match(out, /#main-bar/); assert.doesNotMatch(out, /#gone/);
  assert.match(out, /:not\(\.never-set\)/, 'a class a rule only excludes does not decide it');
  assert.doesNotMatch(out, /dead-three/); assert.doesNotMatch(out, /@media/, 'an emptied media block goes');
  assert.match(out, /@keyframes k/); assert.match(out, /body\{j:10\}/);
});
