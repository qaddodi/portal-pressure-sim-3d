// The small questions the library asks (a name, "Delete this script?", a link to copy by hand, the import box). One dialog at a time, answered with a promise.
import { create } from 'zustand';

export type DeckDialog =
  | { kind: 'ask'; title: string; label: string; value: string; yes: string; done(v: string | null): void }
  | { kind: 'confirm'; title: string; body: string; yes: string; danger: boolean; done(v: boolean): void }
  | { kind: 'link'; url: string; done(): void }
  | { kind: 'import'; done(): void };

export const useDialogs = create<{ dialog: DeckDialog | null }>(() => ({ dialog: null }));
const show = (d: DeckDialog) => useDialogs.setState({ dialog: d });
export const closeDialog = () => useDialogs.setState({ dialog: null });

/** A name, asked in a dialog: the text (never empty), or null when cancelled. */
export const askText = (o: { title: string; label: string; value?: string; yes?: string }): Promise<string | null> =>
  new Promise((res) => show({ kind: 'ask', title: o.title, label: o.label, value: o.value ?? '', yes: o.yes ?? 'Save', done: (v) => { closeDialog(); res(v && v.trim() ? v.trim() : null); } }));
export const confirmDialog = (o: { title: string; body: string; yes?: string; danger?: boolean }): Promise<boolean> =>
  new Promise((res) => show({ kind: 'confirm', title: o.title, body: o.body, yes: o.yes ?? 'OK', danger: !!o.danger, done: (v) => { closeDialog(); res(v); } }));
/** Where the clipboard is not allowed, the link is shown, selected, to copy by hand. */
export const showLink = (url: string): void => show({ kind: 'link', url, done: closeDialog });
export const openImport = (): void => show({ kind: 'import', done: closeDialog });
