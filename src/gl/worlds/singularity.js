/*
 * WORLD 04 — SINGULARITY
 * A black hole. The background starfield is bent by an inverse-square
 * "gravitational" warp; a tilted accretion disk swirls with Keplerian
 * shear (inner edge faster than outer) and Doppler beaming (the side
 * rotating toward us is brighter); a thin photon ring haloes the event
 * horizon, inside which all light is extinguished.
 */
(function (root) {
  'use strict';
  var US = (root.US = root.US || {});
  US.GLSL = US.GLSL || { worlds: {}, post: {} };
  US.GLSL.worlds = US.GLSL.worlds || {};

  US.GLSL.worlds.singularity = [
    'void main(){',
    '  vec2 R = uResolution;',
    '  vec2 uv = (gl_FragCoord.xy - 0.5*R)/R.y;',
    '  uv *= rot(0.08*sin(uTime*0.05));',
    '  vec2 par = (uMouse-0.5)*0.22;',
    '  vec2 q = uv + par;',
    '',
    '  float r  = length(q) + 1e-4;',
    '  float rh = 0.16 + 0.015*uBass;     // event horizon radius',
    '',
    '  // --- lensed background --------------------------------------',
    '  float lens = (rh*rh) / (r*r);',
    '  vec2 ldir = q * (1.0 + 1.6*lens);',
    '  vec3 bg  = starField(ldir, 15.0, uTime) * 1.1;',
    '  bg += starField(ldir*1.9 + 5.0, 30.0, uTime*1.2) * 0.5;',
    '  bg += vec3(0.012,0.018,0.045) * fbm(ldir*2.2 + uTime*0.02);  // faint cold dust',
    '',
    '  // --- accretion disk (tilted ellipse) ------------------------',
    '  vec2 dq = q; dq.y /= 0.40;          // tilt to an ellipse',
    '  float dr = length(dq);',
    '  float da = atan(dq.y, dq.x);',
    '  float inner = 0.28, outer = 0.78;',
    '  float band = smoothstep(inner, inner+0.05, dr) * (1.0 - smoothstep(outer-0.26, outer, dr));',
    '  float speed = uTime * (0.5 / pow(max(dr,0.12), 1.5));   // keplerian',
    '  float turb = fbm(vec2(da*2.0 - speed, dr*7.0 + speed*0.3));',
    '  float disk = band * (0.25 + 0.8*turb);',
    '  float doppler = 0.40 + 0.60*sin(da + 1.2);  // approaching side brighter',
    '  disk *= 0.4 + 1.6*doppler*doppler;',
    '  // warm ramp: deep orange at the rim, white-hot toward the horizon',
    '  vec3 diskcol = mix(vec3(1.0,0.34,0.07), vec3(1.0,0.92,0.76),',
    '                     clamp(turb*0.55 + (0.6-dr)*1.5, 0.0, 1.0));',
    '',
    '  // --- photon ring around the horizon -------------------------',
    '  float pr = smoothstep(0.012, 0.0, abs(r - rh*1.55));',
    '  vec3 ring = pr * vec3(1.0,0.92,0.8) * (1.0 + 1.3*uTreble);',
    '',
    '  // --- compose ------------------------------------------------',
    '  vec3 col = bg * (1.0 - band*0.8);                 // disk occludes bg',
    '  col += diskcol * disk * (0.9 + 1.6*uBeat);',
    '  col += ring;',
    '  // inner glow lip just outside horizon',
    '  col += exp(-(r-rh)*26.0) * step(rh, r) * vec3(1.0,0.6,0.3) * (0.35+0.8*uBeat);',
    '',
    '  // extinguish everything inside the event horizon',
    '  col *= smoothstep(rh*0.92, rh*1.04, r);',
    '',
    '  // intro: horizon swallows then releases the field',
    '  float reveal = smoothstep(0.0, 1.0, uIntro*1.5 - abs(r-0.5)*0.4);',
    '  col *= clamp(reveal, 0.0, 1.0);',
    '',
    '  gl_FragColor = vec4(max(col,0.0), 1.0);',
    '}'
  ].join('\n');

  if (typeof module !== 'undefined' && module.exports) module.exports = true;
})(typeof window !== 'undefined' ? window : globalThis);
