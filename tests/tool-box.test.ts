// A slide's chart sits in 2D's tool box (`.pz-tool[data-kind]`, presenter-tools.js): the lifted rules size and fit each chart family by the kind on it (owner, 20 Nov: fix the root cause everywhere).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { toolBoxKind } from '../src/ui/talk/tool-box.ts';

test('the box carries the slide\'s tool kind; the procedure\'s graph is the flow-time box; no tool, no box', () => {
  assert.equal(toolBoxKind({ tool: { kind: 'profile' } }), 'profile');
  assert.equal(toolBoxKind({ tool: { kind: 'scope' } }), 'scope');
  assert.equal(toolBoxKind({ tool: { kind: 'evgraph' } }), 'flowtime');
  assert.equal(toolBoxKind({}), null);
});

test('the chart is mounted inside it, and the profile and flows boxes are containers one level below the card as in 2D', () => {
  assert.match(readFileSync('src/ui/talk/ToolCard.tsx', 'utf8'), /className="pz-tool" data-kind=\{kind\}/);
  assert.match(readFileSync('src/ui/deck-ui.css', 'utf8'), /\.pz-data > \.dk-in > \.pz-tool:is\(\[data-kind="profile"\], \[data-kind="flows"\]\) \{ container-type: inline-size; \}/);
});
