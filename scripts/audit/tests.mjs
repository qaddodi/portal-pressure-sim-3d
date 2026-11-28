// The node tests as an audit check: the repo's own test files for the request's features, run with node:test's own runner in this process' children, each red test turned into a finding.
// Reuses the tests as they are (rule 20: no new pixels, no new approval). Never the whole suite: the files come from the feature table (src/ui/debug/request/features.ts).
import { readdirSync } from 'node:fs';
import { run } from 'node:test';
import { ROOT } from './world.mjs';

export const allTestFiles = () => readdirSync(`${ROOT}tests`).filter((f) => f.endsWith('.test.ts')).sort();

/** Runs `names` (files under tests/) and returns one result per file: { file, pass, fail, skip, failures: [{ name, message }] }, and the seconds it took. `onFile(file)` is told as each file ends. */
export async function runTestFiles(names, { concurrency = 4, onFile = () => {} } = {}) {
  const t0 = Date.now(), by = new Map(names.map((n) => [n, { file: n, pass: 0, fail: 0, skip: 0, failures: [] }]));
  const abs = names.map((n) => `${ROOT}tests/${n}`);
  if (!abs.length) return { results: [], seconds: 0 };
  const stream = run({ files: abs, concurrency, forceExit: true, cwd: ROOT });
  const fileOf = (d) => (d.file ? d.file.replace(/^.*\/tests\//, '') : null);
  const seen = new Set();
  stream.on('test:pass', (d) => { const r = by.get(fileOf(d)); if (!r || d.nesting > 1) return; if (d.skip || d.todo) r.skip++; else r.pass++; });
  stream.on('test:fail', (d) => {
    const r = by.get(fileOf(d)); if (!r) return;
    const e = d.details?.error, cause = e?.cause ?? e;
    if (e?.failureType === 'subtestsFailed') return;
    r.fail++;
    r.failures.push({ name: d.name, message: String(cause?.message ?? e?.message ?? 'failed').split('\n').slice(0, 6).join('\n').slice(0, 600) });
  });
  stream.on('test:summary', (d) => { if (d.file) { const f = fileOf(d); if (f && !seen.has(f)) { seen.add(f); onFile(f); } } });
  // (the stream must be read to the end: it is the run)
  // eslint-disable-next-line no-unused-vars
  for await (const _ of stream) { /* events are handled above */ }
  return { results: [...by.values()], seconds: (Date.now() - t0) / 1000 };
}
