/*
 * WORLD 02 — LATTICE
 * A crystalline mandala. Space is folded into N-fold kaleidoscopic
 * symmetry and, in log-polar coordinates (so the crystal grows endlessly
 * toward the center), several rotated "gyroid line" fields are stacked.
 * Each field lights up only along its thin zero-set, so the result reads
 * as a luminous geometric web on true black — not fog. Nodes where lines
 * cross sparkle on the beat.
 */
(function (root) {
  'use strict';
  var US = (root.US = root.US || {});
  US.GLSL = US.GLSL || { worlds: {}, post: {} };
  US.GLSL.worlds = US.GLSL.worlds || {};

  US.GLSL.worlds.lattice = [
    'void main(){',
    '  vec2 R = uResolution;',
    '  vec2 uv = (gl_FragCoord.xy - 0.5*R)/R.y;',
    '  uv += (uMouse-0.5)*0.15;',
    '  uv *= rot(uTime*0.03);',
    '  float r = length(uv) + 1e-4;',
    '  float a = atan(uv.y, uv.x);',
    '',
    '  // N-fold kaleidoscope mirror symmetry',
    '  float N = 6.0;',
    '  float seg = TAU / N;',
    '  a = mod(a, seg); a = abs(a - seg*0.5);',
    '',
    '  // log-polar: endless inward growth',
    '  float lr = log(r);',
    '  vec2 kp = vec2(a*5.0, lr*2.2 + uTime*0.06);',
    '',
    '  // stacked, rotated gyroid line-fields -> crystalline web',
    '  vec3 col = vec3(0.0);',
    '  for(int i=0;i<4;i++){',
    '    float fi = float(i);',
    '    vec2 q = kp*(1.0 + fi*0.7) + fi*4.0;',
    '    q *= rot(0.3*fi + uTime*0.02*(fi+1.0));',
    '    q += 0.3*vec2(sin(q.y*1.3), cos(q.x*1.3));   // soft warp',
    '    float g = abs(dot(sin(q), cos(q.yx)));        // zero-set = lines',
    '    float line = smoothstep(0.14 + 0.06*uMid, 0.0, g);',
    '    float hue = 0.56 + 0.07*fi + 0.1*sin(uTime*0.2 + fi) + 0.08*uTreble;',
    '    vec3 tint = palette(hue, vec3(0.5,0.5,0.6), vec3(0.42,0.4,0.5),',
    '                        vec3(1.0,1.0,1.0), vec3(0.0,0.25,0.55));',
    '    col += line * tint * (0.6 / (1.0 + fi*0.8));',
    '  }',
    '',
    '  // bright nodes where lines pile up; sparkle on the beat',
    '  float node = pow(max(col.r, max(col.g, col.b)), 3.0);',
    '  col += node * (0.4 + 1.6*uBeat) * vec3(0.7,0.85,1.0);',
    '',
    '  // small central seed glow + faint cold ambient',
    '  col += exp(-r*5.0) * (0.25 + 0.3*uBass) * vec3(0.6,0.8,1.0);',
    '  col += vec3(0.005,0.008,0.020);',
    '',
    '  col = col / (1.0 + col*0.3);          // soft roll-off',
    '  col *= 1.0 - 0.5*dot(uv,uv);          // vignette',
    '',
    '  float reveal = smoothstep(0.0,1.0, uIntro*1.4 - r*0.4);',
    '  col *= clamp(reveal, 0.0, 1.0);',
    '  gl_FragColor = vec4(max(col,0.0), 1.0);',
    '}'
  ].join('\n');

  if (typeof module !== 'undefined' && module.exports) module.exports = true;
})(typeof window !== 'undefined' ? window : globalThis);
