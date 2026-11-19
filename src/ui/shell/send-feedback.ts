// Settings > Send feedback (the 2D app's sendFeedback): the draft in the viewer's own mail app, with the details a bug report needs, a link back to this exact view (camera and
// sliders too) and a short report of what the app's own self-checks found on the screen; then a toast that offers the whole report to copy. Read once, after the Settings sheet has
// left, never for longer than FEEDBACK_READ_MS so the draft is not held up. The app sends nothing: the person sends the email, so the Privacy page stays true.
import { feedbackHref, FEEDBACK_SHEET_MS, FEEDBACK_READ_MS } from './feedback.ts';
import { useShell } from './store.ts';

export async function sendFeedback(email: string): Promise<void> {
  const plain = { build: `PREVIEW · ${String(import.meta.env.VITE_BUILD ?? 'local').split('@').pop()}`, device: navigator.userAgent, screen: `${innerWidth} × ${innerHeight} at ${devicePixelRatio}×`, view: location.href };
  let fb: { short: string; full: string; link: string; build: string } | null = null;
  try {
    await new Promise((ok) => setTimeout(ok, FEEDBACK_SHEET_MS));
    fb = await Promise.race([import('../debug/packet/feedback.ts').then((m) => m.readFeedback()), new Promise<null>((ok) => setTimeout(() => ok(null), FEEDBACK_READ_MS))]);
  } catch (e) { console.warn('[feedback] the screen could not be read; the draft goes without it', e); }
  location.href = feedbackHref(email, fb ? { ...plain, build: fb.build, view: fb.link } : plain, fb?.short ?? '');
  const full = fb?.full;
  if (full) {
    useShell.getState().say('Your email app has the short report.', 'info', { label: 'Copy the full report', run: () => { navigator.clipboard?.writeText(full).then(() => useShell.getState().say('Full report copied: paste it under your message.'), () => useShell.getState().say('Could not copy it from here.', 'bad')); } });
  }
}
