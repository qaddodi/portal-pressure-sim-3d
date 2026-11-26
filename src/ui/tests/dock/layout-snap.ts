// Layout reads for the copied 2D modules (layout-snap.js): the one door every read goes through, so a count could be kept here. Reads happen at rest (a choice changed, a resize), never in a frame.
export const readBox = (el: Element | null | undefined): DOMRect => (el as Element).getBoundingClientRect();
export const readStyle = (el: Element, pseudo?: string): CSSStyleDeclaration => (pseudo ? getComputedStyle(el, pseudo) : getComputedStyle(el));
export const readMetric = (el: Element | null | undefined, k: string): number => (el == null ? 0 : ((el as unknown as Record<string, number>)[k] as number));
export const readAnims = (el: Element): Animation[] => el.getAnimations?.() ?? [];
