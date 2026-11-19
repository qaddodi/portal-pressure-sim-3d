#!/usr/bin/env node
// Writes tests/fixtures/csph-fingerprint.json: the fingerprint (every reading the cards use) of the slice's patient as the pinned engine
// and host produce it. Re-run only when sync:engine moves the pin on purpose; tests/engine-numbers.test.ts then guards it.
import { createCore } from '../src/engine/host/worker-core.js';
import { mkdirSync, writeFileSync } from 'node:fs';

export async function csphFingerprint(preset = 'csph') {
  const out = [];
  const core = createCore((m) => out.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id: preset, reqId: 1 });
  await core.handle({ type: 'metrics', reqId: 2 });
  core.dispose();
  return out.find((m) => m.type === 'metrics').result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(new URL('../tests/fixtures/', import.meta.url), { recursive: true });
  const fp = await csphFingerprint();
  writeFileSync(new URL('../tests/fixtures/csph-fingerprint.json', import.meta.url), `${JSON.stringify(fp, null, 2)}\n`);
  console.log(`csph: HVPG ${fp.hvpg}, WHVP ${fp.whvp.toFixed(2)}, FHVP ${fp.fhvp.toFixed(2)}`);
  process.exit(0);
}
