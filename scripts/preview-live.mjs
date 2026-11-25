#!/usr/bin/env node
// "Is my push live?" (F5/D5 of the 25 Nov review: a thread reported a fix live while /preview/ still served a build two commits old, after two deploys failed with a GitHub-side 500).
//
//   node scripts/preview-live.mjs [commit]      default: HEAD. Polls /preview/build-info.txt every 10 s until it names the commit; gives up after 5 minutes.
//
// Exit 0 and "live: <commit>" only when the deployed file names the commit; exit 1 and "NOT LIVE" (with what is served instead) otherwise. No thread says "live" without this printing it.
// PREVIEW_INFO_URL overrides the address; PREVIEW_WAIT_S and PREVIEW_EVERY_S shorten the wait. The fetch is curl, so the cloud's proxy settings apply as they do for every other tool.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const INFO_URL = 'https://qaddodi.github.io/portal-pressure-sim-3d/preview/build-info.txt';

/** build-info.txt's lines ("commit 1a2b3c4d") as an object; {} for anything unreadable. */
export function parseBuildInfo(text) {
  const out = {};
  for (const line of String(text ?? '').split('\n')) { const m = /^(\w+) (.*)$/.exec(line.trim()); if (m) out[m[1]] = m[2]; }
  return out;
}
/** Whether the served commit is the wanted one (either may be the longer form of the other; both must be at least 7 characters). */
export function namesCommit(served, want) {
  const a = (served ?? '').trim().toLowerCase(), b = (want ?? '').trim().toLowerCase();
  return a.length >= 7 && b.length >= 7 && (a.startsWith(b) || b.startsWith(a));
}
/** The one line a thread may report: "live: …" only for a match. */
export function verdict(info, want, minutes) {
  if (namesCommit(info.commit, want)) return { live: true, line: `live: ${want} (built ${info.built ?? 'time unknown'}${info.checks && info.checks !== 'ok' ? `; checks: ${info.checks}` : ''})` };
  const serving = info.commit ? `preview serves ${info.commit}${info.built ? ` (built ${info.built})` : ''}` : 'preview build-info.txt could not be read';
  return { live: false, line: `NOT LIVE after ${minutes} min: ${serving}, expected ${want}. The deploy may have failed or still be running: check the Pages run before saying "live".` };
}

const fetchInfo = (url) => {
  try { return execFileSync('curl', ['-fsS', '--max-time', '15', '-H', 'Cache-Control: no-cache', `${url}${url.includes('?') ? '&' : '?'}t=${process.hrtime.bigint()}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; }
};
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const want = process.argv[2] || execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim();
  const url = process.env.PREVIEW_INFO_URL || INFO_URL;
  const waitS = Number(process.env.PREVIEW_WAIT_S) || 300, everyS = Number(process.env.PREVIEW_EVERY_S) || 10;
  const t0 = process.hrtime.bigint();
  const elapsedS = () => Number((process.hrtime.bigint() - t0) / 1_000_000_000n);
  let info = {};
  for (;;) {
    info = parseBuildInfo(fetchInfo(url));
    if (namesCommit(info.commit, want) || elapsedS() >= waitS) break;
    await sleep(everyS * 1000);
  }
  const v = verdict(info, want, Math.round(elapsedS() / 60));
  console.log(v.line);
  process.exit(v.live ? 0 : 1);
}
