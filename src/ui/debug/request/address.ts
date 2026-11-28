// The request in an address: `?stress&req=feature:junctions%2Blayout:iphone`, `?audit=frames&capture=1&req=random:10@4471`.
// One flag, `req`, holds the whole request line (grammar.ts), so the page, the capture frame inside it
// and the node runner all read the same text. The line is written percent-encoded (`+` is `%2B`, a space `%20`), and read tolerantly: a raw `+` in an address reads as a space
// (that is what a query string does), so words with no `=` are taken as parts and joined again with `+`. Pure.
import { flagValue } from '../flags.ts';
import { parseRequest, type Request } from './grammar.ts';
import { resolveRequest, type Scope, type World } from './resolve.ts';

/** The request line an address carries, normalised, or null when it carries none. */
export function lineFromSearch(search: string): string | null {
  const v = flagValue('req', search);
  if (v === null) return null;
  const words = v.trim().split(/\s+/).filter(Boolean);
  const isOption = (w: string) => /^[a-z]+=/.test(w) && !w.slice(0, w.indexOf('=')).includes(':');
  return [words.filter((w) => !isOption(w)).join('+'), ...words.filter(isOption)].filter(Boolean).join(' ');
}

/** The address flag for a line: `req=feature%3Ajunctions%2Blayout%3Aiphone`. */
export const requestFlag = (line: string): string => `req=${encodeURIComponent(line).replace(/%3A/gi, ':').replace(/%40/g, '@').replace(/%2F/gi, '/').replace(/%3D/gi, '=').replace(/%2C/gi, ',')}`;

export type FromAddress = { ok: true; request: Request; line: string } | { ok: false; error: string };
/** The request an address carries (null: none), parsed. */
export function requestFromSearch(search: string): FromAddress | null {
  const line = lineFromSearch(search);
  if (line === null) return null;
  const p = parseRequest(line);
  return p.ok ? { ok: true, request: p.request, line } : { ok: false, error: p.error };
}

/** The scope an address's request names, against what exists: null when the address has no request, an error that says what is wrong when it cannot be read. */
export function scopeFromSearch(search: string, world: World): { ok: true; scope: Scope } | { ok: false; error: string } | null {
  const r = requestFromSearch(search);
  if (!r) return null;
  if (!r.ok) return r;
  return resolveRequest(r.request, world);
}
