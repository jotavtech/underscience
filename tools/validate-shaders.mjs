/*
 * Compile-test every shader program against a real WebGL1 driver.
 *
 * We can't see a screen in this environment, so this is how we gain
 * confidence the GLSL actually compiles & links. headless-gl needs an
 * X display, so run it under xvfb:
 *
 *     xvfb-run -a node tools/validate-shaders.mjs
 *
 * Exit code is non-zero if any program fails to compile or link.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Load the shader registry + every world/post module (they self-register
// onto globalThis.US.GLSL, exactly like the browser does).
require(path.join(root, 'src/gl/shaders.js'));
const files = [
  'src/gl/worlds/aether.js',
  'src/gl/worlds/lattice.js',
  'src/gl/worlds/currents.js',
  'src/gl/worlds/singularity.js',
  'src/gl/worlds/genesis.js',
  'src/gl/post/post.js'
];
for (const f of files) {
  try { require(path.join(root, f)); }
  catch (e) { console.error(`! could not load ${f}: ${e.message}`); }
}

const GLSL = globalThis.US.GLSL;

let createGL;
try {
  createGL = require('gl');
} catch (e) {
  console.error('headless-gl (npm "gl") is not installed:', e.message);
  process.exit(2);
}

const gl = createGL(256, 256, { preserveDrawingBuffer: true });
if (!gl) {
  console.error('Could not create a WebGL context. Run under xvfb-run.');
  process.exit(2);
}

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS);
  const log = gl.getShaderInfoLog(sh);
  return { sh, ok, log };
}

function annotate(src, log) {
  // headless-gl reports "ERROR: 0:LINE:" — show the offending lines.
  const lines = src.split('\n');
  const nums = new Set();
  const re = /0:(\d+)/g;
  let m;
  while ((m = re.exec(log)) !== null) nums.add(parseInt(m[1], 10));
  if (!nums.size) return '';
  let out = '';
  for (const n of [...nums].sort((a, b) => a - b)) {
    for (let i = n - 2; i <= n; i++) {
      if (i >= 1 && i <= lines.length) {
        out += `   ${String(i).padStart(4)} | ${lines[i - 1]}\n`;
      }
    }
    out += '   ----\n';
  }
  return out;
}

const vs = compile(gl.VERTEX_SHADER, GLSL.vertex);
if (!vs.ok) {
  console.error('VERTEX shader failed:\n' + vs.log);
  process.exit(1);
}

const programs = [];
for (const [k, v] of Object.entries(GLSL.worlds)) programs.push(['world:' + k, v]);
for (const [k, v] of Object.entries(GLSL.post)) programs.push(['post:' + k, v]);

let failures = 0;
for (const [name, src] of programs) {
  const full = GLSL.assemble(src);
  const fs = compile(gl.FRAGMENT_SHADER, full);
  if (!fs.ok) {
    failures++;
    console.error(`✗ ${name} — FRAGMENT compile failed`);
    console.error(fs.log.trim());
    console.error(annotate(full, fs.log));
    continue;
  }
  // also link, to catch varying / uniform mismatches
  const prog = gl.createProgram();
  gl.attachShader(prog, vs.sh);
  gl.attachShader(prog, fs.sh);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    failures++;
    console.error(`✗ ${name} — LINK failed`);
    console.error(gl.getProgramInfoLog(prog).trim());
    continue;
  }
  const lc = full.split('\n').length;
  console.log(`✓ ${name.padEnd(20)} compiled & linked  (${lc} lines)`);
}

console.log('');
if (failures) {
  console.error(`${failures} program(s) failed.`);
  process.exit(1);
}
console.log('All shader programs compiled & linked cleanly.');
