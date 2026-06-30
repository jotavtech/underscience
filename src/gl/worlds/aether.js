/*
 * WORLD 01 — AETHER
 * A domain-warped nebula drifting in deep space. Two layers of fbm are
 * folded into each other (Inigo Quilez style domain warping) to create
 * turbulent, cloud-like structure, lit by an internal cosine palette and
 * dusted with a parallax starfield. Bass swells the cloud; treble adds
 * glints; beats bloom the core.
 */
(function (root) {
  'use strict';
  var US = (root.US = root.US || {});
  US.GLSL = US.GLSL || { worlds: {}, post: {} };
  US.GLSL.worlds = US.GLSL.worlds || {};

  US.GLSL.worlds.aether = [
    'void main(){',
    '  vec2 R = uResolution;',
    '  vec2 uv = (gl_FragCoord.xy - 0.5*R)/R.y;',
    '',
    '  // gentle parallax: mouse + slow drift',
    '  vec2 par = (uMouse-0.5)*0.35;',
    '  float t = uTime*0.06 + uSeed*10.0;',
    '',
    '  // base sample coordinate, slowly rotating & breathing',
    '  vec2 p = uv*1.6 + par;',
    '  p *= rot(0.05*sin(uTime*0.05));',
    '  float zoom = 1.0 + 0.18*sin(uTime*0.07) + uBass*0.25;',
    '  p /= zoom;',
    '',
    '  // --- domain warp ---------------------------------------------',
    '  vec2 q = vec2(fbm(p + vec2(0.0,t)), fbm(p + vec2(5.2,1.3) - t));',
    '  vec2 r = vec2(fbm(p + 3.4*q + vec2(1.7,9.2) + 0.15*t),',
    '                fbm(p + 3.4*q + vec2(8.3,2.8) - 0.12*t));',
    '  float f = fbm(p + 3.6*r);',
    '',
    '  // density shaping — punchy clouds with deep dark voids',
    '  float dens = f*f*(2.2 - 1.2*f);',
    '  dens = pow(dens, 2.3 - 0.4*uMid);',
    '  dens = max(dens - 0.04, 0.0);',
    '',
    '  // --- color ----------------------------------------------------',
    '  // mix palettes by warp magnitude so structure reads as color',
    '  float warp = length(q) + 0.6*length(r);',
    '  vec3 deep = palette(0.55 + 0.25*warp + 0.05*uTime*0.02,',
    '                      vec3(0.06,0.08,0.16), vec3(0.26,0.18,0.45),',
    '                      vec3(1.0,1.0,1.0), vec3(0.00,0.18,0.52));',
    '  vec3 hot  = palette(0.15 + 0.5*f + 0.1*warp,',
    '                      vec3(0.50,0.28,0.30), vec3(0.45,0.30,0.25),',
    '                      vec3(1.0,0.9,0.7), vec3(0.10,0.25,0.55));',
    '  vec3 col = mix(deep, hot, smoothstep(0.45,0.98,f)) * dens;',
    '',
    '  // inner glow toward a moving core — tight + restrained',
    '  vec2 core = vec2(0.18*sin(uTime*0.11), 0.12*cos(uTime*0.09));',
    '  float gd = length(uv - core);',
    '  float glow = exp(-gd*4.6) * (0.20 + 0.5*uBass + 0.8*uBeat);',
    '  col += glow * vec3(0.42,0.36,0.85);',
    '  col += exp(-gd*9.0) * (0.22 + uBeat) * vec3(0.85,0.82,1.0);',
    '',
    '  // filamentary highlights driven by treble',
    '  float fil = smoothstep(0.64,0.92,f) * (0.2 + 1.2*uTreble);',
    '  col += fil * vec3(0.6,0.8,1.0) * 0.35;',
    '',
    '  // --- starfield (parallax background) -------------------------',
    '  vec2 sdir = uv + par*2.0;',
    '  col += starField(sdir, 14.0, uTime) * (1.0 - dens*0.9);',
    '  col += starField(sdir*1.7 + 3.1, 26.0, uTime*1.3) * 0.5 * (1.0 - dens*0.9);',
    '',
    '  // subtle nebula self-shadowing for depth',
    '  col *= 0.7 + 0.4*fbm(p*0.7 - t);',
    '  col *= 0.82;',
    '',
    '  // intro reveal: iris open from the core outward',
    '  float reveal = smoothstep(0.0, 1.0, uIntro*1.6 - gd*0.9);',
    '  col *= reveal;',
    '',
    '  gl_FragColor = vec4(max(col,0.0), 1.0);',
    '}'
  ].join('\n');

  if (typeof module !== 'undefined' && module.exports) module.exports = true;
})(typeof window !== 'undefined' ? window : globalThis);
