// The copied 2D files are plain JS, whose defaults give them narrow types; these are the same functions typed for how the 3D tools call them. No logic here.
import { sweepRun as sweepRunJs, walkRun as walkRunJs, checkRun as checkRunJs } from './emit.copied.js';
import { renderRun as renderRunJs, parseReport as parseReportJs, compareRuns as compareRunsJs, validateRun as validateRunJs, runBlock as runBlockJs } from './run.copied.js';

export interface Finding { rule: string; sev: 'fail' | 'warn' | 'note'; what: string; where?: string; why?: string; owner?: string; at?: string; scope?: Record<string, unknown> }
export interface Run { kind: string; v: number; tool: string; build: Record<string, unknown>; device: Record<string, unknown>; scope: Record<string, unknown>; started: string; ms: number | null; findings: Finding[]; total: number; health: Record<string, unknown>; notes: string[]; missing: string[]; sum?: string }
type Loose = (o: Record<string, unknown>) => Run;
export const sweepRun = sweepRunJs as unknown as Loose;
export const walkRun = walkRunJs as unknown as Loose;
export const checkRun = checkRunJs as unknown as (p: unknown[], where?: Record<string, unknown>) => Run;
export const renderRun = renderRunJs as unknown as (r: Run, o?: { json?: boolean }) => string;
export const runBlock = runBlockJs as unknown as (r: Run) => string;
export const parseReport = parseReportJs as unknown as (t: string) => { ok: boolean; run: Run; why?: string };
export const compareRuns = compareRunsJs as unknown as (a: Run, b: Run) => { fixed: Finding[]; added: Finding[]; same: Finding[]; text?: string } & Record<string, unknown>;
export const validateRun = validateRunJs as unknown as (r: unknown) => { ok: boolean; why?: string };
