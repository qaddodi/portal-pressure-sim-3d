// What Send feedback adds on any copy, the live site included (the 2D app's packet/feedback.js; bible review 19 Nov 2026, 7.5): the screen's self-checks as a short text for the
// email, and the whole packet to copy. Loaded by the Settings row only when Send feedback is tapped (a lazy chunk; the live site never loads it otherwise). Reads the screen once,
// on that tap; nothing is sent by the app.
import { packetNow, stateNow, buildInfo } from './sources.ts';
import { thisVersion } from '../../../boot/release.ts';
import { stateLink, baseOf } from './state.ts';
import { packetText } from '../core/packet.copied.js';
import { shortReport } from '../core/short.copied.js';

export interface Feedback { short: string; full: string; findings: number; /** the address that puts the app back where it is now (patient, talk and slide, look, camera, sliders) */ link: string; /** the preview pill's text and the release, as the 2D draft names the build */ build: string }

/** { short, full } for the screen as it is now: the short text for the draft and the full packet text to copy. Never throws (null when the screen cannot be read). */
export async function readFeedback(): Promise<Feedback | null> {
  try {
    const p = await packetNow();
    const b = buildInfo();
    return { short: shortReport(p), full: packetText(p), findings: (p.findings as unknown[]).length, link: stateLink(stateNow(), baseOf(location)), build: `${thisVersion() ? `v${thisVersion()} · ` : ''}${b.badge} · ${b.release}` };
  } catch { return null; }
}
