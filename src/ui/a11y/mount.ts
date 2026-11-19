// Accessibility beyond the keyboard, mounted once at boot (main.tsx): the page's live region, the figure's name and description, the slide announcements,
// the Reduce Motion styles. The keyboard walk of the figure's vessels is the labels' (scene/labels/VesselWalk.tsx); the rules the screen report holds all of
// this to are in debug/selfcheck/rules-a11y.ts.
import './a11y.css';
import './reduced.css';
import { mountDescription, mountSlideAnnouncer } from './describe.ts';

export function mountA11y(doc: Document = document): void {
  if (!doc.getElementById('live')) {
    const live = doc.createElement('div');
    live.id = 'live'; live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status');
    doc.body.append(live);
  }
  mountDescription(doc);
  mountSlideAnnouncer();
}
