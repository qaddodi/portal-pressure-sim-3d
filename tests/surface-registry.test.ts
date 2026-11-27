// The surfaces table (src/ui/surface/kinds.ts SURFACES) is the registry every menu, panel and dialog answers to (menu unification, stage 6: reports/menu-unification.md section 5).
// Pinned here, for every id in it: it is drawn through its kind's one shell (a menu by <Menu>, a panel by <Panel>, <ShellPanel> or usePanelShell, a dialog by <Dialog>), never by
// a shell of another kind; menus and dialogs close on a press outside and panels never do; and one Esc closes by the table's order (a dialog, then a menu, then the newest panel).
// The source rules that keep a surface from being hand-built again are lint rules (scripts/lint-rules.mjs: surface-outside-shell, one-sheet-rule, surface-motion-tokens).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SURFACES, ESC_ORDER, closesOnOutsidePress, takesRoom, isPanel, kindOf, type SurfaceId, type SurfaceKind } from '../src/ui/surface/kinds.ts';
import { escStep, type EscState, type EscStep } from '../src/ui/keys/escape.ts';
import { RULES } from '../scripts/lint-rules.mjs';

const read = (p: string) => readFileSync(p, 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f).replace(/\\/g, '/'); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : []; });
const ui = walk('src/ui').filter((p) => !p.startsWith('src/ui/debug/')).map((p) => [p, code(p)] as const);
const IDS = Object.keys(SURFACES) as SurfaceId[];

/** How each kind's shell is asked for a surface, by id. */
const SHELL_OF: Record<SurfaceKind, (id: string) => RegExp> = {
  menu: (id) => new RegExp(`<Menu id="${id}"|useMenu\\('${id}'`),
  panel: (id) => new RegExp(`<(?:Panel|ShellPanel)\\b[^>]*\\bid="${id}"|usePanelShell\\('${id}'`),
  dialog: (id) => new RegExp(`<Dialog id="${id}"`),
};
/** The surfaces drawn with their kind's shared parts but not its whole shell, each with why, and the parts it must still use. */
const OWN: Partial<Record<SurfaceId, { why: string; file: string; uses: RegExp[] }>> = {
  // (one component for two menus: the top bar's Blood and Layers, `<Menu id={kind}>`)
  blood: { why: 'FigureMenu draws Blood and Layers with one <Menu id={kind}>', file: 'src/ui/shell/FigureMenu.tsx', uses: [/<Menu id=\{kind\}/] },
  'tips-views': {
    why: 'a small inline menu inside its Tests pane: no frame, no sheet, the menus\' one outside press', file: 'src/ui/tests/ir/TipsView.tsx',
    uses: [/useOutsidePress\(open, \[menu, more\], \(\) => setOpen\(false\)\)/],
  },
  tests: {
    why: 'the right column\'s wide tier: its own place rule (tests/place.ts) and stops, with the shell\'s head, column step, room channel, role and pull', file: 'src/ui/tests/TestsLayer.tsx',
    uses: [/<PanelHead\b/, /useColumnStep\('tests'\)/, /publishPanel\('tests',/, /role=\{PANEL_ROLE\}/, /attachSheetPull\(/],
  },
  stop: { why: 'the case\'s own card (a chunk of its own), with the one Peek, Half and Full of every phone panel', file: 'src/ui/case/StopCard.tsx', uses: [/usePanelSheet\(\{/] },
};

test('every surface of the table is drawn through its kind\'s shell, and by no shell of another kind', () => {
  for (const id of IDS) {
    const kind = kindOf(id), own = OWN[id];
    const by = ui.filter(([, s]) => SHELL_OF[kind](id).test(s)).map(([p]) => p);
    if (own) {
      for (const re of own.uses) assert.match(code(own.file), re, `${id} (${own.why}): ${own.file} uses ${re}`);
    } else {
      assert.ok(by.length > 0, `${id} (${kind}) is drawn by no ${kind} shell`);
    }
    for (const other of (['menu', 'panel', 'dialog'] as const).filter((k) => k !== kind)) {
      const wrong = ui.filter(([, s]) => SHELL_OF[other](id).test(s)).map(([p]) => p);
      assert.deepEqual(wrong, [], `${id} is a ${kind}, drawn by the ${other} shell`);
    }
  }
  // the exceptions are surfaces of the table (a stale one fails), and the old shells are gone
  for (const id of Object.keys(OWN)) assert.ok(id in SURFACES, `${id} is listed as its own but is not in SURFACES`);
  for (const f of ['src/ui/shell/Frame.tsx', 'src/ui/shell/Pop.tsx']) assert.ok(!existsSync(f), `${f} is gone`);
  // (the one full-width panel, the timeline chart, is the panel shell's too)
  assert.match(code('src/ui/bigtime/TimelineSheet.tsx'), /<Panel ref=\{ref\} id="timeline" open=\{open\}/);
});

test('menus and dialogs close on a press outside, panels never do', () => {
  for (const id of IDS) assert.equal(closesOnOutsidePress(id), kindOf(id) !== 'panel', id);
  for (const id of IDS) assert.equal(takesRoom(id), kindOf(id) === 'panel', id);
  // the one outside press (surface/outside.ts) is the menu shell's, and the inline TIPS views menu's; a dialog cancels on a press off its box (surface/dialog-stack.ts)
  const users = ui.filter(([, s]) => /useOutsidePress\(/.test(s)).map(([p]) => p).filter((p) => p !== 'src/ui/surface/outside.ts').sort();
  assert.deepEqual(users, ['src/ui/surface/Menu.tsx', 'src/ui/tests/ir/TipsView.tsx']);
  assert.match(code('src/ui/surface/Menu.tsx'), /useOutsidePress\(open, \[ref\], pressClose, `\[data-opens="\$\{id\}"\]`\)/);
  assert.match(code('src/ui/surface/dialog-stack.ts'), /window\.addEventListener\('pointerdown', onPress, true\)/);
  // no file that draws a panel closes it on a press: not the shell, not a panel of its own markup
  const panelFiles = ['src/ui/surface/Panel.tsx', 'src/ui/surface/wire.ts', 'src/ui/treat/TreatCard.tsx', 'src/ui/tests/TestsLayer.tsx', 'src/ui/action/ActionCard.tsx',
    'src/ui/case/StopCard.tsx', 'src/ui/bigtime/TimelineSheet.tsx', 'src/ui/history/HistorySheet.tsx', 'src/ui/compare/DifferencesSheet.tsx', 'src/ui/why/WhySheet.tsx'];
  for (const f of panelFiles) assert.doesNotMatch(code(f), /useOutsidePress\(|closeByPress\(|surface\/outside\.ts|'\.\/outside\.ts'/, `${f} closes a panel on a press`);
});

/** The Esc state with these surfaces up (`newest`: the newest of the right column), as keys/useKeys.ts builds it from the stores. */
function stateOf(up: readonly SurfaceId[], newest: SurfaceId | null = null): EscState {
  const has = (id: SurfaceId) => up.includes(id);
  const menu = up.some((id) => kindOf(id) === 'menu'), slotPanel = up.some((id) => ['history', 'compare', 'why', 'timeline'].includes(id));
  return {
    dialog: up.some((id) => kindOf(id) === 'dialog'), sheet: menu || slotPanel, sheetPanel: !menu, testsOpen: has('tests'), testsFocus: false, treatOpen: has('treat'),
    sinusoid: false, selection: has('action'), talk: false,
    newest: newest === 'treat' || newest === 'tests' ? newest : newest ? 'sheet' : null,
  };
}
/** The kind the step closes. */
const KIND_OF_STEP: Record<Exclude<EscStep, null>, SurfaceKind | null> = {
  dialog: 'dialog', sheet: null, 'tests-focus': 'panel', treat: 'panel', tests: 'panel', selection: 'panel', sinusoid: null, talk: null,
};

test('one Esc closes by the table\'s order: a dialog, then a menu, then a panel, the newest first', () => {
  assert.deepEqual([...ESC_ORDER].sort(), ['dialog', 'menu', 'panel']);
  const one: Record<SurfaceKind, SurfaceId[]> = { dialog: ['reset', 'search', 'about'], menu: ['settings', 'menu', 'speed'], panel: ['tests', 'treat', 'history', 'timeline', 'action'] };
  // every pair of kinds, with a surface of each up: Esc goes to the one first in the order
  for (const a of ESC_ORDER) for (const b of ESC_ORDER) for (const x of one[a]) for (const y of one[b]) {
    const up = [x, y], first = ESC_ORDER.find((k) => k === a || k === b)!;
    const step = escStep(stateOf(up, isPanel(y) ? y : isPanel(x) ? x : null))!;
    const kind = step === 'sheet' ? (stateOf(up).sheetPanel ? 'panel' : 'menu') : KIND_OF_STEP[step];
    assert.equal(kind, first, `${x} and ${y} up: Esc (${step}) closes a ${kind}, the order says a ${first}`);
  }
  // two panels side by side in the right column: the newest goes first, whichever they are
  for (const [p, q] of [['treat', 'tests'], ['tests', 'treat'], ['history', 'tests'], ['tests', 'history'], ['treat', 'why'], ['compare', 'treat']] as const) {
    const step = escStep(stateOf([p, q], q));
    assert.equal(step, q === 'treat' || q === 'tests' ? q : 'sheet', `${p} then ${q}: the newest, ${q}, goes first`);
  }
  // the keys ask the table whether what stands in the menus' slot is a panel (the chart) or a menu
  assert.match(code('src/ui/keys/useKeys.ts'), /sheetPanel: !sh\.sheet \|\| isPanel\(sh\.sheet\)/);
  assert.match(code('src/ui/keys/useKeys.ts'), /import \{ isPanel \} from '\.\.\/surface\/kinds\.ts';/);
  assert.ok(isPanel('timeline') && !isPanel('settings'));
});

test('the source rules that keep a surface in its shell are lint rules', () => {
  for (const r of ['surface-outside-shell', 'one-sheet-rule', 'surface-motion-tokens']) assert.ok(r in RULES, r);
  const allow = JSON.parse(read('scripts/lint-allow.json')) as Record<string, number>;
  for (const r of ['surface-outside-shell', 'one-sheet-rule', 'surface-motion-tokens']) assert.equal(allow[r], 0, `${r}: no allowance`);
});
