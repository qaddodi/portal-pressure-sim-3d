// The registry entry of Across the lobule (tool kind 'lobule'). The specimens' pressures are the model's own (healthy, decompensated cirrhosis and schistosomiasis:
// portal vein, mid-sinusoid, central vein).
import type { ChartKind } from '../registry.ts';
import { lobuleFrame } from './frame.ts';

export const lobuleEntry: ChartKind = {
  kind: 'lobule', what: 'Across the lobule: oxygen or pressure from the portal tract to the central vein, by zone', slides: 4, status: 'done',
  specimens: [
    { id: 'oxygen', label: 'Oxygen: zone 3 receives the least', build: (c) => lobuleFrame({ view: 'oxygen', pv: 8.1, sin: 7.3, cv: 5.2 }, c) },
    { id: 'healthy', label: 'Pressure, healthy: little is lost', build: (c) => lobuleFrame({ view: 'pressure', pv: 8.1, sin: 7.3, cv: 5.2 }, c) },
    { id: 'cirrhosis', label: 'Pressure, cirrhosis: the fall is in the sinusoids', build: (c) => lobuleFrame({ view: 'pressure', pv: 22.7, sin: 22.1, cv: 6.9 }, c) },
    { id: 'schisto', label: 'Pressure, schistosomiasis: the fall is at the portal tract', build: (c) => lobuleFrame({ view: 'pressure', pv: 20.6, sin: 9.5, cv: 5.9 }, c) },
  ],
};
