// The cover's first paint is the saved look's ground (index.html's first script reads the save before anything paints), so Navy, Black, Soft, or Light on a dark device never show one colour and then snap to another (22 Nov splash review, item 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { LOOKS, LOOK_IDS } from '../src/looks/looks.ts';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>(\/\* The saved look's ground[\s\S]*?)<\/script>/)![1];

function run(save: string | null, dark = false) {
  const props: Record<string, string> = {}, metas = [{ c: '' }, { c: '' }].map((m) => ({ setAttribute: (_k: string, v: string) => { m.c = v; }, m }));
  const ctx = {
    JSON, localStorage: { getItem: () => save }, matchMedia: () => ({ matches: dark }),
    document: { documentElement: { style: { setProperty: (k: string, v: string) => { props[k] = v; } } }, querySelectorAll: () => metas },
  };
  vm.runInNewContext(script, { ...ctx, window: ctx });
  return { props, themeColors: metas.map((m) => m.m.c) };
}

test('each saved look sets the same ground, text and mute colours as the look table', () => {
  for (const id of LOOK_IDS) {
    const { props, themeColors } = run(JSON.stringify({ look: id, lookChosen: true }));
    assert.equal(props['--bg'], LOOKS[id].bg, id); assert.equal(props['--text'], LOOKS[id].text, id); assert.equal(props['--text-3'], LOOKS[id].text3, id);
    assert.deepEqual(themeColors, [LOOKS[id].bg, LOOKS[id].bg], id);
  }
});

test('System follows the device; nothing chosen, nothing saved or a broken save leaves the CSS defaults', () => {
  assert.equal(run(JSON.stringify({ look: 'system', lookChosen: true }), true).props['--bg'], LOOKS.dark.bg);
  assert.equal(run(JSON.stringify({ look: 'system', lookChosen: true }), false).props['--bg'], LOOKS.light.bg);
  for (const s of [null, '{', JSON.stringify({ look: 'navy' }), JSON.stringify({ look: 'plaid', lookChosen: true }), JSON.stringify({ look: 'toString', lookChosen: true })]) assert.deepEqual(run(s).props, {}, String(s));
});

test('the page ground follows --bg from the first paint', () => {
  assert.match(html, /html, body \{ margin: 0; background: var\(--bg, #F1EBE0\); \}/);
});
