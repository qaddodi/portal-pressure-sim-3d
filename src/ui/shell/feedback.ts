// Send feedback: a draft in the viewer's own email app, as the 2D app makes it (main.js sendFeedback): the ask, then the details a bug report needs (build, device,
// screen, a link back to this exact view) and a short report of what the app's own self-checks found on the screen. The app sends nothing itself. The address comes from the
// build (VITE_FEEDBACK_EMAIL), never from the source: the row is there only when the build has one, as in the 2D app.
import { FEEDBACK } from './words.ts';
import { fitMailto } from '../debug/core/short.copied.js';

export interface FeedbackCtx { build: string; device: string; screen: string; view: string }
/** The base of the draft: what it always had. */
export const feedbackBase = (c: FeedbackCtx): string => [FEEDBACK.ask, '', '', '', FEEDBACK.keep, `Build: ${c.build}`, `Device: ${c.device}`, `Screen: ${c.screen}`, `View: ${c.view}`].join('\n');
/** The mailto link. `short` is the short report (src/ui/debug/packet/feedback.ts), cut first when the whole link would be too long for a mail app (6,000 percent-encoded characters). */
export function feedbackHref(email: string, c: FeedbackCtx, short = ''): string {
  const body = fitMailto(feedbackBase(c), short);
  return `mailto:${email}?subject=${encodeURIComponent(FEEDBACK.subject)}&body=${encodeURIComponent(body)}`;
}
export const feedbackEmail = (): string => String(import.meta.env?.VITE_FEEDBACK_EMAIL ?? '');
/** Wait for the Settings sheet to leave (its fade), then at most this long for the screen read, so the draft is never held up (2D: FEEDBACK_SHEET_MS, FEEDBACK_READ_MS). */
export const FEEDBACK_SHEET_MS = 380, FEEDBACK_READ_MS = 2500;
