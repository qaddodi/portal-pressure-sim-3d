// The days shown, glided: a window set by a word or a row eases to its new place (the clock's own Tweened); a drag or a wheel sets it at once.
import { useEffect, useRef, useState } from 'react';
import { clock } from '../../clock/frame.ts';
import { Tweened, easeArrive } from '../../clock/tween.ts';

export function useGlide(target: readonly [number, number], snap: boolean, ms = 300): [number, number] {
  const a = useRef(new Tweened(target[0], 'bigtime-a')), b = useRef(new Tweened(target[1], 'bigtime-b'));
  const [v, setV] = useState<[number, number]>([target[0], target[1]]);
  useEffect(() => {
    const A = a.current, B = b.current;
    if (snap) { A.to(target[0], { ms: 0 }); B.to(target[1], { ms: 0 }); setV([target[0], target[1]]); return; }
    A.to(target[0], { ms, ease: easeArrive }); B.to(target[1], { ms, ease: easeArrive });
    const off = clock.on('tween', () => { setV([A.value, B.value]); if (!A.moving && !B.moving) off(); }, 5);
    return off;
  }, [target[0], target[1], snap, ms]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { a.current.dispose(); b.current.dispose(); }, []);
  return v;
}
