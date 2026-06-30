/*
 * UNDERSCIENCE — shader registry
 * ------------------------------------------------------------------
 * Every visual in this experience is generated in real time on the GPU.
 * There are no image files. Each "world" below is a self-contained
 * GLSL ES 1.00 fragment program assembled at runtime as:
 *
 *     HEADER  +  LIB  +  <world or post source>
 *
 * The same assembly is used by tools/validate-shaders.mjs so that what
 * we compile-test in Node (via headless-gl) is byte-for-byte what the
 * browser runs.
 *
 * Conventions for every fragment program:
 *   - it defines `void main()`
 *   - it reads from the uniforms declared in HEADER
 *   - it may call anything from LIB
 *   - it writes a linear-ish color to gl_FragColor; tone mapping and
 *     post FX happen later in the pipeline.
 */
(function (root) {
  'use strict';
  var US = (root.US = root.US || {});

  // ----------------------------------------------------------------
  // Vertex shader — one fullscreen triangle, passes through UVs.
  // ----------------------------------------------------------------
  var VERTEX = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  // ----------------------------------------------------------------
  // HEADER — precision + the uniform contract shared by all programs.
  // ----------------------------------------------------------------
  var HEADER = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform vec2  uResolution;', // pixels
    'uniform float uTime;',       // seconds
    'uniform vec2  uMouse;',      // 0..1, smoothed
    'uniform float uAudio;',      // overall loudness 0..1
    'uniform float uBass;',       // low band 0..1
    'uniform float uMid;',        // mid band 0..1
    'uniform float uTreble;',     // high band 0..1
    'uniform float uBeat;',       // onset envelope 0..1 (decays)
    'uniform float uIntro;',      // 0 at load -> 1 once revealed
    'uniform float uMorph;',      // per-world transition 0..1
    'uniform float uSeed;',       // per-world random seed
    'uniform sampler2D uPrev;',   // previous frame / generic input texture
    'uniform sampler2D uBloom;',  // bloom texture (composite pass only)',
    'uniform sampler2D uFreeze;', // frozen previous world (crossfade)',
    'uniform vec2  uDir;',        // blur direction in texels (post only)
    'uniform float uParam;',      // generic post strength
    'uniform float uVignette;',   // vignette amount
    ''
  ].join('\n');

  // ----------------------------------------------------------------
  // LIB — shared GLSL toolbox: hashing, noise, fbm, color, sdf, tone.
  // Techniques follow well-worn, reliable recipes (value/gradient
  // noise, fbm, Inigo Quilez cosine palettes, ACES tone mapping).
  // ----------------------------------------------------------------
  var LIB = [
    'const float PI  = 3.14159265359;',
    'const float TAU = 6.28318530718;',
    '',
    'mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }',
    '',
    '// --- hashing ---------------------------------------------------',
    'float hash11(float p){ p=fract(p*0.1031); p*=p+33.33; p*=p+p; return fract(p); }',
    'float hash21(vec2 p){',
    '  vec3 p3=fract(vec3(p.xyx)*0.1031);',
    '  p3+=dot(p3,p3.yzx+33.33);',
    '  return fract((p3.x+p3.y)*p3.z);',
    '}',
    'vec2 hash22(vec2 p){',
    '  vec3 p3=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));',
    '  p3+=dot(p3,p3.yzx+33.33);',
    '  return fract((p3.xx+p3.yz)*p3.zy);',
    '}',
    'vec3 hash33(vec3 p){',
    '  p=fract(p*vec3(0.1031,0.1030,0.0973));',
    '  p+=dot(p,p.yxz+33.33);',
    '  return fract((p.xxy+p.yxx)*p.zyx);',
    '}',
    '',
    '// --- value noise + fbm ----------------------------------------',
    'float vnoise(vec2 p){',
    '  vec2 i=floor(p), f=fract(p);',
    '  vec2 u=f*f*(3.0-2.0*f);',
    '  float a=hash21(i), b=hash21(i+vec2(1.0,0.0));',
    '  float c=hash21(i+vec2(0.0,1.0)), d=hash21(i+vec2(1.0,1.0));',
    '  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);',
    '}',
    '// gradient noise (smoother, signed) ----------------------------',
    'float gnoise(vec2 p){',
    '  vec2 i=floor(p), f=fract(p);',
    '  vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);',
    '  vec2 ga=hash22(i)*2.0-1.0;',
    '  vec2 gb=hash22(i+vec2(1.0,0.0))*2.0-1.0;',
    '  vec2 gc=hash22(i+vec2(0.0,1.0))*2.0-1.0;',
    '  vec2 gd=hash22(i+vec2(1.0,1.0))*2.0-1.0;',
    '  float va=dot(ga,f-vec2(0.0,0.0));',
    '  float vb=dot(gb,f-vec2(1.0,0.0));',
    '  float vc=dot(gc,f-vec2(0.0,1.0));',
    '  float vd=dot(gd,f-vec2(1.0,1.0));',
    '  return mix(mix(va,vb,u.x),mix(vc,vd,u.x),u.y)*0.5+0.5;',
    '}',
    'float fbm(vec2 p){',
    '  float s=0.0, a=0.5, t=0.0;',
    '  for(int i=0;i<6;i++){',
    '    s+=a*vnoise(p);',
    '    t+=a; a*=0.5; p=rot(0.5)*p*2.02+11.3;',
    '  }',
    '  return s/t;',
    '}',
    'float fbm5(vec2 p){',
    '  float s=0.0, a=0.5, t=0.0;',
    '  for(int i=0;i<5;i++){',
    '    s+=a*gnoise(p);',
    '    t+=a; a*=0.5; p=rot(0.6)*p*2.0+7.0;',
    '  }',
    '  return s/t;',
    '}',
    '',
    '// curl of a noise field — divergence-free flow, great for fluids',
    'vec2 curl(vec2 p){',
    '  float e=0.1;',
    '  float n1=fbm(p+vec2(0.0,e));',
    '  float n2=fbm(p-vec2(0.0,e));',
    '  float n3=fbm(p+vec2(e,0.0));',
    '  float n4=fbm(p-vec2(e,0.0));',
    '  float dx=(n1-n2)/(2.0*e);',
    '  float dy=(n3-n4)/(2.0*e);',
    '  return vec2(dx,-dy);',
    '}',
    '',
    '// --- 3D value noise (cheap) for volumetrics -------------------',
    'float vnoise3(vec3 p){',
    '  vec3 i=floor(p), f=fract(p);',
    '  f=f*f*(3.0-2.0*f);',
    '  vec2 uv=(i.xy+vec2(37.0,17.0)*i.z)+f.xy;',
    '  float a=hash21(uv+0.5);',
    '  float b=hash21(uv+vec2(1.0,0.0)+0.5);',
    '  float c=hash21(uv+vec2(0.0,1.0)+0.5);',
    '  float d=hash21(uv+vec2(1.0,1.0)+0.5);',
    '  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);',
    '}',
    'float fbm3(vec3 p){',
    '  float s=0.0,a=0.5,t=0.0;',
    '  for(int i=0;i<5;i++){ s+=a*vnoise3(p); t+=a; a*=0.5; p*=2.03; }',
    '  return s/t;',
    '}',
    '',
    '// --- color -----------------------------------------------------',
    '// Inigo Quilez cosine palette',
    'vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d){',
    '  return a + b*cos(TAU*(c*t+d));',
    '}',
    'vec3 spectral(float t){',
    '  return palette(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0,0.33,0.67));',
    '}',
    'vec3 aces(vec3 x){',
    '  float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;',
    '  return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);',
    '}',
    'float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }',
    '',
    '// --- sdf / raymarch helpers -----------------------------------',
    'float sdSphere(vec3 p, float r){ return length(p)-r; }',
    'vec3 starField(vec2 dir, float density, float tw){',
    '  vec2 g = dir*density;',
    '  vec2 id = floor(g);',
    '  vec2 f  = fract(g)-0.5;',
    '  float h = hash21(id);',
    '  float star = smoothstep(0.06,0.0,length(f-(hash22(id)-0.5)*0.7));',
    '  float bri = step(0.86,h)*(0.4+0.6*sin(tw*(1.0+h*4.0)+h*TAU));',
    '  vec3 tint = mix(vec3(0.7,0.8,1.0), vec3(1.0,0.85,0.7), hash11(h*3.7));',
    '  return star*bri*tint;',
    '}',
    ''
  ].join('\n');

  US.GLSL = {
    vertex: VERTEX,
    header: HEADER,
    lib: LIB,
    worlds: {},
    post: {}
  };

  // assemble a full fragment program for compile / use
  US.GLSL.assemble = function (src) {
    return HEADER + '\n' + LIB + '\n' + src;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = US.GLSL;
  }
})(typeof window !== 'undefined' ? window : globalThis);
