// What the 3D app has, counted against the 2D app's inventory (parity/inventory.json, from `npm run sync:inventory`).
// Each batch owns one file here, `src/parity/<batch>.ts`, exporting `claims`: the rows it has built. A claim is DERIVED from the tables the UI renders
// from (never typed apart from them), so a row is claimed only while the thing it names is really on the screen.
//   present  the control, word or card exists and shows the 2D app's words
//   wired    it also does what the 2D app's does (a control that only shows is present but not wired)
// The `?parity` scoreboard that counted these against the 2D app is retired (27 Nov: the 2D app is); what stays is that a claim is derived from the tables the UI renders from, so the tests that
// import a batch's `claims` hold the controls, words and cards it names to the screen.

export interface Claim { id: string; wired: boolean }
/** A row of the 2D inventory (parity/inventory.json), or one of the 3D app's own that the inventory has none for (b4-rows.ts, own-slides.ts). */
export interface Row { id: string; area: string; batch: string; label: string }
export type Claims = readonly Claim[];

/** `area:path` ids, the same spelling the inventory script writes. */
export const rowId = (area: string, path: string) => `${area}:${path}`;
