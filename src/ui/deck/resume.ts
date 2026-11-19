// Where each presentation was left, so the Present menu can offer "Resume 7 / 12" (2D resume.js). One small record per deck on this device: { at, n } (the stop, outline included, and the deck's
// stop count then). A deck whose count has changed since, or a position past its end, starts from the beginning again. The first stop or the last (the talk is over) forgets it.
import { STORAGE_PREFIX } from '../../state/settings.ts';

const KEY = `${STORAGE_PREFIX}resume`;
const MAX = 40;
type All = Record<string, { at: number; n: number; w: number }>;

function readAll(): All {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
function writeAll(all: All): void {
  const ids = Object.keys(all).sort((a, b) => (all[a]?.w || 0) - (all[b]?.w || 0));
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX))) delete all[id];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
}
const stamp = (all: All) => Math.max(Date.now(), ...Object.values(all).map((r) => (r?.w || 0) + 1));

export function noteResume(id: string, at: number, n: number): void {
  if (!id || !(n > 1) || !Number.isInteger(at)) return;
  const all = readAll();
  if (at <= 0 || at >= n - 1) { if (!(id in all)) return; delete all[id]; }
  else { if (all[id]?.at === at && all[id]?.n === n) return; all[id] = { at, n, w: stamp(all) }; }
  writeAll(all);
}
/** Where to resume the deck (n stops now), or null for the beginning. */
export function resumeFor(id: string, n: number): { at: number; n: number } | null {
  const r = readAll()[id];
  return r && Number.isInteger(r.at) && r.n === n && r.at > 0 && r.at < n - 1 ? { at: r.at, n } : null;
}
export function forgetResume(id: string): void { const all = readAll(); if (id in all) { delete all[id]; writeAll(all); } }
