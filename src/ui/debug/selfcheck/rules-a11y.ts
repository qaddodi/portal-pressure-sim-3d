// Accessibility rules (docs/accessibility.md): the figure is named and described, the live region is there, the page says its language, every control has a name, and a
// colour that means something always has a second cue (words or a number, or a name a screen reader hears).
import { registerRule } from '../core/rules.copied.js';

registerRule({ id: 'a11y-figure-named', family: 'a11y', owner: 'src/ui/a11y/describe.ts', why: 'The figure has an accessible name and a live one-line description of the patient (WCAG 1.1.1; docs/accessibility.md)',
  check: (r: Record<string, any>) => {
    const a = r.a11y;
    if (!a) return [];
    const out: { what: string; where: string }[] = [];
    if (!a.figureName) out.push({ what: 'The figure has no accessible name', where: 'the stage canvas' });
    else if (!a.figureDescription && r.figure?.status === 'ready') out.push({ what: 'The figure has no description of the patient yet', where: 'the stage canvas, aria-description' });
    return out;
  } });

registerRule({ id: 'a11y-live-region', family: 'a11y', owner: 'src/ui/a11y/mount.ts', why: 'Announcements (a patient loaded, a slide changed) go through one polite live region, #live',
  check: (r: Record<string, any>) => (r.a11y && !r.a11y.live ? [{ what: 'The page has no live region', where: '#live is missing' }] : []) });

registerRule({ id: 'a11y-lang', family: 'a11y', owner: 'index.html', why: 'The document declares its language (WCAG 3.1.1)',
  check: (r: Record<string, any>) => (r.a11y && !r.a11y.lang ? [{ what: 'The document has no lang', where: '<html lang>' }] : []) });

registerRule({ id: 'a11y-control-name', family: 'a11y', owner: 'src/ui/shell/TopBar.tsx', why: 'Every control has a name: an icon-only button carries an aria-label (WCAG 4.1.2)',
  check: (r: Record<string, any>) => (r.a11y?.unnamed ?? []).map((u: string) => ({ what: `Control ${u} has no name`, where: 'no text, aria-label or title' })) });

registerRule({ id: 'a11y-colour-cue', family: 'a11y', owner: 'src/ui/debug/screen/raw.ts', why: 'Colour is never the only cue: every value shown by colour also has a number, an arrow, a dash pattern or a word (WCAG 1.4.1; docs/accessibility.md)',
  check: (r: Record<string, any>) => (r.a11y?.cues?.bare ?? []).map((c: { el: string; tone: string }) => ({ what: `${c.el} is coloured "${c.tone}" with no words behind it`, where: 'give it its number or word, or an aria-label naming the state' })) });
