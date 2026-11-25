import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkflow } from './workflow-yaml.ts';

test('the workflow reader gives maps, lists, [a, b] lists, | blocks and quoted scalars, and skips comments', () => {
  const doc = parseWorkflow([
    '# a header',
    'on:',
    '  push:',
    '    branches: [main, claude/x]',
    '  workflow_dispatch:',
    'jobs:',
    '  one:',
    '    runs-on: ubuntu-24.04',
    '    steps:',
    '      # a step comment',
    '      - uses: actions/checkout@v4',
    '        with:',
    '          path: |',
    '            a/b',
    '            c/d',
    '          key: "k-${{ x }}"',
    '      - name: Run it',
    '        run: echo hi',
    '      - plain',
    '  two:',
    '    needs: one',
  ].join('\n'));
  assert.deepEqual(doc, {
    on: { push: { branches: ['main', 'claude/x'] }, workflow_dispatch: '' },
    jobs: {
      one: { 'runs-on': 'ubuntu-24.04', steps: [{ uses: 'actions/checkout@v4', with: { path: 'a/b\nc/d\n', key: 'k-${{ x }}' } }, { name: 'Run it', run: 'echo hi' }, 'plain'] },
      two: { needs: 'one' },
    },
  });
});

test('the workflow reader refuses what it cannot read rather than guessing', () => {
  assert.throws(() => parseWorkflow('jobs:\n  a: b\n   c d'));
});
