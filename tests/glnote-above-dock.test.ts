// F9 of the independent review: the "figure couldn't be redrawn" note, with its Reload button, stood at the screen's foot with only the sheet gap under it, so at 1280 x 800 it sat under the view switcher and the
// transport bar and Reload could not be pressed. Root cause: `.sh-glnote` (also the base of the error note) ignored `--bot-occ`, the foot the dock and the view pill take, which the toast and the sheets read.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/ui/shell/shell.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const bottomOf = (sel: string) => {
  const m = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((x) => x[1].trim() === sel && /(^|;)\s*bottom:/.test(x[2]));
  return /(?:^|;)\s*bottom:\s*([^;]*)/.exec(m?.[2] ?? '')?.[1] ?? '';
};

test('the lost-context note and the error note stand above the dock and the view pill, never under them', () => {
  assert.ok(bottomOf('.sh-glnote').includes('var(--bot-occ'), `.sh-glnote bottom: ${bottomOf('.sh-glnote')}`);
  assert.ok(bottomOf('.sh-errnote').includes('var(--bot-occ'), `.sh-errnote bottom: ${bottomOf('.sh-errnote')}`);
});

test('the lost-context note is the one fixed note and keeps its fade (opacity, no pop)', () => {
  const m = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((x) => x[1].trim() === '.sh-glnote');
  assert.ok(m && /transition:\s*opacity/.test(m[2]));
});
