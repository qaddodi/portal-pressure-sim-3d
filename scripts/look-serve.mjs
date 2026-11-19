// `npm run look:serve` (WP11): Vite on this computer plus a tiny save endpoint for the look board. Open http://localhost:5173/?look in the browser (add &twod for the 2D app beside each row).
//   GET  /__look/info          { commit, dirs }          the short commit the pictures go under, the folders already in look/
//   POST /__look/save?file=<state>.png   body: the PNG    writes look/<commit>/<state>.png
//   POST /__look/promote       copies look/<commit>/ over look/baseline/ (the board's "Make this run the baseline")
// Everything stays on this computer; nothing is pushed. Run `npm run look:diff` afterwards for the contact sheet (look/<commit>/index.html).
import { createServer } from 'vite';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const lookDir = `${root}look/`;
const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' }).stdout?.trim() || '';
export const safeName = (n) => /^[a-z0-9][a-z0-9.-]*\.png$/.test(n || '') ? n : null;
export const commitDir = () => `${git('rev-parse', '--short', 'HEAD') || 'work'}${git('status', '--porcelain') ? '-dirty' : ''}`;

const plugin = {
  name: 'look-save',
  configureServer(server) {
    const dir = commitDir();
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url, 'http://x');
      if (!url.pathname.startsWith('/__look/')) return next();
      const send = (code, body) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
      if (url.pathname === '/__look/info') return send(200, { commit: dir, dirs: existsSync(lookDir) ? readdirSync(lookDir).filter((d) => !d.includes('.')) : [] });
      if (req.method !== 'POST') return send(405, { error: 'POST only' });
      if (url.pathname === '/__look/promote') {
        if (!existsSync(`${lookDir}${dir}`)) return send(404, { error: 'nothing saved yet' });
        rmSync(`${lookDir}baseline`, { recursive: true, force: true }); cpSync(`${lookDir}${dir}`, `${lookDir}baseline`, { recursive: true });
        return send(200, { ok: true });
      }
      if (url.pathname === '/__look/save') {
        const file = safeName(url.searchParams.get('file'));
        if (!file) return send(400, { error: 'bad file name' });
        const chunks = []; req.on('data', (c) => chunks.push(c));
        req.on('end', () => { mkdirSync(`${lookDir}${dir}`, { recursive: true }); writeFileSync(`${lookDir}${dir}/${file}`, Buffer.concat(chunks)); send(200, { ok: true }); });
        return;
      }
      send(404, { error: 'no such endpoint' });
    });
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await createServer({ root, plugins: [plugin], server: { host: true, port: 5173, fs: { allow: [root] } } });
  await server.listen();
  server.printUrls();
  console.log(`\nOpen  http://localhost:5173/?look   (add &twod for the 2D app beside each row)\nPictures go to look/${commitDir()}/ ; afterwards: npm run look:diff`);
}
