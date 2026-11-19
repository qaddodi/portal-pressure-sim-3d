// The "What's wrong here?" sheet (the 2D app's packet/sheet.js): shows what the packet found, takes an optional note, and copies the packet on a tap (a copy needs a tap on a
// phone, so the packet is built when the sheet opens and copied by its button). Preview only. Plain DOM, one style block, nothing per frame; the sheet fades (240 ms), and
// nothing in it scrolls sideways.
import { packetText, withNote } from '../core/packet.copied.js';

const CSS = `
.pkt { position: fixed; inset: auto 8px 8px 8px; z-index: var(--z-perf, 100); max-height: min(78vh, 640px); display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; border: 1px solid var(--border, #8884); background: var(--surface, #fff); color: var(--text, #111); box-shadow: 0 8px 28px rgba(0,0,0,.28); font: 500 13px/1.4 system-ui, sans-serif; opacity: 0; transition: opacity 240ms ease; }
.pkt[data-in] { opacity: 1; }
@media (min-width: 700px) { .pkt { inset: auto 16px 16px auto; width: 460px; } }
.pkt h2 { margin: 0; font-size: 15px; font-weight: 650; }
.pkt p { margin: 0; }
.pkt-status { overflow-wrap: anywhere; }
.pkt-list { margin: 0; padding: 0 0 0 20px; overflow-y: auto; overflow-x: hidden; max-height: 24vh; display: flex; flex-direction: column; gap: 4px; }
.pkt-list li { overflow-wrap: anywhere; }
.pkt-list b { color: var(--danger, #c33); font-weight: 650; }
.pkt textarea { width: 100%; box-sizing: border-box; min-height: 56px; resize: vertical; font: inherit; padding: 8px; border-radius: 9px; border: 1px solid var(--border, #8884); background: transparent; color: inherit; overflow-x: hidden; }
.pkt textarea.pkt-raw { min-height: 110px; font: 500 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
.pkt-row { display: flex; flex-wrap: wrap; gap: 8px; }
.pkt button { font: inherit; font-weight: 600; min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--border, #8884); background: var(--surface, #fff); color: inherit; cursor: pointer; }
.pkt button.go { background: var(--danger, #c33); border-color: transparent; color: #fff; }
.pkt button:disabled { opacity: .5; }
.pkt [hidden] { display: none !important; }
`;

export interface SheetDeps { build(note: string): Promise<Record<string, any>>; doc?: Document; say?: (t: string) => void }
type Packet = { findings: { rule: string; what: string; where?: string }[]; missing: string[] };

/** Opens the sheet over the page; one at a time (a second call replaces the first). Returns { close, root }. */
export function openPacketSheet({ build, doc = document, say = () => undefined }: SheetDeps): { close(): void; root: HTMLElement } {
  if (!doc.getElementById('pkt-css')) { const st = doc.createElement('style'); st.id = 'pkt-css'; st.textContent = CSS; doc.head.append(st); }
  doc.getElementById('pkt-sheet')?.remove();
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const root = el('section', 'pkt'); root.id = 'pkt-sheet'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', "What's wrong here?");
  const status = el('p', 'pkt-status', 'Reading the screen…'); status.setAttribute('role', 'status');
  const list = el('ol', 'pkt-list'); list.hidden = true;
  const note = el('textarea'); note.placeholder = 'What did you see? (optional, a few words)'; note.setAttribute('aria-label', 'What did you see?');
  const raw = el('textarea', 'pkt-raw'); raw.readOnly = true; raw.hidden = true; raw.setAttribute('aria-label', 'The packet, to copy by hand');
  const copy = el('button', 'go', 'Copy packet'); copy.type = 'button'; copy.disabled = true;
  const close = el('button', '', 'Close'); close.type = 'button';
  const row = el('div', 'pkt-row'); row.append(copy, close);
  const intro = el('p', 'pkt-status', 'Something look wrong? This collects what the app shows right now, so the agent can see it without a screenshot. Nothing is sent: tap Copy, then paste it into the thread.');
  root.append(el('h2', '', "What's wrong here?"), intro, status, list, note, raw, row);
  doc.body.append(root);
  fadeInSoon(() => root.setAttribute('data-in', ''));
  let packet: Record<string, any> | null = null, closed = false;
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dispose(); };
  const dispose = () => { if (closed) return; closed = true; doc.removeEventListener('keydown', onKey); root.removeAttribute('data-in'); setTimeout(() => root.remove(), 300); };
  doc.addEventListener('keydown', onKey);
  close.onclick = dispose;
  copy.onclick = async () => {
    if (!packet) return;
    const text: string = packetText(withNote(packet, note.value));
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      status.textContent = `Copied. Paste it into the thread (${text.length.toLocaleString('en-US')} characters).`; say('Packet copied.'); raw.hidden = true;
    } catch { raw.value = text; raw.hidden = false; raw.focus(); raw.select(); status.textContent = 'The browser would not copy. Select all in the box below and copy it by hand.'; }
  };
  Promise.resolve().then(() => build('')).then((p) => {
    if (closed) return;
    packet = p;
    const pk = p as Packet, n = pk.findings.length;
    const lacks = pk.missing.length ? `Not in the packet: ${pk.missing.join('; ')}.` : '';
    status.textContent = n ? `${n} finding${n === 1 ? '' : 's'}. ${lacks}` : `No self-check named a problem. ${lacks} Write what you saw, so the agent can add the rule that would have.`.replace(/\s+/g, ' ').trim();
    list.replaceChildren(...pk.findings.map((f) => { const li = el('li'), b = el('b', '', `${f.rule}: `); li.append(b, `${f.what}${f.where ? `, ${f.where}` : ''}`); return li; }));
    list.hidden = n === 0;
    copy.disabled = false;
  }, (e) => { status.textContent = `The packet could not be made: ${(e as Error)?.message ?? e}`; });
  return { close: dispose, root };
}

// (a frame later, so the sheet's first paint is its hidden state and the fade runs; a timer, not a frame request: nothing here asks the clock for anything)
function fadeInSoon(fn: () => void): void { setTimeout(fn, 16); }
