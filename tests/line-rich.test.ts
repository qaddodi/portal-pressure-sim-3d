// A slide's words are typeset the way the 2D presenter does (presenter-words.js rich): station words in their colour, key words in bold, disease names in a pill.
// The first block judges the typesetter on lines of the circulation talk (what the owner saw plain on the iPad, 20 Nov: "portal vein", "right atrium", "splenic" had no colour);
// the second compares it with 2D's own `rich` on every plain line of every talk of A to G and R to W, when a 2D checkout at the pin is at hand (PPS_2D_REPO).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typesetter, termList, toneVar, richOf, type Node } from '../src/ui/text/rich.ts';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { parseLine, gluePieces } from '../src/ui/text/line.ts';
import { nb } from '../src/ui/text/glue.ts';
import { pinned2D } from './two-d-pin.ts';
import { loadSource } from '../src/decks/source.ts';

const kinds = (ns: Node[]) => ns.filter((n) => n.t !== 'text').map((n) => `${n.t}:${n.s}`);

test('the circulation talk: its station words are pills in their colour, once each', () => {
  const ts = typesetter({ terms: ['sv', 'smv', 'pv'] });
  const ns = ts.set('The splenic and superior mesenteric veins join behind the pancreas to form the portal vein, which supplies about three quarters of hepatic blood flow.');
  assert.deepEqual(kinds(ns), ['term:splenic', 'term:superior mesenteric veins', 'term:portal vein']);
  const t = ns.filter((n): n is Extract<Node, { t: 'term' }> => n.t === 'term');
  assert.deepEqual(t.map((n) => n.tone), ['sv', 'smv', 'pv']);
  assert.equal(toneVar('pv'), 'var(--tr-pv)');
  assert.equal(toneVar('--artery'), 'var(--artery)');
});

test('a term pills on its first mention only, and keeps the stop after it on its line', () => {
  const ts = typesetter({ terms: ['pv'] });
  const a = ts.set('The portal vein, then the portal vein again.');
  assert.deepEqual(kinds(a), ['term:portal vein']);
  assert.equal((a.find((n) => n.t === 'term') as Extract<Node, { t: 'term' }>).stop, ',');
});

test('the slide\'s own key words and the first mention of a term are bold, three at most', () => {
  const ts = typesetter({ key: ['pv'] });
  assert.deepEqual(kinds(ts.set('The portal pressure is high.')), ['bold:portal pressure']);
  const t3 = typesetter({});
  assert.deepEqual(kinds(t3.set('SAAG, WHVP, FHVP and CSPH are terms.')), ['bold:SAAG', 'bold:WHVP', 'bold:FHVP']);
});

test('a disease name is a pill, and a view the words name takes that view\'s colour', () => {
  const ts = typesetter({});
  const ns = ts.set('In cirrhosis, with the vessels colored by origin.');
  assert.deepEqual(kinds(ns), ['disease:cirrhosis', 'lens:origin']);
  assert.equal((ns.find((n) => n.t === 'lens') as Extract<Node, { t: 'lens' }>).tone, '--origin-spleen');
});

test('the cavernoma is always a station word; a record of words is read as the deck wrote it', () => {
  assert.ok(termList({}).some(([, k]) => k === 'cavernoma'));
  const ts = typesetter({ terms: { 'the gut': 'smv' } });
  assert.deepEqual(kinds(ts.set('Blood from the gut.')), ['term:the gut']);
});

test('a pill keeps the word before it and its stop after it: no space between a value and the comma that follows it', () => {
  const g = gluePieces(parseLine('The portal vein pressure is {pv}, the IVC {ivc} and the [right atrium](ra).'));
  const [t0, v0, t1, v1, t2, term, t3] = g;
  assert.equal(t0!.p.t === 'text' && t0!.p.text, 'The portal vein pressure is\u00a0');
  assert.equal(v0!.stop, ',');
  assert.equal(t1!.p.t === 'text' && t1!.p.text, ' the IVC\u00a0');
  assert.equal(v1!.stop, '');
  assert.equal(t2!.p.t === 'text' && t2!.p.text, ' and the ');
  assert.equal(term!.stop, '.');
  assert.equal(t3!.p.t === 'text' && t3!.p.text, '');
});

const two = pinned2D('src/ui/presenter-words.js');
test('every plain line of A to G and R to W is typeset as 2D does', { skip: two.skip }, async () => {
  await import(`${two.repo}/tests/dom-shim.js`);
  // (2D's `h` builds elements: a minimal document that keeps the class, the children and the text of each)
  class El {
    nodeType = 1; children: any[] = []; className = ''; attrs: Record<string, string> = {}; style = { setProperty() {} }; tagName: string;
    constructor(tagName: string) { this.tagName = tagName; }
    get classList() { const c = this.className.split(/\s+/); return { contains: (x: string) => c.includes(x) }; }
    setAttribute(k: string, v: string) { this.attrs[k] = v; }
    append(...k: any[]) { this.children.push(...k); }
    get textContent(): string { return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); }
  }
  (globalThis as any).document = { ...(globalThis as any).document, createElement: (t: string) => new El(t.toUpperCase()), createTextNode: (s: unknown) => ({ nodeType: 3, textContent: String(s) }) };
  const { rich } = await import(`${two.repo}/src/ui/presenter-words.js`);
  const sig2d = (out: unknown[]): string[] => out.flatMap((x: any): string[] => {
    if (typeof x === 'string') return [];
    const c = String(x.className ?? x.getAttribute?.('class') ?? '');
    const inner: any = x.children?.[0];
    if (/pz-lens-t/.test(c)) return [`lens:${x.textContent}`];
    if (/pz-term/.test(c)) return [`term:${x.textContent}`];
    if (/pz-dz/.test(c)) return [`disease:${x.textContent}`];
    if (/pz-nw/.test(c) && inner && typeof inner !== 'string') return sig2d([inner]);
    if (x.tagName === 'B') return [`bold:${x.textContent}`];
    return [];
  });
  let lines = 0;
  const decks: [string, () => Promise<unknown>][] = [...AG_IDS.map((id): [string, () => Promise<unknown>] => [id, () => loadAgDeck(id as never)]), ...RW_IDS.map((id): [string, () => Promise<unknown>] => [id, () => loadSource(id)])];
  for (const [id, load] of decks) {
    const deck = (await load()) as { slides: { line?: string; terms?: unknown; key?: string[]; bold?: string[]; pill?: false }[] };
    for (const [i, s] of deck.slides.entries()) {
      const line = s.line;
      // (lines with a link, a braced token, a bold mark or a value with a unit are the Line component's own pieces; this judges the plain words)
      if (!line || /[{}[\]*]/.test(line) || /\d\s?(?:mmHg|g\/dL|mL\/min|kPa|cm\/s|mm|%)/.test(line)) continue;
      lines++;
      const want = sig2d(rich(line, s));
      assert.equal(nb(line), (await import(`${two.repo}/src/ui/glue.js`)).nb(line), 'the glue is 2D\'s');
      const ts = typesetter(richOf({ lineTerms: s.terms as never, lineKey: s.key, lineBold: s.bold }));
      const got = kinds(ts.set(nb(line)));
      assert.deepEqual(got, want, `${id} slide ${i + 1}: ${line}`);
    }
  }
  assert.ok(lines > 20, `only ${lines} plain lines were compared`);
});

test('a closing bracket stays with its pill and an opening one is known, so a value never reads "( 59.4 kPa )" or "2.2 g/dL ."', () => {
  const g = gluePieces(parseLine('or an SSM >55 kPa ({ssm}), decides.'));
  const v = g.find((x) => x.p.t === 'value')!;
  assert.equal(v.stop, ')');
  assert.equal(v.open, true);
  const g2 = gluePieces(parseLine('albumin {ssm}.'));
  assert.equal(g2.find((x) => x.p.t === 'value')!.stop, '.');
});
