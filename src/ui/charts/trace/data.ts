// What the course chart reads from the 3D engine, as 2D's presenter gives it (presenter-question.js chainTo, talk-chain.js): the readings and params at every state of the deck
// (the engine's `sequence`, each slide from the one before it), and the states up to a slide as the chart's points. The chain itself (talkChain) is in ./model.ts.
import type { Fp, TalkPoint, TalkSlide } from './model.ts';
import { talkChain } from './model.ts';
import { tokensOf } from '../../text/tokens.ts';

/** One state of a deck: the fingerprint the model reads there and the params it stood on. */
export interface TalkState { fp: Fp; params: unknown }
/** The slide's `tool` for a trace on the talk (decks: tool: { kind: 'trace', range: 'talk', since?, bands?, gap?, style?, title? }). */
export interface TraceTool { kind?: 'trace'; range?: 'talk' | 'beats'; since?: string; bands?: readonly string[]; gap?: string; style?: 'milestones' | string; title?: string }

/** The props TraceCard takes for a slide's tool (a milestones style, bands and gap as the tool names them). */
export const traceProps = (tool: TraceTool | null | undefined) => ({ bands: tool?.bands ?? null, gap: typeof tool?.gap === 'string' ? tool.gap : null, style: tool?.style === 'milestones' ? ('milestones' as const) : null });

/** The talk so far for slide i of a deck: every state up to it once each (talk-chain.js), the chart starting at tool.since when it names one. */
export const chainFor = (slides: readonly TalkSlide[], stateOf: readonly number[], states: readonly (Partial<TalkState> | undefined)[], i: number, tool?: TraceTool | null): TalkPoint[] =>
  talkChain(slides, stateOf, states, i, tool?.since ?? null);


/** The states whose HVPG a slide's words cite (`{hvpg@id}`), as the chart's points name them (the slide that holds the state): the readings row keeps these. */
export const citedHvpg = (slides: readonly { id?: string; line?: string }[], stateOf: readonly number[], line: string | undefined): string[] =>
  tokensOf(line ?? '').flatMap(({ token }) => {
    if (token.kind !== 'value' || token.key !== 'hvpg' || !token.at) return [];
    const j = slides.findIndex((x) => x.id === token.at), id = j >= 0 ? slides[stateOf[j]!]?.id : undefined;
    return id ? [id] : [];
  });
