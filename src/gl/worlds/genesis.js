/*
 * WORLD 05 — GENESIS
 * The science of life. An animated Voronoi tessellation reads as a sheet
 * of living cells: glowing nuclei, membrane edges, and "firing" cells
 * that flash on the beat and propagate like a neural network waking up.
 */
(function (root) {
  'use strict';
  var US = (root.US = root.US || {});
  US.GLSL = US.GLSL || { worlds: {}, post: {} };
  US.GLSL.worlds = US.GLSL.worlds || {};

  US.GLSL.worlds.genesis = [
    '// animated voronoi: returns vec4(F1, cellId, edge=F2-F1, cellAngle)',
    'vec4 voronoi(vec2 p){',
    '  vec2 n = floor(p), f = fract(p);',
    '  float F1 = 8.0, F2 = 8.0, id = 0.0;',
    '  for(int j=-1;j<=1;j++){',
    '    for(int i=-1;i<=1;i++){',
    '      vec2 g = vec2(float(i), float(j));',
    '      vec2 o = hash22(n+g);',
    '      o = 0.5 + 0.5*sin(uTime*0.4 + TAU*o);   // cells drift',
    '      vec2 r = g + o - f;',
    '      float d = dot(r,r);',
    '      if(d < F1){ F2=F1; F1=d; id=hash21(n+g); }',
    '      else if(d < F2){ F2=d; }',
    '    }',
    '  }',
    '  return vec4(sqrt(F1), id, sqrt(F2)-sqrt(F1), 0.0);',
    '}',
    '',
    'void main(){',
    '  vec2 R = uResolution;',
    '  vec2 uv = (gl_FragCoord.xy - 0.5*R)/R.y;',
    '  vec2 par = (uMouse-0.5)*0.3;',
    '  float scale = 4.5 + 1.5*sin(uTime*0.05);',
    '  vec2 p = uv*scale + par*scale*0.3;',
    '  p += 0.3*vec2(fbm(p*0.5+uTime*0.03), fbm(p*0.5-uTime*0.03)); // warp tissue',
    '',
    '  vec4 v = voronoi(p);',
    '  float F1 = v.x, id = v.y, edge = v.z;',
    '',
    '  // membranes: bright where two cells meet',
    '  float membrane = smoothstep(0.06, 0.0, edge);',
    '  // nucleus glow at each cell center',
    '  float nucleus = exp(-F1*F1*7.0);',
    '',
    '  // firing: some cells pulse, beats make them fire harder + spread',
    '  float phase = id*TAU + uTime*(0.6 + id*1.5);',
    '  float fire = pow(0.5+0.5*sin(phase), 6.0);',
    '  fire *= step(0.45, id);',
    '  fire = fire*(0.3 + 1.7*uMid) + nucleus*uBeat*step(0.6,id)*2.0;',
    '',
    '  // color per cell — cool tissue, warm firing',
    '  vec3 cellCol = palette(0.55 + 0.25*id + 0.05*uTime*0.02,',
    '                         vec3(0.2,0.3,0.35), vec3(0.25,0.3,0.4),',
    '                         vec3(1.0,1.0,1.0), vec3(0.1,0.3,0.55));',
    '  vec3 fireCol = mix(vec3(0.2,0.9,0.8), vec3(1.0,0.85,0.5), id);',
    '',
    '  vec3 col = vec3(0.0);',
    '  col += cellCol * nucleus * (0.5 + 0.6*uBass);',
    '  col += vec3(0.4,0.7,0.9) * membrane * (0.25 + 0.6*uTreble);',
    '  col += fireCol * fire;',
    '',
    '  // faint cytoplasm gradient inside cells',
    '  col += cellCol * (0.12) * (1.0 - smoothstep(0.0,0.9,F1));',
    '',
    '  // subtle global breathing + vignette',
    '  col *= 0.8 + 0.2*sin(uTime*0.3);',
    '  col *= 1.0 - 0.3*dot(uv,uv);',
    '',
    '  float reveal = smoothstep(0.0,1.0, uIntro*1.6 - length(uv)*0.5);',
    '  col *= clamp(reveal,0.0,1.0);',
    '',
    '  gl_FragColor = vec4(max(col,0.0), 1.0);',
    '}'
  ].join('\n');

  if (typeof module !== 'undefined' && module.exports) module.exports = true;
})(typeof window !== 'undefined' ? window : globalThis);
