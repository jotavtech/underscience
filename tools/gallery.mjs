/*
 * Capture a light-weight JPEG gallery (one image per world) for the README.
 *   xvfb-run -a node tools/gallery.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'gallery');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

await new Promise(r => server.listen(0, r));
const port = server.address().port;
const b = await chromium.launch({
  executablePath: EXE,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage']
});
const pg = await b.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 });
await pg.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
await pg.waitForSelector('#enterBtn:not([disabled])', { timeout: 8000 }).catch(() => {});
await pg.click('#enterBtn').catch(() => {});
await sleep(800);
await pg.keyboard.press('a').catch(() => {}); // autopilot off

const worlds = ['01-aether', '02-lattice', '03-currents', '04-genesis', '05-singularity'];
for (let i = 0; i < worlds.length; i++) {
  await pg.keyboard.press(String(i + 1));
  await sleep(i === 2 ? 13000 : 3200); // feedback world needs to reach steady state
  await pg.screenshot({ path: path.join(OUT, worlds[i] + '.jpg'), type: 'jpeg', quality: 82 });
  console.log('captured', worlds[i]);
}
await b.close(); server.close();
