/* =============================================================
   UNDERSCIENCE · theatre.js  (módulo ESM)
   Integração com Theatre.js — editor visual de animação cujo
   ESTADO É UM ARQUIVO JSON (`js/theatre-state.json`).

   Fluxo IA + humano:
   1. Abra o site com `?edit` na URL (ou em localhost)  → o Studio abre.
   2. Anime o objeto "Hero" na timeline visual (glow, pulso do acento…).
   3. No Studio: menu do projeto → "Export"  → salve como
      `js/theatre-state.json` e faça commit.
   4. Em produção (sem `?edit`), o core apenas TOCA esse JSON.

   Objeto controlado — "Hero":
     titleGlow  (0–60px)  brilho do título SCIENCE
     accentBloom(0–1)     intensidade do halo de acento (via --accent-bloom)
     vignette   (0–1)     escurecimento das bordas
     scan       (0–1)     opacidade das scanlines

   Se o Theatre.js não puder ser carregado (offline), a página segue
   normal — esta camada é puramente aditiva.
   ============================================================= */

var CORE = 'https://esm.sh/@theatre/core@0.7.2';
var STUDIO = 'https://esm.sh/@theatre/studio@0.7.2';

var EDIT = /[?&]edit\b/.test(location.search) ||
  location.hostname === 'localhost' || location.hostname === '127.0.0.1';

(async function () {
  var core;
  try {
    core = await import(CORE);
  } catch (e) {
    console.warn('[underscience] Theatre.js indisponível (seguindo sem):', e && e.message);
    return;
  }

  var getProject = core.getProject, types = core.types, onChange = core.onChange, val = core.val;

  // tenta carregar o estado salvo (JSON exportado do Studio)
  var state = null;
  try {
    var res = await fetch('js/theatre-state.json', { cache: 'no-cache' });
    if (res.ok) {
      var json = await res.json();
      // só usa se for um save file de verdade (tem definitionVersion string)
      if (json && typeof json.definitionVersion === 'string') state = json;
    }
  } catch (e) { /* sem estado salvo ainda — tudo bem */ }

  if (EDIT) {
    try {
      var studioMod = await import(STUDIO);
      studioMod.default.initialize();
    } catch (e) {
      console.warn('[underscience] Theatre Studio indisponível:', e && e.message);
    }
  }

  var project = state ? getProject('UNDERSCIENCE', { state: state }) : getProject('UNDERSCIENCE');
  var sheet = project.sheet('Cena');

  var hero = sheet.object('Hero', {
    titleGlow:   types.number(28, { range: [0, 60], nudgeMultiplier: 0.5 }),
    accentBloom: types.number(0.35, { range: [0, 1], nudgeMultiplier: 0.01 }),
    vignette:    types.number(0.55, { range: [0, 1], nudgeMultiplier: 0.01 }),
    scan:        types.number(0.5,  { range: [0, 1], nudgeMultiplier: 0.01 })
  });

  var science = document.querySelector('.u-science');
  var vignetteEl = document.querySelector('.fx.vignette');
  var scanEl = document.querySelector('.fx.scan');
  var root = document.documentElement;

  function apply(v) {
    if (science) science.style.textShadow = '0 0 ' + v.titleGlow + 'px var(--accent)';
    root.style.setProperty('--accent-bloom', String(v.accentBloom));
    if (vignetteEl) vignetteEl.style.opacity = String(0.4 + v.vignette * 0.6);
    if (scanEl) scanEl.style.opacity = String(v.scan);
  }

  onChange(hero.props, apply);
  apply(val(hero.props));

  // se o JSON salvo tiver uma sequência (keyframes), toca em loop suave
  project.ready.then(function () {
    try {
      if (state && sheet.sequence && sheet.sequence.pointer) {
        sheet.sequence.play({ iterationCount: Infinity, direction: 'alternate' });
      }
    } catch (e) { /* sem sequência — valores estáticos bastam */ }
  });

  window.USTheatre = { project: project, sheet: sheet, hero: hero, editing: EDIT };
})();
