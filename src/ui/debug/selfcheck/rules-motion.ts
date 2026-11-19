// The motion rules as registry rules (kind 'series'): each judges the recorder's last seconds. A runner asks for them by family 'motion'.
import { registerRule } from '../core/rules.copied.js';
import { MOTION_RULES, type History } from '../watch/motion-rules.ts';

/** A history as the rules read it: the recorder's packed export, or the plain object (samples, events). */
export function historyOf(input: unknown, ctx: { report?: unknown } = {}): History | null {
  const h = (Array.isArray(input) ? { samples: input as History['samples'], events: (input as unknown as { events?: History['events'] }).events ?? [] } : input) as History | null;
  if (!h?.samples?.length) return null;
  void ctx;
  return h;
}

for (const r of MOTION_RULES) {
  registerRule({ id: r.id, family: 'motion', kind: 'series', owner: r.owner, why: r.why, check: (input: unknown, ctx: { report?: unknown }) => { const h = historyOf(input, ctx); return h ? r.judge(h).map((f) => ({ what: f.what, where: f.where, at: f.at, scope: 'motion' })) : []; } });
}
