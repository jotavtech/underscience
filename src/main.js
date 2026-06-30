/*
 * UNDERSCIENCE — main orchestrator
 * ------------------------------------------------------------------
 * Boots the renderer + audio, runs the frame loop, drives chapter
 * navigation (with GPU crossfades), autopilot, input, and the HUD.
 */
(function (root) {
  'use strict';
  var US = root.US;

  // ---- the journey ------------------------------------------------
  var CHAPTERS = [
    { world: 'aether',      title: 'Aether',      line: 'Every void is a medium. Listen to the space between things.',
      bloom: 0.55, vignette: 0.50 },
    { world: 'lattice',     title: 'Lattice',     line: 'Order is only a slower kind of light.',
      bloom: 0.65, vignette: 0.45 },
    { world: 'currents',    title: 'Currents',    line: 'Everything that flows remembers where it has been.',
      bloom: 0.55, vignette: 0.50 },
    { world: 'genesis',     title: 'Genesis',     line: 'Given enough time, matter learns to dream.',
      bloom: 0.55, vignette: 0.55 },
    { world: 'singularity', title: 'Singularity', line: 'At the center, even time kneels.',
      bloom: 0.75, vignette: 0.60 }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  var App = {
    renderer: null,
    audio: null,
    index: 0,
    started: false,
    paused: false,

    // eased / live state fed to shaders
    st: {
      world: 'aether', time: 0,
      mouseX: 0.5, mouseY: 0.5,
      audio: 0, bass: 0, mid: 0, treble: 0, beat: 0,
      intro: 0, morph: 1, seed: 0,
      vignette: 0.5, bloom: 0.55
    },
    introTarget: 0, morphTarget: 1,
    bloomTarget: 0.55, vigTarget: 0.5,

    // pointer + idle parallax
    ptrX: 0.5, ptrY: 0.5, ptrTX: 0.5, ptrTY: 0.5,
    lastPointer: 0,

    // autopilot
    auto: true, autoNext: 0, autoLockUntil: 0,

    // timing / adaptive quality
    t0: 0, last: 0, rafId: 0, quality: 1, frameAcc: 0, frameN: 0, lastQAdj: 0,
    cssW: 0, cssH: 0
  };

  // ================================================================
  // boot
  // ================================================================
  function boot() {
    var canvas = $('stage');
    try {
      App.renderer = new US.Renderer(canvas);
    } catch (e) {
      showFallback();
      return;
    }
    App.audio = new US.AudioEngine();
    US.initCursor();

    // graceful WebGL context-loss handling (e.g. GPU reset / tab backgrounded
    // too long on mobile): stop drawing, and reload cleanly on restore.
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); App.paused = true; }, false);
    canvas.addEventListener('webglcontextrestored', function () { location.reload(); }, false);

    sizeCanvas();
    window.addEventListener('resize', sizeCanvas, { passive: true });

    buildRail();
    bindControls();
    bindInput();

    // a brief, dramatic "calibration" while everything is wired up
    runLoader();
  }

  function showFallback() {
    var fb = $('fallback');
    if (fb) fb.hidden = false;
    document.body.classList.remove('is-loading');
    var gate = $('gate'); if (gate) gate.style.display = 'none';
  }

  function runLoader() {
    var bar = $('loadBar'), btn = $('enterBtn');
    var p = 0;
    var iv = setInterval(function () {
      p = Math.min(100, p + 6 + Math.random() * 12);
      bar.style.width = p + '%';
      if (p >= 100) {
        clearInterval(iv);
        btn.disabled = false;
        btn.querySelector('span').textContent = 'enter';
      }
    }, 110);
    $('enterBtn').addEventListener('click', enter);
  }

  function enter() {
    if (App.started) return;
    App.started = true;
    // user gesture: unlock + start audio
    var ok = App.audio.start();
    setSoundLabel(!App.audio.muted && ok);

    document.body.classList.remove('is-loading');
    document.body.classList.add('is-running');
    var hud = $('hud'); if (hud) hud.setAttribute('aria-hidden', 'false');

    App.t0 = now();
    App.last = App.t0;
    App.st.intro = 0; App.introTarget = 1;       // first global reveal
    App.autoNext = App.t0 + 22;

    go(0, true);
    ensureLoop();

    // auto-hide the hint
    setTimeout(function () { var h = $('hint'); if (h) h.classList.add('is-hidden'); }, 7000);
  }

  function now() { return (root.performance && performance.now ? performance.now() : Date.now()) / 1000; }

  // ================================================================
  // sizing + adaptive quality
  // ================================================================
  function sizeCanvas() {
    var canvas = $('stage');
    var cssW = canvas.clientWidth || window.innerWidth;
    var cssH = canvas.clientHeight || window.innerHeight;
    App.cssW = cssW; App.cssH = cssH;
    var pr = Math.min(window.devicePixelRatio || 1, 1.75) * App.quality;
    var rw = Math.round(cssW * pr), rh = Math.round(cssH * pr);
    // protect very large displays / heavy shaders
    var maxSide = Math.max(rw, rh), CAP = 1900;
    if (maxSide > CAP) { var k = CAP / maxSide; rw = Math.round(rw * k); rh = Math.round(rh * k); }
    if (canvas.width !== rw || canvas.height !== rh) {
      canvas.width = rw; canvas.height = rh;
    }
    if (App.renderer) App.renderer.resize(rw, rh);
  }

  function maybeAdaptQuality(t) {
    App.frameAcc += (t - App.last); App.frameN++;
    if (t - App.lastQAdj < 2.5 || App.frameN < 30) return;
    var avg = App.frameAcc / App.frameN;
    App.frameAcc = 0; App.frameN = 0; App.lastQAdj = t;
    if (avg > 1 / 42 && App.quality > 0.6) { App.quality = Math.max(0.6, App.quality - 0.15); sizeCanvas(); }
    else if (avg < 1 / 58 && App.quality < 1) { App.quality = Math.min(1, App.quality + 0.1); sizeCanvas(); }
  }

  // ================================================================
  // navigation
  // ================================================================
  function go(i, immediate) {
    i = (i % CHAPTERS.length + CHAPTERS.length) % CHAPTERS.length;
    var ch = CHAPTERS[i];
    App.index = i;

    if (App.renderer && !immediate) App.renderer.freezeCurrent();
    App.st.world = ch.world;
    App.st.seed = Math.random() * 10;
    App.morphTarget = 1;
    App.st.morph = immediate ? 1 : 0;     // crossfade in (unless first)
    App.bloomTarget = ch.bloom; App.vigTarget = ch.vignette;
    if (App.audio) App.audio.setMood(ch.world);

    updateChapterUI(ch, i);
    updateRail(i);
    App.autoNext = now() + 24;            // reset autopilot timer
  }

  function next() { go(App.index + 1); lockAuto(); }
  function prev() { go(App.index - 1); lockAuto(); }
  function lockAuto() { App.autoLockUntil = now() + 45; }

  function updateChapterUI(ch, i) {
    var elT = $('chapterTitle'), elL = $('chapterLine'), elI = $('chapterIndex');
    var wrap = $('chapter');
    // animate current out, then swap + in
    wrap.classList.remove('is-in'); wrap.classList.add('is-out');
    setTimeout(function () {
      elI.textContent = pad(i + 1) + ' / ' + pad(CHAPTERS.length);
      elT.setAttribute('data-text', ch.title); elT.textContent = ch.title;
      elL.setAttribute('data-text', ch.line);  elL.textContent = ch.line;
      US.splitText(elT, 0.05);
      US.splitText(elL, 0.25);
      wrap.classList.remove('is-out');
      // next frame -> trigger in
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        wrap.classList.add('is-in');
      }); });
    }, 380);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ================================================================
  // HUD: rail + controls
  // ================================================================
  function buildRail() {
    var rail = $('rail');
    rail.innerHTML = '';
    CHAPTERS.forEach(function (ch, i) {
      var b = document.createElement('button');
      b.innerHTML = '<span class="label">' + ch.title + '</span><span class="dot"></span>';
      b.addEventListener('click', function () { go(i); lockAuto(); });
      rail.appendChild(b);
    });
  }
  function updateRail(i) {
    var rail = $('rail');
    [].forEach.call(rail.children, function (b, j) {
      b.classList.toggle('is-active', j === i);
    });
  }

  function bindControls() {
    $('nextBtn').addEventListener('click', next);
    $('prevBtn').addEventListener('click', prev);
    $('soundBtn').addEventListener('click', toggleSound);
    $('autoBtn').addEventListener('click', toggleAuto);
    $('fsBtn').addEventListener('click', toggleFullscreen);
    setAutoLabel();
  }

  function toggleSound() {
    if (!App.audio) return;
    App.audio.start();                        // ensure context (in case)
    App.audio.setMuted(!App.audio.muted);
    setSoundLabel(!App.audio.muted);
  }
  function setSoundLabel(on) {
    var l = $('soundLabel'); if (l) l.textContent = on ? 'sound on' : 'sound off';
    $('soundBtn').classList.toggle('is-active', on);
  }
  function toggleAuto() { App.auto = !App.auto; App.autoNext = now() + 18; App.autoLockUntil = 0; setAutoLabel(); }
  function setAutoLabel() {
    var l = $('autoLabel'); if (l) l.textContent = App.auto ? 'auto ▮▮' : 'auto ▶';
    $('autoBtn').classList.toggle('is-active', App.auto);
  }
  function toggleFullscreen() {
    var d = document, el = d.documentElement;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || function(){}).call(el);
    } else {
      (d.exitFullscreen || d.webkitExitFullscreen || function(){}).call(d);
    }
  }

  // ================================================================
  // input
  // ================================================================
  function bindInput() {
    // pointer parallax
    window.addEventListener('mousemove', function (e) {
      App.ptrTX = e.clientX / window.innerWidth;
      App.ptrTY = 1 - e.clientY / window.innerHeight;
      App.lastPointer = now();
    }, { passive: true });

    // wheel -> advance (debounced)
    var wheelAcc = 0, wheelLock = 0;
    window.addEventListener('wheel', function (e) {
      var t = now();
      if (t < wheelLock) return;
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) > 220) {
        (wheelAcc > 0 ? next : prev)();
        wheelAcc = 0; wheelLock = t + 0.7;
      }
    }, { passive: true });

    // keyboard
    window.addEventListener('keydown', function (e) {
      if (!App.started) { if (e.key === 'Enter' || e.key === ' ') enter(); return; }
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': next(); e.preventDefault(); break;
        case 'ArrowLeft':  case 'ArrowUp':   case 'PageUp': prev(); e.preventDefault(); break;
        case 'm': case 'M': toggleSound(); break;
        case 'a': case 'A': toggleAuto(); break;
        case 'f': case 'F': toggleFullscreen(); break;
        default:
          if (e.key >= '1' && e.key <= '9') {
            var n = parseInt(e.key, 10) - 1;
            if (n < CHAPTERS.length) { go(n); lockAuto(); }
          }
      }
    });

    // touch swipe
    var sx = 0, sy = 0, st = 0;
    window.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = now();
    }, { passive: true });
    window.addEventListener('touchend', function (e) {
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (now() - st < 0.6 && Math.max(Math.abs(dx), Math.abs(dy)) > 60) {
        if (Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next : prev)();
        else (dy < 0 ? next : prev)();
      }
    }, { passive: true });

    // pause when tab hidden (idempotent restart — never stacks loops)
    document.addEventListener('visibilitychange', function () {
      App.paused = document.hidden;
      if (!App.paused) ensureLoop();
    });
  }

  // ================================================================
  // frame loop
  // ================================================================
  // Single, idempotent RAF loop. ensureLoop() schedules a frame only if one
  // is not already pending, so rapid tab hide/show can never stack two loops
  // running at double speed.
  function ensureLoop() {
    if (!App.rafId && App.started && !App.paused) {
      App.last = now();
      App.rafId = requestAnimationFrame(frame);
    }
  }
  function frame() {
    App.rafId = 0;
    if (!App.started || App.paused) return;
    var t = now();
    var dt = Math.min(0.05, t - App.last);
    maybeAdaptQuality(t);
    App.last = t;
    var st = App.st;
    st.time = t - App.t0;

    // audio levels -> uniforms
    if (App.audio) {
      var L = App.audio.update();
      st.audio = L.audio; st.bass = L.bass; st.mid = L.mid; st.treble = L.treble; st.beat = L.beat;
    }

    // pointer vs idle drift
    var idle = (t - App.lastPointer) > 4;
    if (idle) {
      App.ptrTX = 0.5 + 0.28 * Math.sin(st.time * 0.13);
      App.ptrTY = 0.5 + 0.20 * Math.cos(st.time * 0.11);
    }
    App.ptrX = lerp(App.ptrX, App.ptrTX, idle ? 0.01 : 0.06);
    App.ptrY = lerp(App.ptrY, App.ptrTY, idle ? 0.01 : 0.06);
    st.mouseX = App.ptrX; st.mouseY = App.ptrY;

    // ease envelopes
    st.intro = lerp(st.intro, App.introTarget, 1 - Math.pow(0.001, dt));   // ~3s reveal
    st.morph = Math.min(1, st.morph + dt / 1.2);                            // crossfade ~1.2s
    st.bloom = lerp(st.bloom, App.bloomTarget, 1 - Math.pow(0.02, dt));
    st.vignette = lerp(st.vignette, App.vigTarget, 1 - Math.pow(0.02, dt));

    // autopilot
    if (App.auto && t > App.autoLockUntil && t > App.autoNext) {
      App.autoNext = t + 24;
      go(App.index + 1);
    }

    App.renderer.render(st);
    App.rafId = requestAnimationFrame(frame);
  }

  // ----------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})(typeof window !== 'undefined' ? window : globalThis);
