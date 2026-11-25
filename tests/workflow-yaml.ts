// A reader for the YAML subset the Pages workflow uses (maps, lists, scalars, [a, b] lists, | block scalars, full-line comments), so a test can ask what the workflow DOES
// (which jobs, steps, conditions, keys) instead of grepping its text. Every scalar comes back as a string. Not a general YAML parser: it throws on anything outside that subset.
export type Yaml = string | Yaml[] | { [k: string]: Yaml };
type Line = { indent: number; text: string; raw: string };

export function parseWorkflow(source: string): { [k: string]: Yaml } {
  const lines: Line[] = source.split('\n').map((raw) => ({ indent: raw.length - raw.trimStart().length, text: raw.trim(), raw })).filter((l) => l.text !== '' && !l.text.startsWith('#'));
  let at = 0;
  const scalar = (s: string): Yaml => {
    const t = s.trim();
    if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
    if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) return t.slice(1, -1);
    return t;
  };
  // (a `|` block: every following line indented deeper than the key, taken whole; blank lines inside are dropped, which this workflow never relies on)
  const block = (keyIndent: number): string => {
    const out: string[] = [];
    let base = -1;
    while (at < lines.length && lines[at].indent > keyIndent) { if (base < 0) base = lines[at].indent; out.push(lines[at].raw.slice(base)); at++; }
    return `${out.join('\n')}\n`;
  };
  const entry = (text: string): [string, string] => {
    const m = /^([^\s:][^:]*?):(?:\s+(.*))?$/.exec(text);
    if (!m) throw new Error(`not a "key: value" line: ${text}`);
    return [m[1], m[2] ?? ''];
  };
  const mapping = (indent: number, first?: string): { [k: string]: Yaml } => {
    const out: { [k: string]: Yaml } = {};
    let pending = first;
    for (;;) {
      let text: string, lineIndent = indent;
      if (pending !== undefined) { text = pending; pending = undefined; } else {
        if (at >= lines.length || lines[at].indent !== indent || lines[at].text.startsWith('- ')) return out;
        text = lines[at].text; lineIndent = lines[at].indent; at++;
      }
      const [key, rest] = entry(text);
      if (rest === '|') out[key] = block(lineIndent);
      else if (rest !== '') out[key] = scalar(rest);
      else if (at < lines.length && lines[at].indent > lineIndent) out[key] = lines[at].text.startsWith('- ') ? sequence(lines[at].indent) : mapping(lines[at].indent);
      else if (at < lines.length && lines[at].indent === lineIndent && lines[at].text.startsWith('- ')) out[key] = sequence(lineIndent);
      else out[key] = '';
    }
  };
  const sequence = (indent: number): Yaml[] => {
    const out: Yaml[] = [];
    while (at < lines.length && lines[at].indent === indent && lines[at].text.startsWith('- ')) {
      const text = lines[at].text.slice(2).trim();
      at++;
      out.push(/^[^\s:'"[][^:]*:(\s|$)/.test(text) ? mapping(indent + 2, text) : scalar(text));
    }
    return out;
  };
  const doc = mapping(0);
  if (at < lines.length) throw new Error(`unread line: ${lines[at].raw}`);
  return doc;
}
