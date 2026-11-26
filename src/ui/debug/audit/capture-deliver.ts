// How a capture's zip reaches the person without the page ever holding the whole of it (26 Nov: Safari ran out of memory on one huge Blob). Every capture page (the Mac's outer page, the
// self-test panel, the promotion page and "Recover last capture") offers its finished run here:
//  - a browser that can write to a file the person picks (`showSaveFilePicker`: Chrome, Edge) gets a Save button that opens the save dialog in the tap and streams the zip into the file one
//    picture at a time, from storage: no Blob at all, and one zip unless it nears a zip's 4 GB;
//  - Safari (no such dialog) gets the run as zips of at most PART_BYTES_BLOB each (capture-parts.ts): one part is made at a time, from storage, and offered with its own Save tap
//    (the share sheet or the download has to happen inside the tap, so the part is made before the button says Save); once saved it is let go and the next is made.
// Saving every part marks the run saved (it is not offered again as a recovery).
import { planParts, partName, sizeWords, PART_BYTES_BLOB, PART_BYTES_FILE, type PartPlan } from './capture-parts.ts';
import type { Session } from './capture-store.ts';
import { saveFiles } from '../../capture/save-files.ts';

interface WritableFile { write(chunk: Uint8Array): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }
interface FileHandle { createWritable(): Promise<WritableFile> }
type Picker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileHandle>;

/** The browser's save dialog, or null where there is none (Safari). */
export const filePicker = (win: Window): Picker | null => {
  const f = (win as Window & { showSaveFilePicker?: Picker }).showSaveFilePicker;
  return typeof f === 'function' ? f.bind(win) : null;
};

export interface Delivery {
  el: HTMLElement;
  /** offer the run: `zipName` is the zip's name (parts add `-part2of4`), `onSaved` runs once every part is saved */
  offer(session: Session, zipName: string, at: Date, onSaved?: () => void): void;
  /** take the offer down (a new run starts) */
  clear(): void;
}

export function deliverUi(doc: Document): Delivery {
  const win = doc.defaultView ?? window, pick = filePicker(win);
  const el = doc.createElement('div'); el.hidden = true; el.style.cssText = 'flex:1 1 100%;display:flex;flex-direction:column;gap:8px;margin:6px 0';
  const note = doc.createElement('div'); note.style.cssText = 'font-size:13px;white-space:pre-line';
  const btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'au-primary'; btn.style.cssText = 'min-height:44px;padding:0 16px;border-radius:9px;align-self:flex-start';
  el.append(note, btn);
  let gen = 0;
  const limit = pick ? PART_BYTES_FILE : PART_BYTES_BLOB;
  const wordsOf = (p: PartPlan): string => (p.of > 1 ? `part ${p.index} of ${p.of}` : 'zip');

  function offer(session: Session, zipName: string, at: Date, onSaved?: () => void): void {
    const mine = ++gen, plan = planParts(session.files(), { bytes: limit }), state: ('todo' | 'making' | 'ready' | 'saved')[] = plan.map(() => 'todo');
    let at0 = 0, working = false;
    const live = (): boolean => mine === gen;
    const paint = (extra = ''): void => {
      const lines: string[] = [];
      if (plan.length > 1) {
        lines.push(`${sizeWords(plan.reduce((n, p) => n + p.bytes, 0))} in all, so it comes as ${plan.length} zips${pick ? '' : ' (Safari cannot hold one that big)'}: save each in turn.`);
        for (const [i, p] of plan.entries()) {
          const mark = state[i] === 'saved' ? '✓' : state[i] === 'todo' ? '·' : '›';
          lines.push(`${mark} ${wordsOf(p)}: ${p.label || 'the capture'}, ${sizeWords(p.bytes)}, ${p.names.length} files${state[i] === 'saved' ? ', saved' : ''}`);
        }
      }
      if (extra) lines.push(extra);
      note.textContent = lines.join('\n');
    };
    const done = (): void => { btn.hidden = true; btn.onclick = null; paint(`${plan.length > 1 ? 'Every part is saved.' : 'Saved.'}`); onSaved?.(); };
    const progress = (n: number, of: number): void => { if (live() && (n % 25 === 0 || n === of)) paint(`Making ${wordsOf(plan[at0]!)}: ${n} of ${of} files…`); };

    /** The Blob way: make part `i` from storage, then offer its Save (the tap itself saves: no await in it before `saveFiles`). */
    const make = async (i: number): Promise<void> => {
      if (i >= plan.length) { done(); return; }
      at0 = i; state[i] = 'making'; btn.disabled = true; btn.hidden = false; btn.textContent = `Making ${wordsOf(plan[i]!)}…`; paint();
      try {
        const z = await session.zip(at, progress, plan[i]!.names);
        if (!live()) return;
        state[i] = 'ready'; btn.disabled = false; btn.textContent = plan.length > 1 ? `Save ${wordsOf(plan[i]!)} (${sizeWords(z.size)})` : 'Save zip';
        btn.onclick = () => {
          const f = new File([z], partName(zipName, plan[i]!), { type: 'application/zip' });
          void saveFiles([f]).then((ok) => {
            if (!ok || !live()) return;
            state[i] = 'saved'; btn.onclick = null; void make(i + 1);
          });
        };
        paint();
      } catch (e) {
        state[i] = 'todo'; btn.disabled = false; btn.textContent = `Try ${wordsOf(plan[i]!)} again`; btn.onclick = () => { void make(i); };
        paint(`The ${wordsOf(plan[i]!)} could not be made: ${String((e as Error)?.message ?? e)}`);
      }
    };

    /** The file way: the tap opens the save dialog (first thing, before any await), then the zip streams into the file. */
    const next = (): number => state.findIndex((s) => s !== 'saved');
    const arm = (): void => {
      const i = next();
      if (i < 0) { done(); return; }
      btn.hidden = false; btn.disabled = false; btn.textContent = plan.length > 1 ? `Save ${wordsOf(plan[i]!)} (${sizeWords(plan[i]!.bytes)})` : `Save zip (${sizeWords(plan[i]!.bytes)})`;
      btn.onclick = () => {
        if (working || !pick) return;
        const handle = pick({ suggestedName: partName(zipName, plan[i]!), types: [{ description: 'Zip', accept: { 'application/zip': ['.zip'] } }] });
        working = true; btn.disabled = true; at0 = i;
        void (async () => {
          let w: WritableFile | null = null;
          try {
            const h = await handle;
            w = await h.createWritable();
            const out = w;
            paint(`Writing ${wordsOf(plan[i]!)}…`);
            await session.zipTo((c) => out.write(c), at, progress, plan[i]!.names);
            await out.close(); w = null;
            state[i] = 'saved'; paint();
          } catch (e) {
            try { await w?.abort?.(); } catch { /* the file is already closed */ }
            // (closing the dialog is not an error)
            paint((e as { name?: string })?.name === 'AbortError' ? '' : `The ${wordsOf(plan[i]!)} could not be written: ${String((e as Error)?.message ?? e)}`);
          } finally { working = false; if (live()) arm(); }
        })();
      };
      paint();
    };

    el.hidden = false; paint();
    if (pick) arm(); else void make(0);
  }

  return { el, offer, clear() { gen++; el.hidden = true; note.textContent = ''; btn.hidden = false; } };
}
