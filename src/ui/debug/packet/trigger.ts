// The three ways to ask "What's wrong here?" (the 2D app's packet/trigger.js), on the preview copy only: the chord Alt+Shift+/ (Option+Shift+? on a Mac), a 0.7 s hold on the
// orange PREVIEW pill (a short tap still reloads onto the newest build), and `pps.packet.open()` (the debug page's Tools button and the Settings link call it).
//   pps.packet.build(note) -> the packet object   pps.packet.text(note) -> the text to paste   pps.packet.open() -> the sheet
//   pps.packet.parse(text), pps.packet.apply(x)   -> read a packet; put a state's extras on this page (a replay in the browser)
import { packetText, parsePacket } from '../core/packet.copied.js';
import { isChord, longPress, BADGE_CSS } from '../core/press.copied.js';
import { packetNow } from './sources.ts';
import { openPacketSheet } from './sheet.ts';
import { applyExtras, applyFromAddress } from './apply.ts';
import { attach, pps } from '../pps.ts';
import { useShell } from '../../shell/store.ts';

export function installPacketTrigger(win: Window = window, doc: Document = document): Record<string, unknown> | null {
  if (pps(win as never).packet) return null;
  const say = (t: string) => useShell.getState().say(t);
  const build = (note = '') => packetNow({ note });
  const open = () => openPacketSheet({ build, doc, say });
  const api = { build, text: async (note?: string) => packetText(await build(note)), open, parse: parsePacket, apply: applyExtras, isPreview: true };
  attach('packet', api, win as never);
  win.addEventListener('keydown', (e) => { if (isChord(e)) { e.preventDefault(); e.stopImmediatePropagation(); open(); } }, true);
  // the pill is drawn by React (BuildPill) a moment after boot: wait for it, once
  const hook = () => {
    const badge = doc.getElementById('preview-badge');
    if (!badge || badge.dataset.packet) return !!badge;
    badge.dataset.packet = '1';
    const st = doc.createElement('style'); st.textContent = BADGE_CSS; doc.head.append(st);
    longPress(badge, open);
    return true;
  };
  if (!hook()) { const t = setInterval(() => { if (hook()) clearInterval(t); }, 500); setTimeout(() => clearInterval(t), 20000); }
  const skipped = applyFromAddress(win.location.hash);
  if (skipped?.length) console.warn('[packet] not applied:', skipped.join('; '));
  return api;
}
