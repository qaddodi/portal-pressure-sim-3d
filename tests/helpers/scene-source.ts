import { readFileSync, readdirSync } from 'node:fs';

/**
 * The text of the scene's source: src/scene/scene.ts (its state and construction) followed by the parts it is made of
 * (src/scene/parts/*.ts, one per frame system, in name order). The source-reading tests look for code in the scene, wherever it lives.
 */
export function sceneSource(): string {
  const parts = readdirSync('src/scene/parts').filter((n) => n.endsWith('.ts')).sort();
  return [readFileSync('src/scene/scene.ts', 'utf8'), ...parts.map((n) => readFileSync(`src/scene/parts/${n}`, 'utf8'))].join('\n');
}
