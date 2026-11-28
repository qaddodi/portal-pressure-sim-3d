// The node scene audit (scripts/scene-audit.mjs) as an audit check: the real scene with real engine frames, no browser, no GPU. Run as a child with --json, its rows turned into items and findings.
import { spawnSync } from 'node:child_process';
import { ROOT } from './world.mjs';

export function sceneAudit() {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [`${ROOT}scripts/scene-audit.mjs`, '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const at = r.stdout.indexOf('{\n');
  let json = null;
  try { json = at >= 0 ? JSON.parse(r.stdout.slice(at)) : null; } catch { json = null; }
  return { json, seconds: (Date.now() - t0) / 1000, crashed: json ? '' : `${r.stdout}${r.stderr}`.slice(-500) };
}
