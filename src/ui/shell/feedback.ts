// Send feedback: a draft in the viewer's own email app, as the 2D app makes it (main.js sendFeedback): the ask, then the details a bug report needs (build, device,
// screen, a link back to this exact view). The app sends nothing itself. The address comes from the build (VITE_FEEDBACK_EMAIL), never from the source: the row is
// there only when the build has one, as in the 2D app.
import { FEEDBACK } from './words.ts';

export interface FeedbackCtx { build: string; device: string; screen: string; view: string }
export function feedbackHref(email: string, c: FeedbackCtx): string {
  const body = [FEEDBACK.ask, '', '', '', FEEDBACK.keep, `Build: ${c.build}`, `Device: ${c.device}`, `Screen: ${c.screen}`, `View: ${c.view}`].join('\n');
  return `mailto:${email}?subject=${encodeURIComponent(FEEDBACK.subject)}&body=${encodeURIComponent(body)}`;
}
export const feedbackEmail = (): string => String(import.meta.env.VITE_FEEDBACK_EMAIL ?? '');
