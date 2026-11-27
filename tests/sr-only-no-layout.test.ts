// Root cause of the Pressure card that scrolled with empty space under it (owner, 27 Nov, iPhone): every chart writes its numbers as a hidden `<table class="sr-only">` (charts/Chart.tsx), and a TABLE does not shrink
// to the 1 px its CSS asks for: width, height and overflow do nothing to a table box, so it kept its full height in the Tests pane's flow (nine rows, about 220 px) and the pane's scroll height ran that far
// past its content, on every card with a chart. A visually hidden box must be a block box, which obeys its 1 px and its overflow: so every `.sr-only` rule declares `display: block`, whatever sheet wins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCss, stylesheets, splitSel } from './css-parse.ts';

const val = (r: { decls: { prop: string; value: string }[] }, p: string) => r.decls.filter((d) => d.prop === p).pop()?.value;

test('every .sr-only rule is an absolutely placed 1 px block that clips its overflow, so a table (or any box) with that class takes no room', () => {
  const rules = stylesheets().flatMap(([file, css]) => parseCss(file, css)).filter((r) => splitSel(r.sel).some((s) => /(^|[\s>])(table)?\.sr-only$/.test(s)));
  assert.ok(rules.length >= 3, `the .sr-only rules were not found (${rules.length})`);
  for (const r of rules) {
    const tag = `${r.file} ${r.sel}`;
    assert.equal(val(r, 'display'), 'block', `${tag}: display: block (a table box ignores width, height and overflow)`);
    assert.equal(val(r, 'position'), 'absolute', `${tag}: out of the flow`);
    assert.equal(val(r, 'width'), '1px', `${tag}: width 1px`);
    assert.equal(val(r, 'height'), '1px', `${tag}: height 1px`);
    assert.equal(val(r, 'overflow'), 'hidden', `${tag}: clips what it holds`);
  }
});

test('no other rule gives an .sr-only box a table or flow display back', () => {
  for (const [file, css] of stylesheets()) for (const r of parseCss(file, css)) {
    if (!/\.sr-only\b/.test(r.sel) || /^\.sr-only$/.test(r.sel)) continue;
    const d = val(r, 'display');
    assert.ok(!d || d === 'block', `${file} ${r.sel}: display ${d} would bring the hidden table's height back`);
  }
});

test('the chart still writes its numbers as the sr-only table (the box above must keep covering it)', () => {
  assert.match(readFileSync('src/ui/charts/Chart.tsx', 'utf8'), /<table className="sr-only" data-chart-data="">/);
});
