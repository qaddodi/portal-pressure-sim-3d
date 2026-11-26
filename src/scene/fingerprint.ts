// What a baked file was made from, told apart in a way another JavaScript engine cannot break (the skins' and the weld plan's digests).
// Root cause (Mac Safari ?perf, 26 Nov: build:skins 10,173 ms, the baked skins thrown away and meshed live): the digests rounded every input number to a grid (1e-4, 1e-5) and hashed the
// result, in order.
// The inputs come out of sin, cos, splines and smoothing, whose last bits differ between engines; a number near a rounding edge falls on the other side of it, a near tie sorts two arms the other
// way, a smoothing step lands a thousandth of a unit apart. One ulp on every transcendental result in node changed both digests (tests/fingerprint.test.ts). Exact hashing of computed numbers
// cannot work.
// A fingerprint is instead, per group, an ORDER-FREE exact part (the strings and booleans as a multiset, and the count of numbers) and three sums of the numbers (|x|, x, x squared), compared with a
// tolerance (TOL of the group's size): far above any engine's difference, far below a different figure (a vessel grown, coiled or moved, another junction, another network).
export interface Fingerprint {
  /** The exact part: each group's strings and booleans (as a multiset) and its count of numbers, hashed in group order. */
  key: string;
  /** Per group: the sum of |x|, the sum of x, and the sum of x squared. */
  sums: number[];
}

export class Printer {
  private keys: string[] = [];
  private readonly sums: number[] = [];
  private tokSum = 0;
  private tokXor = 0;
  private toks = 0;
  private abs = 0;
  private sum = 0;
  private sq = 0;
  private count = 0;
  /** Adds an exact token (a 32-bit integer, or a string's hash) to the open group: order-free (a sum and a xor of each token's own hash). */
  exact(x: number): void {
    let h = Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    this.tokSum = (this.tokSum + (h >>> 0)) >>> 0; this.tokXor = (this.tokXor ^ h) >>> 0; this.toks++;
  }
  text(s: string): void { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); this.exact(h); }
  /** A number made by arithmetic: summed into the open group, never hashed. */
  number(x: number): void { this.abs += Math.abs(x); this.sum += x; this.sq += x * x; this.count++; }
  /** Closes the open group (its tokens and count go into the key, its sums into the list) and opens the next. */
  group(): void {
    this.keys.push(`${this.tokSum.toString(16)}.${this.tokXor.toString(16)}.${this.toks}.${this.count}`);
    this.sums.push(this.abs, this.sum, this.sq);
    this.tokSum = this.tokXor = this.toks = 0; this.abs = this.sum = this.sq = 0; this.count = 0;
  }
  /** Walks any JSON-like value: its strings and booleans as tokens, its numbers into the open group (the shape and the order are not kept: see the file's head). Keys are taken in any
   *  order; `skip` leaves a key out. */
  walk(v: unknown, skip?: (key: string) => boolean): void {
    if (typeof v === 'number') this.number(v);
    else if (typeof v === 'string') this.text(v);
    else if (Array.isArray(v)) for (const x of v) this.walk(x, skip);
    else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        const x = (v as Record<string, unknown>)[k];
        if (x === undefined || skip?.(k)) continue;
        this.text(k); this.walk(x, skip);
      }
    } else this.exact(v === true ? 1 : v === false ? 2 : 3);
  }
  finish(): Fingerprint {
    if (this.count || this.toks) this.group();
    let h = 0x811c9dc5; for (const k of this.keys) for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619);
    return { key: `${(h >>> 0).toString(16)}-${this.keys.length}`, sums: [...this.sums] };
  }
}

/** The fingerprint as the one string a file's header holds: `key|s,s,s,...` (each sum to 17 digits, so the string gives the number back exactly). */
export const printString = (p: Fingerprint): string => `${p.key}|${p.sums.map((s) => s.toPrecision(17)).join(',')}`;

/** How far a group's sums may move and still be the same figure: this share of the group's size (its sum of |x|, or of x squared for that sum). One ulp on every sin and cos in node moved
 *  the Anatomy's worst group by 5e-4 of its size (a smoothing step a thousandth of a unit apart: a third of a 2D pixel); a vessel grown, coiled or moved moves its group by far more. */
export const TOL = 2e-3, ABS_TOL = 1e-9;

/** Whether two fingerprint strings name the same figure: equal everywhere but the sums, and every sum within TOL of its group's size. */
export function samePrint(a: string, b: string): boolean {
  if (a === b) return true;
  const ia = a.lastIndexOf('|'), ib = b.lastIndexOf('|');
  if (ia < 0 || ib < 0 || a.slice(0, ia) !== b.slice(0, ib)) return false;
  const sa = a.slice(ia + 1).split(',').map(Number), sb = b.slice(ib + 1).split(',').map(Number);
  if (sa.length !== sb.length || sa.length % 3) return false;
  for (let g = 0; g < sa.length; g += 3) {
    const size = Math.max(sa[g]!, sb[g]!), sizeSq = Math.max(sa[g + 2]!, sb[g + 2]!);
    const near = (x: number, y: number, s: number): boolean => Math.abs(x - y) <= ABS_TOL + TOL * s;
    if (!near(sa[g]!, sb[g]!, size) || !near(sa[g + 1]!, sb[g + 1]!, size) || !near(sa[g + 2]!, sb[g + 2]!, sizeSq)) return false;
  }
  return true;
}
