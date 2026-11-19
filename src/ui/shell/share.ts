// Share links, as the 2D app makes and reads them (src/ui/share-flow.js): `#s=<code>` carries the patient, every setting (the sliders, drugs, shunts and treatments are all
// in `params`), the view and the selection, so "Copy share link" reopens the same scenario, not only the same patient. The code is the 2D app's own (deck/from2d/share-link.js),
// so a link made in either app opens in the other. What the 3D figure adds (the lobule or sinusoid view, the hand's turn, zoom and pan) rides in `x`, the bug packet's extras
// (debug/packet/state.ts cleanExtras): the 2D app ignores it, and the 2D camera (`cam`, in the 2D drawing's own units) is ignored here. In a talk the link is the talk's own
// (`?script=<id>&slide=<n>`), as the 2D app's resumeUrl. Nothing here touches the page: `ShareDeps` is what a link acts on, so tests/share-link.test.ts runs it with a fake app.
import { parseShare, cleanShare, encodeShare as encodeCode } from '../deck/from2d/share-link.js';
import { deepMerge, sanitizeParamsReport } from '../../engine/hales/portal/scenario.js';
import { EDGES } from '../../engine/hales/portal/topology.js';
import { cleanExtras, type Cam } from '../debug/packet/state.ts';
import type { Sel } from '../action/selection.ts';
import type { ViewId } from './views.ts';

/** What the app shows now, as far as a link carries it. `cam` is null while the camera is at the shot's own framing; `deck.slide` counts from 1. */
export interface ShareNow { preset: string; params: unknown; view: ViewId; sel: Sel | null; cam: Cam | null; deck: { id: string; slide: number } | null }
/** A link's content after cleaning: only what the app can apply. */
export interface Shared { preset: string; missing?: string; fromYours?: boolean; params?: Record<string, unknown>; view?: ViewId; sel?: Sel; cam?: Cam }
export interface ShareDeps {
  /** Load a patient; false when the load failed or another patient was asked for meanwhile (then nothing of the link is applied). */
  loadPatient(id: string): Promise<boolean>;
  currentParams(): unknown;
  /** Put the link's settings on the loaded patient (settled, and not a change to undo). */
  setParams(params: unknown): void;
  view(): ViewId;
  goToView(v: ViewId): void;
  select(sel: Sel): void;
  /** Put the hand's view back once the figure has landed. */
  setCamera(cam: Cam): void;
  say(text: string, tone?: 'info' | 'bad'): void;
}

/** 2D: src/ui/share-flow.js (its toasts, word for word) */
export const SHARE_WORDS = {
  copied: 'Link to this exact scenario copied.',
  loaded: 'Loaded the shared scenario.',
  unread: 'This shared link could not be read, so the healthy patient opened.',
  unreadOpen: 'This shared link could not be read.',
  missing: (id: string) => `This link names a patient the app does not have (“${id}”), so its settings opened on the healthy patient.`,
  fromYours: 'This link comes from a patient made from readings, which is saved on the sender’s device only, so its settings opened on the healthy patient.',
  clamped: (fields: string) => `This link had values the model does not accept${fields ? ` (${fields})` : ''}; they were set to the nearest allowed value or the default.`,
} as const;

const EDGE_IDS = new Set((EDGES as { id: string }[]).map((e) => e.id));
const ORGAN = /^[a-z][a-z-]{0,23}$/;
/** A selection the figure can show: a vessel of the model, an organ by a plain name, a lobule part. */
function knownSel(s: unknown): Sel | undefined {
  const o = s as { type?: string; id?: unknown } | null;
  if (!o) return undefined;
  if (o.type === 'edge') return typeof o.id === 'string' && EDGE_IDS.has(o.id) ? { type: 'edge', id: o.id } : undefined;
  if (o.type === 'organ') return typeof o.id === 'string' && ORGAN.test(o.id) ? { type: 'organ', id: o.id } : undefined;
  if (o.type === 'lobule') return { type: 'lobule' };
  return undefined;
}

/** The payload of a link to the scenario now (2D encodeShare: v, preset, params, view; with the selection, and the 3D figure's own view and camera in `x`). */
export function sharePayload(now: ShareNow): Record<string, unknown> {
  const p: Record<string, unknown> = { v: 1, preset: now.preset, params: now.params, view: now.view === 'circuit' ? 'circuit' : 'anatomic' };
  if (now.sel) p.sel = now.sel;
  const x = cleanExtras({ view: now.view === 'lobule' || now.view === 'sinusoid' ? now.view : undefined, cam: now.cam ?? undefined });
  if (Object.keys(x).length) p.x = x;
  return p;
}

/** The address of the scenario now: in a talk the talk and its slide, otherwise the page's own path with `#s=`. `base` is the page's address without query or hash. */
export function shareUrl(now: ShareNow, base: string): string {
  if (now.deck) return `${base}?script=${encodeURIComponent(now.deck.id)}&slide=${Math.max(1, Math.round(now.deck.slide))}`;
  return `${base}#s=${encodeCode(sharePayload(now))}`;
}

/** Does this address carry a share link at all (readable or not)? */
export const hasShare = (hash: string): boolean => /#s=/.test(hash);

/** The link in an address, cleaned (2D readShare, through share-link.js: prototype keys dropped, a known patient, view and selection only), or null when there is none or it cannot be read. */
export function readShare(hash: string, presetIds: readonly string[]): Shared | null {
  const m = String(hash || '').match(/#s=([\w-]+)/);
  if (!m) return null;
  const raw = parseShare(m[1]) as Record<string, unknown> | null;
  const s = (cleanShare as (s: unknown, ids: string[] | null) => unknown)(raw, [...presetIds]) as (Omit<Shared, 'view' | 'sel' | 'cam'> & { view?: string; sel?: unknown }) | null;
  if (!s || !raw) return null;
  const out: Shared = { preset: s.preset };
  if (s.missing) out.missing = s.missing;
  if (s.fromYours) out.fromYours = true;
  if (s.params) out.params = s.params;
  const x = cleanExtras(raw.x);
  if (s.view === 'circuit') out.view = 'circuit';
  else if (x.view === 'lobule' || x.view === 'sinusoid') out.view = x.view;
  else if (s.view === 'anatomic') out.view = 'anatomic';
  const sel = knownSel(s.sel);
  if (sel) out.sel = sel;
  if (x.cam) out.cam = x.cam;
  return out;
}

/** Open a shared scenario (2D loadShared): the patient, then its settings (merged onto the patient's own and checked by the model's own sanitizer), the view, the selection and
 *  the camera. False when the patient did not load or was replaced meanwhile: then nothing of the link is applied. */
export async function loadShared(s: Shared, d: ShareDeps, { quiet = false } = {}): Promise<boolean> {
  if (!(await d.loadPatient(s.preset))) return false;
  let clamped = false, repaired = '';
  const missing = s.missing ? SHARE_WORDS.missing(s.missing) : '';
  if (s.fromYours) d.say(SHARE_WORDS.fromYours, 'bad');
  if (s.params) {
    const merged = deepMerge(d.currentParams(), s.params);
    const { params: clean, repairs } = sanitizeParamsReport(merged) as { params: unknown; repairs: { path?: string }[] };
    d.setParams(clean);
    if (repairs.length) repaired = repairs.slice(0, 3).map((r) => r.path || 'the settings').join(', ') + (repairs.length > 3 ? ` and ${repairs.length - 3} more` : '');
    if (JSON.stringify(clean) !== JSON.stringify(merged)) clamped = true;   // (the view, selection and camera of the link still apply)
  }
  if (s.view && s.view !== d.view()) d.goToView(s.view);
  if (s.sel) d.select(s.sel);
  if (s.cam) d.setCamera(s.cam);
  if (clamped) d.say(missing || SHARE_WORDS.clamped(repaired), missing ? 'bad' : 'info');
  else if (missing) d.say(missing, 'bad');
  else if (!quiet && !s.fromYours) d.say(SHARE_WORDS.loaded);
  return true;
}
