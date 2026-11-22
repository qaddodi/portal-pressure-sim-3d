// The cover's first paint is the saved look's ground (index.html's first script reads the save before anything paints), so Navy, Black, Soft, or Light on a dark device never show one colour and then snap to another (22 Nov splash review, item 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { LOOKS, LOOK_IDS, resolveLook, themeAttrs } from '../src/looks/looks.ts';
import { parseSettings } from '../src/state/settings.ts';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>(\/\* The saved look, whole[\s\S]*?)<\/script>/)![1];

function run(save: string | null, dark = false) {
  const props: Record<string, string> = {}, metas = [{ c: '' }, { c: '' }].map((m) => ({ setAttribute: (_k: string, v: string) => { m.c = v; }, m }));
  const dataset: Record<string, string> = {}, style = { setProperty: (k: string, v: string) => { props[k] = v; }, colorScheme: '' };
  const ctx = {
    JSON, localStorage: { getItem: () => save }, matchMedia: () => ({ matches: dark }),
    document: { documentElement: { style, dataset }, querySelectorAll: () => metas },
  };
  vm.runInNewContext(script, { ...ctx, window: ctx });
  return { props, dataset, colorScheme: style.colorScheme, themeColors: metas.map((m) => m.m.c) };
}
/** What applyLook sets for the look the app boots into from the same save (parseSettings, then resolveLook). */
function expected(save: string | null, dark: boolean) {
  const id = resolveLook(parseSettings(save).look, dark), a = themeAttrs(id);
  return { id, theme: a.theme, palette: a.palette ?? undefined, scheme: LOOKS[id].scheme };
}

test('each saved look sets the same ground, text and mute colours as the look table', () => {
  for (const id of LOOK_IDS) {
    const { props, themeColors } = run(JSON.stringify({ look: id, lookChosen: true }));
    assert.equal(props['--bg'], LOOKS[id].bg, id); assert.equal(props['--text'], LOOKS[id].text, id); assert.equal(props['--text-3'], LOOKS[id].text3, id);
    assert.deepEqual(themeColors, [LOOKS[id].bg, LOOKS[id].bg], id);
  }
});

test('the whole look matches applyLook for every save, with and without lookChosen, on a light and a dark device', () => {
  const saves: (string | null)[] = [null, '{', '{}', JSON.stringify({ look: 'plaid', lookChosen: true }), JSON.stringify({ look: 'toString', lookChosen: true }), JSON.stringify({ look: 'system', lookChosen: true })];
  for (const id of LOOK_IDS) saves.push(JSON.stringify({ look: id, lookChosen: true }), JSON.stringify({ look: id }), JSON.stringify({ look: id, lookChosen: false }));
  for (const save of saves) for (const dark of [false, true]) {
    const e = expected(save, dark), r = run(save, dark), msg = `${save} dark=${dark}`;
    assert.equal(r.dataset.look, e.id, msg); assert.equal(r.dataset.theme, e.theme, msg); assert.equal(r.dataset.palette, e.palette, msg); assert.equal(r.colorScheme, e.scheme, msg);
    assert.equal(r.props['--bg'], LOOKS[e.id].bg, msg); assert.equal(r.props['--text'], LOOKS[e.id].text, msg); assert.equal(r.props['--text-3'], LOOKS[e.id].text3, msg);
    assert.deepEqual(r.themeColors, [LOOKS[e.id].bg, LOOKS[e.id].bg], msg);
  }
});

test('the page ground follows --bg from the first paint', () => {
  assert.match(html, /html, body \{ margin: 0; background: var\(--bg, #F1EBE0\); \}/);
});
