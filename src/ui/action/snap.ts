// What a card prints now, as one small plain object: the readings, the status word, the span bar, and each verb's state. A card re-renders only when this changes (a number
// that moves by a tenth, a switch, a word), never for a frame that changes nothing it prints. Pure of React.
import { cardFor, shuntable, type Card, type Verb } from './cards.ts';
import type { Env, Reading, Status } from './read.ts';

export interface VerbSnap { show: boolean; text?: string; lines?: readonly string[]; share?: number; num?: number; on?: boolean; pick?: string | number; note?: string | null }
export interface Snap { value: Reading | null; status: Status; span: { a: number; b: number; d: number; ok: boolean } | null; verbs: VerbSnap[] }

const r1 = (x: number) => Math.round(x * 10) / 10;
function verbSnap(card: Card, v: Verb, env: Env): VerbSnap {
  const show = (v.showIf ? v.showIf(env) : true) && !(v.type === 'button' && v.id === 'shunt' && !(card.edge && shuntable(card.edge)));
  switch (v.type) {
    case 'read': case 'stat': return { show, text: v.value(env) };
    case 'about': return { show, lines: v.text(env) };
    case 'meter': return { show, share: Math.round(v.share(env) * 100) / 100 };
    case 'slider': { const x = v.get(env.p); return { show, num: x, text: v.format(x) }; }
    case 'toggle': return { show, on: v.get(env.p) };
    case 'seg': return { show, pick: v.get(env.p) };
    case 'button': return { show, note: v.note ? v.note(env) : null };
    default: return { show };
  }
}

/** The card's printed state for an env, with numbers rounded to what they print (so an equal print is an equal snap). */
export function snapOf(card: Card, env: Env): Snap {
  const v = card.value(env);
  const span = card.span ? card.span.at(env) : null;
  return {
    value: v && { v: v.v, u: v.u, d: v.d ?? null, up: !!v.up },
    status: card.status ? card.status(env) : null,
    span: span && { a: r1(span.a), b: r1(span.b), d: r1(span.d), ok: span.ok && env.lens !== 'neutral' },
    verbs: card.verbs.map((x) => verbSnap(card, x, env)),
  };
}
export const sameSnap = (a: Snap, b: Snap): boolean => JSON.stringify(a) === JSON.stringify(b);
export { cardFor };
