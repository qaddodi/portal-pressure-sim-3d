// The two tester start guides (batch B15): the 2D app's PDFs with only the 3D build's words changed (scripts/copy-guides.py, scripts/guides-edits.json). Node only: the PDF text is
// checked from the bytes (the script writes its streams uncompressed), so no PDF tool is needed to run this.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const FILES = ['beta-start-guide.pdf', 'beta-start-guide-iphone.pdf'];
const bytes = (f: string) => readFileSync(new URL(`../public/guides/${f}`, import.meta.url));
/** The file as text with every stream that inflates inflated in place (the page streams are Flate or plain; the pictures stay noise). */
const read = (f: string) => {
  const raw = bytes(f), out: string[] = [];
  let at = 0;
  for (;;) {
    const s = raw.indexOf('stream', at, 'latin1');
    if (s < 0) break;
    out.push(raw.subarray(at, s).toString('latin1'));
    const start = raw[s + 6] === 13 ? s + 8 : s + 7, end = raw.indexOf('endstream', start, 'latin1');
    if (end < 0) { at = s + 6; continue; }
    const body = raw.subarray(start, end);
    let text: string;
    try { text = inflateSync(body).toString('latin1'); } catch { text = body.toString('latin1'); }
    out.push(text.length < 200_000 ? text : '');
    at = end + 9;
  }
  out.push(raw.subarray(at).toString('latin1'));
  return out.join('\n');
};
/** The words of the page streams: every (string) the PDF shows, run together with single spaces (a wrapped line ends a string; a bold word is its own). */
const words = (f: string) => [...read(f).matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1]!.replace(/\\([()\\])/g, '$1')).join(' ').replace(/\s+/g, ' ');
const edits = JSON.parse(readFileSync(new URL('../scripts/guides-edits.json', import.meta.url), 'utf8'));

test('both guides are there under the stable names the testers get as links, as PDFs of a size a phone opens', () => {
  for (const f of FILES) {
    const b = read(f);
    assert.ok(b.startsWith('%PDF-'), f); assert.ok(b.includes('%%EOF'), f);
    assert.ok(statSync(new URL(`../public/guides/${f}`, import.meta.url)).size < 4 * 1024 * 1024, `${f} is over 4 MB`);
  }
  assert.equal(FILES.length, Object.keys(edits.files).length);
});

test('they send the tester to the 3D preview, never the 2D one, and carry no email address', () => {
  for (const f of FILES) {
    const b = read(f);
    assert.ok(b.includes(edits.url.to), `${f} does not name the 3D preview`);
    assert.ok(!b.includes(edits.url.from), `${f} still names the 2D preview`);
    assert.ok(!/[\w.+-]+@[\w-]+\.(com|org|net|edu)/.test(b), `${f} carries an email address`);
  }
});

test('the words that are not true of the 3D app are gone (a loading screen, a feedback card after ten minutes) and what Send feedback does now is said', () => {
  for (const f of FILES) {
    const w = words(f);
    assert.ok(!/loading screen/.test(w), `${f} still mentions a loading screen`);
    assert.ok(!/asks once/.test(w), `${f} still mentions the timed feedback card`);
    assert.match(w, /a short report of what the app's own checks found/, `${f} does not say what Send feedback carries`);
    assert.match(w, /3D build/, f);
    assert.match(w, /Light, Soft, Dark, Navy, Black or System/, `${f}: the Settings row list changed`);
  }
});

test('the edits table is whole: every paragraph says where it is and what it may be found by, and the new link is the one in the table', () => {
  assert.match(edits.url.to, /^https:\/\/qaddodi\.github\.io\/portal-pressure-sim-3d\/preview\/$/);
  for (const [name, f] of Object.entries<any>(edits.files)) {
    assert.ok(f.title && f.subtitle?.from && f.subtitle?.to, name);
    for (const p of f.paragraphs) { assert.ok(Number.isInteger(p.page) && p.find && p.width > 100 && p.size > 6 && p.leading > p.size && Array.isArray(p.runs), `${name} page ${p.page}`); }
  }
});
