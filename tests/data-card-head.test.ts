// The data card's heading (2D presenter-question.js cardTitle): the slide's `dataTitle`, else its instrument's title, else "The patient"; short on a phone. Held to the 2D files' own words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pinned2D } from './two-d-pin.ts';
import { cardTitle, toolTitle, toolShort, titleUnits, EXT_TITLE_KINDS } from '../src/ui/talk/tool-title.ts';
import { TITLE } from '../src/ui/talk/tool-titles.generated.js';
import { loadAgDeck, AG_IDS } from '../src/decks/ag/index.ts';
import { loadHpDeck, HP_IDS } from '../src/decks/hp/index.ts';
import { RW_IDS } from '../src/decks/rw/copied/index.ts';
import { DECKS as RW } from '../src/decks/rw/copied/all.ts';

test('a card with no instrument is "The patient"; dataTitle wins; an instrument names itself; a phone takes the short form of a long one', () => {
  assert.equal(cardTitle({ tiles: ['hvpg'] }, false), 'The patient');
  assert.equal(cardTitle({ dataTitle: 'Pressures', tool: { kind: 'profile' } }, false), 'Pressures');
  assert.equal(cardTitle({ tool: { kind: 'profile' } }, false), 'Pressure, gut to heart');
  assert.equal(cardTitle({ tool: { kind: 'profile' } }, true), 'Gut to heart', 'a registered instrument\'s own short form');
  assert.equal(cardTitle({ tool: { kind: 'doppler' } }, false), 'Doppler, main portal vein');
  assert.equal(cardTitle({ tool: { kind: 'doppler' } }, true), 'Doppler, portal vein');
  assert.equal(cardTitle({ tool: { kind: 'doppler', vessel: 'SMV_CONF' } }, false), 'Doppler, superior mesenteric vein');
  assert.equal(cardTitle({ tool: { kind: 'flowtime' } }, true), 'Pressure and flow');
  assert.equal(cardTitle({ tool: { kind: 'evgraph', title: 'What the procedure changes' } }, false), 'What the procedure changes');
  assert.equal(cardTitle({ tool: { kind: 'evgraph' } }, false), 'What the stent changes');
  assert.equal(cardTitle({ tool: { kind: 'fluid', window: true } }, false), 'Fluid balance');
  assert.equal(cardTitle({ tool: { kind: 'stiffness' } }, false), '', 'a kind 2D titles nowhere has no title');
  assert.equal(cardTitle({ tool: { kind: 'trace', range: 'beats' } }, false), 'Pressure, beat by beat'.replace(' ', ' ').replace(/-/g, '‑'));
  assert.equal(cardTitle({ tool: { kind: 'wall' } }, false), 'The varix wall, in cross‑section', 'a hyphen in a title never breaks');
  assert.deepEqual(titleUnits('Fluid balance · mL/day'), ['Fluid balance · ', 'mL/day', '']);
  assert.equal(toolShort({ kind: 'path', of: 'x' }, 'not the title', null), null);
});

test('every chart or instrument a copied deck uses has a title, and every title is a string', async () => {
  const decks = [...(await Promise.all(AG_IDS.map((id) => loadAgDeck(id)))), ...(await Promise.all(HP_IDS.filter((i) => i !== 'hvpg').map((id) => loadHpDeck(id)))), ...RW_IDS.map((id) => RW[id]!)] as unknown as { id: string; slides: Record<string, any>[] }[];
  const kinds = new Set<string>();
  for (const d of decks) for (const s of d.slides) {
    if (!s.tool?.kind) continue;
    kinds.add(s.tool.kind);
    for (const small of [false, true]) assert.equal(typeof cardTitle(s, small), 'string');
    if (s.tool.kind !== 'stiffness') assert.ok(cardTitle(s, false).length > 0, `${d.id}/${s.id}: a ${s.tool.kind} card has a title`);
  }
  assert.ok(kinds.size >= 15, [...kinds].join());
  for (const k of [...Object.keys(TITLE), ...EXT_TITLE_KINDS]) assert.equal(typeof toolTitle({ kind: k }, {}), 'string', k);
});

const two = pinned2D('src/ui/ext-charts.js');
test('the heading words are the 2D files\' own (when the 2D checkout at the pin is here)', { skip: two.skip }, () => {
  execFileSync('node', ['scripts/copy-tool-titles.mjs', '--from', two.repo, '--check'], { stdio: 'pipe' });
  const ext = ['ext-charts', 'ext-teaching', 'ext-model', 'ext-instruments', 'ext-stent', 'ext-panels'].map((f) => readFileSync(`${two.repo}/src/ui/${f}.js`, 'utf8')).join('\n');
  const mine = readFileSync('src/ui/talk/tool-title.ts', 'utf8');
  // every quoted word the ext titles use here is in the 2D files
  for (const m of mine.matchAll(/(?:title|short): \([^)]*\) => (?:[^'`\n]*)['`]([^'`$]+)['`]/g)) assert.ok(ext.includes(m[1]!), `not in the 2D files: ${m[1]}`);
  for (const k of EXT_TITLE_KINDS) assert.ok(new RegExp(`\\b${k}: \\{ make`).test(ext), `2D has no registered tool "${k}"`);
});
