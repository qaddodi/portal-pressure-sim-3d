// Where the overrides come from, read SYNCHRONOUSLY at module load (network.ts and the organ meshes are built once, at import):
// the committed file src/editor/overrides.json everywhere; on the preview copy with ?editor, the editor's draft in localStorage replaces it.
// The live site never reads the draft. Saving the draft reloads the page, so every consumer (camera, scope, catheter, labels, clots, ascites) rebuilds from one geometry.
import committed from './overrides.json' with { type: 'json' };
import { EMPTY, type Overrides } from './types.ts';

export const DRAFT_KEY = 'pps3d.editor.draft.v1';
const editorPage = (): boolean => {
  if (typeof location === 'undefined') return false;
  const preview = /\/preview\//.test(location.pathname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  return preview && new URLSearchParams(location.search).has('editor');
};
/** Any file's version to the current one (the one place a change of the format is handled): version 1 is the current; anything else is refused (null), never guessed at. */
export function migrate(raw: unknown): Overrides | null {
  const o = raw as { version?: unknown } | null;
  if (!o || typeof o !== 'object') return null;
  return o.version === 1 ? (o as Overrides) : null;
}
function load(): Overrides {
  if (editorPage()) {
    try { const s = localStorage.getItem(DRAFT_KEY); if (s) { const o = migrate(JSON.parse(s)); if (o) return o; } } catch { /* fall through */ }
  }
  const c = committed as Overrides;
  return c?.version === 1 ? c : EMPTY;
}
/** The committed file's overrides (never the draft): what the live site is built with. */
export const committedOverrides = (): Overrides => { const c = committed as Overrides; return c?.version === 1 ? c : EMPTY; };
let current: Overrides = load();
/** The overrides this page was built with. */
export const overrides = (): Overrides => current;
/** Tests only: build with these instead. */
export const setOverridesForTest = (o: Overrides): void => { current = o; };
/** The editor's Save: keep the draft and reload so everything rebuilds from it. */
export function saveDraft(o: Overrides, reload = true): void {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(o)); } catch { /* private mode */ }
  if (reload && typeof location !== 'undefined') location.reload();
}
export function clearDraft(): void { try { localStorage.removeItem(DRAFT_KEY); } catch { /* nothing */ } }
