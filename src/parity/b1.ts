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
const TOP_WIRED = new Set(['btnMenu', 'btnBlood', 'btnLayers', 'legend', 'btnSettings', 'btnPalette', 'btnHistory', 'btnTreat', 'tabInstruments', 'btnLobuleLayers']);   // (Treat and Tests: registered by ui/action/boot.ts and ui/tests/TestsLayer.tsx; Layers: the lobule's switches reach the scene)
for (const t of UI.topbar) claim(`topbar:${t.id}`, TOP_WIRED.has(t.id));
for (const v of UI.views) claim(`view:${v.id}`, true);   // (the Circuit pill: B7)
for (const z of UI.zoomGroup) claim(`zoom:${z.id}`, true);   // (Turn upright: B7)

// ── play bar ──
const PB_WIRED = new Set(['Pause', 'Restart this patient', 'Playback speed', 'Jump ahead', 'History', 'Compare from here']);
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
for (const p of UI.helpPages) claim(`help:${p.label}`, true);   // (Guide and Keyboard shortcuts: HelpSheets.tsx; About the model, References and Privacy: Pages.tsx, the 2D app's own pages)

// ── shortcuts: the key map (keys/keymap.ts, carried out in keys/useKeys.ts). Wired = the key does what the 2D one does here. ──
const KEYS_WIRED = new Set(['Run the model/Space', 'Run the model/[ ]', 'Run the model/.', 'Run the model/Z', 'Run the model/Ctrl/⌘ Z', 'Run the model/P', 'Change the view/A', 'Change the view/L', 'Change the view/+ / − / 0', 'Change the view/Ctrl/⌘ K or /', 'Change the view/?', 'Reach and act/Esc',
  'While presenting/Home · End', 'While presenting/?', 'While presenting/→ · Space · Enter',
  'Run the model/J', 'Change the view/I', 'Change the view/T', 'While presenting/← · Backspace', 'While presenting/↑ · ↓', 'While presenting/Esc',
  'While presenting/Number, then Enter', 'While presenting/G', 'While presenting/P', 'While presenting/B or .', 'While presenting/F', 'While presenting/L',
  'Reach and act/Click', 'Reach and act/1 – 9', 'Reach and act/Tab · Enter']);
const KEYS_PRESENT = new Set<string>([]);
for (const s of UI.shortcuts) { const k = `${s.group}/${s.keys}`; if (KEYS_WIRED.has(k)) claim(`shortcut:${k}`, !k.startsWith('While presenting/→'));  else if (KEYS_PRESENT.has(k)) claim(`shortcut:${k}`, false); }

// ── search: the commands the 2D palette lists in its App, Time and View groups; each is wired where commands.ts has work behind it ──
const SEARCH_GROUPS = new Set(['App', 'Time', 'View', 'Go to']);   // (Go to: a structure by name becomes the selection, 2D palette.js ctx.select)
for (const c of UI.search.commands) if (SEARCH_GROUPS.has(c.group)) claim(`search:${c.group}/${c.title}`, isWiredCommand(c.group, c.title));

// ── platform: deep links ──
for (const d of UI.platform.deepLinks) claim(`platform:deep link ?${d}=`, true);
// Built (manifest, icons, the build's service worker) but registered by main.tsx, which another thread owns, and not yet tried on a device: present, not wired.
claim('platform:installable PWA', false);
claim('platform:works offline', false);

// ── figure menus: Blood, Layers, Lens, the phone's Layers page ──
const BLOOD_WIRED = new Set(['Chevrons', 'Key chevrons only', 'Potential collaterals', 'Organ names']);
for (const r of UI.menus.blood) claim(`menu:Blood/${r.label}`, BLOOD_WIRED.has(r.label));
for (const r of UI.menus.lobule) claim(`menu:Layers/${r.label}`, r.label !== 'Bile');
for (const r of UI.menus.layersPhone) claim(`menu:Layers (phone)/${r.label}`, r.label === 'Fit to screen' || r.label === 'Turn upright');
for (const l of UI.lenses) claim(`menu:Lens/${l.name}`, true);

// ── phone bottom bar and the main menu's tabs ──
for (const t of UI.menus.thumbTabs) claim(`bottombar:${t.label}`, true);   // (Treat and Tests run their registered features)
for (const t of UI.menus.mainMenu.tabs) claim(`mainmenu:tab/${t.label}`, true);

// ── behaviours (the 2D shell's rules, ui/shell/views.ts and the components) ──
const BEH_PRESENT_ONLY = new Set<string>([]);   // (the Anatomy ⇄ Circuit turn is B7's, wired)
for (const b of UI.menus.behaviours) claim(`behaviour:${b}`, !BEH_PRESENT_ONLY.has(b));
void yes;

export const claims: readonly Claim[] = out;
