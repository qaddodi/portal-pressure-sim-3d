// The copied 2D pages (about.copied.ts) as React elements, node for node, with 2D's class names and data attributes untouched.
import { createElement, type ReactNode } from 'react';
import type { Node } from './about.copied.ts';
import { feedbackEmail } from './feedback.ts';

const ATTR: Record<string, string> = { class: 'className' };

/** `clear` draws the node the app owns ({t: 'clear-row'}); a paragraph that names the feedback email is left out while no email is configured (the build keeps it out of the public repo). */
export function draw(n: Node | string, key: number | string = 0, clear?: () => ReactNode): ReactNode {
  if (typeof n === 'string') return n;
  if (n.t === 'clear-row') return createElement('span', { key }, clear?.());
  if (n.p?.needsEmail && !feedbackEmail()) return null;
  const props: Record<string, unknown> = { key };
  for (const [k, v] of Object.entries(n.p ?? {})) if (k !== 'needsEmail') props[ATTR[k] ?? k] = v;
  return createElement(n.t, props, ...(n.k ?? []).map((c, j) => draw(c, j, clear)));
}
