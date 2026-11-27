#!/usr/bin/env node
// Writes tests/fixtures/advanced-numbers-3d.json: the Advanced physiology readings (tests/fixtures/advanced-2d.json: the slice patient with each control put to each end of its range) where THIS
// app's engine has moved on from the 2D app's, recorded from this engine. Same rule as scripts/gen-rw-numbers-3d.mjs: a row (the base, or one control at one value) is written when any reading
// differs from the 2D row; every other row stays the 2D app's. tests/advanced.test.ts reads the two through tests/engine-departures.ts. Run by `npm run gen:departures`; about a minute.
import { readFileSync, writeFileSync } from 'node:fs';
import { runAdvanced } from '../tests/advanced-run.ts';
import { ADV_CONTROLS } from '../src/ui/settings/advanced.ts';
import { advSet } from '../src/ui/settings/advanced.ts';
import { advancedKey } from '../tests/engine-departures.ts';

const two = JSON.parse(readFileSync(new URL('../tests/fixtures/advanced-2d.json', import.meta.url), 'utf8'));
const keys = Object.keys(two.base);
const got = await runAdvanced(two.preset, keys, [() => {}, ...two.cases.map((c) => (p) => advSet(ADV_CONTROLS[c.id], p, c.value))]);
const differs = (a, b) => keys.some((k) => a[k] !== b[k]);
const out = { note: 'Recorded from this app\'s engine where a reading has moved on from the 2D app (scripts/gen-advanced-numbers-3d.mjs); every other row is held to advanced-2d.json.', base: differs(got[0], two.base) ? got[0] : null, cases: {} };
two.cases.forEach((c, i) => { if (differs(got[i + 1], c.readings)) out.cases[advancedKey(c)] = got[i + 1]; });
writeFileSync(new URL('../tests/fixtures/advanced-numbers-3d.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`wrote tests/fixtures/advanced-numbers-3d.json (${out.base ? 'base, ' : ''}${Object.keys(out.cases).length} of ${two.cases.length} cases)`);
process.exit(0);
