# Decks R to W (batch B13c)

Sixteen of the 2D app's decks, 207 slides, split by deck id with B13a (A to G) and B13b (H to P): `sites`, `stiffness`, `varices`, `treatment`, `shunts`, `tips-doppler`,
`variceal-bleed`, `two-inflows`, `recompensation`, `where-resistance`, `ten-years`, `tipping`, `same-gradient`, `two-lesions`, `tips-candidacy`, `tips-complete`.

## What is here

| Piece | Where | How it stays true |
|---|---|---|
| Words, every slide field | `src/decks/rw/copied/*.ts` (generated) | `node scripts/port-decks-rw.mjs --from <2D checkout>`; `--check` fails on any difference (the test runs it when `PPS_2D_REPO` is set). Never edit. |
| Camera shot of every slide | `src/decks/rw/cams.ts` | Arithmetic on the shared frame (X = (x − 700)/300, Y = (556 − y)/300): a 2D region, box, list of regions or `{ on: [names] }` becomes a shot; `lobule*` and `sinusoid` are the scene's own shots; Circuit regions pass to B7. Shots register as `rw:<deck>/<slide>` (`registerShots`). |
| Numbers | `src/decks/rw/numbers.ts`, `numbers-node.ts` | The 2D presenter's step chain (outline first, `withOverview`) run through the engine host's `sequence`; `{hvpg}`, `{hvpg:0}`, `{ppg@slide}`, `{>=10 mmHg}`, `{#2}`, `[term](key)` parse to pieces and print as the 2D tiles print. `tests/fixtures/rw-numbers.json` is what the 2D app reads on every slide (`scripts/gen-rw-numbers.mjs`). |
| What each slide needs from other batches | `src/decks/rw/hooks.ts`, `hooks-builtin.ts` | One hook per feature (`tool:criteria`, `lens:flow`, `procedure:tips` …) with its owning batch. A 2D field nobody classified fails the test. What exists today is read from its own tables (lenses, done charts, catheter states, lobule views). |
| One built deck | `src/decks/rw/plan.ts` | `buildDeck(copiedDeck)` gives words (with pieces), placed camera, shot name, hooks, per slide. Nothing 3D is typed by hand. |
| Parity rows | `src/parity/b13c.ts` | 16 `deck:*`, 207 `slide:*` and the 27 `camera:*` rows. Present = words, shot, steps and hooks are in; wired = every hook has landed. |

Run `node scripts/rw-deps.mjs` for what the decks still wait on (`--slides <deck>` per slide).

## For a batch that lands a feature

Your slides start playing when your hook is registered. Either `registerHook('tool:profile')` at module load, or add the id to the table read in `hooks-builtin.ts` (the push that
lands the feature). `tests/decks-rw-hooks.test.ts` then moves exactly the slides that waited for it; nothing else changes. Nothing is offered by the menu until a whole deck can
play (`playable(decks)` in `plan.ts`; the menu spreads it into `PLAYABLE` when B12 plays decks).

Two hooks hold every slide: `presenter:deck` (B12: the presenter plays decks beyond the HVPG slice, with their case cards, data card and quick check) and `engine:steps` (the page runs
a deck's chain on the engine worker, streamed per slide: `EngineClient.request` resolves on the first answer, so it needs a streaming call). The words, numbers and shots do not wait for either.

## Tests (all fast, node only)

`decks-rw-copy` (every slide of the 2D deck is here, in order, the inventory rows all met), `decks-rw-cams` (every camera places; the frame arithmetic; shots registered),
`decks-rw-hooks` (one test per slide: every need has an owner and the claim equals the registry), `decks-rw-words` (every token, term and `@slide` is real),
`decks-rw-numbers` (every `{value}` has a number; `two-lesions` is run live against the 2D numbers; `RW_FULL=1` runs all sixteen, about two minutes, for the Mac).

## Not done here, on purpose

Auto-typesetting in a slide's line (key words in bold, disease names, a first-mention term) belongs to the card's typesetter, not the deck data. Slide-level extras the 2D presenter builds
for its steps (`trail` for the time-lapse graph, `before` for a procedure's undo) are asked of the engine by the features that need them (`time:lapse`, `procedure:*`).
