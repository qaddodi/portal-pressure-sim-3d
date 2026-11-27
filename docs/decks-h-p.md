# Decks H to P (batch B13b)

> **Authoring note (superseded in part).** How to write or change a slide is now in [`docs/deck-authoring.md`](deck-authoring.md): one overlay, one loader, one author path, templates and in-talk questions. This page stays as the record of how this batch of decks was copied and what its files do.


Twelve 2D decks whose ids run from H to P, 138 slides: hvpg, hyperdynamic, kidney, landmark-trials, lobule, masld, meso-rex, ncph, next-bleed, outflow,
pregnancy, prehepatic. (Split by id with B13a A to G and B13c R to W; the id is the rule, not the title.)

| Piece | File | What it does |
|---|---|---|
| Copy | `scripts/port-decks-hp.mjs --from <2D checkout> [--check] [--numbers]` | Writes `src/decks/hp/data/<id>.copied.ts` (every field of every slide, verbatim), `regions.copied.ts`, `ids.copied.ts`; `--numbers` writes `tests/fixtures/decks-hp-numbers.json` (the 2D engine's reading of every slide and how each `{token}` prints). Words are never retyped. |
| Camera | `src/decks/hp/cams.ts` | A 2D `cam` (region, box, list, `fit`, lobule or sinusoid) becomes a scene `Shot` in the shared body frame; the room solver fits it into the room the cards leave. |
| Needs | `src/decks/hp/hooks.ts` | Each slide's needs (a tool, a visual, a procedure, a lens, callouts, compare, a slider, a time-lapse…) as features with ONE owner batch and a `landed` flag. Slide is present when words, numbers and shot are here, wired when all its needs have landed. `tests/decks-hp-data.test.ts` fails a need nobody owns and a landing whose file is missing. |
| Plan | `src/decks/hp/plan.ts` | Per slide: shot, view, lens, stations, model step, needs. All derived from the copied fields. |
| Numbers | `src/decks/hp/numbers.ts`, `calc.ts` | The 2D presenter's step chain (outline first, then every slide), run in a second engine worker; a slide's `{tokens}` print as 2D prints them. Tiles card: `src/ui/cards/TilesCard.tsx` on the 2D tile markup, its numbers and ratings `src/ui/cards/tiles-2d.ts`. |
| Claims | `src/parity/b13b.ts` | `deck:` and `slide:` rows, wired from `readiness`. Camera rows are B13c's. |

Tests: `node --test tests/decks-hp-data.test.ts tests/decks-hp-numbers.test.ts` (seconds). `DECKS_HP_FULL=1` replays all 138 slides through the pinned engine (about a minute; for the Mac).
After a 2D deck changes: `node scripts/port-decks-hp.mjs --from <2D> --numbers`, then the tests.

## Playing them (phase 2)

- `src/decks/hp/deck.ts` turns a copied deck into the schema's `Deck` (`numbers: 'states'`): words as copied, `scene` (camera, view, lens, labels, terms) from `plan.ts`, equations parsed, tiles spec, catheter carried over a `cathKeep` slide.
- The other eleven decks register lazily (`registry.ts` `registerLazyDeck`, `hp/register.ts`): the menu knows their id and slide count; the data chunk loads when the talk opens (`startTalk` opens it as soon as it is in).
- The HVPG deck is all 13 slides in the 2D order (`hvpg.ts`), but for the PPG slide, which plays after the two EUS slides (owner, 27 Nov 2026: `MOVE_AFTER` in `scripts/source-edits.mjs`; the 2D numbers, the inventory and `tests/fixtures/slide-frames-today.json` stay in the 2D order or its keys and are joined to the talk by slide id through `scripts/play-order.mjs`); the four slice slides keep their plates, and its quick check stays the slice's two questions (see hand-off).
- Numbers: `hp/link.ts` prints the state of the slide on show (and `{key@slide}` states), and eases the live figure to that slide's snapshot.
- Tiles card: `src/ui/cards/TilesCard.tsx` (the 2D tile: name, number and unit, rating word and colour, scale bar, "from" line; an instrument card's readings stand in its header). `tests/tiles-2d.test.ts` holds every tile of decks H to P to `tests/fixtures/tiles-2d.json` (`node scripts/gen-tiles-2d.mjs --from <2D checkout>`). A slide that needs a feature that has not landed keeps its words, shot and numbers and is listed by `hooks.ts`.

## Hand-off (not done)

- Every `needs` hook listed in `hooks.ts` (B3, B5, B6, B8, B10, B11, B12).
- A play-test on the Mac (decks open, slide-to-slide morph, tiles card, lobule-camera slides).
- Decks are copied in three layouts (ag, hp, rw): unify into one folder.
