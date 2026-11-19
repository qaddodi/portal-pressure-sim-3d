// The 2D app's stylesheets are lifted byte for byte (scripts/copy-2d-css.mjs): a hand edit of a copied file, a missing file, or an index that does not
// import them in the 2D load order fails here. Change the 2D repo and copy again (PPS_2D_REPO=<2D checkout at the pin> also compares with that checkout).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pinned2D } from './two-d-pin.ts';

const dir = 'src/ui/css2d';
const src = JSON.parse(readFileSync(`${dir}/SOURCE.json`, 'utf8')) as { source: string; order: string[]; hashes: Record<string, string>; icons: Record<string, string> };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex').slice(0, 16);

test('every copied stylesheet is the 2D file, unedited', () => {
  assert.ok(src.order.length >= 10 && src.order[0] === 'tokens.css', 'the 2D load order starts with the tokens');
  for (const f of src.order) assert.equal(sha(readFileSync(`${dir}/${f}`)), src.hashes[f], `${f} was edited by hand: change the 2D repo and run scripts/copy-2d-css.mjs`);
});

test('the index imports exactly those files, in that order', () => {
  const imports = [...readFileSync(`${dir}/index.css`, 'utf8').matchAll(/@import "\.\/([\w.-]+)";/g)].map((m) => m[1]);
  assert.deepEqual(imports, src.order);
});

test('the icon sheets the stylesheets name are here, unedited', () => {
  const named = new Set<string>();
  for (const f of src.order) for (const m of readFileSync(`${dir}/${f}`, 'utf8').matchAll(/url\("\.\.\/brand\/icons\/([\w.-]+)"\)/g)) named.add(m[1]);
  assert.ok(named.size >= 3);
  for (const n of named) { assert.ok(existsSync(`src/ui/brand/icons/${n}`), `${n} is missing`); assert.equal(sha(readFileSync(`src/ui/brand/icons/${n}`)), src.icons[n], `${n} was changed`); }
});

const two = pinned2D('index.html');
test('the copy is what the 2D app has at the pin (PPS_2D_REPO)', { skip: two.skip }, () => {
  assert.match(execFileSync('node', ['scripts/copy-2d-css.mjs', '--from', two.repo, '--check'], { encoding: 'utf8' }), /matches/);
});
