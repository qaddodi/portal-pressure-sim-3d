// How many bands are on the varices: the ONE rule every reader of the engine's band count uses (the Endoscopy readout and its drawing, the caption under the lens, the answer to a Band tap, the
// Days record). The engine's count is not a whole number: each band placed adds 1 and the whole wears off by 0.02 a day (engine.js advance), so 1 band and 28 days later is 0.44, and a second band
// makes 1.44. A band with any of it left is still on, so the count is rounded UP (a small epsilon keeps a float's dust from making a band). Rounding to the nearest made the readout lag a
// band behind the session (1.44 read 1: Bands 1, 1, 2 after sessions 1, 2, 3 of a case, review of capture 0bc14020, B8), and a band can never again read fewer than the model has on.
// A band placed always adds exactly one to the count (ceil(x + 1) is ceil(x) + 1), up to the engine's cap of four. Pure.
export const bandsPlaced = (b: unknown): number => (typeof b === 'number' && Number.isFinite(b) ? Math.max(0, Math.ceil(b - 1e-3)) : 0);
