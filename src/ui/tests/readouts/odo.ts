// The number roll of 2D's util.js countTo (its odometer: odoSwap, odoBuildRest): a number that takes a new value of the same shape rolls, each digit that changes in its own column, a strip of the
// digits between the old one and the new one moved by a transform the compositor eases (the lifted `.odo` rule, styles/app-11-deck-visuals.css). Pure here: the plan of columns for two texts.
// A number whose shape changes (9.9 to 10.1, a sign) is not rolled: it lands at once and fades in (countTo's own rule).

/** One piece of a rolling number: a run of plain text, or a column that rolls from one digit to another through the digits between (the strip is read top down: old to new when the value rose). */
export type Piece = { t: string } | { s: string[]; n: number; up: boolean; end: string };

const isDigit = (ch: string | undefined) => ch !== undefined && ch >= '0' && ch <= '9';

/** util.js sameShape: the same length, digits where digits are, every other character the same. */
export function sameShape(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) { const ch = a[i], d = isDigit(ch); if (d !== isDigit(b[i]) || (!d && ch !== b[i])) return false; }
  return true;
}

/** util.js odoBuildRest: the columns of a roll from text a to text b (`up`: the value rose, so the strip climbs); null when the two are not the same shape or are the same text. */
export function odoPlan(a: string, b: string, up: boolean): Piece[] | null {
  if (a === b || !sameShape(a, b)) return null;
  const out: Piece[] = [];
  let run = '';
  for (let i = 0; i < b.length; i++) {
    if (a[i] === b[i]) { run += b[i]; continue; }
    if (run) { out.push({ t: run }); run = ''; }
    const p = +a[i]!, q = +b[i]!, n = Math.abs(q - p), seq: number[] = [];
    for (let k = 0; k <= n; k++) seq.push(p + (q > p ? k : -k));
    const strip = (up ? seq : seq.slice().reverse()).map(String);
    out.push({ s: strip, n, up, end: b[i]! });
  }
  if (run) out.push({ t: run });
  return out;
}

/** How long a roll runs (motion.js COUNT_MS, the one roll speed), and the extra the page waits before it takes the plain number back (odoBuildRest: ms + 40). */
export const ROLL_MS = 400, ROLL_TAIL_MS = 40;
