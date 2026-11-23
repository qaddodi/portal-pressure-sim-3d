// The one primitive for something that comes and goes (Plan 39, finding 4): never `hidden={…}`, `style.display` or a removed node, which are a display swap in one frame.
// The node stays; its opacity eases over --d-small (fade.css), then it is `visibility: hidden`, and `inert` the moment it is asked off. Where its room must go too (a list row,
// a note, a button in a row of buttons) it is a grid and its one track eases between 1fr and 0fr; the content sits in `.fade-in`. tests/no-pop.test.ts keeps the rest of the app off the swap.
import { createElement, useMemo, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import './fade.css';

export type FadeAxis = 'x' | 'y';
export interface FadeAttrs { 'data-fade': 'on' | 'off'; 'data-fade-axis'?: FadeAxis; inert?: true }

/** The attributes of an element that is shown (`on`) or on its way out; spread them onto it. `axis` makes it give its room back too (then its content goes in `<span className="fade-in">`). */
export function fadeAttrs(on: boolean, axis?: FadeAxis): FadeAttrs {
  const a: FadeAttrs = { 'data-fade': on ? 'on' : 'off' };
  if (axis) a['data-fade-axis'] = axis;
  if (!on) a.inert = true;
  return a;
}
/** The same, memoised, for a component that owns one thing that comes and goes. */
export function useFadePresence(on: boolean, axis?: FadeAxis): FadeAttrs { return useMemo(() => fadeAttrs(on, axis), [on, axis]); }

interface FadeProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> { on: boolean; as?: ElementType; axis?: FadeAxis; children?: ReactNode; [attr: string]: unknown }
/** `<Fade on={x} as="p" axis="y" className="…">` is the element, with its content inside `.fade-in` when it gives its room back. */
export function Fade({ on, as = 'span', axis, children, ...rest }: FadeProps) {
  return createElement(as, { ...rest, ...fadeAttrs(on, axis) }, axis ? createElement('span', { className: 'fade-in' }, children) : children);
}
