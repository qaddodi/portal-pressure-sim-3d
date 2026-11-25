// The audit's capture presses every choice of a teaching slide (capture-all.ts choiceShots; selectors in capture-model.ts CHOICE_SEL). A chooser built from plain buttons is invisible to it unless it says which
// one stands (aria-pressed, aria-selected, aria-checked, a tab, radio or switch role) or opts in with data-audit-select. This test walks every <button> of the card components: one with none of those must be a
// known ACTION (it does something, it is not one of several options). A new plain button fails here until it is tagged or named as an action on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIRS = ['cards', 'talk', 'deck', 'tests', 'charts', 'treat', 'action', 'trials', 'wallet'].map((d) => join('src/ui', d));
/** Buttons that act (close, go, open, play, step, expand a row) or are the pieces of a card that are not choices. First class name of each. */
const ACTIONS = new Set(['(none)', 'pz-prail-go', 'pz-zbtn', 'sh-btn', 'ib', 'pzb-n', 'pzb-next', 'pzb-exit', 'btn', 'ab-dp-sb', 'ab-drain', 'metric', 'rp-fr-btn', 'chg-go', 'chg-x', 'order-btn', 'tcp-row', 'tcp-back',
  'ac-btn', 'ac-name', 'ac-x', 'ac-back', 'sr-done', 'se-summary', 'tr-row', 'tr-fh', 'dk-strip', 'ir-more', 'dop-tint', 'sheet-grab', 'dk-card', 'pzc-q-none']);
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : []; });
/** The text of each <button …> opening tag: to the first `>` outside braces and quotes. */
function buttons(src: string): string[] {
  const out: string[] = []; let i = 0;
  while ((i = src.indexOf('<button', i)) >= 0) {
    let j = i + 7, depth = 0, q = '';
    for (; j < src.length; j++) { const c = src[j]!; if (q) { if (c === q && src[j - 1] !== '\\') q = ''; continue; } if (depth === 0 && (c === '"' || c === "'")) { q = c; continue; } if (c === '`') { q = c; continue; } if (c === '{') depth++; else if (c === '}') depth--; else if (c === '>' && depth === 0) break; }
    out.push(src.slice(i, j + 1)); i = j + 1;
  }
  return out;
}
const STATED = /aria-pressed|aria-selected|aria-checked|role="(?:tab|radio|switch)"|data-audit-select/;
const classOf = (tag: string): string => { const m = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(tag); const c = (m?.[1] ?? m?.[2] ?? '').replace(/\$\{[^}]*\}/g, '').trim().split(/\s+/)[0]; return c || '(none)'; };

test('every plain button of a card is a named action; a chooser says which option stands, or opts in with data-audit-select', () => {
  const bad: string[] = [];
  for (const f of DIRS.flatMap(walk)) for (const tag of buttons(readFileSync(f, 'utf8'))) { if (STATED.test(tag)) continue; const c = classOf(tag); if (!ACTIONS.has(c)) bad.push(`${f}: <button className="${c}"> has no aria-pressed/selected/checked, no tab/radio/switch role and no data-audit-select`); }
  assert.deepEqual(bad, [], 'tag the chooser (data-audit-select) or, if it only acts, add its class to ACTIONS above');
});

test('the openers that are options (quick-check questions, treatment orders, stent rows) are tagged for the capture', () => {
  for (const [f, cls] of [['src/ui/cards/CheckCard.tsx', 'pzc-q'], ['src/ui/treat/TreatCard.tsx', 'order-btn'], ['src/ui/action/stent/StentPanel.tsx', 'sr-row']] as const)
    assert.match(readFileSync(f, 'utf8'), new RegExp(`className="${cls}" data-audit-select=""`), `${f} ${cls}`);
});

test('a capture press never leaves the slide: choices are looked for only in the standing slide cards, and never in the Tests card, instrument tabs, toolbar or anything that opens a card', async () => {
  const { pressable, CHOICE_ROOTS, CHOICE_OUT } = await import('../src/ui/capture/capture-model.ts');
  const inside = (sels: string[]) => ({ closest: (sel: string) => (sels.some((s) => sel.split(',').map((x) => x.trim()).includes(s)) ? {} : null) });
  for (const s of ['.t-card', '.instr-tab', '[data-opens]', '.nb-tab', '.topbar', '.dk-pos[data-tucked]']) assert.equal(pressable(inside([s])), false, s);
  assert.equal(pressable(inside([])), true);
  assert.ok(!/t-card/.test(CHOICE_ROOTS), 'the Tests card is not a place to press');
  assert.match(CHOICE_OUT, /\.instr-tab/);
  const all = readFileSync('src/ui/debug/audit/capture-all.ts', 'utf8');
  assert.match(all, /querySelectorAll<HTMLElement>\(CHOICE_ROOTS\)/); assert.match(all, /if \(!pressable\(t\)\) return false/);
  assert.match(all, /it opened another card/, 'a press that changes the standing cards is undone and reported');
});
