// The 2D menu code is plain JS (menu-pure.generated.js); this gives its options function the type of its second argument.
import { menuOptions as menuOptions0 } from './menu-pure.generated.js';
export const menuOptionsOf = menuOptions0 as (params: unknown, rows?: readonly string[] | null) => { id: string; name: string; short?: string }[];
