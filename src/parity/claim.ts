// What the 3D app has, counted against the 2D app's inventory (parity/inventory.json, from `npm run sync:inventory`).
// Each batch owns one file here, `src/parity/<batch>.ts`, exporting `claims`: the rows it has built. A claim is DERIVED from the tables the UI renders
// from (never typed apart from them), so a row is claimed only while the thing it names is really on the screen.
//   present  the control, word or card exists and shows the 2D app's words
//   wired    it also does what the 2D app's does (a control that only shows is present but not wired)
// tests/parity-score.test.ts prints "x of y" (present) and "a of y" (wired) per batch, and fails on a claim of a row the inventory does not have
// (a typo or a row that left the 2D app) or on two files claiming one row.

export interface Claim { id: string; wired: boolean }
export type Claims = readonly Claim[];

/** `area:path` ids, the same spelling the inventory script writes. */
export const rowId = (area: string, path: string) => `${area}:${path}`;
