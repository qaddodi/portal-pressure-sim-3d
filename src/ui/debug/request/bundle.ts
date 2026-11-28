// The zip every runner writes, the same shape from node, the layout run and the gpu run (so a thread fed a zip never has to learn which tool made it):
//
//   README-FIRST.md        for the thread that will fix it: the rules, how to read the zip, how this run was made, what it could not judge
//   REPORT.md              the build, the request, the seed, the counts, the findings worst first
//   sections/NN-<name>.md  one per feature, talk, case, or group of code checks: every item, its state, its checks, its findings
//   findings.json          one entry per finding: stable id, rule, severity, owner file, where, how to reproduce
//   manifest.json          schema version, build, request, seed, runner, device, every item and picture
//   pictures/              when the runner can take them (node cannot)
//
// Pure: a run's result in, the files' text out (`bundleFiles`). `zipBytes` joins them into the zip with the repo's own writer (ui/capture/zip.ts); the node runner and the page both use it.
import { zipParts, type ZipFile } from '../../capture/zip.ts';
import { RUNNER_WORDS, type CheckId } from './grammar.ts';
import { SEVERITIES, type Finding, type Severity } from './finding.ts';
import type { Scope } from './resolve.ts';
import type { Comparison } from './compare.ts';

export const SCHEMA = 1;

export type State = 'pass' | 'fail' | 'not-run' | 'n/a';
export interface Item {
  /** the section it is in: `feature:junctions`, `deck:shunts`, `case:hist-bleed`, `code`, `scene` */
  section: string;
  id: string;
  label: string;
  /** each check's state on this item: only the checks that were asked for */
  checks: Partial<Record<CheckId, State>>;
  /** the ids of its findings */
  findings: string[];
  /** lines printed under the section's table for this item (a picture's path, its state, how to reopen it, each check in words) */
  detail?: string[];
}
export interface CheckRun { id: CheckId; ran: boolean; why?: string; seconds: number; summary: string }
export interface RunInfo {
  build: { commit: string; branch: string; engine: string; dirty: boolean };
  runner: string;
  startedAt: string;
  seconds: number;
  device: string;
}
export interface RunResult {
  info: RunInfo;
  scope: Scope;
  checks: CheckRun[];
  items: Item[];
  findings: Finding[];
  /** how this run was made, and what that does to how far it can be trusted (speed, parallel, what was cut) */
  validity: string[];
  /** what this run could not judge, one line each */
  notJudged: string[];
  /** picture paths inside the zip (`pictures/...`) */
  pictures: string[];
  /** against the last run of the same request, when there was one (compare.ts) */
  comparison?: Comparison;
  /** a section's title when it is not one the names below make (`pictures:moves`) */
  titles?: Record<string, string>;
  /** how to ask for this run again, when it is not `npm run audit` (a page's address); one line each */
  again?: string[];
}
export interface BundleFile { name: string; text: string }

const slug = (s: string): string => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
/** `sections/NN-<name>.md` for each section, in the order the items first name them, features first, then talks, cases, scene, code. */
export function sectionNames(items: readonly Item[], titles: Record<string, string> = {}): { section: string; file: string; title: string }[] {
  const rank = (s: string) => ['feature', 'deck', 'case', 'pictures', 'scene', 'code'].indexOf(s.split(':')[0]!);
  const seen: string[] = [];
  for (const it of items) if (!seen.includes(it.section)) seen.push(it.section);
  const sorted = seen.map((s, i) => ({ s, i })).sort((a, b) => (rank(a.s) < 0 ? 9 : rank(a.s)) - (rank(b.s) < 0 ? 9 : rank(b.s)) || a.i - b.i).map((x) => x.s);
  return sorted.map((section, i) => {
    const [k, ...rest] = section.split(':'), id = rest.join(':');
    const kind = { feature: 'Feature', deck: 'Talk', case: 'Case' }[k as string] ?? k;
    const title = titles[section] ?? (id ? `${kind} ${id}` : section === 'code' ? 'Code checks (typecheck, lint)' : section === 'scene' ? 'The scene audit' : section);
    return { section, file: `sections/${String(i + 1).padStart(2, '0')}-${slug(section)}.md`, title };
  });
}

const count = (fs: readonly Finding[]): Record<Severity, number> => Object.fromEntries(SEVERITIES.map((s) => [s, fs.filter((f) => f.severity === s).length])) as Record<Severity, number>;
const sevLine = (c: Record<Severity, number>): string => SEVERITIES.map((s) => `${c[s]} ${s}`).join(', ');
/** `new` or `still there` for a finding, when this run was compared with an earlier one. */
const statusOf = (r: RunResult, id: string): string => (!r.comparison ? '' : r.comparison.new.includes(id) ? 'new' : r.comparison.still.includes(id) ? 'still there' : '');
const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
const MARK: Record<State, string> = { pass: 'pass', fail: 'FAIL', 'not-run': 'not run', 'n/a': '-' };

const comparisonCounts = (c: Comparison) => ({ new: c.new.length, still: c.still.length, fixed: c.fixed.length, unverified: c.unverified.length });

/** The part of REPORT.md that says what changed since the last run of the same request. */
function comparisonMd(c: Comparison): string[] {
  const a = c.against, L: string[] = ['## Since the last run', ''];
  const other = c.sameRequest ? '' : `; ANOTHER request: ${a.request}`;
  const file = a.zip.replace(/^.*\//, ''), many = `${a.findings} finding${a.findings === 1 ? '' : 's'}`;
  L.push(`Compared with \`${file}\` (build \`${a.build.slice(0, 8)}\`, ${a.startedAt}, ${many}${other}).`, '');
  L.push(`- **${c.new.length} new**${c.new.length ? `: ${c.new.join(', ')}` : ''}`, `- **${c.still.length} still there**`, `- **${c.fixed.length} fixed**${c.fixed.length ? ':' : ''}`);
  for (const f of c.fixed) L.push(`  - ${f.id} (${f.severity}, ${f.check}): ${cell(f.target)}`);
  if (c.unverified.length) {
    L.push(`- **${c.unverified.length} gone but not shown fixed** (this run cannot say):`);
    for (const u of c.unverified) L.push(`  - ${u.finding.id} (${u.finding.check}): ${cell(u.finding.target)}: ${u.why}`);
  }
  return L;
}

function reportMd(r: RunResult): string {
  const { scope: s, info } = r, c = count(r.findings);
  const L: string[] = [];
  L.push(`# Audit report`, '');
  L.push(`- Request: \`${s.line}\``);
  L.push(`- Runner: ${RUNNER_WORDS[s.runner]}`);
  const engine = info.build.engine ? `; engine \`${info.build.engine.slice(0, 8)}\`` : '', branch = info.build.branch ? ` on \`${info.build.branch}\`` : '';
  L.push(`- Build: \`${info.build.commit.slice(0, 8)}\`${branch}${info.build.dirty ? ' (with uncommitted changes)' : ''}${engine}`);
  L.push(`- Run: ${info.startedAt}, ${Math.round(info.seconds)} s, ${info.device}`);
  if (s.random) {
    const again = `random:${s.random.n}@${s.random.seed}${s.random.spread ? '/deck' : ''}`;
    const how = `${s.random.n} slides, seed ${s.random.seed}${s.random.spread ? ', spread over the talks' : ''}`;
    L.push(`- Random: ${how}. Ask for the same slides again with \`${again}\`. Slides: ${s.random.picked.join(', ')}`);
  }
  const scopeParts = [
    s.features.length ? `features ${s.features.join(', ')}` : '', `${s.decks.length} talk${s.decks.length === 1 ? '' : 's'}, ${s.slides.length} slides`,
    s.cases.length ? `cases ${s.cases.join(', ')}` : '', s.lenses.length ? `lenses ${s.lenses.join(', ')}` : '', s.looks.length ? `looks ${s.looks.join(', ')}` : '', `sizes ${s.sizes.join(', ')}`,
  ];
  L.push(`- Scope: ${s.all ? 'the whole app' : scopeParts.filter(Boolean).join('; ')}`, '');
  L.push(`## Result: ${r.findings.length ? `${r.findings.length} finding${r.findings.length === 1 ? '' : 's'} (${sevLine(c)})` : 'no findings'}`, '');
  L.push('| Check | Ran | Seconds | What it found |', '|---|---|---|---|');
  for (const k of r.checks) L.push(`| ${k.id} | ${k.ran ? 'yes' : 'no'} | ${k.ran ? k.seconds.toFixed(1) : '-'} | ${cell(k.ran ? k.summary : k.why ?? 'not run')} |`);
  L.push('');
  if (r.comparison) L.push(...comparisonMd(r.comparison), '');
  if (r.findings.length) {
    const st = !!r.comparison;
    L.push('## Findings, worst first', '', `| Id | ${st ? 'Since last run | ' : ''}Severity | Check | About | What |`, `|---|${st ? '---|' : ''}---|---|---|---|`);
    for (const f of r.findings) L.push(`| ${f.id} | ${st ? `${statusOf(r, f.id)} | ` : ''}${f.severity} | ${f.check} | ${cell(f.target)} | ${cell(f.message.slice(0, 220))} |`);
    L.push('', 'Each finding in full (owner file, where, how to see it again) is in `findings.json`, and under its section in `sections/`.', '');
  }
  const names = sectionNames(r.items, r.titles);
  if (names.length) {
    L.push('## Sections', '');
    for (const n of names) {
      const mine = r.items.filter((i) => i.section === n.section);
      L.push(`- [${n.title}](${n.file}): ${mine.length} items, ${new Set(mine.flatMap((i) => i.findings)).size} findings`);
    }
    L.push('');
  }
  return `${L.join('\n')}\n`;
}

function sectionMd(r: RunResult, section: string, title: string): string {
  const items = r.items.filter((i) => i.section === section), byId = new Map(r.findings.map((f) => [f.id, f]));
  const checks = r.scope.checks.filter((k) => items.some((i) => i.checks[k] && i.checks[k] !== 'n/a'));
  const L: string[] = [`# ${title}`, ''];
  L.push(`Request: \`${r.scope.line}\`. ${items.length} items.`, '');
  L.push(`| Item | ${checks.join(' | ')} | Findings |`, `|---|${checks.map(() => '---|').join('')}---|`);
  for (const i of items) L.push(`| ${cell(i.label)} | ${checks.map((k) => MARK[i.checks[k] ?? 'n/a']).join(' | ')} | ${i.findings.join(', ') || '-'} |`);
  L.push('');
  const detailed = items.filter((i) => i.detail && i.detail.length);
  if (detailed.length) {
    L.push('## Items in full', '');
    for (const i of detailed) L.push(`### ${i.label}`, '', ...i.detail!.map((d) => `- ${d}`), '');
  }
  const fs = items.flatMap((i) => i.findings).filter((id, k, a) => a.indexOf(id) === k).map((id) => byId.get(id)).filter((f): f is Finding => !!f);
  if (fs.length) {
    L.push('## Findings', '');
    for (const f of fs) {
      const st = statusOf(r, f.id);
      L.push(`### ${f.id} (${f.severity}, ${f.check}${st ? `, ${st}` : ''}): ${f.target}`, '', f.message, '');
      L.push(`- Rule: \`${f.rule}\``, `- Owner: ${f.owner || 'not named'}`, `- Where: ${f.where || '-'}`, `- See it again: \`${f.repro}\``, '');
    }
  }
  return `${L.join('\n')}\n`;
}

function readmeMd(r: RunResult): string {
  const s = r.scope;
  const L = [
    '# Read this first',
    '',
    `This zip is an audit of the 3D portal pressure simulator, made by **${s.runner}** from the request \`${s.line}\`.`,
    'It is written for the thread that will fix what it found. The same zip layout comes from every runner (node, layout, gpu), so what follows holds for all of them.',
    '',
    '## Rules that hold when you fix anything here',
    '',
    '- Fix at the root cause, in the shared place, then look for the same cause everywhere (every slide, deck, view and screen size) and add a test that pins the general rule (rule #1; AGENTS.md).',
    '- Never run a headless browser or a GPU capture without the owner\'s OK each time. This zip needed none if the runner says `node`.',
    '- Do not run the whole test suite in the cloud: re-run the files a finding names (`node --test tests/<file>`), then `npm run pre-push`.',
    '- Numbers move only through `npm run gen:departures`, never by hand. Clinical words and numbers that move are the owner\'s to rule on: name them to him, do not decide.',
    '',
    '## How to read it',
    '',
    '1. `REPORT.md`: the build, the request, the seed, the counts, every finding worst first.',
    '2. `findings.json`: one entry per finding. Its `id` (F-xxxxxx) is made from the rule, what it is about and which way it fails,',
    '   never from a line number or a time, so the same fault has the same id in the next run. Say "F-3a91c2 is fixed", not "the third one".',
    '   When the run was compared with the last run of the same request, REPORT.md says which findings are new, still there or fixed, and findings.json carries `status` and `comparison`.',
    '3. `sections/`: one file per feature, talk, case or group of code checks, with every item and its state per check.',
    '4. `manifest.json`: the build, the request, the scope, every item and picture, for a program.',
    '',
    '## Before you trust a finding',
    '',
    'Check each finding is real for how this run was made. A past audit\'s 4,900 flags were nearly all artefacts of how it was run (speed, parallel frames, a page that was not still), so:',
    '',
    ...(r.validity.length ? r.validity.map((v) => `- ${v}`) : ['- (this runner stated nothing)']),
    '',
    '## What this run could not judge',
    '',
    ...(r.notJudged.length || s.skipped.length ? [...s.skipped.map((k) => `- ${k.check}: asked for, not done: ${k.why}.`), ...r.notJudged.map((v) => `- ${v}`)] : ['- (nothing named)']),
    '',
    '## Run it again',
    '',
    ...(r.again ?? [`\`npm run audit -- "${s.line}"\` (node, no browser, no approval).`, 'The same line is the request for the other runners.']),
    ...(s.random ? [`The random slice is fixed by its seed (${s.random.seed}).`] : []),
    '',
    `Schema ${SCHEMA}. Build \`${r.info.build.commit.slice(0, 8)}\`.`,
  ];
  return `${L.join('\n')}\n`;
}

/** Every file of the zip as text, in zip order. Pure. */
export function bundleFiles(r: RunResult): BundleFile[] {
  const names = sectionNames(r.items, r.titles);
  const out: BundleFile[] = [
    { name: 'README-FIRST.md', text: readmeMd(r) },
    { name: 'REPORT.md', text: reportMd(r) },
    ...names.map((n) => ({ name: n.file, text: sectionMd(r, n.section, n.title) })),
    {
      name: 'findings.json',
      text: `${JSON.stringify({
        schema: SCHEMA, request: r.scope.line, build: r.info.build.commit,
        findings: r.findings.map((f) => (r.comparison ? { ...f, status: r.comparison.new.includes(f.id) ? 'new' : 'still' } : f)),
        ...(r.comparison ? { comparison: r.comparison } : {}),
      }, null, 1)}\n`,
    },
    {
      name: 'manifest.json',
      text: `${JSON.stringify({
        schema: SCHEMA, request: r.scope.line, runner: r.scope.runner, build: r.info.build, startedAt: r.info.startedAt, seconds: Math.round(r.info.seconds), device: r.info.device,
        scope: { all: r.scope.all, features: r.scope.features, decks: r.scope.decks, slides: r.scope.slides, cases: r.scope.cases, lenses: r.scope.lenses, looks: r.scope.looks, sizes: r.scope.sizes },
        random: r.scope.random, checks: r.checks, skipped: r.scope.skipped,
        items: r.items.map((i) => ({ section: i.section, id: i.id, label: i.label, checks: i.checks, findings: i.findings })),
        sections: names, pictures: r.pictures,
        counts: { findings: r.findings.length, ...count(r.findings) },
        comparison: r.comparison ? { against: r.comparison.against, ...comparisonCounts(r.comparison) } : null,
      }, null, 1)}\n`,
    },
  ];
  return out;
}

/** The files as a zip (stored, the repo's own writer). `at` stamps the entries. */
export function zipBytes(files: readonly BundleFile[], at: Date, extra: readonly ZipFile[] = []): Uint8Array {
  const enc = new TextEncoder();
  const parts = zipParts([...files.map((f) => ({ name: f.name, data: enc.encode(f.text) })), ...extra], at);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
