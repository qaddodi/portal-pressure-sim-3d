// The dialog shell (menu unification, stage 5: reports/menu-unification.md 3.2 "Dialog shell"; owner, 27 Nov: Guide and Search become dialogs). Before it, six dialogs answered for
// themselves where they stood, how they came and went and what closed them: the deck dialogs and the case guard each caught Esc with a listener of their own, Search caught it in its
// field, About and Search had a 2D backdrop each with its own leave (180, 260 ms, --d-flip), and the Guide was a sheet. This holds the one rule: every dialog renders through
// <Dialog> (src/ui/surface/Dialog.tsx), only the shell is a modal, only the shell answers Esc, a press outside and Tab, and the sheet-mode keyboard fit is one pure function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SURFACES } from '../src/ui/surface/kinds.ts';
import { keyboardFit, dialogFoot, dialogAlign, trapStep, DIALOG_EDGE, type DialogId, type DialogSize } from '../src/ui/surface/dialog-fit.ts';
import { openDialog, dialogKey, dialogPress, dialogOpen, cancelTopDialog, openDialogIds } from '../src/ui/surface/dialog-stack.ts';
import { lintFiles } from '../scripts/lint-rules.mjs';

const read = (p: string) => readFileSync(p, 'utf8');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Each dialog, the file that draws it and its size. A new dialog in SURFACES fails here until it is drawn through the shell and listed. */
const OWNER: Record<DialogId, [string, DialogSize]> = {
  search: ['src/ui/search/SearchSheet.tsx', 'l'],
  guide: ['src/ui/shell/HelpSheets.tsx', 'l'],
  about: ['src/ui/shell/Pages.tsx', 'l'],
  privacy: ['src/ui/shell/Pages.tsx', 'l'],
  reset: ['src/ui/shell/Sheets.tsx', 's'],
  'deck-dialog': ['src/ui/deck/DeckDialogs.tsx', 's'],
  'case-guard': ['src/ui/case/CaseGuard.tsx', 's'],
};

test('every surface of kind dialog in SURFACES renders through <Dialog>, at its size', () => {
  const dialogs = Object.entries(SURFACES).filter(([, d]) => d.kind === 'dialog').map(([id]) => id).sort();
  assert.deepEqual(Object.keys(OWNER).sort(), dialogs, 'OWNER lists exactly the dialogs of SURFACES');
  for (const [id, [file, size]] of Object.entries(OWNER)) {
    assert.match(read(file), new RegExp(`<Dialog id="${id}" size="${size}" open=\\{`), `${id}: <Dialog id="${id}" size="${size}"> in ${file}`);
  }
  // the size-l dialogs stand in the sheets' clip (a phone's sheet tucks behind the dock as it comes and goes), the questions over everything
  const sheets = read('src/ui/shell/Sheets.tsx');
  const clip = sheets.slice(sheets.indexOf('<SheetClip id="sheets">'), sheets.indexOf('</SheetClip>'));
  for (const el of ['<SearchSheet />', '<Guide />', '<PageDialog />']) assert.ok(clip.includes(el), `${el} in the sheets' clip`);
  for (const el of ['<ResetDialog />', '<DeckDialogs />', '<CaseGuardDialog />']) assert.ok(sheets.includes(el) && !clip.includes(el), `${el} outside the clip`);
});

test('only the shell is a modal: no file outside src/ui/surface/ sets aria-modal or a dialog role, draws a scrim or listens for Escape for a dialog', () => {
  // (aria-modal and a dialog's role outside the shells are the lint rule surface-outside-shell's, scripts/lint-rules.mjs: a role handed to the shell, `<Dialog role="alertdialog">`, is
  // the shell's to write; the rule is proved in tests/lint-rules.test.ts and the repo kept at 0 hits there)
  const lint = (f: string) => (lintFiles([{ path: f, text: read(f) }]) as { rule: string; line: number }[]).filter((h) => h.rule === 'surface-outside-shell');
  const strays: string[] = [];
  for (const f of walk('src')) {
    if (f.startsWith('src/ui/surface/') || f.includes('/debug/')) continue;
    const c = code(f);
    if (/className="sh-scrim"|className=\{?["'`]?(?:pal|modal)-back/.test(c)) strays.push(`${f}: a scrim or backdrop of its own`);
  }
  assert.deepEqual(strays, []);
  for (const file of new Set(Object.values(OWNER).map(([f]) => f))) {
    const c = code(file);
    assert.doesNotMatch(c, /'Escape'|"Escape"/, `${file}: Esc is the shell's (surface/dialog-stack.ts)`);
    assert.deepEqual(lint(file), [], `${file}: the role and aria-modal are the shell's`);
    assert.doesNotMatch(c, /addEventListener\('keydown'/, `${file}: no key listener of its own`);
  }
  // useKeys' dialog step goes through the same shell
  const keys = read('src/ui/keys/useKeys.ts');
  assert.match(keys, /escStep\(\{ dialog: dialogOpen\(\) \|\| !!sh\.dialog,/);
  assert.match(keys, /if \(step === 'dialog'\) \{ if \(!cancelTopDialog\('esc'\)\)/);
});

test('the shell: one leave on the motion scale, focus in in the commit that shows it, back to the opener, the pull on a phone sheet, CloseX on every page', () => {
  const d = read('src/ui/surface/Dialog.tsx');
  assert.match(d, /leaveMs\('dialog', surfaceModeNow\(\)\)/);
  assert.match(d, /useLayoutEffect\(\(\) => \{\s*const el = box\.current;\s*if \(!open \|\| !el\) return;[\s\S]{0,200}focusOf\(el, size, initialFocus\?\.current\)\.focus\(/, 'focus in, in a layout effect');
  assert.match(d, /back\.focus\(\{ preventScroll: true \}\)/, 'focus back to the opener');
  assert.match(d, /useSheetSwipe\(box, \(\) => cancel\.current\('pull'\), \(\) => size === 'l' && surfaceModeNow\(\) === 'sheet'\)/);
  assert.match(d, /<CloseX onClose=\{onClose\} \/>/);
  assert.match(d, /className="sf-layer" data-surface=\{id\} data-size=\{size\} data-mode=\{mode\} data-open=\{open\} inert=\{!open\}/, 'always in the page');
  assert.match(read('src/ui/search/SearchSheet.tsx'), /initialFocus=\{input\}/, 'Search\'s field is focused by the shell, in the commit that shows it');
  assert.match(read('src/ui/case/CaseGuard.tsx'), /initialFocus=\{stay\}/, 'the guard\'s Stay has the focus');
  // the box fades itself (glass): the layer only eases its colour (a fading ancestor is a backdrop root, glass.css)
  const css = read('src/ui/surface/dialog.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const layer = /\.sf-layer \{([^}]*)\}/.exec(css)![1]!;
  assert.match(layer, /transition: background-color var\(--d-small\)/);
  assert.doesNotMatch(layer, /opacity|filter|will-change/);
  assert.match(css, /\.sf-layer > \.sf-dialog \{[^}]*opacity: 0; visibility: hidden; transform: var\(--dlg-from\); animation: none;[^}]*transition: opacity var\(--d-small\)/);
});

test('the keyboard fit: the room ends at the on-screen keyboard, and a phone\'s size-l sheet rests on the dock or one gap over the keys', () => {
  // an iPhone 390 x 844 with no keyboard, with a 336 px keyboard, and with the page scrolled up under it
  assert.deepEqual(keyboardFit(844, null), { kb: 0, vh: 844 });
  assert.deepEqual(keyboardFit(844, { offsetTop: 0, height: 844 }), { kb: 0, vh: 844 });
  assert.deepEqual(keyboardFit(844, { offsetTop: 0, height: 508 }), { kb: 336, vh: 508 });
  assert.deepEqual(keyboardFit(844, { offsetTop: 100, height: 508 }), { kb: 236, vh: 508 });
  assert.deepEqual(keyboardFit(844, { offsetTop: 0, height: 900 }), { kb: 0, vh: 900 }, 'never a negative keyboard');
  const f = { occ: 120, gap: 12, safeB: 34 };
  assert.equal(dialogFoot('sheet', 'l', { ...f, kb: 0 }), 120, 'on the dock, where every phone sheet rests');
  assert.equal(dialogFoot('sheet', 'l', { ...f, kb: 100 }), 120, 'a keyboard lower than the dock leaves it there');
  assert.equal(dialogFoot('sheet', 'l', { ...f, kb: 336 }), 348, 'one gap over the keys');
  assert.equal(dialogFoot('sheet', 's', { ...f, kb: 0 }), DIALOG_EDGE + 34, 'a question stays centred');
  assert.equal(dialogFoot('float', 'l', { ...f, kb: 336 }), DIALOG_EDGE + 336, 'an iPad with its keyboard: the room ends over it');
  assert.equal(dialogAlign('sheet', 'l'), 'end'); assert.equal(dialogAlign('sheet', 's'), 'center'); assert.equal(dialogAlign('float', 's'), 'center'); assert.equal(dialogAlign('float', 'l'), 'start');
  // dialog.css writes the same rule with the same properties, and Dialog.tsx publishes them from the visual viewport
  const css = read('src/ui/surface/dialog.css');
  assert.ok(css.includes(`--dlg-edge: ${DIALOG_EDGE}px`));
  assert.ok(css.includes('calc(var(--dlg-edge) + max(var(--safe-b, 0px), var(--dlg-kb, 0px)))'), 'float: the edge over the safe area or the keyboard');
  assert.match(css, /\.sf-layer\[data-mode="sheet"\]\[data-size="l"\] \{[^}]*align-items: end;[^}]*max\(var\(--thumb-occ, 0px\), calc\(var\(--dlg-kb, 0px\) \+ var\(--sheet-gap, 8px\)\)\)/);
  assert.match(css, /\.sf-layer \{[^}]*align-items: center;/); assert.match(css, /\.sf-layer\[data-size="l"\] \{[^}]*align-items: start;/);
  const d = read('src/ui/surface/Dialog.tsx');
  assert.match(d, /keyboardFit\(innerHeight, vv \?\? null\)/);
  assert.match(d, /vv\?\.addEventListener\('resize', fit\); vv\?\.addEventListener\('scroll', fit\);/);
  assert.match(d, /setProperty\('--dlg-kb', `\$\{kb\}px`\); el\.style\.setProperty\('--dlg-vh', `\$\{vh\}px`\)/);
  // Search's list keeps the visible height on a phone (2D --pal-vh, read by the lifted sheet)
  assert.match(css, /--pal-vh: var\(--dlg-vh, 100svh\)/);
});

test('Tab is trapped: it walks the controls and wraps at either end; focus outside comes back in', () => {
  assert.equal(trapStep(0, -1, false), 'box', 'no control: the dialog holds focus');
  assert.equal(trapStep(3, -1, false), 0); assert.equal(trapStep(3, -1, true), 2);
  assert.equal(trapStep(3, 2, false), 0); assert.equal(trapStep(3, 0, true), 2);
  assert.equal(trapStep(3, 1, false), null); assert.equal(trapStep(3, 1, true), null, 'inside: the browser\'s own step');
});

/** A stand-in for a dialog's box and its controls (node has no DOM). */
function fakeBox(n: number) {
  const focused: number[] = [];
  const ctl = Array.from({ length: n }, (_, i) => ({ i, closest: () => null, focus: () => { focused.push(i); } }));
  const box = { contains: (t: unknown) => t === box || ctl.includes(t as never), querySelectorAll: () => ctl, focus: () => { focused.push(-1); } };
  return { box: box as unknown as HTMLElement, ctl, focused };
}
const key = (k: string, extra: Record<string, unknown> = {}) => {
  const e = { key: k, prevented: false, stopped: false, preventDefault() { e.prevented = true; }, stopImmediatePropagation() { e.stopped = true; }, ...extra };
  return e;
};

test('one Esc closes one thing, the top dialog first, and no one else hears it; a press outside the top one cancels it, a press inside does not', () => {
  const log: string[] = [];
  const a = fakeBox(2), b = fakeBox(1);
  const offA = openDialog({ id: 'about', box: () => a.box, cancel: (by) => log.push(`about:${by}`) });
  const offB = openDialog({ id: 'reset', box: () => b.box, cancel: (by) => log.push(`reset:${by}`) });
  assert.ok(dialogOpen()); assert.deepEqual(openDialogIds(), ['about', 'reset']);
  const e = key('Escape');
  assert.ok(dialogKey(e, { activeElement: null }));
  assert.ok(e.prevented && e.stopped, 'the key goes no further (a talk does not end, a toast stays)');
  assert.deepEqual(log, ['reset:esc']);
  assert.ok(!dialogKey(key('Escape', { isComposing: true }), { activeElement: null }), 'an input method composing keeps its Esc');
  assert.ok(!dialogPress(b.ctl[0]), 'a press inside the top dialog is its own');
  assert.ok(dialogPress(a.ctl[0]), 'a press on the dialog under it is outside the top one');
  assert.deepEqual(log, ['reset:esc', 'reset:press']);
  offB();
  assert.ok(dialogPress({}), 'with the question gone, a press on the scrim cancels the page');
  assert.ok(cancelTopDialog('esc'));
  assert.deepEqual(log, ['reset:esc', 'reset:press', 'about:press', 'about:esc']);
  // Tab: from the last control to the first, Shift Tab from the first to the last, focus outside back in
  const tab = key('Tab');
  assert.ok(dialogKey(tab, { activeElement: a.ctl[1] as never }) && tab.prevented); assert.deepEqual(a.focused, [0]);
  assert.ok(dialogKey(key('Tab', { shiftKey: true }), { activeElement: a.ctl[0] as never })); assert.deepEqual(a.focused, [0, 1]);
  assert.ok(dialogKey(key('Tab'), { activeElement: null })); assert.deepEqual(a.focused, [0, 1, 0]);
  assert.ok(!dialogKey(key('Tab'), { activeElement: a.ctl[0] as never }), 'a step inside is the browser\'s');
  offA();
  assert.ok(!dialogOpen()); assert.ok(!cancelTopDialog('esc')); assert.ok(!dialogKey(key('Escape'), { activeElement: null }), 'with no dialog, Esc is the page\'s (useKeys)');
});
