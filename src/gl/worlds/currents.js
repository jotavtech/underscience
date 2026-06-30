/*
 * WORLD 03 — CURRENTS
 * Luminous ink in an invisible fluid. This world is a feedback shader:
 * each frame samples the *previous* frame (uPrev) slightly upstream along
 * a curl-noise velocity field (divergence-free, so it swirls like a real
 * fluid), dissipates a little, then injects fresh dye from drifting
 * emitters, the cursor, and audio onsets. The result is endlessly
 * advecting filaments of light.
 */
(function (root) {
  'use strict';
  var US = (root.US = root.US || {});
  US.GLSL = US.GLSL || { worlds: {}, post: {} };
  US.GLSL.worlds = US.GLSL.worlds || {};

  US.GLSL.worlds.currents = [
    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 R = uResolution;',
    '  vec2 asp = vec2(R.x/R.y, 1.0);',
    '  vec2 p = (uv-0.5)*asp;',
    '',
    '  // --- velocity field (curl noise => incompressible swirl) -----',
    '  float t = uTime*0.05;',
    '  vec2 v  = curl(p*1.5 + vec2(0.0, t)) * 1.3;',
    '  v += curl(p*3.1 - vec2(t,0.0)) * 0.45;',
    '  v += curl(p*6.0 + 7.0) * 0.18;',
    '  // gentle global rotation around center',
    '  v += vec2(-p.y, p.x) * 0.25;',
    '  // cursor stirs the fluid',
    '  vec2 m = (uMouse-0.5)*asp;',
    '  vec2 dm = p - m;',
    '  v += normalize(dm + 1e-4) * (-0.6) * exp(-dot(dm,dm)*12.0);',
    '',
    '  // --- advect: read previous frame upstream --------------------',
    '  vec2 vel = v / asp;            // back to uv space',
    '  float dt = 0.0030 * (1.0 + 0.8*uBass);',
    '  vec3 prev = texture2D(uPrev, uv - vel*dt).rgb;',
    '  prev *= 0.965;                 // dissipation',
    '  vec3 col = prev;',
    '  float pl = clamp(luma(prev), 0.0, 1.0);',
    '  float headroom = 1.0 - pl;     // inject only into darkness => never whites out',
    '',
    '  // cyan -> violet ink palette (deliberately no green)',
    '  vec3 inkA = vec3(0.20, 0.80, 1.00);',
    '  vec3 inkB = vec3(0.62, 0.42, 1.00);',
    '',
    '  // --- structured seeding: THIN iso-contour lines that the flow',
    '  //     advects into long electric filaments. Headroom-limited. ----',
    '  vec2 sp = p*2.4; sp *= rot(uTime*0.04);',
    '  float fa = fbm(sp + vec2(uTime*0.05, uTime*0.12));',
    '  float fb = fbm(sp*1.9 - uTime*0.07);',
    '  float thread = smoothstep(0.045, 0.0, abs(fa - 0.5));',
    '  thread += 0.6 * smoothstep(0.03, 0.0, abs(fb - 0.5));',
    '  thread *= (0.06 + 0.06*uMid);',
    '  vec3 threadCol = mix(inkA, inkB, 0.5 + 0.5*sin(fa*6.0 + uTime*0.3));',
    '  col += thread * headroom * threadCol;',
    '',
    '  // a few drifting emitters add brighter cores',
    '  for(int i=0;i<3;i++){',
    '    float fi = float(i);',
    '    float ph = fi*2.1 + uSeed*6.0;',
    '    vec2 e = vec2(0.66*sin(uTime*(0.37+0.09*fi)+ph),',
    '                  0.44*cos(uTime*(0.31+0.07*fi)+ph*1.3));',
    '    float amt = smoothstep(0.03, 0.0, length(p - e)) * 0.07;',
    '    col += amt * headroom * mix(inkA, inkB, fi*0.5);',
    '  }',
    '  // cursor paints bright ink',
    '  col += smoothstep(0.04,0.0,length(dm)) * 0.06 * headroom * vec3(0.7,0.95,1.0);',
    '  // beats pulse a ring of dye from center',
    '  float ring = smoothstep(0.013,0.0, abs(length(p) - (0.15+0.5*uBeat)));',
    '  col += ring * uBeat * mix(inkA, inkB, 0.6) * 0.25;',
    '',
    '  col = clamp(col, 0.0, 1.2);',
    '',
    '  // intro: ink blooms outward from center',
    '  float reveal = smoothstep(0.0,1.0, uIntro*1.5 - length(p)*0.6);',
    '  col *= mix(0.0, 1.0, clamp(reveal,0.0,1.0));',
    '',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  if (typeof module !== 'undefined' && module.exports) module.exports = true;
})(typeof window !== 'undefined' ? window : globalThis);
