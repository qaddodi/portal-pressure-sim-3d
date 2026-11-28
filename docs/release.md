# Release

How a build gets its version, what the live site ships, and the checklist for a release. The merge to `main` is Mohammad's call alone.

## Version and build
- The version is `package.json` `version` (now `1.0.0-beta.1`). `scripts/build.mjs` stamps it as `VITE_RELEASE`; the commit is `VITE_BUILD` (`branch@commit`).
- Settings > Help > About shows "Updated <month> · Version 1.0.0-beta.1 · build 7e5d6f99". The Send feedback draft's `Build:` line is "v1.0.0-beta.1 · PREVIEW · 7e5d6f99" on the preview copy and "v1.0.0-beta.1 · 7e5d6f99" on the live site; the report packet carries it too. `dist/build-info.txt` has it.
- To release: change `version` in `package.json` and `package-lock.json` (both top entries), commit, tag `v<version>` on the merge commit.

## The feedback address
It is never in the repository (`tests/release.test.ts` greps `src`, `scripts`, `public`, `index.html` and `.github` for a mail address). The workflow passes the repository secret `FEEDBACK_EMAIL` to both builds as `VITE_FEEDBACK_EMAIL`: GitHub repo Settings > Secrets and variables > Actions > Secrets > New repository secret `FEEDBACK_EMAIL` (a secret, not a variable, so the run's log masks it). Unset, the Send feedback row and the Privacy paragraph about it are absent. The address is necessarily in the shipped JavaScript (a mailto link); the rule is only that it is not in the repo.

## What each copy ships
- `/preview/` (integration branch, `VITE_CHANNEL=preview`): everything, with the orange build pill and every debug tool (`?audit`, `?inspect`, `?joins`, `?look`, `?charts`, `?trials`, `?parity`, `?debug`, `?watch`).
- `/` (main, `VITE_CHANNEL=live`): no build pill, and no debug tool: `src/main.tsx` `DEBUG` is false at build time, so those chunks are not built, not downloaded, not held offline. Only `?perf`, `?gl` and the links that open a talk, slide, patient or the menu work. `tests/live-no-debug.test.ts`.
- Both: a Content-Security-Policy meta (`scripts/csp.mjs`, written into `index.html` by the build) that allows only this origin and the page's own boot script by hash, and `referrer: strict-origin-when-cross-origin`. Privacy is Help > Privacy (the 2D app's page, copied).

## Size
`npm run build` prints what a first visit holds ("held at install ... about N kB on the wire": text counted gzipped as the host sends it, data files as they are), and then `scripts/boot-bytes.mjs` prints the same list by kind and checks it against `scripts/boot-budget.json` (25 Nov, review D3 and W2: before this the guard counted source bytes and no geometry, and 80% of the 10,071 kB a first visit downloaded was geometry). The number is in `build-info.txt` (`boot N kB before usable`); over the budget fails the build on `main` and is named on a branch. The budget only comes down, toward the review's 4,000 kB target; `tests/boot-entry.test.ts` also holds the baked geometry alone to `geometryKb` without a build. What is in it: the install list leaves out the Lobule's weld plan (1.7 MB: the quiet ladder reads it in once the cover is up, or the first dive into the Lobule waits for it behind "Preparing the lobule… N%"), its planner worker, the organs file only the fallback path reads (`isFallback`), and the fonts' other alphabets (`scripts/pwa.mjs` `LATE`). The baked files (organs, skins, welds) are packed losslessly (`src/scene/bake-pack.ts`: each array through a reversible delta and byte-plane transform that gzip likes, read back bit for bit, so no picture changes; the raw stomach the scope fits to is the finished stomach's own arrays, stored once). The built stylesheet drops the rules that name a class the app never makes (`scripts/css-unused.mjs`; `PPS_NO_CSS_PRUNE=1` skips it). Two numbers are rounded, on the owner's OK (25 Nov): the organs' octahedral normals are kept to 1/1023 (`SNORM`, `src/scene/organs/baked.ts`; an outline normal moves by under 2.5e-3) and the skins' blend numbers (`ROUNDED_KEYS` in `skin/baked.ts`) lose their 8 lowest mantissa bits (relative step 3e-5; positions are never rounded, so the seams still meet the tubes). Bounded by `tests/organs-baked.test.ts` and `tests/skin-baked.test.ts`; the look compare (`npm run look:diff`) still needs a browser run on the devices. Not done: thinning the organ meshes (it changes vertices).

## Old links
`tests/fixtures/links-v1.json` froze every talk id and slide count and one share link per patient (21 Nov 2026). A rename needs an alias in `src/ui/deck/deck-of.ts` `DECK_ALIAS`; the test fails without it. Never edit the fixture to pass.

## The release gate (28 Nov, P-01)
`npm run release:check` (a Mac or one scheduled thread, never a push thread) runs the whole suite (`scripts/tests-daily.mjs`), refuses unless 0 are failing, and commits `tests-status.json` for that commit. The build on `main` (`scripts/build.mjs`, `scripts/release-gate.mjs`) refuses to ship when the file is missing, red, or names a commit that differs from HEAD by anything but the file itself. Commit the record with the merge. `tests/release-gate.test.ts`.

## Testers
`/preview/` is the testers' and the owner's copy; there is no separate /beta/ (owner, 28 Nov: "preview is essentially beta for me").

## Supported browsers (28 Nov, P-05)
Safari 16.4, Chrome and Edge 110, Firefox 115, or newer. `index.html` (`floorOk()`, in the boot-messages script) tests the features of that generation (no eval: the CSP) and an older browser is told so in one plain sentence on the cover.

## Release checklist
1. The review's P0 items (error boundaries, lazy-load retry, context loss) pushed and seen by Mohammad.
2. Stall work (`rebuild-3d/code-review-21nov.md` items 1 to 5) closed, or listed as known.
3. Version bumped; `FEEDBACK_EMAIL` secret set; tester guides updated to the live address (they still say `/preview/` and the PREVIEW tab).
4. Device pass on the exact commit: `docs/device-checklist.md`.
4b. `npm run release:check` is green and its record is committed.
5. Mohammad says merge: merge the integration branch into `main`; `/` becomes the app and `/preview/` equals it.
6. Tag `v<version>`; the previous tag's commit is the rollback (revert the merge on `main`).
