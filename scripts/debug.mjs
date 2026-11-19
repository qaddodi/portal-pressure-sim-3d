// One command for every debug tool: `npm run debug -- <verb> ...` (the 2D app's scripts/debug.mjs, with the verbs the 3D app has). Node only: nothing here opens a browser
// (owner's rule: no headless runs; the play-tests and the sweeps run on his Mac in the Claude desktop browser, and `links` prints exactly what to open there).
//
//   npm run debug                                         this list
//   npm run debug -- rules [--family fit] [--json]        every self-check rule with its owner file and why
//   npm run debug -- limits [--json]                      the owner's standing numbers the judges hold the screen to (12 px, 1.4x, 4.5:1 ...)
//   npm run debug -- flags [--json]                       every address flag, where it works and what it does
//   npm run debug -- report show|compare <file | ->       any tool's report block, a bug packet or a replay: show it, or compare two (before, after)
//   npm run debug -- packet show <file | ->               a bug packet pasted into a file (or stdin): its text, its findings, whether it arrived whole
//   npm run debug -- packet link <address>                what a state link puts back: the patient, talk and slide, look, camera, vessel and sliders
//   npm run debug -- links [--base <url>] [--sweep <specs>] [--look a,b] [--only ids]   the preview addresses to open on the Mac (debug page, Phone check, Full check, Sweep, device frames)
//   npm run debug -- test                                 the debug, a11y and feedback unit tests (node only, about a second)
//   npm run debug -- scan                                 the node-only lint (scripts/lint.mjs)
//   npm run debug -- doc [--check]                        regenerate (or check) the tables of docs/debug.md from the rules, limits and flags
//
// `--print` after a verb that runs another script shows the command and runs nothing. Never run a sweep on GitHub Actions or in the cloud: a Sweep, Phone check or Full check is a link
// on the owner's Mac. (A 2D-only verb, `sweep decks|specimens|turns`, drives a headless browser there and has no 3D counterpart on purpose: `links` replaces it.)
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PREVIEW = 'https://qaddodi.github.io/portal-pressure-sim-3d/preview/';

/** The command a verb runs when it is a front for another script: [{ file, args }], run one after another. Pure (tests/debug-command.test.ts). null for a verb that is not one. */
export function plan(verb, args = []) {
  switch (verb) {
    case 'scan': return [{ file: 'lint.mjs', args }];
    case 'doc': return [{ file: 'debug-doc.mjs', args }];
    case 'test': return [{ node: ['--test', ...testFiles()] }];
    default: return null;
  }
}
/** The fast tests this command runs. */
export const testFiles = () => readdirSync(resolve(ROOT, 'tests')).filter((f) => /^(debug-.*|a11y.*|feedback-short)\.test\.ts$/.test(f)).sort().map((f) => `tests/${f}`);

/** The addresses to open on the Mac. Pure.
 * @param {{ base?: string, sweep?: string | null, look?: string, only?: string }} [o] */
export function links({ base = PREVIEW, sweep = null, look = '', only = '' } = {}) {
  const b = base.endsWith('/') || base.includes('?') ? base : `${base}/`;
  const enc = (v) => encodeURIComponent(v).replace(/%2C/g, ',').replace(/%3A/g, ':');
  // (a bare flag is written bare: `?debug&sweep`, as the page reads it)
  const addr = (...parts) => `${b}?${parts.filter(Boolean).join('&')}`;
  const opt = (k, v) => (v ? `${k}=${enc(v)}` : '');
  const out = [
    ['Debug page (Report, Browse, Tools)', addr('debug')],
    ['Phone check (views, sheets, HVPG slides, patients)', addr('debug=check', opt('only', only))],
    ['Full check (adds the first three talks; reads the memory estimate)', addr('debug=full', opt('only', only))],
    ['Sweep: one of each specimen', addr('debug', 'sweep', opt('look', look))],
  ];
  if (sweep) out.push([`Sweep: ${sweep}`, addr('debug', `sweep=${enc(sweep)}`, opt('look', look))]);
  for (const d of ['iphone', 'iphone-landscape', 'ipad', 'ipad-portrait', 'mac']) out.push([`Device frame: ${d}`, addr('debug=frame', `device=${d}`)]);
  out.push(['Motion recorder on any page', addr('watch')], ['Frame times (Copy puts the slowest frames on the clipboard)', addr('perf')], ['Progress against 2D', addr('parity')], ['Charts gallery', addr('charts')]);
  return out.map(([label, url]) => ({ label, url }));
}

const argv = process.argv.slice(2);
const verb = argv[0], rest = argv.slice(1);
const print = rest.includes('--print');
const args = rest.filter((a) => a !== '--print');
const flagArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = (n) => args.includes(n);

const readInput = (f) => (f && f !== '-' ? readFileSync(f, 'utf8') : readFileSync(0, 'utf8'));

async function showRules() {
  await import('../src/ui/debug/selfcheck/plugins.ts');
  const { ruleList } = await import('../src/ui/debug/core/rules.copied.js');
  const fam = flagArg('--family') ?? '';
  const list = ruleList().filter((r) => !fam || r.family === fam);
  if (has('--json')) { console.log(JSON.stringify(list, null, 1)); return 0; }
  console.log(`${list.length} rule${list.length === 1 ? '' : 's'}${fam ? ` in family ${fam}` : ''} (id, kind, owner: why)\n`);
  for (const r of list) console.log(`${r.id.padEnd(30)} ${r.kind.padEnd(7)} ${r.owner}: ${r.why}`);
  return 0;
}
async function showLimits() {
  const { LIMITS } = await import('../src/ui/debug/limits.ts');
  if (has('--json')) { console.log(JSON.stringify(LIMITS, null, 1)); return 0; }
  for (const l of LIMITS) console.log(`${l.id.padEnd(20)} ${String(l.value).padEnd(6)} ${l.unit.padEnd(22)} since ${l.since}\n  ${l.rule}\n  Exceptions: ${l.exceptions}`);
  return 0;
}
async function showFlags() {
  const { knownFlags } = await import('../src/ui/debug/flags.ts');
  const list = knownFlags();
  if (has('--json')) { console.log(JSON.stringify(list, null, 1)); return 0; }
  console.log('flag'.padEnd(16), 'gate'.padEnd(8), 'group'.padEnd(10), 'meaning');
  for (const f of list) console.log(`?${f.id}`.padEnd(16), f.gate.padEnd(8), String(f.group || '').padEnd(10), `${f.meaning || ''}${f.alias ? ` (also ?${f.alias})` : ''}`);
  return 0;
}
async function report() {
  const api = await import('../src/ui/debug/core/api.ts');
  const [sub, a, b] = args;
  if (sub === 'show' && a) {
    const r = api.parseReport(readInput(a));
    if (!r.ok) { console.error(`report: ${r.why}`); return 1; }
    console.log(api.renderRun(r.run, { json: false }));
    return 0;
  }
  if (sub === 'compare' && a && b) {
    const x = api.parseReport(readInput(a)), y = api.parseReport(readInput(b));
    for (const [n, r] of [[a, x], [b, y]]) if (!r.ok) { console.error(`report: ${n}: ${r.why}`); return 1; }
    console.log(api.compareRuns(x.run, y.run).lines.join('\n'));
    return 0;
  }
  console.error('usage: debug -- report show <file | -> | report compare <before> <after>');
  return 2;
}
async function packet() {
  const [sub, a] = args;
  if (sub === 'show' && a) {
    const { parsePacket, packetText } = await import('../src/ui/debug/core/packet.copied.js');
    const r = parsePacket(readInput(a));
    if (!r.ok) { console.error(`packet: ${r.why}`); return 1; }
    console.log(packetText(r.packet));
    return 0;
  }
  if (sub === 'link' && a) {
    const { readStateLink } = await import('../src/ui/debug/packet/state.ts');
    console.log(JSON.stringify(readStateLink(a), null, 2));
    return 0;
  }
  console.error('usage: debug -- packet show <file | -> | packet link <address>');
  return 2;
}
function showLinks() {
  const list = links({ base: flagArg('--base') ?? PREVIEW, sweep: flagArg('--sweep'), look: flagArg('--look') ?? '', only: flagArg('--only') ?? '' });
  console.log('Open these on the Mac (Claude desktop built-in browser). Nothing runs in the cloud.\n');
  for (const l of list) console.log(`${l.label}\n  ${l.url}`);
  return 0;
}
function help() {
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
  console.log(src.slice(0, src.findIndex((l, i) => i > 0 && !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  return verb ? 2 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let code;
  if (verb === 'rules') code = await showRules();
  else if (verb === 'flags') code = await showFlags();
  else if (verb === 'limits') code = await showLimits();
  else if (verb === 'report') code = await report();
  else if (verb === 'packet') code = await packet();
  else if (verb === 'links') code = showLinks();
  else if (verb === 'help' || verb === '--help' || !verb) code = help();
  else {
    const steps = plan(verb, args);
    if (!steps) { console.error(`debug: no verb "${verb}".\n`); help(); code = 2; }
    else {
      code = 0;
      for (const s of steps) {
        const cmd = s.node ? [...s.node] : [resolve(ROOT, 'scripts', s.file), ...s.args];
        if (print) { console.log(`node ${s.node ? s.node.join(' ') : `scripts/${s.file}${s.args.length ? ` ${s.args.join(' ')}` : ''}`}`); continue; }
        const r = spawnSync(process.execPath, cmd, { stdio: 'inherit', cwd: ROOT });
        if (r.status) code = r.status;
      }
    }
  }
  process.exit(code);
}
