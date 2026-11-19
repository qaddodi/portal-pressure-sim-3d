# Working instructions for all coding agents (portal-pressure-sim-3d)

The 3D cel-shaded rebuild of the portal pressure simulator. The owner (a hepatologist teaching US physicians) tests every change on
iPhone, iPad and Mac. Read `docs/look-and-feel.md` and `docs/slice-plan.md` first; `docs/interfaces.md` says who owns which folder and
how the pieces plug together.

## The bible (judge every change against all six before calling it done)
1. production level 2. intuitive 3. elegant 4. beautiful 5. humanized 6. performant.
Nothing pops in or out; cards never show before their content and fonts are ready; text never shrinks to fit; nothing scrolls inside a
card. Clinical text is for US physicians: Baveno VIII (never VII) and AASLD.

## Rules that do not bend
- **One clock.** `requestAnimationFrame` is called in `src/clock/frame.ts` and nowhere else (`tests/one-clock.test.ts`). Ask for frames
  with `clock.hold(tag)` / `clock.invalidate(tag)` / `Tweened`; draw through the R3F canvas with `frameloop="never"` and `<ClockBridge/>`.
  Nothing is drawn when nothing moves.
- **Per-frame DOM writes are `transform` and `opacity` only**, written by a clock system, never through React state.
- **The engine copy is never edited.** `src/engine/hales/` and `src/engine/host/` come from `npm run sync:engine` (pinned commits in
  `src/engine/PINNED.json`). Fix the engine in `qaddodi/hales-engine`, then re-sync.
- **Numbers equal the 2D app's** for the same preset (`tests/engine-numbers.test.ts`).
- **Fix bugs at the root cause**, check the whole app for the same bug, add a test.

## How to work (owner's standing rules)
- **No headless browsers, no screenshots, no Playwright** in the cloud. Work from code. Play-tests run on the owner's Mac in the Claude
  desktop app's built-in browser, through a Remote Control thread, only when he asks.
- **No GitHub Actions runners for checks or sweeps.** `.github/workflows/pages.yml` (build and publish only) is the one workflow.
- **Tests are fast and targeted**: `npm run typecheck`, `npm run lint`, `npm test` (node only, about a second). Never a long suite in the cloud.
- **Work on your own branch** `claude/<name>`; merge into the integration branch `claude/project-thread-ge1swr` (it publishes the site);
  never push `main` directly; merge to `main` only when the owner says so.
- **Every push is reported** to the owner: the commit hash, what changed, how to test it, what could still be wrong. Push as soon as a fix works.

## Preview
The integration branch publishes at https://qaddodi.github.io/portal-pressure-sim-3d/ (`/build-info.txt` says which branch and commit).
`?perf` on the address shows the clock's frame times, the slowest frames and who asked for them, with Copy.

## Pages setup (one-time, by the owner, in repo Settings)
- Pages > Source: **GitHub Actions** (a private repository needs a plan that includes Pages for private repos).
- Environments > github-pages > Deployment branches and tags: allow `main` and `claude/*`.

## Tester guides
`public/guides/beta-start-guide.pdf` (Letter) and `beta-start-guide-iphone.pdf` are the beta testers' start guides, served at `/guides/` and `/preview/guides/` under stable names that
testers get as links. They are the 2D app's guides with only the 3D build's words changed: `python3 scripts/copy-guides.py --from <2D checkout>` (table: `scripts/guides-edits.json`,
notes: `docs/guides.md`). When a change alters anything a guide shows or says (buttons, Settings rows, Send feedback, the first steps), update both PDFs in the same push and keep the
file names. The pictures are still the 2D app's until new ones are taken on the Mac. Keep Mohammad's email out of the guides: the address is a build variable only.
