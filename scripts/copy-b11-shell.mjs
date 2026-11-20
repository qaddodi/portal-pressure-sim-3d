#!/usr/bin/env node
// Copies what the Tests card's shell needs from the 2D app (dock.js, seg-glide.js, hand-over.js, stack-plan.js, lazy-pane.js, the sideways phone's rules in app-09-tests.css),
// so none of its rules is retyped (owner, 19 Nov 2026: match 2D 1:1).
//   src/ui/tests/copied/hand-over.copied.js         hand-over.js whole: the hand-over between the side card and the sheet (a turn of the device puts every scroller back to its top)
//   src/ui/tests/copied/stack-plan.copied.js        stack-plan.js whole: the Half height a sheet gives way to under the vessel's card
//   src/ui/tests/copied/hold-until-loaded.copied.js lazy-pane.js holdUntilLoaded: a tab for an instrument still on its way waits for it, the pane it leaves stays up
//   src/ui/tests/copied/seg-glide.copied.js         seg-glide.js whole: the one gliding piece of every segmented control and tab row; its three page helpers are this repo's (src/ui/tests/dock/)
//   src/ui/tests/dock/dock-side.generated.css       the rules of app-09-tests.css that read `:has(#dock.side)` on .app (the sideways phone's play bar ending at the card), as `.app.dock-side`:
//                                                   the 3D card is not inside .app, so the app wears the class instead (src/ui/tests/dock/app-classes.ts)
//   src/ui/shell/topbar-motion.copied.js            topbar-motion.js whole (a button that comes or goes in the top bar fades and grows in or out as a ghost, and what is next to it glides: FLIP on transform and opacity);
//                                                   its four imports are this repo's (the arrive curves, the motion query, and ./topbar-motion-deps.ts for removeSoon and the two glass-morph helpers, which are
//                                                   `false` here: the 3D bar's glass is the page's own backdrop blur, so the plate copies of plateGlide are the way), and the init returns its own stop
// Usage: node scripts/copy-b11-shell.mjs --from <2D checkout> [--check]    (--check writes nothing and fails when a file would change)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
/** The rules of a stylesheet whose selector satisfies `keep`, each with the @media / @supports blocks it stands in. A tiny block parser: comments are dropped, nothing is reordered. */
export function pickRules(css, keep, rewrite) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  const parse = () => {
    const out = [];
    while (i < src.length) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (i >= src.length || src[i] === '}') return out;
      let j = i, depth = 0;
      while (j < src.length && (depth > 0 || (src[j] !== '{' && src[j] !== ';'))) { if (src[j] === '(' || src[j] === '[') depth++; else if (src[j] === ')' || src[j] === ']') depth--; j++; }
      const prelude = src.slice(i, j).trim();
      if (src[j] === ';') { i = j + 1; out.push({ prelude, body: null }); continue; }
      i = j + 1;
      if (prelude.startsWith('@media') || prelude.startsWith('@supports') || prelude.startsWith('@container')) { const kids = parse(); i++; out.push({ prelude, kids }); }
      else { let d = 1, k = i; while (k < src.length && d > 0) { if (src[k] === '{') d++; else if (src[k] === '}') d--; k++; } out.push({ prelude, body: src.slice(i, k - 1).trim() }); i = k; }
    }
    return out;
  };
  const tree = parse();
  const emit = (nodes, pad) => nodes.flatMap((n) => {
    if (n.kids) { const inner = emit(n.kids, pad + '  '); return inner.length ? [`${pad}${n.prelude} {`, ...inner, `${pad}}`] : []; }
    if (n.body == null || !keep(n.prelude)) return [];
    return [`${pad}${rewrite(n.prelude)} { ${n.body.replace(/\s+/g, ' ')} }`];
  });
  return emit(tree, '');
}

// The sideways phone's rules that read the card through :has(#dock.side). Their subject is the play bar (.vdock), a vessel card (.action-card.docked) or the view pill, all inside .app.
// The two that name the card itself (.instrument-workspace.side) stay with the card (src/ui/tests/tests.css places it), since it is not inside .app here.
export function sideRules(css) {
  const keep = (sel) => /:has\(#dock\.side/.test(sel) && !/\.instrument-workspace\.side\s*$/.test(sel);
  const rewrite = (sel) => sel.replace(/:has\(#dock\.side:not\(\[data-state="peek"\]\)\)/g, '.dock-side').replace(/:has\(#dock\.side\)/g, '.dock-side');
  return pickRules(css, keep, rewrite);
}

function main() {
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const from = flag('--from') ?? process.env.PPS_2D_REPO;
const check = args.includes('--check');
if (!from || !existsSync(`${from}/src/ui/dock.js`)) { console.error('usage: copy-b11-shell.mjs --from <2D checkout> [--check]'); process.exit(2); }
let commit = 'unknown';
try { commit = execFileSync('git', ['-C', from, 'rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
const head = (what) => `// GENERATED by scripts/copy-b11-shell.mjs from the 2D app at ${commit} (${what}). Do not edit; run the script again.\n`;
const read = (p) => readFileSync(`${from}/${p}`, 'utf8');

const OUT = {
    'src/ui/tests/copied/hand-over.copied.js': () => head('hand-over.js') + read('src/ui/hand-over.js'),
    'src/ui/tests/copied/stack-plan.copied.js': () => head('stack-plan.js') + read('src/ui/stack-plan.js'),
    'src/ui/tests/copied/hold-until-loaded.copied.js': () => {
      const src = read('src/ui/lazy-pane.js'), at = src.indexOf('/**\n * For a dock: afterLoad');
      if (at < 0) throw new Error('lazy-pane.js: holdUntilLoaded moved; update scripts/copy-b11-shell.mjs');
      return head('lazy-pane.js holdUntilLoaded') + src.slice(at);
    },
    'src/ui/tests/copied/seg-glide.copied.js': () => {
      const map = { './ease.js': './ease.copied.js', './rest-pass.js': '../dock/rest-pass.ts', './layout-snap.js': '../dock/layout-snap.ts', './motion.js': './motion.copied.js' };
      const src = read('src/ui/seg-glide.js').replace(/from '(\.\/[\w-]+\.js)'/g, (m, s) => { if (!map[s]) throw new Error(`seg-glide.js imports ${s}, which is not mapped`); return `from '${map[s]}'`; });
      // (2D starts the glide on load for the whole page; here the Tests layer starts it when the free-play UI mounts, and stops it with it.)
      return head('seg-glide.js') + src.replace(/\nlet live = null;[\s\S]*$/, '\nlet live = null;\n/** Starts the one gliding piece for every control on the page (the shell calls it once); returns the stop. */\nexport function runSegGlide(root = document.body) {\n  live?.stop();\n  live = startSegGlide(root);\n  return () => { live?.stop(); live = null; };\n}\n/** Places a control\'s piece now, in the caller\'s task, right after it changed its buttons. Without it the next rest pass does it. */\nexport function glideNow(ctl) { if (ctl) live?.now(ctl); }\n');
    },
    'src/ui/shell/topbar-motion.copied.js': () => {
      const map = { './ease.js': '../tests/copied/ease.copied.js', './class-soon.js': './topbar-motion-deps.ts', './motion.js': '../tests/copied/motion.copied.js', './glass-morph.js': './topbar-motion-deps.ts' };
      let src = read('src/ui/topbar-motion.js').replace(/from '(\.\/[\w-]+\.js)'/g, (m, f) => { if (!map[f]) throw new Error(`topbar-motion.js imports ${f}, which is not mapped`); return `from '${map[f]}'`; });
      // (the page starts it once; here the bar's component starts it and stops it with the bar, so it hands back its stop)
      const tail = "(document.fonts?.ready || Promise.resolve()).then(start, start);\n}";
      if (!src.includes(tail)) throw new Error('topbar-motion.js: the end of initTopbarMotion moved; update scripts/copy-b11-shell.mjs');
      src = src.replace(tail, "let dead = false;\n  (document.fonts?.ready || Promise.resolve()).then(() => { if (!dead) start(); }, () => { if (!dead) start(); });\n  return () => { dead = true; mo.disconnect(); ro.disconnect(); };\n}");
      src = src.replace("if (!bar || !app || !bar.animate) return;", "if (!bar || !app || !bar.animate) return () => {};");
      return head('topbar-motion.js') + src;
    },
    'src/ui/tests/dock/dock-side.generated.css': () => {
      const css = read('styles/app-09-tests.css');
      const rules = sideRules(css);
      if (rules.length < 5) throw new Error(`app-09-tests.css: found ${rules.length} sideways-phone rules, expected 5 or more`);
      return `/* GENERATED by scripts/copy-b11-shell.mjs from the 2D app at ${commit} (styles/app-09-tests.css, the rules that read :has(#dock.side)). Do not edit; run the script again.\n   The 3D card is not inside .app, so .app wears .dock-side while the side card is up (src/ui/tests/dock/app-classes.ts) where the 2D selector asks :has(#dock.side). */\n${rules.join('\n')}\n`;
    },
  };
  
  let bad = 0;
  for (const [file, make] of Object.entries(OUT)) {
    const want = make(), path = root + file, have = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const strip = (t) => t.replace(/at [0-9a-f]+ \(/, 'at X (');
    if (check) { if (strip(have) !== strip(want)) { console.error(`${file} differs from the 2D app`); bad++; } }
    else { mkdirSync(new URL(`../${file}`, import.meta.url).pathname.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(path, want); }
  }
  if (check) { if (bad) process.exit(1); console.log('the shell copies match the 2D app'); } else console.log(`copied the Tests shell files from the 2D app at ${commit}`);
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
