// The Differences panel (Compare's table): a panel of the panel shell, in the sheets' chunk, so the shell's panel code is not in the boot entry with the banner (CompareUi.tsx).
import { ShellPanel } from '../surface/Panel.tsx';
import { Differences } from './CompareUi.tsx';
import { CMP } from './words.ts';

export function DifferencesSheet() {
  return <ShellPanel id="compare" label={CMP.tableBtn} head={CMP.tableBtn}><div className="cmp-section"><Differences /></div></ShellPanel>;
}
