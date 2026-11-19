// Send feedback carries the short report (batch B14): the draft keeps its details, the report is capped, the whole mailto link stays one a mail app takes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feedbackHref, feedbackBase } from '../src/ui/shell/feedback.ts';
import { shortReport, SHORT_MAX, MAILTO_MAX } from '../src/ui/debug/core/short.copied.js';

const ctx = { build: 'PREVIEW · abc12345 · 0.1.0', device: 'UA', screen: '390 × 844 at 3×', view: 'https://x.test/p/?preset=csph#x=abc' };
const body = (href: string) => decodeURIComponent(href.split('body=')[1]!);
const finding = (i: number) => ({ rule: `rule-${i}`, what: `something is off in a way that takes a few words to say, number ${i}`, where: `card teach ${i}` });

test('without a report the draft is the plain one (every detail a report needs)', () => {
  const h = feedbackHref('a@b.test', ctx);
  for (const k of ['Build: PREVIEW · abc12345 · 0.1.0', 'Device: UA', 'Screen: 390 × 844 at 3×', 'View: https://x.test/p/?preset=csph#x=abc']) assert.ok(body(h).includes(k));
  assert.equal(body(h), feedbackBase(ctx));
});

test('with a report, the details stay and the findings follow, one line each', () => {
  const short = shortReport({ findings: [finding(1), finding(2)], health: { errors: 2 } });
  assert.match(short, /^Self-checks on this screen: 2 findings\n1\. rule-1: something is off/);
  assert.match(short, /Caught errors: 2$/);
  const b = body(feedbackHref('a@b.test', ctx, short));
  assert.ok(b.startsWith(feedbackBase(ctx)) && b.endsWith(short));
});

test('nothing named is said as such, and a long list is cut with a count of the rest', () => {
  assert.match(shortReport({ findings: [] }), /nothing named/);
  const many = shortReport({ findings: Array.from({ length: 80 }, (_, i) => finding(i)) });
  assert.ok(many.length <= SHORT_MAX);
  assert.match(many, /… and \d+ more in the full report/);
});

test('the whole link is capped: the short report is cut first, the details are kept', () => {
  const huge = 'x '.repeat(20000);
  const h = feedbackHref('a@b.test', ctx, huge);
  assert.ok(encodeURIComponent(body(h)).length <= MAILTO_MAX);
  assert.ok(body(h).startsWith(feedbackBase(ctx)));
});

test('the address stays out of the source: it comes from the build variable only', () => {
  for (const f of ['src/ui/shell/feedback.ts', 'src/ui/shell/send-feedback.ts', 'src/ui/debug/packet/feedback.ts']) assert.ok(!/@[\w-]+\.(com|org|net)/.test(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')), f);
  assert.match(readFileSync(new URL('../src/ui/shell/feedback.ts', import.meta.url), 'utf8'), /VITE_FEEDBACK_EMAIL/);
});

test('the Settings row hands the tap to sendFeedback, which reads the screen once, after the sheet leaves and for at most 2.5 s', () => {
  const row = readFileSync(new URL('../src/ui/settings/SettingsSheet.tsx', import.meta.url), 'utf8');
  assert.match(row, /void sendFeedback\(email\)/);
  const send = readFileSync(new URL('../src/ui/shell/send-feedback.ts', import.meta.url), 'utf8');
  assert.match(send, /FEEDBACK_SHEET_MS/); assert.match(send, /FEEDBACK_READ_MS/); assert.match(send, /Copy the full report/);
});
