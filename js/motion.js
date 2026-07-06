/* =============================================================
   UNDERSCIENCE · motion.js
   Camada de movimento declarativa sobre GSAP + ScrollTrigger.
   - Timeline cinematográfica de intro (fácil de ajustar: veja TUNE).
   - Cursor personalizado (anel magnético, como referências premium).
   - Transições de espécime (troca de acento, re-entrada dos painéis).
   - Integração opcional com Theatre.js (bloom "Hero" editável por JSON).

   Degradação graciosa: se o GSAP não carregar (offline / file://),
   `window.USMotion.ready` fica falso e o app.js volta às animações CSS.
   Respeita `prefers-reduced-motion`.
   ============================================================= */
(function () {
  'use strict';

  var g = window.gsap;
  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasHover = !(window.matchMedia && window.matchMedia('(hover: none)').matches);

  // ---- painel de ajuste rápido (mexa aqui, é declarativo) ---------------
  var TUNE = {
    intro: { stagger: 0.09, dur: 1.0, ease: 'expo.out', charStagger: 0.03 },
    enter: { out: 0.55, in: 0.7, railStagger: 0.055, ease: 'power3.out' },
    swap:  { dur: 0.5, ease: 'power3.out' },
    cursor:{ follow: 0.18, ringFollow: 0.32 }
  };

  function el(id) { return document.getElementById(id); }
  function qsa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  // interpolação de cor hex (para o acento animado sem depender do CSSPlugin)
  function hex2rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbStr(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
  function rgbaStr(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')'; }

  // divide um elemento de texto simples em <span> por palavra (para stagger)
  function splitWords(node) {
    var words = node.textContent.split(/(\s+)/);
    node.textContent = '';
    var spans = [];
    words.forEach(function (w) {
      if (/^\s+$/.test(w) || w === '') { node.appendChild(document.createTextNode(w)); return; }
      var s = document.createElement('span');
      s.className = 'w';
      s.textContent = w;
      s.style.display = 'inline-block';
      s.style.willChange = 'transform, opacity';
      node.appendChild(s);
      spans.push(s);
    });
    return spans;
  }

  // ------------------------------------------------------------------
  // Se não há GSAP, exporta um stub inerte e sai. app.js detecta e usa CSS.
  // ------------------------------------------------------------------
  if (!g) {
    window.USMotion = { ready: false, introReveal: noop, enter: noop, activate: noop,
      about: noop, setAccent: noop };
    function noop() {}
    return;
  }

  if (window.ScrollTrigger) {
    try { g.registerPlugin(window.ScrollTrigger); } catch (e) {}
  }
  document.body.classList.add('motion-on');

  // ================================================================
  // CURSOR PERSONALIZADO
  // ================================================================
  var cursor = null;
  function setupCursor() {
    if (!hasHover || reduce) return;
    var dot = document.createElement('div'); dot.className = 'cursor-dot';
    var ring = document.createElement('div'); ring.className = 'cursor-ring';
    document.body.appendChild(dot); document.body.appendChild(ring);
    document.body.classList.add('has-cursor');

    var xTo = g.quickTo(dot, 'x', { duration: TUNE.cursor.follow, ease: 'power3' });
    var yTo = g.quickTo(dot, 'y', { duration: TUNE.cursor.follow, ease: 'power3' });
    var rxTo = g.quickTo(ring, 'x', { duration: TUNE.cursor.ringFollow, ease: 'power3' });
    var ryTo = g.quickTo(ring, 'y', { duration: TUNE.cursor.ringFollow, ease: 'power3' });

    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      xTo(e.clientX); yTo(e.clientY);
      rxTo(e.clientX); ryTo(e.clientY);
    }, { passive: true });

    // cresce sobre elementos interativos
    var grow = 'a, button, .spec, .ubtn, input[type=range], #enterBtn, .close';
    document.addEventListener('pointerover', function (e) {
      if (e.target.closest && e.target.closest(grow)) ring.classList.add('grow');
    });
    document.addEventListener('pointerout', function (e) {
      if (e.target.closest && e.target.closest(grow)) ring.classList.remove('grow');
    });
    window.addEventListener('pointerdown', function () { ring.classList.add('press'); });
    window.addEventListener('pointerup', function () { ring.classList.remove('press'); });
    cursor = { dot: dot, ring: ring };
  }

  // ================================================================
  // MAGNETISMO (botões e itens que "puxam" o cursor)
  // ================================================================
  function makeMagnetic(node, strength) {
    if (!hasHover || reduce || !node) return;
    strength = strength || 0.35;
    var xTo = g.quickTo(node, 'x', { duration: 0.4, ease: 'power3' });
    var yTo = g.quickTo(node, 'y', { duration: 0.4, ease: 'power3' });
    node.addEventListener('pointermove', function (e) {
      var r = node.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * strength);
      yTo((e.clientY - (r.top + r.height / 2)) * strength);
    });
    node.addEventListener('pointerleave', function () { xTo(0); yTo(0); });
  }

  // ================================================================
  // INTRO — timeline cinematográfica
  // ================================================================
  function introReveal() {
    var intro = el('intro');
    if (!intro) return;

    // preparação: divide tagline em palavras (título fica em blocos p/ preservar o glitch)
    var tagline = intro.querySelector('.tagline');
    var taglineWords = tagline ? splitWords(tagline) : [];

    var titleEl = intro.querySelector('.title');
    var under = intro.querySelector('.u-under');
    var science = intro.querySelector('.u-science');
    var kicker = intro.querySelector('.kicker');
    var manifesto = intro.querySelector('.manifesto');
    var enterBtn = el('enterBtn');
    var foot = intro.querySelector('.intro-foot');
    var frames = qsa('.frame');

    // os containers .title/.tagline nascem com opacity:0 no CSS (estado pré-anim);
    // o GSAP anima os FILHOS, então garantimos os pais visíveis aqui.
    g.set([titleEl, tagline], { autoAlpha: 1 });
    g.set([kicker, under, science, manifesto, enterBtn, foot], { autoAlpha: 0 });
    g.set(frames, { autoAlpha: 0, scale: 0.6 });
    if (taglineWords.length) g.set(taglineWords, { autoAlpha: 0, yPercent: 120 });

    if (reduce) {
      g.set([titleEl, tagline, kicker, under, science, manifesto, enterBtn, foot, frames],
        { autoAlpha: 1, scale: 1 });
      if (taglineWords.length) g.set(taglineWords, { autoAlpha: 1, yPercent: 0 });
      makeMagnetic(enterBtn, 0.4);
      return;
    }

    var T = TUNE.intro;
    var tl = g.timeline({ defaults: { ease: T.ease, duration: T.dur } });
    tl.to(frames, { autoAlpha: 0.5, scale: 1, duration: 1.1, ease: 'expo.out',
        stagger: { each: 0.08, from: 'random' } }, 0)
      .from(kicker, { yPercent: 60 }, 0.1).to(kicker, { autoAlpha: 1 }, 0.1)
      .from([under, science], { yPercent: 130, rotate: 2, stagger: 0.08 }, 0.2)
      .to([under, science], { autoAlpha: 1, stagger: 0.08 }, 0.2)
      .to(taglineWords, { autoAlpha: 1, yPercent: 0, stagger: T.charStagger, duration: 0.7 }, 0.5)
      .from(manifesto, { y: 18, filter: 'blur(6px)' }, 0.65).to(manifesto, { autoAlpha: 1 }, 0.65)
      .from(enterBtn, { y: 16, scale: 0.96 }, 0.8).to(enterBtn, { autoAlpha: 1 }, 0.8)
      .to(foot, { autoAlpha: 1 }, 0.95);

    makeMagnetic(enterBtn, 0.4);
    qsa('.ubtn').forEach(function (b) { makeMagnetic(b, 0.3); });
    return tl;
  }

  // ================================================================
  // ENTRAR — intro sai, HUD entra em cascata
  // ================================================================
  function enter(done) {
    var intro = el('intro');
    var ui = el('ui');
    if (ui) ui.classList.add('show');

    if (reduce || !intro) {
      if (intro) { intro.style.opacity = 0; intro.style.visibility = 'hidden'; intro.style.pointerEvents = 'none'; }
      revealHud(true);
      if (done) done();
      return;
    }

    var E = TUNE.enter;
    var tl = g.timeline({ onComplete: done });
    tl.to(intro.querySelectorAll('.kicker, .title, .tagline, .manifesto, .enter, .intro-foot'),
        { autoAlpha: 0, y: -26, filter: 'blur(4px)', duration: E.out, ease: 'power2.in',
          stagger: 0.04 }, 0)
      .to(intro, { autoAlpha: 0, duration: E.out, ease: 'power2.inOut',
          onComplete: function () { intro.style.visibility = 'hidden'; intro.style.pointerEvents = 'none'; } }, 0.15)
      .add(function () { revealHud(false); }, 0.35);
    return tl;
  }

  // entrada do HUD (topbar, rail, controles, hint, botões)
  function revealHud(instant) {
    var topbar = el('topbar'), rail = el('rail'), controls = el('controls'),
        hint = el('hint'), util = el('util');
    var railItems = qsa('.spec', rail);
    var E = TUNE.enter;

    if (instant || reduce) {
      g.set([topbar, controls, hint, util], { clearProps: 'all' });
      g.set(railItems, { clearProps: 'all' });
      return;
    }
    g.from(topbar, { y: -20, autoAlpha: 0, duration: E.in, ease: E.ease });
    g.from(util, { y: -16, autoAlpha: 0, duration: E.in, ease: E.ease, delay: 0.05 });
    g.from(railItems, { x: -28, autoAlpha: 0, skewX: 4, duration: E.in, ease: E.ease,
      stagger: E.railStagger, delay: 0.1 });
    g.from(controls, { y: 26, autoAlpha: 0, duration: E.in, ease: E.ease, delay: 0.2 });
    g.from(hint, { y: 16, autoAlpha: 0, duration: E.in, ease: E.ease, delay: 0.35 });
  }

  // ================================================================
  // TROCA DE ESPÉCIME — acento animado + re-entrada dos controles
  // ================================================================
  var accentTween = null;
  function setAccent(from, to) {
    var a = hex2rgb(from || '#00e5ff'), b = hex2rgb(to);
    var proxy = { t: 0 };
    if (accentTween) accentTween.kill();
    accentTween = g.to(proxy, {
      t: 1, duration: 0.6, ease: 'power2.out',
      onUpdate: function () {
        var c = [a[0] + (b[0] - a[0]) * proxy.t, a[1] + (b[1] - a[1]) * proxy.t, a[2] + (b[2] - a[2]) * proxy.t];
        var root = document.documentElement.style;
        root.setProperty('--accent', rgbStr(c));
        root.setProperty('--accent-soft', rgbaStr(c, 0.16));
      }
    });
  }

  function activate(spec, prevAccent) {
    var acc = (spec && spec.accent) || '#00e5ff';
    if (!reduce) setAccent(prevAccent, acc);
    else {
      document.documentElement.style.setProperty('--accent', acc);
      document.documentElement.style.setProperty('--accent-soft', 'rgba(0,0,0,0.16)');
    }

    var controls = el('controls');
    var now = el('now');
    var frames = qsa('.frame');
    var S = TUNE.swap;

    if (reduce) return;

    // pulso nas molduras (feedback de troca)
    g.fromTo(frames, { scale: 1 }, { scale: 1.14, duration: 0.18, yoyo: true, repeat: 1,
      ease: 'power2.out', stagger: { each: 0.03, from: 'random' } });

    // re-entrada suave do painel de controles
    if (controls) {
      g.fromTo(controls, { y: 14, autoAlpha: 0.4, filter: 'blur(3px)' },
        { y: 0, autoAlpha: 1, filter: 'blur(0px)', duration: S.dur, ease: S.ease });
      var ctrls = qsa('.ctrl', controls);
      g.fromTo(ctrls, { x: 12, autoAlpha: 0 },
        { x: 0, autoAlpha: 1, duration: 0.45, ease: S.ease, stagger: 0.05 });
    }
    // troca do nome no topbar com leve "flip"
    if (now) g.fromTo(now, { yPercent: 60, autoAlpha: 0 },
      { yPercent: 0, autoAlpha: 1, duration: 0.4, ease: 'back.out(2)' });
  }

  // ================================================================
  // SOBRE — overlay
  // ================================================================
  function about(open) {
    var card = document.querySelector('#about .card');
    if (!card || reduce) return;
    if (open) {
      g.fromTo(card, { y: 24, autoAlpha: 0, scale: 0.97 },
        { y: 0, autoAlpha: 1, scale: 1, duration: 0.5, ease: 'expo.out' });
      var ps = qsa('#about p, #about h2, #about .sub, #about .meta');
      g.fromTo(ps, { y: 14, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.5, ease: 'power3.out', stagger: 0.06, delay: 0.08 });
    }
  }

  // ------- boot desta camada -------
  setupCursor();

  window.USMotion = {
    ready: true,
    introReveal: introReveal,
    enter: enter,
    activate: activate,
    about: about,
    setAccent: function (to) { setAccent(getComputedAccent(), to); },
    makeMagnetic: makeMagnetic,
    TUNE: TUNE
  };

  function getComputedAccent() {
    return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00e5ff';
  }
})();
