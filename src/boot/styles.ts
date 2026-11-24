// The app's stylesheets are not in front of the first paint (scripts/app-css.mjs: the build's links start as media="print" and an inline script turns them on as they load), so the loading cover draws at once and the app
// must not. `appStylesReady()` resolves when every one of them is on (never rejects: a sheet that failed to load counts as done, the page then shows what it can). main.tsx waits for it before its first render, and the
// plain pages in src/entry.ts before they mount. A page with none of those links (the dev server injects its CSS from script) resolves at once.
type Styles = { ppsStyles?: Promise<void> };

export function appStylesReady(win: Styles = window as Window & Styles): Promise<void> {
  return win.ppsStyles ?? Promise.resolve();
}
