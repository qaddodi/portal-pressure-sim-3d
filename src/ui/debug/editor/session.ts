// What the editor keeps between loads (the editor only). Root cause of "an iPad's work is lost": the only copy was the draft in one browser's localStorage, written on Save, and Save reloaded the page,
// which dropped the undo stack, the camera and the selection. Now the undo history is written a moment after every edit (so a crash, a closed tab or a Save does not lose it), the view (camera, mode,
// selection) goes in sessionStorage for the Save reload, and the last Export is remembered so the panel can say when the work exists only in this browser.
// Pure: every function takes the storage, so a node test drives it.
import { exportText } from './state.ts';
import type { Overrides } from '../../../editor/types.ts';

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export const HISTORY_KEY = 'pps3d.editor.history.v1';
export const EXPORT_KEY = 'pps3d.editor.exported.v1';
export const VIEW_KEY = 'pps3d.editor.view.v1';
const KEEP_PAST = 40;   // (each state may carry strokes: the entry must fit a browser's few MB)
export const EXPORT_REMIND_MS = 10 * 60 * 1000;

export interface Persisted { base: string; now: Overrides; past: Overrides[]; future: Overrides[]; savedAt: number }
const guard = <T>(f: () => T, or: T): T => { try { return f(); } catch { return or; } };

export function persistHistory(st: StorageLike, base: Overrides, h: { now: Overrides; pastList: readonly Overrides[]; futureList: readonly Overrides[] }, at: number): boolean {
  const p: Persisted = { base: exportText(base), now: h.now, past: h.pastList.slice(-KEEP_PAST), future: h.futureList.slice(-KEEP_PAST), savedAt: at };
  return guard(() => { st.setItem(HISTORY_KEY, JSON.stringify(p)); return true; }, false);
}
/** The saved history when it belongs to this page: it was started from what the page was built with (a crash or closed tab), or ended at it (a Save and reload). */
export function restorableHistory(st: StorageLike, loaded: Overrides): Persisted | null {
  const p = guard(() => JSON.parse(st.getItem(HISTORY_KEY) ?? 'null') as Persisted | null, null), text = exportText(loaded);
  if (!p || typeof p.base !== 'string' || p.now?.version !== 1 || !Array.isArray(p.past) || !Array.isArray(p.future)) return null;
  return p.base === text || exportText(p.now) === text ? p : null;
}
export const clearHistory = (st: StorageLike): void => guard(() => st.removeItem(HISTORY_KEY), undefined);

export function noteExported(st: StorageLike, o: Overrides, at: number): void { guard(() => st.setItem(EXPORT_KEY, JSON.stringify({ at, text: exportText(o) })), undefined); }
/** A quiet reminder when the draft holds edits no Export has captured, or the last Export is old. Null when there is nothing to say. */
export function exportReminder(st: StorageLike, now: Overrides, committed: Overrides, at: number): string | null {
  const text = exportText(now);
  if (text === exportText(committed)) return null;
  const e = guard(() => JSON.parse(st.getItem(EXPORT_KEY) ?? 'null') as { at: number; text: string } | null, null);
  if (!e) return 'These edits exist only in this browser: Export keeps a copy.';
  if (e.text !== text && at - e.at > EXPORT_REMIND_MS) return 'Changed since the last Export: Export keeps a copy.';
  return null;
}

export interface ViewState { yaw: number; pitch: number; mode: string; organ: string | null; vessel: string | null; panel: boolean }
export const saveView = (st: StorageLike, v: ViewState): void => guard(() => st.setItem(VIEW_KEY, JSON.stringify(v)), undefined);
export function loadView(st: StorageLike): ViewState | null {
  const v = guard(() => JSON.parse(st.getItem(VIEW_KEY) ?? 'null') as ViewState | null, null);
  return v && Number.isFinite(v.yaw) && Number.isFinite(v.pitch) && typeof v.mode === 'string' ? v : null;
}
