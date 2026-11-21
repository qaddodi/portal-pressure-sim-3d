// The keyboard walk's two small rules, pure so a test can hold them (VesselWalk.tsx carries them out).

/** What Enter or Space does to the pick on vessel `id`. A vessel the focus alone lit (`focusLit`) is picked by Enter, never un-picked by it; a picked one is toggled off. */
export function enterOn(picked: string | null, id: string, focusLit: boolean): string | null {
  return picked === id && !focusLit ? null : id;
}

/** Where a key moves the focus inside the walk (index of `n` stops), or null when it is not a linear move: Down/Up step, Home/End jump. */
export function rovingNext(key: string, i: number, n: number): number | null {
  if (n <= 0 || i < 0) return null;
  if (key === 'ArrowDown') return Math.min(n - 1, i + 1);
  if (key === 'ArrowUp') return Math.max(0, i - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return null;
}
