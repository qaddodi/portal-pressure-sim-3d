# One audit: one request, one zip, three runners

Decided 28 Nov 2026 (external review, section 4, option 1; owner chose it). Every tool that audits the app keeps working; this puts one front and one back on them, so "audit the junctions" means the same thing in every tool and the answer always comes back as the same zip.

## The request

One line, read by `src/ui/debug/request/grammar.ts` (pure; node, the page and the tests all import it):

```
<what> [checks=<a,b,...>] [runner=<node|layout|gpu>]

what   = part { "+" part }
         app | deck:<id> | slide:<deck>:<n> | case:<id> | lens:<id> | look:<id> | layout:<size> | feature:<name> | random:<n>@<seed>[/deck]
checks = layout motion numbers junctions perf a11y pictures types lint     (left out: every check the runner can do)
```

Examples: `feature:junctions`, `feature:junctions+layout:iphone`, `deck:tips-complete+look:dark`, `slide:tips-complete:17`, `random:12@4471`, `random:12@4471/deck` (one slide at a time from each talk in a seeded order, so it spreads over as many talks as it can), `app checks=numbers,perf`.

- A slide is counted from 1 (the title is 0 and is not a slide), as in the capture's `pick=`.
- `random` is the capture's own seeded generator (`audit/capture-pick.ts`): the seed gives the same slides in every runner, today and next month. The seed is an input and is printed in the report.
- A part the grammar does not know is an error that names it and lists what it could have been. Nothing is guessed.
- A `feature` is a row of `src/ui/debug/request/features.ts`: its talks and slides, lenses, source folders and the repo's node tests. `tests/audit-request.test.ts` checks every name in the table exists. A new feature is a new row.

## The zip (the same from every runner)

```
README-FIRST.md        for the thread that will fix it: the rules, how to read the zip, how valid the run is, what it could not judge
REPORT.md              build, request, seed, counts, checks (ran or not), findings worst first
sections/NN-<name>.md  one per feature, talk, case, the scene audit and the code checks: every item, its state per check, its findings in full
findings.json          one entry per finding: id, rule, check, severity, target, owner, where, message, repro, section
manifest.json          schema, build, request, scope, seed, runner, device, every item and picture
pictures/              when the runner can take them (node cannot)
```

`bundle.ts` writes it (`bundleFiles`, `zipBytes`, using the capture's own zip writer). A check the runner did not do is a row that says `no` and why; it is never a pass.

A **finding id** (`F-xxxxxx`) is the first six hex digits of FNV-1a over rule, target and state (`finding.ts`): never a line number, a duration, a picture name or the run's time, and the numbers in an error text are taken out of the state. The same fault has the same id in the next run. Two alike get `.2`, `.3`.

## The runners

| runner | what | how |
|---|---|---|
| **node** | no browser, no GPU, no approval; the typecheck, lint and scene audit take about 15 s, the tests of a feature take as long as they take (`feature:ascites` 25 s in all, `feature:junctions` about 9 minutes on 4 cores in the cloud: the skin tests are slow) | `npm run audit -- "<request>"` (`scripts/audit.mjs`): the repo's node tests for the request's features (`scripts/audit/tests.mjs`, node's own test runner), the node scene audit (`scene-audit.mjs --json`: pops, stuck eases, slowest frame, rebuilds), the typecheck and the lint. Writes the zip to `/mnt/project-files/audits/` when that folder exists, else `./audits/` (ignored by git); `--out <dir>`, `--dir`, `--print`, `--json`, `--jobs <n>`. |
| **layout** | today's `npm run layout-check` | one approved headless run each time. Not yet taught the request. |
| **gpu** | today's `?audit` and `?stress` on the person's own device | pictures and motion. `?stress` and the capture read the request from the address (below). |

Which test files a request runs (`plan.ts`): a feature runs its own; a check no named feature serves runs its base feature only when the request names that check or is `app`, except `numbers` for a request of talks and slides, because the numbers replay is the one node check that reads slides (with `DECKS_HP_FULL` or `RW_FULL` for the families of the named talks). Never the whole suite. A test file is never narrowed by slide, so a finding names a test, not a slide.

What the node runner cannot judge is written into every README-FIRST: pictures, the real page's card sizes (it runs the node layout tests, not the page), lenses and looks, cases, and whether a moved number crosses a clinical cut-off.

## The request in an address (step b)

One flag, `req`, holds the whole line (`src/ui/debug/request/address.ts`; write `+` as `%2B`, a raw `+` is read back as one):

- `?stress&req=feature:junctions` takes that feature's slides instead of the key slides, the transitions of its talks, in the layouts of its `layout:` parts (the three stress layouts by default; a size stress does not take is said, not guessed), and leaves the menus and sheets out. At most 40 slides (`MAX_REQUEST_SLIDES`); more is refused with `random:40@<seed>/deck` as the way out. A request that names no slides (`app`) leaves the default plan. The page and each frame read the same address, so a seeded draw is the same slides in both.
- `?audit=frames&capture=1&req=random:10@4471` (the Mac) and `?audit=here&req=...` take the request's slides, and its `layout:` sizes on the Mac.
- The seed is a printed input: the stress page says it before the run, and REPORT.md, manifest.json and the README (`Taken:`) carry the request line, the seed and `random:n@seed` to ask for the same slides again. The capture's own Random 5, 10, 25 buttons now draw from a seed under 2^32 and print it the same way.
- A request that cannot be read stops the page with the reason; it is never guessed.

The stress and capture zips still keep their own layout (pictures by layout, REPORT.md, notes, manifest.json); they carry the request and the seed in it. Writing them in the one format (README-FIRST, sections, findings.json) is not done yet.

## Build order

1. **(a)** request reader, feature table, zip writer, node runner (this).
2. **(b)** `?stress` and the capture read the request, with the seed as a printed input (this, second push).
3. **(c)** stable ids carried between runs and the comparison with the last run (new, still there, fixed).
