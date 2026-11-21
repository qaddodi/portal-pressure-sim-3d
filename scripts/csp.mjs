// The Content-Security-Policy of the built page (production review 21 Nov, P2-13): the page loads nothing from any other site (verified by tests/csp.test.ts: no fetch, worker or font names another origin), so the policy
// allows only this origin. Scripts: this origin's files and the page's own inline boot script, by its hash (no 'unsafe-inline', no 'unsafe-eval'). Styles allow 'unsafe-inline' (the page's boot style and React's style attributes).
// `blob:` is for workers, canvas pictures and the downloads the app makes itself; `data:` for the style sheets' small inline pictures. Written into dist/index.html by vite.config.ts (build only: the dev server injects inline scripts).
import { createHash } from 'node:crypto';

/** The sha256 source expressions of every inline <script> (one without src) in a page. */
export function inlineScriptHashes(html) {
  const out = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) out.push(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
  return out;
}

export function policy(hashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** The page with the policy as a <meta> right after the charset one (a policy applies to what follows it; the charset must stay among the first bytes). */
export function withCsp(html) {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${policy(inlineScriptHashes(html))}">`;
  return html.replace(/(<meta charset="[^"]*">)/i, `$1\n  ${tag}`);
}
