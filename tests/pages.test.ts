import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ABOUT, PRIVACY, type Node } from '../src/ui/shell/about.copied.ts';
import { draw } from '../src/ui/shell/draw.ts';
import { resetUrl } from '../src/ui/shell/reset.ts';

const texts = (n: Node | string): string[] => (typeof n === 'string' ? [n] : (n.k ?? []).flatMap(texts));
const all = (p: { body: Node }) => texts(p.body).join('\n');
const find = (n: Node | string, f: (n: Node) => boolean): Node[] => (typeof n === 'string' ? [] : [...(f(n) ? [n] : []), ...(n.k ?? []).flatMap((c) => find(c, f))]);

test('About the model is the 2D page: author, model, validation targets, status colours, references, licences', () => {
  assert.equal(ABOUT.title, 'About the model');
  const t = all(ABOUT);
  for (const w of ['Created by', 'The model', 'Validation targets', 'Status colors', 'Reference review', 'Clinical review', 'References', 'Licenses', 'Educational simulation']) assert.ok(t.includes(w), w);
  assert.ok(/Baveno VIII/.test(t) && !/Baveno VII[^I]/.test(t), 'Baveno VIII only');
  assert.equal(find(ABOUT.body, (n) => n.t === 'ol' && n.p?.class === 'refs').length, 2, 'the validation list and the references');
  assert.ok(find(ABOUT.body, (n) => n.p?.['data-sec'] === 'refs').length === 1, 'References has its anchor');
  assert.ok(find(ABOUT.body, (n) => n.t === 'table').length === 1, 'the status-colour table');
  assert.ok(find(ABOUT.body, (n) => n.t === 'a' && /pubmed/.test(String(n.p?.href))).length >= 3, 'PubMed links');
});
test('Privacy is the 2D page, with the feedback paragraph marked and the clear button left to the app', () => {
  assert.equal(PRIVACY.title, 'Privacy');
  assert.equal(find(PRIVACY.body, (n) => !!n.p?.needsEmail).length, 1);
  assert.equal(find(PRIVACY.body, (n) => n.t === 'clear-row').length, 1);
  assert.ok(/no analytics, no trackers/.test(all(PRIVACY)));
});
test('drawn on 2D\'s class names, the feedback paragraph left out while no email is configured', () => {
  const html = renderToStaticMarkup(draw(PRIVACY.body, 0, () => 'CLEAR') as never);
  assert.ok(html.includes('CLEAR') && html.includes('class="sub"'));
  assert.ok(!html.includes('Send feedback (in Settings)'));
  const a = renderToStaticMarkup(draw(ABOUT.body) as never);
  assert.ok(a.includes('class="cut-table"') && a.includes('data-sec="refs"') && a.includes('class="disclaimer"'));
});
test('clearing the device reloads on the healthy patient with no talk', () => {
  assert.equal(resetUrl('https://x.test/preview/?script=a#b'), 'https://x.test/preview/?preset=healthy');
});
