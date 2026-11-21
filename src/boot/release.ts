// Which version and build this page is, in one place: About shows it, the feedback draft and the report carry it, so a bug report names the exact release.
// `VITE_RELEASE` is package.json's version (scripts/build.mjs stamps it); `VITE_BUILD` is "branch@commit" (build.mjs, the Pages workflow). Pure: handed the two strings, so a node test drives it.

/** The short commit of a "branch@commit" build id, or '' for a local run (`dev`, `local`, none). */
export const commitOf = (build: string | undefined): string => { const c = (build ?? '').split('@').pop() ?? ''; return c && c !== 'dev' && c !== 'local' ? c : ''; };

/** "Version 1.0.0-beta.1 · build 7e5d6f99", or whichever part this build has (a local run has neither: "source"). */
export function releaseLine(version: string | undefined, build: string | undefined): string {
  const parts = [version ? `Version ${version}` : '', commitOf(build) ? `build ${commitOf(build)}` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'source';
}

/** The build line of a feedback draft: "v1.0.0-beta.1 · PREVIEW · 7e5d6f99" on the preview copy, "v1.0.0-beta.1 · 7e5d6f99" on the live site. */
export function feedbackBuild(version: string | undefined, build: string | undefined, channel: string | undefined): string {
  return [version ? `v${version}` : '', channel === 'preview' ? 'PREVIEW' : '', commitOf(build) || 'local'].filter(Boolean).join(' · ');
}

const env = (): Record<string, string | undefined> => ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
/** This page's release, from the build's own stamps. */
export const thisRelease = (): string => releaseLine(env().VITE_RELEASE, env().VITE_BUILD);
export const thisVersion = (): string => env().VITE_RELEASE ?? '';
