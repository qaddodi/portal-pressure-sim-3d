// The one copyright line (owner, 26 Nov 2026: "keep the MD"). Its source is CREDIT in src/ui/shell/words.ts; everything else reads it from there:
// the corner credit and the cards' foot (Credit.tsx, CardFrame.tsx), the page's <meta name="copyright"> (index.html's __CREDIT__, filled by vite.config.ts),
// the About page (scripts/source-edits.mjs turns the 2D About's own line into RIGHTS) and the Hales flyer (art/hales-flyer/render.cjs). tests/credit-one-source.test.ts pins it.
import { CREDIT } from '../src/ui/shell/words.ts';

export { CREDIT };
/** The line with its rights sentence, as the About page and the flyer print it. */
export const RIGHTS = `${CREDIT}. All rights reserved.`;
/** The placeholder index.html carries where the line goes. */
export const CREDIT_TOKEN = '__CREDIT__';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
/** index.html with the line in place of its placeholder. */
export const withCredit = (html) => html.split(CREDIT_TOKEN).join(esc(CREDIT));
