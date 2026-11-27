// A focus ring belongs to the keyboard (owner, 27 Nov: "why randomly when I open menus I see the blue outline on input text or buttons?").
// One app-wide modality, `html[data-kbd]`: present only while the last thing that reached the page was a navigating key; a press, a tap or a click takes it off.
// ui/shell/focus-ring.css draws no ring while it is off, so a menu that opens from a tap or a click and moves focus into itself (a Search field, a close button) wears none, however
// the browser's own :focus-visible guess falls. (A text field always matches :focus-visible in a browser, whatever put the caret there, and a key pressed before the tap leaves the
// browser's own "keyboard" guess on for programmatic focus: both were the ring the owner saw.) With it on, one ring per control (focus-ring.css).
//
// Coming back to the app never draws a focus ring the keyboard did not ask for.
// Root cause (24 Nov, Mac desktop): leaving the window (Cmd+Tab, another tab, another app) keeps `document.activeElement`, and Chrome and Safari give focus back to it
// when the window is active again. That restored focus is not a pointer's, so `:focus-visible` matches it: the patient pill (#btnMenu), clicked with the mouse an hour
// before, came back wearing a blue ring, and the menu's Search field with it. Nothing the person did asked for it.
// The rule: a ring belongs to the keyboard. This file remembers what last reached the page (a pointer or a key) and, when the window is left or comes back with a pointer
// as the last thing, the control that held focus gives it up (a button, a switch, a row, a slider: no ring can come back). A text field keeps its caret, so typing carries on,
// but `html[data-returned]` hides its ring (global.css) until the next press or key. If the keyboard was last (a real Tab walk), nothing changes: the ring stays where it was.
export type Modality = 'pointer' | 'keyboard';

type El = { localName?: string; type?: string; isContentEditable?: boolean; tabIndex?: number; getAttribute?(n: string): string | null; blur?(): void };

const TEXT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'time', 'datetime-local', 'month', 'week']);
/** A field the keyboard types into: it keeps its focus (and caret) when the window is left. */
export function isTextEntry(el: El | null | undefined): boolean {
  if (!el) return false;
  const t = el.localName;
  return t === 'textarea' || t === 'select' || el.isContentEditable === true || (t === 'input' && TEXT_TYPES.has((el.type || 'text').toLowerCase()));
}

/** A control whose focus draws a ring: not the page, not a text field, and not a container that holds focus only so keys reach it (tabindex -1: the talk's root, the figure). */
export function drawsRing(el: El | null | undefined): boolean {
  if (!el || el.localName === 'body' || el.localName === 'html' || isTextEntry(el)) return false;
  const native = el.localName === 'button' || el.localName === 'a' || el.localName === 'input' || el.localName === 'summary';
  return native || (el.getAttribute?.('tabindex') ?? null) !== '-1';
}

/** What the window does with the focused control when it is left or comes back: `blur` (let it go), `hide` (a text field: keep it, hide its ring) or `keep`. */
export function returnPlan(by: Modality, active: El | null | undefined): 'keep' | 'blur' | 'hide' {
  if (by === 'keyboard' || !active || active.localName === 'body') return 'keep';
  return isTextEntry(active) ? 'hide' : drawsRing(active) ? 'blur' : 'keep';
}

type Target = { addEventListener(t: string, f: (e: any) => void, o?: unknown): void; removeEventListener(t: string, f: (e: any) => void, o?: unknown): void };
export type ReturnDoc = Target & { activeElement: El | null; hidden?: boolean; documentElement: { toggleAttribute(n: string, force?: boolean): boolean } };

const MODIFIERS = /^(Shift|Control|Alt|Meta|CapsLock|Fn|OS)$/;
/** The only keys that count as keyboard navigation while typing in a text field: typing, deleting, the caret's moves and Enter are the field's own, not a walk over the controls. */
const FIELD_NAV = /^(Tab|ArrowUp|ArrowDown|PageUp|PageDown)$/;
/** Does this key press show rings? Any key but a modifier, except the keys a person types into a text field with. */
export function keyIsNavigation(key: string | undefined, target: El | null | undefined): boolean {
  const k = key ?? '';
  if (MODIFIERS.test(k)) return false;
  return isTextEntry(target) ? FIELD_NAV.test(k) : true;
}

/** Wire it once (main.tsx). The window is `win` (blur, focus, pagehide), the page `doc`. Returns the way to take it down. */
export function installReturnFocus(doc: ReturnDoc = document, win: Target = window): () => void {
  let by: Modality = 'pointer';   // what last reached the page: a page nobody has pressed a key on has no keyboard ring to keep
  const settle = () => {
    const plan = returnPlan(by, doc.activeElement);
    if (plan === 'blur') doc.activeElement?.blur?.();
    doc.documentElement.toggleAttribute('data-returned', plan === 'hide' || plan === 'blur');
  };
  const input = (m: Modality) => () => { by = m; doc.documentElement.toggleAttribute('data-returned', false); doc.documentElement.toggleAttribute('data-kbd', m === 'keyboard'); };
  const key = (e: { key?: string; target?: El | null }) => { if (keyIsNavigation(e.key, e.target ?? doc.activeElement)) input('keyboard')(); };
  const away = () => settle();
  const back = () => { if (!doc.hidden) settle(); };
  // (the window's own blur and focus are listened for without capture: in the capture phase they would be every control's)
  const on: [Target, string, (e: any) => void, boolean][] = [
    [doc, 'pointerdown', input('pointer'), true], [doc, 'keydown', key, true],
    [win, 'blur', away, false], [win, 'pagehide', away, false], [win, 'focus', back, false], [doc, 'visibilitychange', () => { if (doc.hidden) away(); else back(); }, false],
  ];
  for (const [t, n, f, c] of on) t.addEventListener(n, f, c);
  return () => { for (const [t, n, f, c] of on) t.removeEventListener(n, f, c); };
}
