// B1 (shell parity): the rows of the 2D shell the 3D app shows, derived from the tables the shell renders from (strings.generated.ts, settings/rows.ts, the key map).
// `wired` is true only where the control does what the 2D one does; a control that is on the screen with the 2D words but says "not in the 3D app yet" is present, not wired.
// A later batch that builds the thing behind a control registers its feature (ui/shell/features.ts) and flips the flag here in the same push.
import { UI } from '../ui/strings.generated.ts';
import { SECTIONS, rowId as settingsId, isWired } from '../ui/settings/rows.ts';
import { isWiredCommand } from '../ui/search/wired.ts';
import { feedbackEmail } from '../ui/shell/feedback.ts';
import type { Claim } from './claim.ts';

const out: Claim[] = [];
const claim = (id: string, wired: boolean) => { out.push({ id, wired }); };
const yes = new Set<string>();   // helper sets read as "these are wired"

// ── top bar, view pills, zoom group ──
const TOP_WIRED = new Set(['btnMenu', 'btnBlood', 'btnLayers', 'legend', 'btnSettings', 'btnPalette']);
for (const t of UI.topbar) claim(`topbar:${t.id}`, TOP_WIRED.has(t.id));
for (const v of UI.views) claim(`view:${v.id}`, v.id !== 'circuit');
for (const z of UI.zoomGroup) claim(`zoom:${z.id}`, z.id !== 'rotateCircuit');

// ── play bar ──
const PB_WIRED = new Set(['Pause', 'Restart this patient', 'Playback speed', 'Jump ahead']);
for (const c of UI.playbar.controls) claim(`playbar:${c}`, PB_WIRED.has(c));
for (const j of UI.playbar.jumps) claim(`playbar:jump ${j.short}`, true);
for (const v of UI.playbar.speeds) claim(`playbar:speed ${v}×`, true);
for (const l of UI.playbar.lapses) claim(`playbar:lapse ${l.short}`, true);

// ── Settings: the rows the sheet renders (Send feedback only where the build has an address, as in 2D) ──
for (const s of SECTIONS) for (const { row } of s.rows) {
  if (row.label === 'Send feedback' && !feedbackEmail()) continue;
  if (row.kind === 'title') continue;   // (the Figure detail heading: its two step rows are the control)
  claim(settingsId(row), isWired(row));
}
for (const l of UI.looks) claim(`look:${l.id}`, true);

// ── Help ──
for (const p of UI.helpPages) claim(`help:${p.label}`, p.label === 'Guide' || p.label === 'Keyboard shortcuts');

// ── shortcuts: the key map (keys/keymap.ts, carried out in keys/useKeys.ts). Wired = the key does what the 2D one does here. ──
const KEYS_WIRED = new Set(['Run the model/Space', 'Run the model/[ ]', 'Run the model/.', 'Run the model/Z', 'Change the view/A', 'Change the view/L', 'Change the view/+ / − / 0', 'Change the view/Ctrl/⌘ K or /', 'Change the view/?', 'Reach and act/Esc',
  'While presenting/Home · End', 'While presenting/?', 'While presenting/→ · Space · Enter']);
const KEYS_PRESENT = new Set(['Run the model/Ctrl/⌘ Z', 'Run the model/P', 'Run the model/J', 'Change the view/I', 'Change the view/T', 'While presenting/← · Backspace', 'While presenting/↑ · ↓', 'While presenting/Esc']);
for (const s of UI.shortcuts) { const k = `${s.group}/${s.keys}`; if (KEYS_WIRED.has(k)) claim(`shortcut:${k}`, !k.startsWith('While presenting/→'));  else if (KEYS_PRESENT.has(k)) claim(`shortcut:${k}`, false); }

// ── search: the commands the 2D palette lists in its App, Time and View groups; each is wired where commands.ts has work behind it ──
const SEARCH_GROUPS = new Set(['App', 'Time', 'View']);
for (const c of UI.search.commands) if (SEARCH_GROUPS.has(c.group)) claim(`search:${c.group}/${c.title}`, isWiredCommand(c.group, c.title));

// ── platform: deep links ──
for (const d of UI.platform.deepLinks) claim(`platform:deep link ?${d}=`, true);
// Built (manifest, icons, the build's service worker) but not yet tried on a device, so present and not wired.
claim('platform:installable PWA', false);
claim('platform:works offline', false);

// ── figure menus: Blood, Layers, Lens, the phone's Layers page ──
const BLOOD_WIRED = new Set(['Chevrons', 'Key chevrons only', 'Potential collaterals', 'Organ names']);
for (const r of UI.menus.blood) claim(`menu:Blood/${r.label}`, BLOOD_WIRED.has(r.label));
for (const r of UI.menus.lobule) claim(`menu:Layers/${r.label}`, r.label !== 'Bile');
for (const r of UI.menus.layersPhone) claim(`menu:Layers (phone)/${r.label}`, r.label === 'Fit to screen');
for (const l of UI.lenses) claim(`menu:Lens/${l.name}`, true);

// ── phone bottom bar and the main menu's tabs ──
for (const t of UI.menus.thumbTabs) claim(`bottombar:${t.label}`, t.id !== 'treat' && t.id !== 'tests');
for (const t of UI.menus.mainMenu.tabs) claim(`mainmenu:tab/${t.label}`, true);

// ── behaviours (the 2D shell's rules, ui/shell/views.ts and the components) ──
const BEH_PRESENT_ONLY = new Set([
  'view pills: Anatomy and Circuit turn the figure between the two views',
]);
for (const b of UI.menus.behaviours) claim(`behaviour:${b}`, !BEH_PRESENT_ONLY.has(b));
void yes;

export const claims: readonly Claim[] = out;
