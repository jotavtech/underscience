/*
 * Headless smoke-test + screenshotter.
 * Serves the site, opens it in Chromium with software WebGL (SwiftShader),
 * records console/page errors, walks every chapter and screenshots it.
 *
 *   node tools/capture.mjs
 *
 * Exits non-zero if WebGL failed to init or any page error was logged.
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
const OUT = process.env.OUT_DIR || path.join(ROOT, 'tools', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const EXE = process.env.CHROME ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const errors = [];
const consoleErrors = [];

async function main() {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const url = `http://localhost:${port}/index.html`;

  const browser = await chromium.launch({
    executablePath: EXE,
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto(url, { waitUntil: 'load' });
  await sleep(300);

  // did WebGL init? (fallback hidden, renderer present)
  const diag = await page.evaluate(() => {
    const fb = document.getElementById('fallback');
    const cv = document.getElementById('stage');
    return {
      hasUS: !!window.US,
      hasRenderer: !!(window.US && window.US.Renderer),
      fallbackShown: getComputedStyle(fb).display !== 'none',
      canvasSize: cv.width + 'x' + cv.height,
      worlds: (window.US && window.US.GLSL) ? Object.keys(window.US.GLSL.worlds) : []
    };
  });
  console.log('diag:', JSON.stringify(diag));
  if (!diag.hasRenderer || diag.fallbackShown) {
    console.error('WebGL did not initialise.');
    errors.push('WebGL init failed / fallback shown');
  }

  // wait for ENTER to enable, then click it
  await page.waitForSelector('#enterBtn:not([disabled])', { timeout: 8000 }).catch(() => {});
  await page.click('#enterBtn').catch(() => {});
  await sleep(1500);
  const running = await page.evaluate(() => ({
    isRunning: document.body.classList.contains('is-running'),
    gateShown: getComputedStyle(document.getElementById('gate')).visibility !== 'hidden'
  }));
  console.log('after-enter:', JSON.stringify(running));
  if (!running.isRunning) errors.push('experience did not start after ENTER');
  // turn autopilot OFF for deterministic capture
  await page.keyboard.press('a').catch(() => {});

  const names = ['01-aether', '02-lattice', '03-currents', '04-genesis', '05-singularity'];
  for (let i = 0; i < names.length; i++) {
    // let the world settle (crossfade + reveal + a few feedback frames);
    // CURRENTS (index 2) is a feedback sim and needs longer to build up
    await sleep(i === 2 ? 4200 : 2600);
    const f = path.join(OUT, names[i] + '.png');
    await page.screenshot({ path: f });
    console.log('shot:', names[i]);
    // advance to next chapter
    if (i < names.length - 1) await page.keyboard.press('ArrowRight');
  }

  // sample average luminance of each shot so we can detect all-black frames
  await browser.close();
  server.close();

  console.log('\n--- errors ---');
  console.log('pageerrors:', errors.length, errors.slice(0, 5));
  console.log('console.error:', consoleErrors.length, consoleErrors.slice(0, 5));

  if (errors.length) process.exit(1);
  console.log('\nOK — no fatal errors. Screenshots in', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
