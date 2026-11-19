// The presenter's saved scripts (this device's localStorage) and their share-link encoding: the 2D app's script-library.js. A script is `{ id, title, summary, steps }`
// (a patient and its settings per step, built from the live model) or `{ id, title, summary, deck }` (an imported deck). Nothing here touches the page but storage.
import { STORAGE_PREFIX } from '../../state/settings.ts';

const KEY = `${STORAGE_PREFIX}scripts`;
export interface ScriptStep { title: string; preset: string; params?: unknown; view?: string; notes?: string; kicker?: string; line?: string; ask?: [string, string]; [k: string]: unknown }
export interface Script { id: string; title: string; summary?: string; steps?: ScriptStep[]; deck?: Record<string, unknown>; test?: boolean; builtin?: undefined }

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';
// Only well-formed scripts: a damaged saved value is ignored rather than stopping the library. (A script with no steps, or a null step, is dropped too.)
const okScript = (x: unknown): x is Script => isObj(x) && !!x.id && (x.deck ? isObj(x.deck) : x.steps == null || (Array.isArray(x.steps) && x.steps.every((st) => isObj(st))));
export const readMine = (): Script[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(okScript) : []; } catch { return []; } };
/** Says whether it kept them: storage that is full or blocked reports false, so "Script created" is never said of a script that is not there. */
export const writeMine = (list: Script[]): boolean => { try { localStorage.setItem(KEY, JSON.stringify(list)); void navigator.storage?.persist?.(); return true; } catch { return false; } };
export const NO_ROOM = 'This device has no room to keep scripts. Free some browser storage and try again.';

export const enc = (o: unknown): string => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const dec = (s: string): unknown => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
export const newId = (): string => 'my-' + Date.now().toString(36);
/** The file name an exported script gets. */
export const exportName = (title: string): string => `${title.replace(/[^\w-]+/g, '-').toLowerCase()}.pps-script.json`;
