// Speaker notes as a printed handout, as the 2D app's handout.js lays it out: the title, objectives and outline up front, then one block per slide (its kicker, title,
// the line with the numbers the model gives at that slide, the equation, the notes and the question for the room), and the quick check's questions with their answers.
// Black on white in any look; opened as its own page to print or keep on a phone. (The 3D figure is not printed: a slide is its words.)
import type { Deck, Slide } from '../../decks/schema.ts';
import { parseLine, fmtPressure, type Piece } from '../text/line.ts';
import { outlineOf, OBJECTIVES_HEAD, OUTLINE_HEAD } from '../../decks/outline.ts';
import { CHECK_TITLE } from '../../decks/check.ts';
import { slideFps, type Fp } from '../talk/slide-states.ts';
import { download } from './download.ts';

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
export const slug = (t: string) => t.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

/** A slide's line as plain text with the model's numbers in it ("the HVPG is 11.6 mmHg"); a number not known prints as a dash (a printed line has no "still to come"). */
export function lineText(line: string, fp: Fp | null = null): string {
  return parseLine(line).map((p: Piece) => {
    switch (p.t) {
      case 'value': { const v = fp?.[p.key]; return v == null || !Number.isFinite(v) ? '—' : `${fmtPressure(v, p.decimals)} mmHg`; }
      case 'term': return p.label;
      case 'step': return String(p.n);
      default: return p.text;
    }
  }).join('');
}

const CSS = `
:root { color-scheme: light; --ink: #111; --ink-2: #333; --ink-3: #666; --rule: #ccc; --paper: #fff; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 16px 48px; background: var(--paper); color: var(--ink); font: 14px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-text-size-adjust: 100%; }
main { max-width: 860px; margin: 0 auto; }
h1, h2 { font-family: 'Source Serif 4', 'Iowan Old Style', Georgia, serif; }
.cap { margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
header { padding-bottom: 16px; border-bottom: 2px solid var(--ink); }
.top { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 12px 24px; }
h1 { margin: 0; font-size: 30px; font-weight: 600; line-height: 1.12; }
.meta { margin: 6px 0 0; color: var(--ink-3); font-size: 13px; }
.sum { margin: 12px 0 0; color: var(--ink-2); max-width: 75ch; }
.plan { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px 40px; margin-top: 18px; }
.plan :is(ol, ul) { margin: 0; padding-left: 1.3em; }
button { font: 600 13px/1 Inter, system-ui, sans-serif; padding: 9px 16px; border-radius: 999px; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); cursor: pointer; }
article { padding: 22px 0; border-bottom: 1px solid var(--rule); break-inside: avoid; page-break-inside: avoid; }
.n { font-variant-numeric: tabular-nums; }
h2 { margin: 0; font-size: 19px; font-weight: 600; line-height: 1.25; }
.line { margin: 6px 0 0; color: var(--ink-2); }
.eq { margin: 10px 0 0; font: 17px/1.4 'STIX Two Math', 'Cambria Math', 'Latin Modern Math', serif; }
.notes { margin-top: 12px; } .notes p { margin: 0; }
.ask { margin-top: 12px; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 6px; } .ask p { margin: 0; } .ask .a { margin-top: 4px; color: var(--ink-2); } .ask .a b { color: var(--ink); }
.checks { margin: 12px 0 0; padding-left: 1.4em; } .checks li { margin-top: 6px; } .checks p { margin: 0; } .checks .a { margin-top: 2px; color: var(--ink-2); }
@media screen and (pointer: coarse) { button { min-height: 44px; } }
@media print { @page { size: A4; margin: 14mm 12mm; } body { padding: 0; font-size: 9.5pt; } main { max-width: none; } button { display: none; } h1 { font-size: 22pt; } h2 { font-size: 13pt; } article { padding: 12px 0; } }`;

function slideBlock(s: Slide, i: number, fp: Fp | null): string {
  const eq = s.eq?.map((p) => p.text).join(' ');
  const [q, a] = s.ask ?? [];
  return `<article>
  <p class="cap"><span class="n">${i + 1}</span>${s.kicker ? ` · ${esc(s.kicker)}` : ''}</p>
  ${s.vignette ? `<div class="notes"><p class="cap">Case</p><p>${esc(s.vignette)}</p></div>` : ''}
  <h2>${esc(s.title || 'Slide')}</h2>
  ${s.line ? `<p class="line">${esc(lineText(s.line, fp))}</p>` : ''}
  ${eq ? `<p class="eq">${esc(eq)}</p>` : ''}
  ${s.notes ? `<div class="notes"><p class="cap">Notes</p><p>${esc(s.notes)}</p></div>` : ''}
  ${q ? `<div class="ask"><p class="cap">Discussion question</p><p>${esc(q)}</p>${a ? `<p class="a"><b>Answer:</b> ${esc(a)}</p>` : ''}</div>` : ''}
</article>`;
}

/** The handout for a deck as a standalone HTML document; fps: the numbers at each slide (what the model reads there), for the values in the words. */
export function handoutHTML(d: Deck, fps: Fp[] = []): string {
  const meta = [d.mine ? 'Your script' : d.level, `${d.slides.length} slides`, d.minutes ? `about ${d.minutes} min` : ''].filter(Boolean).join(' · ');
  const outline = outlineOf(d);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Notes: ${esc(d.title)}</title><style>${CSS}</style></head><body><main>
<header><div class="top"><div><p class="cap">Speaker notes</p><h1>${esc(d.title)}</h1><p class="meta">${esc(meta)}</p></div>
<button type="button" onclick="print()">Print</button></div>
${d.summary ? `<p class="sum">${esc(d.summary)}</p>` : ''}
<div class="plan">${d.objectives.length ? `<section><p class="cap">${esc(OBJECTIVES_HEAD)}</p><ul>${d.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></section>` : ''}${outline.length ? `<section><p class="cap">${esc(OUTLINE_HEAD)}</p><ol>${outline.map((k) => `<li>${esc(k)}</li>`).join('')}</ol></section>` : ''}</div>
</header>
${d.slides.map((s, i) => slideBlock(s, i, fps[i] ?? null)).join('\n')}
${d.checks.length ? `<article><p class="cap">${esc(CHECK_TITLE)}</p><ol class="checks">${d.checks.map(([q, a]) => `<li><p>${esc(q)}</p><p class="a"><b>Answer:</b> ${esc(a)}</p></li>`).join('')}</ol></article>` : ''}
</main></body></html>`;
}

/** Opens the handout in a new tab (at once, inside the tap, so it is not blocked) and writes the notes into it when the numbers are ready; where a tab is refused, saves it as a file. */
export async function openHandout(d: Deck): Promise<void> {
  const w = window.open('', '_blank');
  if (w) w.document.write(`<!doctype html><title>Notes: ${esc(d.title)}</title><p style="font: 15px system-ui, sans-serif; margin: 32px">Preparing the notes…</p>`);
  const fps = await slideFps(d).catch((): Fp[] => []);
  const html = handoutHTML(d, fps);
  if (w && !w.closed) { w.document.open(); w.document.write(html); w.document.close(); }
  else download(`${slug(d.title)}-notes.html`, html, 'text/html');
}
