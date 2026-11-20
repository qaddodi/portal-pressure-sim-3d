// The weld planner's worker (weld-client.ts): the network in, the plan out.
import { planWelds } from './welds.ts';
import type { WeldRequest } from './weld-client.ts';

self.onmessage = (e: MessageEvent<WeldRequest>) => {
  (self as unknown as { postMessage(m: unknown): void }).postMessage(planWelds(e.data.courses, { avoid: e.data.avoid }));
};
