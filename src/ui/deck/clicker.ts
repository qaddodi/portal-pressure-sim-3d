// The clicker's keys, one pure decision (the 2D presenter's onKey): a clicker sends arrows, Page Up and Down, Enter, Space, B or . and F5. A number then Enter jumps to that slide; G opens the
// slide list; B, . or W blacks the screen; F is full screen; P the presenter view; L the laser; Esc puts the black screen away, then the list, then ends the talk.
// A control the keyboard reached with Tab keeps its own Enter and Space (a clicker's Space after a mouse click is still the talk's).

export const DIGIT_MS = 2500;
export const DIGITS_MAX = 3;

export type ClickAct =
  | { type: 'digit'; digit: string }
  | { type: 'go'; stop: number }
  | { type: 'move'; to: 'next' | 'back' | 'first' | 'last' }
  | { type: 'swap' }
  | { type: 'black' } | { type: 'full' } | { type: 'jump' } | { type: 'laser' } | { type: 'presenter' }
  | { type: 'escape' }
  | { type: 'swallow' };

export interface ClickCtx {
  /** what is typed of a slide number */
  digits: string;
  /** the slide list is open (it has its own keys) */
  jumpOpen: boolean;
  /** the wallet is on (a screen too short for both cards): Up and Down change the card */
  wallet: boolean;
  /** the focused control uses Enter and Space itself (reached by Tab) */
  controlOwnsEnter: boolean;
  /** the focused control uses the arrows (a field, a slider, a menu) */
  controlOwnsArrows: boolean;
  /** a field has the key */
  inField: boolean;
  /** the number of stops, for End */
  stops: number;
}

export interface ClickEv { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; repeat?: boolean; shiftKey?: boolean; isComposing?: boolean }

/** What a key does in a talk, or null when it is not the talk's. */
export function clickerKey(e: ClickEv, c: ClickCtx): ClickAct | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return null;
  const k = e.key, lk = k.length === 1 ? k.toLowerCase() : k;
  if (c.jumpOpen) {
    if (k === 'Escape' || lk === 'g') return { type: 'jump' };
    return null;   // (Up and Down move the list's focus, Enter and Space press a title, Tab moves as usual: the list's own keys)
  }
  if (c.inField) return null;
  if (c.controlOwnsEnter && (k === 'Enter' || k === ' ') && !(k === 'Enter' && c.digits)) return null;
  if (/^[0-9]$/.test(k)) return { type: 'digit', digit: k };
  if (k === 'Enter' && c.digits) { const n = Number(c.digits); return n >= 1 ? { type: 'go', stop: n - 1 } : { type: 'swallow' }; }
  if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') return e.repeat ? { type: 'swallow' } : { type: 'move', to: 'next' };
  if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') return e.repeat ? { type: 'swallow' } : { type: 'move', to: 'back' };
  if (k === 'Home') return { type: 'move', to: 'first' };
  if (k === 'End') return { type: 'move', to: 'last' };
  if ((k === 'ArrowUp' || k === 'ArrowDown') && c.wallet && !c.controlOwnsArrows) return e.repeat ? { type: 'swallow' } : { type: 'swap' };
  if (lk === 'b' || k === '.' || lk === 'w') return { type: 'black' };
  if (lk === 'f') return { type: 'full' };
  if (lk === 'g') return { type: 'jump' };
  if (lk === 'l') return e.repeat ? { type: 'swallow' } : { type: 'laser' };
  if (lk === 'p') return { type: 'presenter' };
  if (lk === 'n' || lk === 's' || k === 'F5') return { type: 'swallow' };   // (the app's own N and S stay off while presenting; a clicker's "start show" never reloads the page)
  if (k === 'Escape') return { type: 'escape' };
  return null;
}

/** The digits typed so far with one more (the last three). */
export const addDigit = (digits: string, d: string): string => (digits + d).slice(-DIGITS_MAX);
