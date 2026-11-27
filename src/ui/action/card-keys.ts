// What the open action card hands the keyboard: its first nine controls (keys 1 to 9) and its Remove (Delete, Backspace). The card writes it (ActionCard.tsx), the keys read it
// (keys/useKeys.ts). Its own small module so the keys, which load with the first picture, do not pull the whole card (and its sheet, glide and panel code) into the boot entry
// (tests/boot-entry.test.ts budget): the card loads with the sheets, when it is first needed.
const live: { shown: boolean; keyed: (() => void)[]; remove: (() => void) | null } = { shown: false, keyed: [], remove: null };

/** The card's side: shown or not, its keyed controls, its Remove. */
export const cardKeys = {
  setShown(on: boolean): void { live.shown = on; if (!on) { live.keyed = []; live.remove = null; } },
  setKeyed(list: (() => void)[]): void { live.keyed = list; },
  setRemove(fn: (() => void) | null): void { live.remove = fn; },
};

/** Key n (1 to 9) on the open card: true when it did something. */
export function triggerCardVerb(n: number): boolean { const a = live.shown ? live.keyed[n - 1] : undefined; if (!a) return false; a(); return true; }
/** Delete or Backspace on the open card: its Remove button's own work (a shunt or a device comes down, the card eases out, Cmd Z brings it back). */
export const removeFromCard = Object.assign((): boolean => { const r = live.shown ? live.remove : null; if (!r) return false; r(); return true; }, { available: (): boolean => live.shown && live.remove != null });
/** Whether a card is up (the number keys mean something then). */
export const cardIsOpen = (): boolean => live.shown;
