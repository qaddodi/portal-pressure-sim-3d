// The page's Content-Security-Policy and referrer policy (production review 21 Nov, P2-13). The policy allows only this origin, so the test also proves the app asks for nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inlineScriptHashes, policy, withCsp } from '../scripts/csp.mjs';

const html = readFileSync('index.html', 'utf8');

test('the policy: this origin only, the inline boot script by hash, no unsafe-eval, no unsafe-inline for scripts', () => {
  const hashes = inlineScriptHashes(html);
  assert.equal(hashes.length, 1, 'index.html has exactly one inline script (the boot messages); another one needs its own look');
  const p = policy(hashes);
  assert.match(p, /default-src 'self'/);
  assert.match(p, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(p, /unsafe-eval/);
  assert.doesNotMatch(p.split('; ').find((d) => d.startsWith('script-src'))!, /unsafe-inline/);
  assert.match(p, /object-src 'none'/);
  assert.doesNotMatch(p, /https?:/, 'no other origin is allowed');
  const out = withCsp(html);
  assert.match(out, /<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="default-src 'self'/);
  assert.equal(withCsp(out.replace(/\n  <meta http-equiv="Content-Security-Policy"[^>]*>/, '')), out, 'the same page gives the same policy');
});

test('the page sets a referrer policy', () => assert.match(html, /<meta name="referrer" content="strict-origin-when-cross-origin">/));

test('the app asks for nothing from another origin: every fetch and worker names this origin\'s own files', () => {
  const bad: string[] = [];
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) { for (const n of readdirSync(p)) walk(join(p, n)); return; }
    if (!/\.(ts|tsx|js)$/.test(p)) return;
    const t = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const m of t.matchAll(/(?:fetch|new Worker|importScripts|new EventSource|new WebSocket)\(\s*[`'"]https?:/g)) bad.push(`${p}: ${m[0]}`);
    for (const m of t.matchAll(/\b(?:src|href)=["']https?:\/\/(?!qaddodi\.github\.io|github\.com|pubmed|www\.ncbi|doi\.org)[^"']+/g)) if (/<(?:img|script|link|iframe)\b/.test(t.slice(Math.max(0, m.index! - 40), m.index!))) bad.push(`${p}: ${m[0]}`);
  };
  walk('src');
  assert.deepEqual(bad, []);
  assert.doesNotMatch(html.replace(/<meta[^>]*>/g, ''), /(?:src|href)=["']https?:\/\/[^"']*(?:fonts\.g|cdn|unpkg|jsdelivr)/, 'no third-party font or script in the page');
});

test('a built page (when dist exists) carries the policy, the hash of its inline script and a meta that comes first', { skip: !existsSync('dist/index.html') }, () => {
  const built = readFileSync('dist/index.html', 'utf8');
  assert.match(built, /<meta charset="utf-8">\s*<meta http-equiv="Content-Security-Policy"/);
  for (const h of inlineScriptHashes(built)) assert.ok(built.includes(h), 'the hash of every inline script is in the policy');
});
