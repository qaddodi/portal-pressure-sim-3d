// The motion recorder (the 2D app's watch/recorder.js): keeps the last seconds of camera, labels and cards as plain numbers in a ring, so the motion rules can judge
// what the eye saw (a card that blinked, a label that slid, a camera that stopped part way) and a bug packet can carry it. Pure and Node-testable: the page's numbers come in
// through `sources`, the clock and the DOM are the mount's business (watch/mount.ts).
import { exportHistory as exportHistoryJs } from '../core/history.copied.js';

// (the copied file is plain JS, whose defaults are typed narrowly)
interface HistoryOut { v: number; seconds: number; step: number; startedAt: number | null; vb: unknown; env: unknown; samples: Record<string, unknown>[]; events: RecEvent[]; traces: unknown[] }
const exportHistory = exportHistoryJs as unknown as (h: Record<string, unknown>, o?: { seconds?: number; maxBytes?: number }) => HistoryOut;
import { judgeMotion, type Sample, type MFinding } from './motion-rules.ts';

import { clock } from '../../../clock/frame.ts';
export interface Sources {
  /** the camera mark: [hand zoom, projected anchor x, y], or null when the camera is not placed */
  camera(): [number, number, number] | null;
  /** [name, x, y, w, h, alpha] per label */
  labels(): number[][] | (string | number)[][] | null;
  /** [id, x, y, w, h, alpha] per card, and per card 1 when it holds words */
  cards(): { K: (string | number)[][]; W: number[] } | null;
}
export interface RecEvent { k: string; t: number; [x: string]: unknown }
export interface Recorder {
  sample(t: number): void;
  event(k: string, extra?: Record<string, unknown>, t?: number): void;
  samples(): Sample[];
  events(): RecEvent[];
  /** The packed history the bug packet carries (history.copied.js), the last `seconds`. */
  exportHistory(seconds?: number): HistoryOut;
  /** The motion rules over what is held now. */
  findings(): MFinding[];
  clear(): void;
}

export const RING_SECONDS = 20, MAX_SAMPLES = 20 * 125;   // 20 s at up to 120 frames a second, with a little over

export function createRecorder(sources: Sources, opts: { seconds?: number; now?: () => number; vb?: unknown; env?: unknown } = {}): Recorder {
  const seconds = opts.seconds ?? RING_SECONDS;
  const ring: Sample[] = [], evs: RecEvent[] = [];
  const now = opts.now ?? (() => (typeof performance !== 'undefined' ? clock.now() : 0));
  const startedAt = now();
  const safe = <T>(f: () => T): T | null => { try { return f(); } catch { return null; } };   // a source that will not say is null, never a thrown frame

  function trim(t: number): void {
    const from = t - seconds * 1000;
    let i = 0;
    while (i < ring.length - 1 && ring[i]!.t < from) i++;
    if (i > 0) ring.splice(0, i);
    if (ring.length > MAX_SAMPLES) ring.splice(0, ring.length - MAX_SAMPLES);
    while (evs.length && evs[0]!.t < from) evs.shift();
  }

  return {
    sample(t) {
      const c = safe(() => sources.camera()), L = safe(() => sources.labels()), k = safe(() => sources.cards());
      ring.push({ t: Math.round(t), c: c ?? null, L: (L as number[][] | null) ?? null, K: k ? k.K : null, W: k ? k.W : null });
      trim(t);
    },
    event(kind, extra = {}, t = now()) { evs.push({ ...extra, k: kind, t: Math.round(t) }); },
    samples: () => ring.slice(),
    events: () => evs.slice(),
    exportHistory(s = 10) { return exportHistory({ samples: ring, events: evs, startedAt, vb: opts.vb ?? null, env: opts.env ?? null }, { seconds: s }); },
    findings() { return judgeMotion({ samples: ring, events: evs }); },
    clear() { ring.length = 0; evs.length = 0; },
  };
}
