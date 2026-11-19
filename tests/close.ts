// Numbers an engine gives are compared with a fixture within a tolerance, never bit for bit: Math functions and the order of float sums differ across Node/V8 builds and machines,
// so a last-digit mismatch (circulation.fhvp on the owner's Mac) is not a wrong number. Relative 1e-6 with a 1e-9 floor; every deck fixture test goes through here.
import assert from 'node:assert/strict';

export const REL = 1e-6, FLOOR = 1e-9;
export const close = (got: number, want: number, rel = REL): boolean => Number.isFinite(got) && Number.isFinite(want) ? Math.abs(got - want) <= Math.max(FLOOR, rel * Math.abs(want)) : Object.is(got, want);

/** Assert that a reading is the fixture's, to the tolerance above (a non-number must be equal). */
export function assertNear(got: unknown, want: unknown, msg: string, rel = REL): void {
  if (typeof want === 'number' && typeof got === 'number') assert.ok(close(got, want, rel), `${msg}: ${got} differs from ${want} by more than ${Math.max(FLOOR, rel * Math.abs(want))}`);
  else assert.deepEqual(got, want, msg);
}
