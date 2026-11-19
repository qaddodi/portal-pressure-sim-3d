// What the menu's Present column does with talks and scripts: the 2D app's presenter-library.js. Scripts are kept on this device (script-library.ts); a script is built from the
// live model (a patient and its settings per step) or is an imported deck. Share links carry a script as #script=…; a built-in talk's link is ?script=<id>.
import { create } from 'zustand';
import { useEngine } from '../../engine/index.ts';
import { patient } from '../../engine/store.ts';
import { useShell } from '../shell/store.ts';
import { UI } from '../strings.generated.ts';
import { NO_ROOM, dec, enc, exportName, newId, readMine, writeMine, type Script, type ScriptStep } from '../deck/script-library.ts';
import { askText, confirmDialog, showLink } from '../deck/dialogs.ts';
import { parseDeckSource, checkDeck } from '../deck/from2d/deck-source.js';
import { W } from '../deck/words.ts';
import { knownTalk, loadDeck } from '../deck/deck-of.ts';
import { startTalk } from '../shell/talk.ts';
import { openHandout } from '../deck/handout.ts';
import { openPresenterView } from '../deck/presenter-link.ts';
import { download } from '../deck/download.ts';

/** Rises on every change to the scripts, so the menu reads them again. */
export const useScripts = create<{ version: number }>(() => ({ version: 0 }));
const changed = () => useScripts.setState((s) => ({ version: s.version + 1 }));
const say = (t: string, tone: 'info' | 'bad' = 'info') => useShell.getState().say(t, tone);

/** The live model as one step of a script: the patient and its settings now, with the view. */
export function captureStep(): ScriptStep {
  const id = useEngine.getState().presetId ?? useShell.getState().patientId;
  return { title: UI.presets.find((p) => p.id === id)?.label || 'Step', preset: id, params: patient.params ? structuredClone(patient.params) : undefined, view: useShell.getState().view, notes: '' };
}

export async function newScript(): Promise<void> {
  const title = await askText({ title: W.newScriptTitle, label: W.newScriptLabel, value: W.newScriptValue, yes: W.newScriptYes });
  if (!title) return;
  const list = readMine();
  list.push({ id: newId(), title, summary: W.newScriptSummary, steps: [captureStep()] });
  if (!writeMine(list)) { say(NO_ROOM, 'bad'); return; }
  changed(); say(W.scriptCreated);
}

export async function addStep(id: string): Promise<void> {
  const cur = readMine().find((x) => x.id === id);
  if (!cur || cur.deck) return;
  const step = captureStep();
  const named = await askText({ title: W.addStepTitle, label: W.addStepLabel, value: step.title, yes: W.addStepYes });
  if (!named) return;   // (Cancel, the × and Esc add nothing; the field never answers empty)
  step.title = named;
  const list = readMine(), s = list.find((x) => x.id === id);   // (read again: the dialog was open a while)
  if (!s || s.deck) return;
  (s.steps ||= []).push(step);
  if (!writeMine(list)) { say(NO_ROOM, 'bad'); return; }
  changed();
}

export async function removeScript(id: string): Promise<void> {
  const s = readMine().find((x) => x.id === id);
  if (!(await confirmDialog({ title: W.deleteTitle, body: W.deleteBody(s?.title), yes: W.deleteYes, danger: true }))) return;
  if (!writeMine(readMine().filter((x) => x.id !== id))) { say(NO_ROOM, 'bad'); return; }
  changed();
}

export const exportScript = (s: Script): void => download(exportName(s.title), JSON.stringify(s, null, 2), 'application/json');

// (Where the clipboard is not allowed, the link is shown in the app's own dialog, selected, to copy by hand.)
const copy = (url: string, msg: string): void => {
  const w = navigator.clipboard?.writeText(url);
  if (!w) { showLink(url); return; }
  w.then(() => say(msg), () => showLink(url));
};
const here = () => `${location.origin}${location.pathname}`;
export const scriptLink = (s: Script): string => `${here()}#script=${enc(s)}`;
export const deckLink = (id: string): string => `${here()}?script=${id}`;
export const shareScript = (s: Script): void => copy(scriptLink(s), W.linkCopiedScript);
export const viewLink = (patient: string): string => `${here()}?preset=${patient}`;
export const shareView = (patient: string): void => copy(viewLink(patient), W.linkCopiedView);
export const shareDeck = (id: string): void => copy(deckLink(id), W.linkCopiedDeck);

/** A script (title, steps) as JSON is kept as it is; anything else must be a deck. */
export function addToLibrary(s: unknown): string {
  let script = s as Script;
  if ((s as { deck?: unknown })?.deck) {
    const d = checkDeck((s as { deck: unknown }).deck) as { title: string; summary?: string };
    script = { id: '', title: d.title, summary: d.summary || '', deck: d as unknown as Record<string, unknown> };
  } else if (!script?.title || !Array.isArray(script.steps) || !script.steps.every((st) => st && typeof st === 'object')) throw new Error(W.importNotDeck);
  const list = readMine(), id = newId();
  list.push({ ...script, id, builtin: undefined });
  if (!writeMine(list)) throw new Error(NO_ROOM);
  changed(); say(W.added(script.title));
  return id;
}
/** Pasted or chosen text: a script as JSON, a deck as JSON, or a deck file (.js) read as data. Throws an Error that says what was wrong. */
export function addText(text: string): string {
  let o: { title?: unknown; steps?: unknown; deck?: unknown } | null = null;
  try { o = JSON.parse(text); } catch { /* not JSON */ }
  if (o?.title && Array.isArray(o.steps)) return addToLibrary(o);
  if (o?.deck) return addToLibrary(o);
  return addToLibrary({ deck: parseDeckSource(text) });
}

/** A shared link (#script=…) adds its script to this device's library; returns its id, true when it could not be read, false when there is none. */
export function readScriptLink(): string | boolean {
  const m = location.hash.match(/#script=([\w-]+)/);
  if (!m) return false;
  let id: string | boolean = true;
  try { id = addToLibrary(dec(m[1])); } catch (e) { say((e as Error)?.message === NO_ROOM ? NO_ROOM : W.linkUnreadable, 'bad'); }
  history.replaceState(null, '', location.pathname + location.search);
  return id;
}

/** Opens a talk by id at a slide; says so when there is none. */
export function present(id: string, at = 0): boolean {
  if (!knownTalk(id)) { say(W.notFound, 'bad'); return false; }
  useShell.getState().close();
  return startTalk(id, at);
}
/** Print notes: the tab opens inside the tap (so it is not blocked) and the talk is read into it, when it is one read on opening. */
export const notes = (id: string): void => { if (!knownTalk(id)) { say(W.notFound, 'bad'); return; } void openHandout(loadDeck(id)).catch(() => say(W.notFound, 'bad')); };
export const presenterView = (id: string, at = 0): void => { const ok = openPresenterView(); if (!ok) say(W.noNotesWindow, 'bad'); present(id, at); };
