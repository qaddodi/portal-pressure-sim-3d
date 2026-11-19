import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// The copied data (tokens, words, paths, the velocity model) is generated from the 2D repo by scripts/copy-b3-data.mjs; with PPS_2D_REPO set this
// proves the committed copies equal what the 2D repo says now. Without it, the copies' header says where they came from.
const repo = process.env.PPS_2D_REPO;
test('the copied 2D data is current (needs PPS_2D_REPO)', { skip: !repo }, () => {
  execFileSync('node', ['scripts/copy-b3-data.mjs', '--from', repo!, '--check'], { stdio: 'pipe' });
});

test('each copied file says it is generated and never to edit it', () => {
  for (const f of ['src/scene/lenses/tokens.copied.ts', 'src/scene/lenses/words.copied.ts', 'src/scene/vessels/paths.copied.ts', 'src/scene/lenses/vel-normal.copied.js']) {
    assert.match(readFileSync(f, 'utf8').slice(0, 400), /copy-b3-data|generated|do not edit/i, f);
  }
});
