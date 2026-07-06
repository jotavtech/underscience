/* =============================================================
   UNDERSCIENCE · app.js
   O hospedeiro / instrumento. Registra espécimes, roda o loop,
   roteia o ponteiro, monta a interface e o áudio.
   ============================================================= */
(function () {
  'use strict';

  var PALETTE = {
    bg: '#05060a',
    fg: '#e8f0ff',
    dim: '#5566aa',
    accents: ['#00e5ff', '#ff2d75', '#7cff6b', '#b06bff', '#ffd23f']
  };

  // Climas musicais por espécime (raiz MIDI, escala, brilho do filtro, andamento).
  var MOODS = {
    'reaction-diffusion': { root: 50, scale: 'dorian', brightness: 1100, tempo: 3.0 },
    'flow-field':         { root: 52, scale: 'lydian', brightness: 1700, tempo: 2.4 },
    'boids':              { root: 55, scale: 'pentMinor', brightness: 1500, tempo: 2.0 },
    'cymatics':           { root: 48, scale: 'hirajoshi', brightness: 1300, tempo: 3.2 },
    'gravity':            { root: 45, scale: 'pentMinor', brightness: 900, tempo: 3.4 },
    'strange-attractor':  { root: 53, scale: 'lydian', brightness: 1800, tempo: 2.6 },
    'lsystem':            { root: 57, scale: 'pentMajor', brightness: 1600, tempo: 2.8 }
  };

  // ---- registro: precisa existir ANTES dos scripts de espécimes ----
  var SPECS = [];
  window.UNDERSCIENCE = {
    register: function (spec) {
      if (spec && spec.id) SPECS.push(spec);
    }
  };

  // ------- utilitários -------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hexToRgba(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function el(id) { return document.getElementById(id); }

  var noise = window.UnderNoise((Math.random() * 1e9) | 0);
  var audio = window.UnderAudio();

  var ctx = {
    canvas: null,
    c2d: null,
    width: 0,
    height: 0,
    dpr: 1,
    noise: noise,
    palette: PALETTE,
    rand: function (a, b) { if (b == null) { b = a; a = 0; } return a + Math.random() * (b - a); },
    randInt: function (a, b) { return Math.floor(ctx.rand(a, b + 1)); },
    chance: function (p) { return Math.random() < p; },
    pick: function (arr) { return arr[(Math.random() * arr.length) | 0]; },
    audio: { ping: function (f, o) { audio.ping(f, o); } }
  };

  // ------- estado -------
  var canvas, current = null, currentSpec = null, currentIndex = -1;
  var prevAccent = '#00e5ff';   // acento anterior (para a transição animada)
  var entered = false;          // já saiu da intro? (atalhos só valem depois)
  var startTime = 0, lastTime = 0, running = false;
  var fpsAvg = 60, fpsAccum = 0, fpsCount = 0, fpsTimer = 0;
  var hadError = false;

  // ------- canvas / resize -------
  function setupCanvas() {
    canvas = el('stage');
    ctx.canvas = canvas;
    ctx.c2d = canvas.getContext('2d', { alpha: false });
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    var dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    var w = Math.max(1, window.innerWidth);
    var h = Math.max(1, window.innerHeight);
    ctx.dpr = dpr;
    ctx.width = w;
    ctx.height = h;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (current && current.resize) {
      try { current.resize(w, h); } catch (e) { reportError(e); }
    }
    clearStage();
  }

  function clearStage() {
    ctx.c2d.save();
    ctx.c2d.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
    ctx.c2d.fillStyle = PALETTE.bg;
    ctx.c2d.fillRect(0, 0, ctx.width, ctx.height);
    ctx.c2d.restore();
  }

  function reportError(e) {
    if (!hadError) {
      hadError = true;
      // eslint-disable-next-line no-console
      console.warn('[underscience] espécime instável:', e && e.message);
    }
  }

  // ------- loop -------
  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    var t = (now - startTime) / 1000;
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (current && current.frame) {
      try { current.frame(t, dt); } catch (e) { reportError(e); }
    }
    // fps
    fpsAccum += dt; fpsCount++;
    if (now - fpsTimer > 500) {
      fpsAvg = fpsCount / (fpsAccum || 1);
      fpsAccum = 0; fpsCount = 0; fpsTimer = now;
      updateHud(t);
    }
  }

  function updateHud(t) {
    var f = el('fps'); if (f) f.textContent = Math.round(fpsAvg);
    var c = el('clock');
    if (c) {
      var s = Math.floor(t);
      var mm = String(Math.floor(s / 60)).padStart(2, '0');
      var ss = String(s % 60).padStart(2, '0');
      c.textContent = mm + ':' + ss;
    }
  }

  // ------- troca de espécime -------
  function activate(index) {
    if (index < 0 || index >= SPECS.length) return;
    var spec = SPECS[index];
    if (current && current.dispose) { try { current.dispose(); } catch (e) {} }
    current = null;

    currentIndex = index;
    currentSpec = spec;
    hadError = false;

    // cor de acento global — animada pela camada de movimento quando disponível
    var acc = spec.accent || PALETTE.accents[0];
    if (window.USMotion && window.USMotion.ready) {
      USMotion.activate(spec, prevAccent);
    } else {
      document.documentElement.style.setProperty('--accent', acc);
      document.documentElement.style.setProperty('--accent-soft', hexToRgba(acc, 0.16));
    }
    prevAccent = acc;

    clearStage();

    try {
      current = spec.create(ctx);
      if (current && current.resize) current.resize(ctx.width, ctx.height);
    } catch (e) {
      reportError(e);
      current = null;
    }

    // clima musical
    var mood = MOODS[spec.id] || { root: 50, scale: 'pentMinor', brightness: 1300, tempo: 2.6 };
    audio.setMood(mood);

    buildControls(spec);
    markRail(index);
    var now = el('now'); if (now) now.textContent = spec.title || spec.id;

    try { localStorage.setItem('us:spec', spec.id); } catch (e) {}

    if (!running) {
      running = true;
      startTime = performance.now();
      lastTime = startTime;
      fpsTimer = startTime;
      requestAnimationFrame(loop);
    }
  }

  // ------- rail (lista de espécimes) -------
  function buildRail() {
    var rail = el('rail');
    rail.innerHTML = '';
    SPECS.forEach(function (spec, i) {
      var b = document.createElement('button');
      b.className = 'spec';
      b.setAttribute('data-i', i);
      b.innerHTML =
        '<div class="idx">' + String(i + 1).padStart(2, '0') + ' / ' + String(SPECS.length).padStart(2, '0') + '</div>' +
        '<div class="name">' + escapeHtml(spec.title || spec.id) + '</div>' +
        '<div class="sub">' + escapeHtml(spec.subtitle || '') + '</div>';
      b.addEventListener('click', function () {
        activate(i);
        if (audio.isEnabled()) audio.ping(520 + i * 40, { dur: 0.16, type: 'triangle', gain: 0.05 });
      });
      rail.appendChild(b);
    });
  }
  function markRail(index) {
    var nodes = document.querySelectorAll('.spec');
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.toggle('active', i === index);
  }

  // ------- controles (parâmetros) -------
  function buildControls(spec) {
    el('cTitle').textContent = spec.title || spec.id;
    el('cSub').textContent = spec.subtitle || '';
    el('cDesc').textContent = spec.description || '';
    var wrap = el('cParams');
    wrap.innerHTML = '';
    (spec.params || []).forEach(function (p) {
      var div = document.createElement('div');
      div.className = 'ctrl';
      var fmt = function (v) {
        var span = (p.max - p.min);
        if (span >= 100) return String(Math.round(v));
        if (span < 1) return (Math.round(v * 1000) / 1000).toString();
        return (Math.round(v * 100) / 100).toString();
      };
      div.innerHTML =
        '<div class="row"><label>' + escapeHtml(p.label || p.key) + '</label>' +
        '<span class="val">' + fmt(p.value) + '</span></div>' +
        '<input type="range" min="' + p.min + '" max="' + p.max + '" step="' + (p.step || 0.01) + '" value="' + p.value + '">';
      var input = div.querySelector('input');
      var val = div.querySelector('.val');
      input.addEventListener('input', function () {
        var v = parseFloat(input.value);
        val.textContent = fmt(v);
        if (current && current.setParam) { try { current.setParam(p.key, v); } catch (e) { reportError(e); } }
      });
      wrap.appendChild(div);
    });
  }

  function randomizeParams() {
    if (!currentSpec) return;
    var inputs = el('cParams').querySelectorAll('input');
    (currentSpec.params || []).forEach(function (p, i) {
      var v = p.min + Math.random() * (p.max - p.min);
      if (p.step >= 1) v = Math.round(v);
      if (inputs[i]) {
        inputs[i].value = v;
        inputs[i].dispatchEvent(new Event('input'));
      }
    });
    if (current && current.reset) { try { current.reset(); } catch (e) {} }
    if (audio.isEnabled()) audio.ping(880, { dur: 0.2, glide: 1.5, type: 'sine', gain: 0.06 });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ------- ponteiro -------
  function setupPointer() {
    function rel(ev) {
      var r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }
    var down = false;
    canvas.addEventListener('pointerdown', function (ev) {
      down = true;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      var p = rel(ev);
      send('down', p.x, p.y, true);
    });
    canvas.addEventListener('pointermove', function (ev) {
      var p = rel(ev);
      send('move', p.x, p.y, down);
    });
    window.addEventListener('pointerup', function (ev) {
      if (!down) return;
      down = false;
      var p = rel(ev);
      send('up', p.x, p.y, false);
    });
    function send(type, x, y, isDown) {
      if (current && current.pointer) {
        try { current.pointer({ type: type, x: x, y: y, down: isDown }); } catch (e) { reportError(e); }
      }
    }
  }

  // ------- áudio -------
  function refreshAudioBtn() {
    var btn = el('btnAudio');
    if (!btn) return;
    btn.classList.toggle('on', audio.isEnabled());
    btn.setAttribute('aria-label', audio.isEnabled() ? 'Som ligado' : 'Som desligado');
  }

  // ------- intro / boot -------
  function enter() {
    if (entered) return;
    entered = true;
    var intro = el('intro');
    audio.start();
    refreshAudioBtn();
    var saved = -1;
    try {
      var id = localStorage.getItem('us:spec');
      if (id) saved = SPECS.findIndex(function (s) { return s.id === id; });
    } catch (e) {}
    var startIndex = saved >= 0 ? saved : 0;

    if (window.USMotion && window.USMotion.ready) {
      el('ui').classList.add('show');
      USMotion.enter();
      activate(startIndex);
    } else {
      intro.classList.add('gone');
      el('ui').classList.add('show');
      activate(startIndex);
    }
    setTimeout(function () { var h = el('hint'); if (h) h.style.opacity = '0'; }, 9000);
  }

  // ------- atalhos + easter egg -------
  var keyBuf = '';
  function setupKeys() {
    window.addEventListener('keydown', function (e) {
      if (!entered) {
        if (e.key === 'Enter' || e.key === ' ') { enter(); }
        return;
      }
      if (e.key >= '1' && e.key <= '9') { activate(parseInt(e.key, 10) - 1); }
      else if (e.key === 'a' || e.key === 'A') { audio.toggle(); refreshAudioBtn(); }
      else if (e.key === 'r' || e.key === 'R') { if (current && current.reset) current.reset(); }
      else if (e.key === 'n' || e.key === 'N') { randomizeParams(); }
      else if (e.key === 'ArrowRight') { activate((currentIndex + 1) % SPECS.length); }
      else if (e.key === 'ArrowLeft') { activate((currentIndex - 1 + SPECS.length) % SPECS.length); }
      else if (e.key === '?' || e.key === '/') { toggleAbout(); }
      else if (e.key === 'Escape') { el('about').classList.remove('show'); }

      keyBuf = (keyBuf + (e.key || '')).slice(-12).toLowerCase();
      if (keyBuf.indexOf('underscience') >= 0) { keyBuf = ''; secret(); }
    });
  }

  function toggleAbout() {
    var open = el('about').classList.toggle('show');
    if (open && window.USMotion && window.USMotion.ready) USMotion.about(true);
  }

  // sequência secreta: passeia por todos os espécimes randomizando.
  function secret() {
    var hint = el('hint');
    if (hint) { hint.style.opacity = '1'; hint.innerHTML = '<span class="k">⌁ SEQUÊNCIA OCULTA</span> · a ciência por baixo da ciência'; }
    var i = 0;
    var iv = setInterval(function () {
      activate(i % SPECS.length);
      randomizeParams();
      i++;
      if (i > SPECS.length) { clearInterval(iv); if (hint) setTimeout(function () { hint.style.opacity = '0'; }, 3000); }
    }, 1100);
  }

  // ------- bind UI -------
  function bindUI() {
    el('enterBtn').addEventListener('click', enter);
    el('btnAudio').addEventListener('click', function () { audio.toggle(); refreshAudioBtn(); });
    el('btnAbout').addEventListener('click', toggleAbout);
    el('aboutClose').addEventListener('click', function () { el('about').classList.remove('show'); });
    el('about').addEventListener('click', function (e) { if (e.target === el('about')) el('about').classList.remove('show'); });
    el('btnReset').addEventListener('click', function () { if (current && current.reset) current.reset(); });
    el('btnRandom').addEventListener('click', randomizeParams);
  }

  // ------- arranque -------
  function boot() {
    setupCanvas();
    setupPointer();
    setupKeys();
    bindUI();

    if (!SPECS.length) {
      el('intro').innerHTML = '<div style="font-family:var(--mono);color:#ff2d75">Nenhum espécime carregado.</div>';
      return;
    }
    // ordem estável conforme MOODS / preferência
    buildRail();
    el('specCount').textContent = SPECS.length;

    // revela a intro com a timeline cinematográfica (se a camada existir)
    if (window.USMotion && window.USMotion.ready) USMotion.introReveal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
