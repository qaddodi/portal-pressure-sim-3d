// R11: the two documents every agent reads first (AGENTS.md, docs/interfaces.md) cannot name a file, a script or a function that is gone. Every backticked path, `npm run` script and identifier in them must exist.
// (Prose, commands with other words, `?flags`, snippets and the fenced code blocks are not checked: only what names one thing in the repo.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DOCS = ['AGENTS.md', 'docs/interfaces.md'];
const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts;

const walk = (dir: string, ext = /\.(ts|tsx|js|mjs|css|json)$/): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === 'node_modules' || n === 'dist' ? [] : walk(p, ext)) : ext.test(n) ? [p] : []; });
/** Every file name in the repo (a bare `Stage.tsx` in a document means the one file of that name). */
const names = new Set(['src', 'scripts', 'tests', 'docs', 'public', '.github'].flatMap((d) => (existsSync(d) ? walk(d, /./) : [])).map((f) => f.split('/').pop()!));
let corpus = '';
const code = () => (corpus ||= ['src', 'scripts', 'tests'].flatMap((d) => walk(d)).map((f) => readFileSync(f, 'utf8')).join('\n'));

const spans = (text: string): string[] => [...text.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!.trim());
/** A branch (`claude/…`), a repository (`qaddodi/…`) or a URL path (`/guides/`) is not a file of this repo. */
const elsewhere = (s: string) => /^(claude|codex|qaddodi|dist)\//.test(s) || s.startsWith('/') || s.startsWith('.');   // (a build's output, a file extension)
const isPath = (s: string) => !elsewhere(s) && /^[\w./@*-]+$/.test(s) && (s.includes('/') || /\.(ts|tsx|md|mjs|js|json|css|pdf|html|yml)$/.test(s)) && !/^(https?:|\/\/)/.test(s) && !/^[.\d]+$/.test(s);
const pathExists = (s: string): boolean => {
  if (!s.includes('/') && !s.includes('*')) return names.has(s) || existsSync(s);
  const p = s.replace(/^\.\.?\//, '').replace(/\/$/, '');
  const stem = p.includes('*') ? p.slice(0, p.indexOf('*')).replace(/\/[^/]*$/, '') : p;
  return [stem, join('src', stem), join('src', 'ui', stem), join('src', 'engine', stem), join('docs', stem)].some((c) => c !== '' && existsSync(c));
};
const isIdent = (s: string) => /^(use[A-Z]\w*|[a-z]+[A-Z]\w*|[A-Z][a-z]\w*[A-Z]\w*)(\(\))?$/.test(s) || /^[a-z]\w*\(\)$/.test(s);

for (const doc of DOCS) {
  test(`${doc}: every path, script and identifier it names exists`, () => {
    const missing: string[] = [];
    for (const s of spans(readFileSync(doc, 'utf8'))) {
      const run = s.match(/^npm run ([\w:-]+)/);
      if (run) { if (!scripts[run[1]!]) missing.push(s); continue; }
      const node = s.match(/^node (?:--\S+ )*(\S+)/);
      if (node) { if (!existsSync(node[1]!)) missing.push(s); continue; }
      if (/\s/.test(s)) continue;
      if (isPath(s)) { if (!pathExists(s)) missing.push(s); continue; }
      if (isIdent(s)) { const id = s.replace(/\(\)$/, ''); if (!new RegExp(`\\b${id}\\b`).test(code())) missing.push(s); }
    }
    assert.deepEqual([...new Set(missing)], [], `${doc} names things that are not in the repo: fix the document`);
  });
}
