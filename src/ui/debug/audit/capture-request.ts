// The capture's slides from an audit request in the address (`&req=random:10@4471`, request/address.ts): which slides, which sizes, and the words the README says. Pure.
// Without `req` the capture takes what its picker says; with one, the request does, and a request that cannot be read is an error to show, never a guess.
import { scopeFromSearch } from '../request/address.ts';
import type { World } from '../request/resolve.ts';

export interface RequestPick {
  /** the slides, `deck:n`; null: every slide (the request named none) */
  pick: string[] | null;
  decks: null;
  words: string;
  none: false;
  seed: number | null;
  /** the sizes the request asked for with `layout:`, or null (the bar's ticks stand) */
  sizes: string[] | null;
  line: string;
}
export function pickFromSearch(search: string, world: World): { ok: true; sel: RequestPick } | { ok: false; error: string } | null {
  const r = scopeFromSearch(search, world);
  if (!r) return null;
  if (!r.ok) return r;
  const s = r.scope, rnd = s.random;
  const seed = rnd ? ` (seed ${rnd.seed}${rnd.spread ? ', spread over the talks' : ''}; the same slides again: random:${rnd.n}@${rnd.seed}${rnd.spread ? '/deck' : ''})` : '';
  const words = s.named ? `request ${s.line}: ${s.slides.length} slide${s.slides.length === 1 ? '' : 's'}${seed}: ${s.slides.join(', ')}` : `request ${s.line}: every slide of every talk`;
  return { ok: true, sel: { pick: s.named ? s.slides : null, decks: null, words, none: false, seed: rnd?.seed ?? null, sizes: s.sized ? s.sizes : null, line: s.line } };
}
