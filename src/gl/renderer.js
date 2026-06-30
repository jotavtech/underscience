/*
 * UNDERSCIENCE — renderer
 * ------------------------------------------------------------------
 * A small WebGL1 engine that drives the whole experience. Per frame:
 *
 *   scene pass   world fragment -> sceneTarget   (ping-pong; the world
 *                may read last frame via uPrev for feedback effects)
 *   bright pass  sceneTarget -> bloomA           (threshold extract, 1/2 res)
 *   blur passes  bloomA -> bloomB -> bloomA       (separable gaussian x2)
 *   composite    sceneTarget + bloomA -> screen   (crossfade, CA, grain,
 *                                                   vignette, ACES, gamma)
 *
 * Everything is RGBA8 for maximum device compatibility. No extensions are
 * required, so it runs on essentially any WebGL1-capable GPU.
 */
(function (root) {
  'use strict';
  var US = (root.US = root.US || {});

  var UNIT_PREV = 0, UNIT_BLOOM = 1, UNIT_FREEZE = 2;

  function Renderer(canvas) {
    this.canvas = canvas;
    var opts = {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false,
      powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false
    };
    var gl = canvas.getContext('webgl', opts) ||
             canvas.getContext('experimental-webgl', opts);
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;

    this.programs = {};   // name -> { program, uniforms }
    this.targets = {};    // name -> { fb, tex, w, h }
    this.w = 0; this.h = 0;          // scene resolution
    this.bw = 0; this.bh = 0;        // bloom resolution

    this._initQuad();
    this._initPrograms();
  }

  Renderer.prototype._initQuad = function () {
    var gl = this.gl;
    // one oversized triangle covering the clip volume
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.quad = buf;
  };

  Renderer.prototype._compile = function (type, src) {
    var gl = this.gl;
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('shader compile failed: ' + log + '\n' + src);
    }
    return sh;
  };

  Renderer.prototype._program = function (fragSrc) {
    var gl = this.gl;
    var vs = this._compile(gl.VERTEX_SHADER, US.GLSL.vertex);
    var fs = this._compile(gl.FRAGMENT_SHADER, US.GLSL.assemble(fragSrc));
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link failed: ' + gl.getProgramInfoLog(p));
    }
    gl.deleteShader(vs); gl.deleteShader(fs);

    // cache uniform locations
    var uniforms = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      var name = info.name.replace(/\[0\]$/, '');
      uniforms[name] = gl.getUniformLocation(p, name);
    }
    // fix sampler units once
    gl.useProgram(p);
    if (uniforms.uPrev)   gl.uniform1i(uniforms.uPrev, UNIT_PREV);
    if (uniforms.uBloom)  gl.uniform1i(uniforms.uBloom, UNIT_BLOOM);
    if (uniforms.uFreeze) gl.uniform1i(uniforms.uFreeze, UNIT_FREEZE);
    return { program: p, uniforms: uniforms };
  };

  Renderer.prototype._initPrograms = function () {
    var k;
    for (k in US.GLSL.worlds) this.programs['world:' + k] = this._program(US.GLSL.worlds[k]);
    for (k in US.GLSL.post)   this.programs['post:' + k]  = this._program(US.GLSL.post[k]);
  };

  // create or resize an RGBA8 render target
  Renderer.prototype._target = function (name, w, h) {
    var gl = this.gl;
    var t = this.targets[name];
    if (t && t.w === w && t.h === h) return t;
    if (!t) {
      t = { fb: gl.createFramebuffer(), tex: gl.createTexture() };
      this.targets[name] = t;
    }
    t.w = w; t.h = h;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return t;
  };

  Renderer.prototype.resize = function (w, h) {
    w = Math.max(2, w | 0); h = Math.max(2, h | 0);
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.bw = Math.max(2, w >> 1); this.bh = Math.max(2, h >> 1);
    this._target('sceneA', w, h);
    this._target('sceneB', w, h);
    this._target('freeze', w, h);
    this._target('bloomA', this.bw, this.bh);
    this._target('bloomB', this.bw, this.bh);
    this._front = 'sceneA'; this._back = 'sceneB';
    // clear new buffers
    var names = ['sceneA', 'sceneB', 'freeze', 'bloomA', 'bloomB'];
    var gl = this.gl;
    for (var i = 0; i < names.length; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[names[i]].fb);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  Renderer.prototype._bindQuad = function () {
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  };

  // set the standard scalar/vector uniforms on a program from a state object
  Renderer.prototype._setCommon = function (u, st, resW, resH) {
    var gl = this.gl;
    if (u.uResolution) gl.uniform2f(u.uResolution, resW, resH);
    if (u.uTime)   gl.uniform1f(u.uTime, st.time);
    if (u.uMouse)  gl.uniform2f(u.uMouse, st.mouseX, st.mouseY);
    if (u.uAudio)  gl.uniform1f(u.uAudio, st.audio);
    if (u.uBass)   gl.uniform1f(u.uBass, st.bass);
    if (u.uMid)    gl.uniform1f(u.uMid, st.mid);
    if (u.uTreble) gl.uniform1f(u.uTreble, st.treble);
    if (u.uBeat)   gl.uniform1f(u.uBeat, st.beat);
    if (u.uIntro)  gl.uniform1f(u.uIntro, st.intro);
    if (u.uMorph)  gl.uniform1f(u.uMorph, st.morph);
    if (u.uSeed)   gl.uniform1f(u.uSeed, st.seed);
    if (u.uVignette) gl.uniform1f(u.uVignette, st.vignette);
  };

  Renderer.prototype._bindTex = function (unit, tex) {
    var gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  };

  // Freeze the currently displayed world into the freeze buffer (for crossfade)
  Renderer.prototype.freezeCurrent = function () {
    var gl = this.gl, prog = this.programs['post:copy'];
    var src = this.targets[this._front];
    var dst = this.targets.freeze;
    gl.useProgram(prog.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, dst.w, dst.h);
    this._bindTex(UNIT_PREV, src.tex);
    this._bindQuad();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  /*
   * Render one frame.
   *   st = { world, time, mouseX, mouseY, audio, bass, mid, treble, beat,
   *          intro, morph, seed, vignette, bloom }
   */
  Renderer.prototype.render = function (st) {
    var gl = this.gl;
    var worldProg = this.programs['world:' + st.world] || this.programs['world:aether'];

    // ---- scene pass (ping-pong) ----
    var dst = this.targets[this._back];
    var prev = this.targets[this._front];
    gl.useProgram(worldProg.program);
    var u = worldProg.uniforms;
    this._setCommon(u, st, this.w, this.h);
    this._bindTex(UNIT_PREV, prev.tex);     // feedback source
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, this.w, this.h);
    this._bindQuad();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // swap
    var tmp = this._front; this._front = this._back; this._back = tmp;
    var scene = this.targets[this._front];

    // ---- bright pass ----
    var bp = this.programs['post:bright'];
    gl.useProgram(bp.program);
    this._setCommon(bp.uniforms, st, this.bw, this.bh);
    this._bindTex(UNIT_PREV, scene.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.bloomA.fb);
    gl.viewport(0, 0, this.bw, this.bh);
    this._bindQuad();
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---- separable blur (2 iterations) ----
    var blur = this.programs['post:blur'];
    var passes = [
      ['bloomA', 'bloomB', 1 / this.bw, 0],
      ['bloomB', 'bloomA', 0, 1 / this.bh],
      ['bloomA', 'bloomB', 1.6 / this.bw, 0],
      ['bloomB', 'bloomA', 0, 1.6 / this.bh]
    ];
    gl.useProgram(blur.program);
    this._setCommon(blur.uniforms, st, this.bw, this.bh);
    for (var i = 0; i < passes.length; i++) {
      var src = this.targets[passes[i][0]], out = this.targets[passes[i][1]];
      if (blur.uniforms.uDir) gl.uniform2f(blur.uniforms.uDir, passes[i][2], passes[i][3]);
      this._bindTex(UNIT_PREV, src.tex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
      gl.viewport(0, 0, this.bw, this.bh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    var bloom = this.targets.bloomA;

    // ---- composite to screen ----
    var cp = this.programs['post:composite'];
    gl.useProgram(cp.program);
    this._setCommon(cp.uniforms, st, this.canvas.width, this.canvas.height);
    if (cp.uniforms.uParam) gl.uniform1f(cp.uniforms.uParam, st.bloom);
    this._bindTex(UNIT_PREV, scene.tex);
    this._bindTex(UNIT_BLOOM, bloom.tex);
    this._bindTex(UNIT_FREEZE, this.targets.freeze.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  Renderer.prototype.worldNames = function () {
    var out = [];
    for (var k in US.GLSL.worlds) out.push(k);
    return out;
  };

  US.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
