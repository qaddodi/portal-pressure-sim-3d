# Shell gaps against the 2D app

Audit of the shell-level features (19 Nov 2026), 2D app at b3058ef3 read against this branch. Status: **ok** (same as 2D in the code), **partial**, **missing**. "Done here" is what this push changed.
Nothing here has been run on a device: "ok" means the code and its tests agree with the 2D source, not that the owner has checked it (`src/parity/matches.ts` stays empty until he does).
The tests for this push are in `tests/shell-gaps.test.ts`.

| Feature | 2D file | 3D status | Action |
|---|---|---|---|
| Settings rows: Appearance (Light, Soft, Dark, Navy, Black, System), Display (Blur effect, Figure detail and its two steps, Sharp while moving, Keyboard shortcuts), Diagnostics, Reset | `main.js` settings, `fig-detail-words.js`, `keys-pref.js` | ok. No "Flow marks" row or setting (`tests/looks.test.ts` holds it out) | none |
| Settings > Advanced physiology | `main.js` | partial: row shown, nothing behind it | for owner Settings (menu fixer) |
| Settings > Send feedback | `main.js sendFeedback`, `feedback-diag.js` | ok: the row exists only when the build has `VITE_FEEDBACK_EMAIL`; no address in the repo (`tests/feedback-short.test.ts`) | none |
| Keys: Space, `[ ]`, `.`, Z, Ctrl/Cmd Z, P, A, L, `+ - 0`, `/`, Ctrl/Cmd K, ?, I, T, J, 1-9, Esc, held key is one press, text field keeps its keys, keys-off leaves Esc and Ctrl/Cmd | `keyboard.js`, `keys-pref.js` | ok (`keys/keymap.ts` is a port) | none |
| Shift C also cycles the lens | `keyboard.js` | was missing | done: `keymap.ts` |
| ? in a talk opens the guide at "While presenting" | `keyboard.js openHelp('present')` | was missing (opened at the top) | done: `useKeys.ts` |
| Esc in the sinusoid backs out to the lobule | `keyboard.js` | was missing | done: `useKeys.ts` |
| + - 0 and `.` are the page's (a held key never scrolls the page behind) | `keyboard.js` preventDefault | was partial | done: `useKeys.ts` |
| Esc also cancels a shunt placement and drops the tool to Select | `keyboard.js` | missing | for owner Treat (`src/ui/treat/*`, `src/ui/action/*`) |
| J held injects dye, release lets go (keyup) | `keyboard.js onKeyUp`, `stage.releaseDye` | partial: a press injects, release does nothing | for owner Treat/action |
| While presenting: arrows, Home/End, number then Enter, G list, P presenter view, B or `.` black, F full screen, Esc, `?` | `presenter.js onKey`, `key-owner.js` | ok (`deck/clicker.ts`, `useDeckInput.ts`; a focused button keeps Enter and Space as in `key-owner.js`) | claims added in `parity/b1.ts` |
| While presenting: L laser | `ink-gl.js` (spotlight: window R = min(W,H) x 0.09 in 50-100 px, 62% veil, faint ring, no dot; iPad press and hold 500 ms) | was missing (L did nothing) | done: `deck/laser.ts` + `laser.css`: five plates under the cards (the window with its soft edge, four plain plates round it) moved by `transform`, shown by `opacity`; kept from slide to slide as in 2D, put away under the black screen, when the window loses focus and when the talk ends; Esc is the talk's, as in 2D; a held finger shows it only on the figure. The pen (D, E) is not lifted |
| While presenting: -> "during a time-lapse, run it to its end" | `presenter.js` | partial: next slide only | for owner presenter (B12) |
| Reach and act: Tab then Enter to reach a vessel | `stage.js` keyboard walk, `fig-stations.js` | ok (`scene/labels/VesselWalk.tsx`) | claim added |
| Reach and act: arrows step through the stations (SMV, splenic, portal, sinusoids, hepatic veins, IVC, right atrium); Shift + arrow follows the vessel along the flow | `fig-stations.js`, `stage.js` ~2912 | partial: plain arrows follow the flow (the older 2D rule), no stations | for owner B6 (`src/scene/labels/*`): lift `fig-stations.js` `stationStep` and move the along-the-flow step to Shift |
| Blood menu: Pressure values, Key / All / None are switches on the 2D words | `main.js` blood menu | partial: stored in `useBlood` and `figure.labelLevel`, only the circuit captions read the label level; the anatomy labels do not | for owner B6 |
| Lobule Layers > Bile | `lobule-bile.js` | partial: switch stored, no bile drawn | for owner B8 |
| Top bar: patient pill, Blood, lens with key, Treat, Tests, History, gear, Search; compacting (`data-fit` 1-3, two rows last) | `main.js` ~1822, `index.html` | ok (`shell/bar-fit.ts`, `use-bar-fit.ts`, `tests/bar-fit.test.ts`) | Treat, Tests, Layers claims flipped to wired |
| Top bar: a button that comes or goes (Layers chip, Sinusoid pill, name length) glides, never pops (FLIP) | `topbar-motion.js` (303 lines, with `ease.js`, `class-soon.js`, `glass-morph.js`) | missing: the buttons pop | not done (needs the GPU-glass `glass-morph.js` or a plate-less rewrite); next push |
| Footer credit | `credit.js`, `.stage-credit` | ok (`shell/Credit.tsx`) | none |
| About the model, References, Privacy (with "Clear my data on this device") | `main.js openAbout/openPrivacy` | ok (`shell/Pages.tsx`, copied by `scripts/copy-about.mjs`) | claims flipped to wired |
| Guide (what it is, keys, while presenting, reading the figure, thresholds, disclaimer) | `main.js openHelp` | ok (`shell/HelpSheets.tsx`) | none |
| Print notes (handout) | `handout.js`, `@media print` in `app-03-layouts.css`, `app-08-cards.css` | ok for the handout page (`deck/handout.ts`) and the copied print rules. Printing the figure itself is blank (a WebGL canvas without a kept buffer) | none; noted |
| Offline: register the worker, hold every built file, a stale tab is offered a reload | `main.js` ~518, `scripts/build.mjs` sw | partial. The worker is built (`scripts/pwa.mjs`) but **`registerPwa()` is imported in `main.tsx` and never called**, so nothing registers | for owner PWA/boot (`main.tsx`): call `registerPwa()` after the first render |
| Update toast "A new version of the simulator is ready." with Reload; held in a talk, asked again after 30 s | `main.js` ~532 | done here as code: `pwa/register.ts` (`offerReload`, `holdsAll`, `loadedAssets`) | for owner PWA: add to the worker the message the page asks (`self.addEventListener('message', e => { if (e.data === 'pps:files' && e.ports[0]) e.ports[0].postMessage(FILES) })`) in `scripts/pwa.mjs`, or every takeover offers the reload |
| Manifest, icons, apple-touch icon, standalone | `manifest.webmanifest`, `index.html` | ok | none |
| `index.html` head: description, author, copyright, share card, theme colour per scheme, status-bar style, SVG icon | `index.html` | was partial | done: `index.html` (no `og:image`: the 3D app has no share picture yet) |
| Loading cover (mark, name, wait bar after 1.2 s, never under 600 ms, fade out), noscript note, "couldn't start" and "still loading" messages | `index.html #boot` and its script | was missing (a blank ground until React) | done: `index.html`; lifts when React puts the first screen in `#root`, by itself after 20 s. A runtime error that is not a SyntaxError only gets the 15 s "Still loading" message |
| Unsupported-browser list and the old-browser note; `?embed` | `index.html` | missing (3D needs WebGL 2; `NoWebGL.tsx` says so with the 2D link) | not planned |
| Deep links `?script=&slide=`, `?preset=`, `?home=` | `main.js openDeepLink` | ok (`shell/open-link.ts`, `deep-link.ts`) | none |
| Share link: Copy share link carries patient, sliders, view, selection, camera; read on load and when pasted into an open tab | `share-link.js`, `share-flow.js`, `main.js createShare` | partial: `Copy share link` writes `?preset=<id>` only. The writer and reader for the full state already exist (`debug/packet/state.ts`, `apply.ts`: camera, sliders, view, lens, figure switches, picked vessel in `#x=`) but only the preview copy's bug-packet trigger reads it | for owner share links (`search/*`, `deep-link.ts`): write `stateLink(stateNow(), baseOf(location))` for the command, read `#x=` on every build after the deep link, and on `hashchange` ("This shared link could not be read." on a bad one) |
| Search commands Lobule view and Tests are listed as not working | `palette.js` | partial: both run (`goToView('lobule')`, the `tests` feature); `search/wired.ts` does not say so | for owner search (`search/wired.ts`): add `Lobule view` and `Tests` to the View group |
| Search > Guide & shortcuts opens the Help menu, 2D opens the Guide | `palette.js` `ctx.help()` | partial | for owner search (`search/commands.ts`): `sheet: 'guide'` |
| Accessibility: live region, the figure's one-line description, slide announcer, reduced motion (nothing pops), control names, focus rings (the 2D stylesheet), `lang` | `a11y.js`, `live.js`, `focus-ring.js` | ok (`ui/a11y/*`, `docs/accessibility.md`; not yet read with a screen reader) | none |
| Tester guides | `guides/` | ok (`scripts/copy-guides.py`) | none |

## For owners (summary)

- **Settings (menu fixer):** Advanced physiology has no work behind it. No Flow marks anywhere (kept).
- **Share links, search, deep links:** full-state Copy share link and reading `#x=` on every build; View > Lobule view and Tests marked wired; Guide & shortcuts opens the Guide.
- **PWA / boot (`main.tsx`, `scripts/pwa.mjs`):** call `registerPwa()`; answer `pps:files` in the worker (the update toast is ready in `src/pwa/register.ts`).
- **Treat / action:** Esc cancels a shunt placement; J's key release; the shell's Esc order now ends in sinusoid, then talk.
- **B6 (labels):** station walk with the arrows, Shift for along the flow; Blood menu Pressure values / Key / All / None on the anatomy labels.
- **Presenter (B12):** `->` during a time-lapse runs it to its end; the pen (D, E) is not lifted.
- **This slice, next:** the top bar's FLIP glide (`topbar-motion.js`).
