// The earlier runs in the output folder, for the comparison (src/ui/debug/request/compare.ts): every `audit-*.zip` there that is a run of this format, read from its findings.json and manifest.json.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipText } from '../../src/ui/debug/request/read-zip.ts';
import { earlierRun } from '../../src/ui/debug/request/compare.ts';

/** One zip as an earlier run, or null when it is not one of ours. */
export function readEarlier(path) {
  try {
    const zip = new Uint8Array(readFileSync(path));
    const f = zipText(zip, 'findings.json'), m = zipText(zip, 'manifest.json');
    return f && m ? earlierRun(path, f, m) : null;
  } catch { return null; }
}
/** Every earlier run in a folder. */
export function earlierRuns(dir) {
  let names = [];
  try { names = readdirSync(dir).filter((n) => /^audit-.*\.zip$/.test(n)); } catch { return []; }
  return names.map((n) => readEarlier(join(dir, n))).filter(Boolean);
}
