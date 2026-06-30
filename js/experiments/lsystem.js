// UNDERSCIENCE :: Crescimento-L
// L-systems estocásticos desenhados progressivamente por uma tartaruga,
// crescendo, ramificando e florescendo; depois balançam ao vento e re-semeiam.
UNDERSCIENCE.register({
  id: 'lsystem',
  title: 'Crescimento-L',
  subtitle: 'L-system estocástico · botânica fractal',
  description: 'Plantas-fractais que se desenham segmento a segmento a partir de regras de reescrita, brotam botões luminosos e oscilam ao vento antes de renascer.',
  tags: ['fractal', 'l-system', 'botânica', 'crescimento'],
  accent: '#7cff6b',
  params: [
    { key: 'angle',  label: 'ângulo',       min: 10,  max: 40, step: 1,    value: 22 },
    { key: 'depth',  label: 'profundidade', min: 3,   max: 6,  step: 1,    value: 5  },
    { key: 'growth', label: 'crescimento',  min: 0.2, max: 3,  step: 0.05, value: 1.1 },
    { key: 'wind',   label: 'vento',        min: 0,   max: 2,  step: 0.05, value: 0.8 },
  ],
  create(ctx) {
    const { c2d, noise, palette, accent, audio } = ctx;
    const DEG = Math.PI / 180;
    const MAX_PLANTS = 5;
    const SEGS_PER_PLANT = 2400;

    const state = { angle: 22, depth: 5, growth: 1.1, wind: 0.8 };
    let W = Math.max(1, ctx.width), H = Math.max(1, ctx.height);

    // Pré-parseia a cor de fundo UMA vez (usada todo frame para o rastro).
    const BG = parseHex(palette.bg) || { r: 5, g: 6, b: 10 };
    const bgFade = 'rgba(' + BG.r + ',' + BG.g + ',' + BG.b + ',0.20)';

    // Regras estocásticas de reescrita (variantes escolhidas por planta).
    const RULES = [
      ['FF+[+F-F-F]-[-F+F+F]', 'FF-[-F+F+F]+[+F-F-F]', 'F[+F]F[-F]F'],
      ['F[+F][-F]FF', 'FF+[+F-F]-[-F+F]', 'F-[[F]+F]+F[+FF]-F'],
    ];

    // hex -> {r,g,b}; retorna null se inválido (robustez).
    function parseHex(hex) {
      if (typeof hex !== 'string') return null;
      const h = hex.replace('#', '');
      if (h.length < 6) return null;
      const r = parseInt(h.substring(0, 2), 16);
      const g = parseInt(h.substring(2, 4), 16);
      const b = parseInt(h.substring(4, 6), 16);
      if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
      return { r, g, b };
    }

    // Expande a string do L-system até a profundidade desejada (limitando tamanho).
    function expand(axiom, ruleset, depth) {
      let s = axiom;
      for (let d = 0; d < depth; d++) {
        let out = '';
        for (let i = 0; i < s.length; i++) {
          const ch = s[i];
          if (ch === 'F') out += ruleset[(Math.random() * ruleset.length) | 0];
          else out += ch;
          if (out.length > 60000) break;
        }
        s = out;
        if (s.length > 60000) break;
      }
      return s;
    }

    // Pré-computa a lista de SEGMENTOS de uma planta percorrendo a string.
    // Cada segmento guarda x0,y0,x1,y1, d (0=tronco .. 1=ponta) e bud(0/1).
    function buildPlant(px, py) {
      const variant = RULES[(Math.random() * RULES.length) | 0];
      const str = expand('F', variant, Math.max(1, state.depth | 0));
      const baseLen = (Math.min(W, H) * 0.07) / Math.max(1, (state.depth - 2));
      const ang = state.angle * DEG;
      const segs = [];
      const stack = [];
      let x = px, y = py, a = -Math.PI / 2, len = baseLen, depth = 0, maxDepth = 0.0001;
      for (let i = 0; i < str.length && segs.length < SEGS_PER_PLANT; i++) {
        const ch = str[i];
        if (ch === 'F') {
          const nx = x + Math.cos(a) * len;
          const ny = y + Math.sin(a) * len;
          segs.push({ x0: x, y0: y, x1: nx, y1: ny, d: depth, bud: 0 });
          if (depth > maxDepth) maxDepth = depth;
          x = nx; y = ny;
        } else if (ch === '+') a += ang;
        else if (ch === '-') a -= ang;
        else if (ch === '[') { stack.push({ x, y, a, len, depth }); len *= 0.78; depth++; }
        else if (ch === ']') {
          if (segs.length) segs[segs.length - 1].bud = 1; // ponta de ramo = botão
          const s = stack.pop();
          if (s) { x = s.x; y = s.y; a = s.a; len = s.len; depth = s.depth; }
        }
      }
      if (segs.length) segs[segs.length - 1].bud = 1;
      // normaliza profundidade -> 0..1
      for (let i = 0; i < segs.length; i++) segs[i].d /= maxDepth;
      // cor da planta, pré-parseada UMA vez (evita parseInt por segmento/frame)
      const col = pickAccentRGB();
      return {
        x: px, segs, grown: 0, phase: 0,
        r: col.r, g: col.g, b: col.b,
        hue: 'rgb(' + col.r + ',' + col.g + ',' + col.b + ')',
      };
    }

    function pickAccentRGB() {
      const acc = (palette.accents && palette.accents.length) ? palette.accents : [accent];
      const hex = Math.random() < 0.55 ? accent : acc[(Math.random() * acc.length) | 0];
      return parseHex(hex) || parseHex(accent) || { r: 124, g: 255, b: 107 };
    }

    let plants = [];
    let time = 0;

    function seed(px, py) {
      if (plants.length >= MAX_PLANTS) plants.shift();
      plants.push(buildPlant(px, py));
      if (audio && audio.ping) audio.ping(180 + Math.random() * 120, { dur: 0.18, gain: 0.04 });
    }

    function reseedAll() {
      plants.length = 0;
      const n = 1 + (Math.random() * 2 | 0);
      for (let i = 0; i < n; i++) {
        // semeia sem tocar áudio em massa (resize/reset)
        if (plants.length >= MAX_PLANTS) plants.shift();
        plants.push(buildPlant(W * (0.25 + 0.5 * (i + 0.5) / n), H * 0.96));
      }
    }

    reseedAll();

    return {
      frame(t, dt) {
        if (W <= 0 || H <= 0) return;
        time = t;
        // trilha: escurece suavemente para deixar rastro/glow.
        c2d.globalCompositeOperation = 'source-over';
        c2d.fillStyle = bgFade;
        c2d.fillRect(0, 0, W, H);

        const windAmt = state.wind;
        c2d.lineCap = 'round';

        for (let pi = 0; pi < plants.length; pi++) {
          const p = plants[pi];
          if (p.grown < 1) {
            p.grown += dt * state.growth * 0.45;
            if (p.grown >= 1) p.grown = 1;
          } else {
            p.phase += dt; // já cresceu: balança ao vento
          }
          const visible = (p.grown * p.segs.length) | 0;
          const swaying = p.grown >= 1;
          const swayBase = windAmt * (swaying ? 1 : 0.15);
          const r = p.r, g = p.g, b = p.b;

          c2d.globalCompositeOperation = 'lighter';
          for (let i = 0; i < visible; i++) {
            const s = p.segs[i];
            // oscilação ao vento: deslocamento cresce com a altura/depth
            let ox1 = 0, oy1 = 0, ox0 = 0, oy0 = 0;
            if (swayBase > 0) {
              const n0 = noise.n3(s.x0 * 0.004, s.y0 * 0.004, time * 0.25);
              const n1 = noise.n3(s.x1 * 0.004, s.y1 * 0.004, time * 0.25);
              ox0 = n0 * swayBase * 7 * s.d; oy0 = n0 * swayBase * 2 * s.d;
              ox1 = n1 * swayBase * 7 * s.d; oy1 = n1 * swayBase * 2 * s.d;
            }
            // cor: tronco escuro -> ponta brilhante (sem parseInt por frame)
            const k = 0.18 + 0.82 * s.d;
            c2d.lineWidth = (1 - s.d) * 2.4 + 0.5;
            c2d.strokeStyle = 'rgb(' + ((r * k) | 0) + ',' + ((g * k) | 0) + ',' + ((b * k) | 0) + ')';
            c2d.globalAlpha = 0.55;
            c2d.beginPath();
            c2d.moveTo(s.x0 + ox0, s.y0 + oy0);
            c2d.lineTo(s.x1 + ox1, s.y1 + oy1);
            c2d.stroke();

            // botões luminosos nas pontas de ramo (pulsam suavemente).
            if (s.bud) {
              const pulse = 0.6 + 0.4 * Math.sin(time * 2.2 + i * 0.7);
              c2d.globalAlpha = 0.85 * pulse;
              c2d.fillStyle = p.hue;
              c2d.beginPath();
              c2d.arc(s.x1 + ox1, s.y1 + oy1, 1.6 + 1.8 * pulse, 0, Math.PI * 2);
              c2d.fill();
            }
          }
          c2d.globalAlpha = 1;
          c2d.globalCompositeOperation = 'source-over';

          // depois de crescer e balançar um tempo, re-semeia esta planta.
          if (swaying && p.phase > 9) {
            const nx = Math.min(W - 20, Math.max(20, p.x + (Math.random() - 0.5) * 80));
            plants[pi] = buildPlant(nx, H * 0.96);
          }
        }
      },

      pointer(p) {
        if (!p) return;
        if (p.type === 'down') {
          seed(Math.max(8, Math.min(W - 8, p.x)), Math.max(8, Math.min(H - 8, p.y)));
        }
      },

      resize(w, h) {
        W = Math.max(1, w | 0); H = Math.max(1, h | 0);
        reseedAll();
      },

      setParam(k, v) {
        if (k in state && typeof v === 'number' && isFinite(v)) state[k] = v;
      },

      reset() {
        reseedAll();
      },

      dispose() {
        plants.length = 0;
      },
    };
  }
});
