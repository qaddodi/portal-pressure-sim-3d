// The page's keys, as one pure decision: a key event and what is open in, an action (or nothing) out. A port of the 2D app's keyboard.js rules
// (createKeyboard), so the same keys do the same things: Esc closes one thing, a talk owns its keys, a text field keeps its own, a held key is one press,
// Ctrl or Cmd with + − 0 stays the browser's page zoom, and Settings › Keyboard shortcuts off leaves only Esc and Ctrl or Cmd with a key.
// Nothing here touches the page: src/ui/keys/useKeys.ts reads the event and carries the action out.

/** The part of a keydown the rules read (a real KeyboardEvent fits). */
export interface KeyEv {
  key: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; repeat?: boolean; isComposing?: boolean; keyCode?: number;
  /** AltGr (reported as Ctrl+Alt on Windows): makes characters, not shortcuts */
  altGraph?: boolean;
}
/** What has the key: a text field or select keeps all of them; a slider or switch keeps the arrows, Space and Enter; a button keeps Space and Enter. */
export type Target = 'page' | 'text' | 'range' | 'switch' | 'button' | 'figure';
export interface KeyCtx {
  target: Target;
  /** the search is open */
  searchOpen: boolean;
  /** a sheet or menu is open (Settings, Help, the main menu): letters are not the page's then */
  sheetOpen: boolean;
  /** a talk is on: it owns the keys except / and ? */
  talk: boolean;
  /** Settings › Keyboard shortcuts */
  keysOn: boolean;
  /** the sinusoid view is up (A, L and Zoom in do not apply there, as in the 2D app) */
  inSinusoid?: boolean;
  /** a card is open (the number keys run its verbs) */
  cardOpen?: boolean;
}

export type KeyAction =
  | { type: 'search-toggle' } | { type: 'search-open' } | { type: 'close' }
  | { type: 'undo' } | { type: 'redo' }
  | { type: 'play-pause'; prevent: boolean } | { type: 'step' } | { type: 'speed'; dir: 1 | -1 }
  | { type: 'zoom'; dir: 'in' | 'out' | 'fit' } | { type: 'view-toggle' }
  | { type: 'lens'; dir: 1 | -1 } | { type: 'settle' } | { type: 'help' } | { type: 'tests' } | { type: 'treat' } | { type: 'compare' } | { type: 'dye' }
  | { type: 'card-verb'; n: number }
  | { type: 'ignore'; prevent?: boolean };

/** The letter a key stands for: its character where that is a Latin letter, else its place on the board (an Arabic or Russian layout has no A, L or Z to name,
 *  but the key in that place is the same one). Only a letter of another script falls back to its place. */
export const letterOf = (e: Pick<KeyEv, 'key' | 'code'>): string =>
  /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : /^\p{L}$/u.test(e.key || '') && /^Key[A-Z]$/.test(e.code || '') ? (e.code as string)[3].toLowerCase() : (e.key || '').toLowerCase();

const ARROWS = /^(Arrow(Left|Right|Up|Down)|Home|End|Page(Up|Down))$/;
const ARROWS_SPACE_ENTER = /^(Arrow(Left|Right|Up|Down)| |Enter)$/;

/** What a key press does. `null` means it is not the page's (the browser or the focused control keeps it). */
export function decideKey(e: KeyEv, c: KeyCtx): KeyAction | null {
  if (e.isComposing || e.keyCode === 229) return null;            // an input method is composing: its Enter and Esc are its own
  const mod = !!(e.ctrlKey || e.metaKey);
  const lower = (e.key || '').toLowerCase();
  if (mod && lower === 'k') return { type: 'search-toggle' };
  if (c.target === 'text') return null;                           // a field keeps its keys (Esc is handled by the field itself)
  // A slider or a switch left with focus keeps the keys it uses; the rest (Cmd Z, Space, the letters) are the page's.
  if (c.target === 'range' && ARROWS.test(e.key)) return null;
  if (c.target === 'switch' && ARROWS_SPACE_ENTER.test(e.key)) return null;
  if (c.searchOpen) return e.key === 'Escape' ? { type: 'close' } : null;   // no letter reaches the figure behind the search
  if (e.key === 'Escape') return { type: 'close' };               // one Esc closes one thing; the shell says which
  if (c.sheetOpen) return null;
  if (c.talk && e.key !== '/' && e.key !== '?') return null;      // a talk owns the keyboard
  if (!c.keysOn && !mod) return null;                             // Settings › Keyboard shortcuts off: only Esc and Ctrl or Cmd with a key
  if (e.key === '/') return { type: 'search-open' };
  if (mod && lower === 'z') return { type: e.shiftKey ? 'redo' : 'undo' };
  // A held key is one press (Space does not flicker play and pause, a number does not run its verb twenty times); J has its own rule.
  const spaceIsOurs = e.key === ' ' && !e.altKey && c.target !== 'button' && c.target !== 'figure';
  if (e.repeat && !mod && letterOf(e) !== 'j') return spaceIsOurs ? { type: 'ignore', prevent: true } : null;
  // [ and ] need Option on a German, French or Spanish layout; AltGr makes other characters, which are not the letter's key.
  const bracket = e.key === '[' || e.key === ']';
  if (e.altGraph ? !bracket : mod || (e.altKey && !bracket)) return null;
  if (spaceIsOurs) return { type: 'play-pause', prevent: true };
  if (/^[1-9]$/.test(e.key) && c.cardOpen) return { type: 'card-verb', n: Number(e.key) };
  if (e.key === '.') return { type: 'step' };
  if (e.key === '+' || e.key === '=') return c.inSinusoid ? null : { type: 'zoom', dir: 'in' };
  if (e.key === '-' || e.key === '_') return { type: 'zoom', dir: 'out' };
  if (e.key === '0') return { type: 'zoom', dir: 'fit' };
  if (bracket) return { type: 'speed', dir: e.key === ']' ? 1 : -1 };
  const k = letterOf(e);
  if (k === 'a' && !e.shiftKey) return c.inSinusoid ? null : { type: 'view-toggle' };
  if (k === 'l') return { type: 'lens', dir: e.shiftKey ? -1 : 1 };
  if (e.key === 'C' && e.shiftKey) return { type: 'lens', dir: 1 };   // (2D keyboard.js: Shift C is the lens key too)
  if (k === 'z') return { type: 'settle' };
  if (e.key === '?') return { type: 'help' };
  if (k === 'i') return { type: 'tests' };
  if (k === 't') return { type: 'treat' };
  if (k === 'p') return { type: 'compare' };
  if (k === 'j') return e.repeat ? null : { type: 'dye' };
  return null;
}

/** The speed ladder: the real-time speeds, then the time-lapse rates, one list ([ and ] step along it). */
export function stepSpeed(speeds: readonly number[], lapses: readonly number[], cur: { speed: number; lapse: number }, dir: 1 | -1): { value: number; lapse: boolean } {
  const ladder = [...speeds.map((v) => ({ value: v, lapse: false })), ...lapses.map((v) => ({ value: v, lapse: true }))];
  const at = cur.lapse ? ladder.findIndex((x) => x.lapse && x.value === cur.lapse) : ladder.findIndex((x) => !x.lapse && x.value === cur.speed);
  return ladder[Math.max(0, Math.min(ladder.length - 1, (at < 0 ? 2 : at) + dir))];
}
