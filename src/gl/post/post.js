/*
 * POST-PROCESSING CHAIN
 * The scene render passes through:
 *   1. bright      — threshold-extract the luminous parts (bloom seed)
 *   2. blur        — separable gaussian (run twice: horizontal, vertical)
 *   3. composite   — recombine scene + bloom with chromatic aberration,
 *                    film grain, vignette, ACES tone-map and gamma.
 *
 * Post passes reuse the world uniform contract: the input texture is bound
 * to uPrev, the bloom texture to uBloom, blur direction to uDir.
 */
(function (root) {
  'use strict';
  var US = (root.US = root.US || {});
  US.GLSL = US.GLSL || { worlds: {}, post: {} };
  US.GLSL.post = US.GLSL.post || {};

  // 0. straight copy (used to freeze a world's last frame before a crossfade)
  US.GLSL.post.copy = [
    'void main(){ gl_FragColor = vec4(texture2D(uPrev, vUv).rgb, 1.0); }'
  ].join('\n');

  // 1. bright-pass: soft-knee threshold so bloom blooms only the highlights
  US.GLSL.post.bright = [
    'void main(){',
    '  vec3 c = texture2D(uPrev, vUv).rgb;',
    '  float l = luma(c);',
    '  float knee = 0.78;',
    '  float w = smoothstep(knee, knee+0.45, l);',
    '  gl_FragColor = vec4(c*w, 1.0);',
    '}'
  ].join('\n');

  // 2. separable 9-tap gaussian. uDir is the texel step (e.g. (1/w,0)).
  US.GLSL.post.blur = [
    'void main(){',
    '  vec2 d = uDir;',
    '  vec3 s = vec3(0.0);',
    '  s += texture2D(uPrev, vUv + d*-4.0).rgb * 0.0162;',
    '  s += texture2D(uPrev, vUv + d*-3.0).rgb * 0.0540;',
    '  s += texture2D(uPrev, vUv + d*-2.0).rgb * 0.1216;',
    '  s += texture2D(uPrev, vUv + d*-1.0).rgb * 0.1945;',
    '  s += texture2D(uPrev, vUv            ).rgb * 0.2270;',
    '  s += texture2D(uPrev, vUv + d* 1.0).rgb * 0.1945;',
    '  s += texture2D(uPrev, vUv + d* 2.0).rgb * 0.1216;',
    '  s += texture2D(uPrev, vUv + d* 3.0).rgb * 0.0540;',
    '  s += texture2D(uPrev, vUv + d* 4.0).rgb * 0.0162;',
    '  gl_FragColor = vec4(s, 1.0);',
    '}'
  ].join('\n');

  // 3. final composite to screen
  US.GLSL.post.composite = [
    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 c = uv - 0.5;',
    '  float r2 = dot(c,c);',
    '',
    '  // chromatic aberration grows toward the edges (+ a touch on beat)',
    '  float ca = (0.0016 + 0.004*r2) * (1.0 + 1.5*uBeat);',
    '  vec2 dir = normalize(c + 1e-5);',
    '  vec3 scene;',
    '  scene.r = texture2D(uPrev, uv + dir*ca).r;',
    '  scene.g = texture2D(uPrev, uv).g;',
    '  scene.b = texture2D(uPrev, uv - dir*ca).b;',
    '',
    '  // crossfade from the frozen previous world (uMorph: 0->1 on switch)',
    '  vec3 frozen = texture2D(uFreeze, uv).rgb;',
    '  scene = mix(frozen, scene, clamp(uMorph, 0.0, 1.0));',
    '',
    '  vec3 bloom = texture2D(uBloom, uv).rgb;',
    '  vec3 col = scene + bloom * (0.4 + 0.7*uParam);',
    '',
    '  // vignette',
    '  float vig = 1.0 - uVignette*smoothstep(0.25, 0.85, r2);',
    '  col *= vig;',
    '',
    '  // tone-map + gamma',
    '  col *= 1.05;',
    '  col = aces(col);',
    '  col = pow(col, vec3(0.4545));',
    '',
    '  // film grain + ordered dither to kill banding',
    '  float g = hash21(gl_FragCoord.xy + fract(uTime)*131.7);',
    '  col += (g-0.5) * 0.035;',
    '',
    '  // faint scanline shimmer for a "transmission" feel',
    '  col *= 1.0 - 0.025*sin(gl_FragCoord.y*1.5 + uTime*2.0);',
    '',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  if (typeof module !== 'undefined' && module.exports) module.exports = true;
})(typeof window !== 'undefined' ? window : globalThis);
