// A shown number that rolls to the new patient's while one is being switched in (patients/switching.ts), and is plain text otherwise (a live tick never rolls). Display only: the model's numbers are not blended.
import { Roll } from '../cards/Roll.tsx';
import { useSwitching } from './switching.ts';

export function SwitchNum({ text }: { text: string | number }) {
  const on = useSwitching((s) => s.on);
  const t = String(text);
  return on && t ? <Roll text={t} /> : <>{t}</>;
}
