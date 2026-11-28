// The picture runs' side of the audit zip, for the pages: the request an address carries (or `app`), the picture run's scope, and the unified files (README-FIRST.md, REPORT.md, sections/,
// findings.json, manifest.json) as zip entries to add beside the pictures. The text is made by bundle.ts and shots.ts, pure and tested in node; this only gathers what the page knows.
import type { ZipFile } from '../../capture/zip.ts';
import { parseRequest, type CheckId } from './grammar.ts';
import { requestFromSearch } from './address.ts';
import { resolveRequest, type Scope, type World } from './resolve.ts';
import { bundleFiles } from './bundle.ts';
import { gpuScope, resultOfShots, type LayoutEnd, type Shot } from './shots.ts';

/** The scope of a picture run: the address's request, or `app` when it carries none. The slides and sizes the page really took replace the request's. */
export function pictureScope(search: string, world: World, o: { checks: readonly CheckId[]; slides?: readonly string[]; sizes?: readonly string[] }): Scope | null {
  const asked = requestFromSearch(search), req = asked?.ok ? asked.request : (parseRequest('app') as { request: Parameters<typeof resolveRequest>[0] }).request;
  const r = resolveRequest(req, world);
  return r.ok ? gpuScope(r.scope, o) : null;
}

/** What every picture run says it could not judge. */
export const NOT_JUDGED = (line: string): string[] => [
  `numbers, junctions, a11y, perf, types, lint: a picture run does not judge them; \`npm run audit -- "${line}"\` does the ones node can.`,
  'Text overlap and clipping by eye, whether a number is right, how smooth the motion plays: read the pictures for those.',
];

export interface GpuRun {
  scope: Scope;
  build: { commit: string; branch: string };
  startedAt: string;
  seconds: number;
  device: string;
  shots: readonly Shot[];
  ends: readonly LayoutEnd[];
  checks: readonly CheckId[];
  validity: readonly string[];
  notJudged?: readonly string[];
  isProblem(note: string): boolean;
}

/** The unified files of a picture run, ready to add to its zip. */
export function unifiedFiles(r: GpuRun): ZipFile[] {
  const enc = new TextEncoder();
  const result = resultOfShots({
    scope: r.scope, info: { build: { commit: r.build.commit, branch: r.build.branch, engine: '', dirty: false }, runner: 'gpu', startedAt: r.startedAt, seconds: r.seconds, device: r.device },
    shots: r.shots, ends: r.ends, checks: r.checks, validity: r.validity, notJudged: r.notJudged ?? NOT_JUDGED(r.scope.line), isProblem: r.isProblem,
  });
  return bundleFiles(result).map((f) => ({ name: f.name, data: enc.encode(f.text) }));
}
