# Writing a deck for the 3D app

One way to author a slide, whoever you are and whichever deck it is in. The built-in decks (42 of them), a script you build in the app, and a deck file you import all play through the
same path and can use the same fields. If a field works on one slide it works on every slide.

The 2D app has its own author guides (`docs/deck-authoring-guide.md`, `docs/deck-authoring-quick-guide.md` and `docs/deck-behavior-vision.md` in the 2D repo). They describe the deck
format itself, which is the same format this app reads. This page covers what is specific to the 3D app: where a slide's fields go, what the 3D app adds, templates, questions for the
room, and how to write your own.

## The one path

```
a deck's source          2D copy (src/decks/*/…copied.ts, never edited by hand)
      │                  or your own script / imported deck file
      ▼
loadSource(id)           src/decks/source.ts     the only place that reads a deck's loader
      ▼
withOverlay(deck)        src/decks/overlay.ts    the 3D additions for built-in slides, keyed "deck/slide"
      ▼
toDeck(deck)             src/decks/hp/deck.ts    the Deck the presenter plays
```

A deck you write yourself goes through `authorDeck` (`src/decks/author.ts`) first, which checks it field by field and then hands it to `toDeck` like any other. Nothing downstream
looks a deck or slide up by name.

## Where a slide's fields go

`FIELD_HOME` in `src/decks/hp/fields.ts` lists every field the format has and which part of the app carries it:

| Home | Meaning | Examples |
|---|---|---|
| `slide` | carried onto the slide and printed by a card | `title`, `line`, `notes`, `ask`, `tiles`, `compare`, `whatIf`, `tool`, `visual`, `interact` |
| `model` | steps the engine runs | `preset`, `params`, `days`, `ramp` |
| `scene` | what the figure is asked for | `cam`, `view`, `lens`, `labels`, `frame` |
| `chart` | read whole by a chart or instrument card | `plane`, `cohort`, `graph`, `milestone` |
| `figure` | marks and glow drawn on the figure | `glow`, `mark`, `callout`, `procedure` |

`tests/deck-card-fields.test.ts` reads every slide of every deck and fails on a field this table does not list. A new field is one line here (`unclassified(slide)` lists any field that has no home).

## What the 3D app adds (the overlay)

A built-in deck is copied word for word from the 2D app and never edited, so the 3D app's additions live in `src/decks/overlay.ts`, keyed by `"deck/slide"`, and arrive on the slide as
ordinary fields:

| Field | What it does |
|---|---|
| `also` | a second level tab beside the slide's `site` |
| `frame` | the camera policy of a slide framed on its subject (`overlay/frames.ts`) |
| `scores` | the liver-function card under the criteria (`overlay/scores.ts`) |
| `split` | the split orbit, healthy liver beside this slide's patient |
| `interact` | a question the room answers before the model reveals (below) |

Because they are ordinary fields, **you can write them on a slide of your own** and get the same behaviour. To add one to a built-in slide, add a line to its table in `overlay.ts`.
`tests/deck-overlay.test.ts` fails if a key names a slide that does not exist, if applying the overlay twice changes anything, or if any other table keyed by `deck/slide` appears outside
the overlay.

## Writing your own deck

In the app you can build a script (a patient and its settings per step) or import a deck file. Both are read as data and never run. A script step or a deck slide takes any field in
`FIELD_HOME` plus the overlay fields. A deck file is `{ slides: [...], checks?, sections? }`; a script is `{ id, title, steps: [...] }`.

Whatever the app cannot play is left out and **said in plain words** (`notices`), never dropped quietly: an unknown preset, a tool or visual that does not exist, a catheter state that
is not one of ours, a camera or lens neither app has, a procedure that is not played, an `interact` that cannot be played. If your deck's id is already a built-in deck's, it is saved as
`my-<id>`. Writing a built-in deck out as your own plays as the same slides with no notices; `tests/deck-author.test.ts` holds that for all 42.

## Templates

A slide may say `template: '<name>'` and give a few plain arguments. It is laid out as ordinary fields before any check, so after that it is an ordinary slide. Each template carries its own
description and a worked example in `src/decks/templates.ts` (`TEMPLATES`); `tests/deck-templates.test.ts` plays every example.

| Template | Arguments | Gives you |
|---|---|---|
| `compare` | `patient`, `options`, `tiles`, optional `key`, `delta` | one patient, buttons that switch the live model between states, the readings that change |
| `before-after` | `patient`, `before`, `after`, `tiles`, optional `key` | the same patient before and after one change, a button for each, the change shown |
| `case-question` | `case`, `question`, `answer` | a patient described, one question, the next slide is the answer |

A template that is missing an argument or has a bad one still plays what it can, with a notice saying which argument. **To add a template**: add an entry to `TEMPLATES` with `name`, `what`,
`required`, `optional`, `expand`, and `example`. Nothing else changes.

## Questions inside the talk (`interact`)

```
interact: { prompt, commit, reveal?, back? }
```

The room commits (thinks, chooses, or guesses a number), then the model reveals: the slide that follows, with its readings.

| `commit` | Shape | The card |
|---|---|---|
| `think` | `{ kind: 'think' }` | tap to show the answer |
| `choose` | `{ kind: 'choose', options: [{ text, right?, why }] }` (2 to 4, exactly one `right`) | says whether the pick was right and why; a wrong pick offers `back` to the slide that teaches it |
| `predict` | `{ kind: 'predict', reading, min, max, step?, unit?, tolerance? }` | slide to a guess for one reading; default tolerance 15 % of the range |

`prompt` is the question in the slide's own words, shown on the slide's first card under the kicker "Your turn" (a slide with a case or question keeps those and adds the controls under them).
`back` names a slide of the same deck. `interactProblems` (`src/decks/interact.ts`) is the one rule for what can be played; a slide that fails it plays without the question and with a notice.

**A new way of asking is a new `commit` kind in `interact.ts` and one branch in `src/ui/cards/InteractControls.tsx`. It is never a new slide field.**

## What a slide needs (readiness)

`readiness(slide)` in `src/decks/hp/hooks.ts` is the one answer to "can this slide play whole?" for every deck, copied or written by you. A slide's fields name the features it needs (a tool, a
procedure, a lens, a view, a card); each feature has one owner and says whether it has landed. Tools, procedures and chart visuals are read from their own registries, so a feature that lands
there lands here with no line to add. `wired` is true when every need has landed; `unowned` lists a need nobody owns, which also stops a slide reading as wired. `tests/deck-readiness.test.ts`
holds all of this over the 42 decks and checks that the parity rows say the same thing.

## Adding things

| To add | Do this | Pinned by |
|---|---|---|
| a slide field | one line in `FIELD_HOME`; if it is a 3D addition, `OVERLAY_FIELDS` and a typed property on `SlideOverlay` | `deck-card-fields`, `deck-overlay` |
| a 3D addition to one built-in slide | one line in a table in `overlay.ts` | `deck-overlay` |
| a template | one entry in `TEMPLATES` | `deck-templates` |
| a way of asking | one `commit` kind | `deck-interact` |
| a deck from the 2D app | run its copy script (below); it is a source like the others | `decks-all-play` |

## Copying decks from the 2D app

Never edit a `*.copied.ts` file. Re-copy from a 2D checkout and commit the difference:

```
node scripts/copy-decks-ag.mjs --from <2D checkout>        # A to G   (add --check to compare only)
node scripts/port-decks-hp.mjs --from <2D checkout>        # H to P
node scripts/port-decks-rw.mjs --from <2D checkout>        # R to W
```

The HVPG deck is copied by the H to P script into the one copy every deck reads. `node scripts/copy-decks.mjs --from <2D checkout>` still writes `src/decks/hvpg.copied.ts` for the first four
slides' camera plates and ladder rows, but their words are taken from the one copy (`tests/hvpg-one-words.test.ts`), so a review's edit to the words only ever needs to go in one place.

After a deck changes, rebake its charts: `node scripts/bake-charts.mjs` (`--check` says which are stale).

## Checks to run

`npx tsc --noEmit`, `node scripts/lint.mjs`, and `node --test tests/deck-*.test.ts tests/decks-all-play.test.ts`.
