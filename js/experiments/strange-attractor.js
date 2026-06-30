UNDERSCIENCE.register({
  id: 'strange-attractor',
  title: 'Atrator Estranho',
  subtitle: 'De Jong · atrator caótico iterado',
  description: 'Uma equação simples, iterada dezenas de milhares de vezes por segundo, desenha filamentos luminosos que nunca se repetem — caos determinístico condensado em luz.',
  tags: ['caos', 'atrator', 'de jong', 'iteração'],
  accent: '#00e5ff',
  params: [
    { key: 'morph',    label: 'Metamorfose', min: 0,     max: 2,    step: 0.01,  value: 0.35 },
    { key: 'points',   label: 'Pontos',      min: 5000,  max: 40000,step: 500,   value: 26000 },
    { key: 'exposure', label: 'Exposição',   min: 0.005, max: 0.06, step: 0.001, value: 0.04 },
    { key: 'dissolve', label: 'Dissolução',  min: 0.005, max: 0.08, step: 0.001, value: 0.01 },
  ],

  create(ctx) {
    const { c2d, noise, palette } = ctx;

    // --- estado dos parâmetros (inicializado a partir dos defaults) ---
    const P = { morph: 0.35, points: 26000, exposure: 0.04, dissolve: 0.01 };

    // Teto absoluto de trabalho por frame para manter ~60fps mesmo no máximo.
    const MAX_POINTS = 40000;

    let W = Math.max(1, ctx.width | 0);
    let H = Math.max(1, ctx.height | 0);

    // De Jong: x' = sin(a*y) - cos(b*x); y' = sin(c*x) - cos(d*y)
    // Os quatro parâmetros base derivam lentamente via noise; cursor empurra a e c.
    const base = { a: 1.4, b: -2.3, c: 2.4, d: -2.1 };

    // posição iterada do atrator (persiste entre frames)
    let px = 0.1, py = 0.1;

    // alvo do ponteiro (offset suave aplicado a a e c)
    let pointerX = 0.5, pointerY = 0.5;       // normalizado 0..1
    let offA = 0, offC = 0;                    // offsets suavizados
    let pointerActive = false;

    function hexToRGB(h) {
      const s = (h || '#000').replace('#', '');
      const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16) || 0;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    // pré-converte as cores de accent para rgb (evita parse em loop)
    const accents = palette.accents && palette.accents.length ? palette.accents : ['#00e5ff'];
    const cols = accents.map(hexToRGB);
    const nCols = cols.length;
    const bgRGB = hexToRGB(palette.bg || '#05060a');
    const auraRGB = hexToRGB(accents[0]);

    // Buckets de cor (path por bucket) — alocados UMA vez. Dois tiers de alpha:
    // núcleo lento (mais brilhante) e filamento rápido (normal).
    // Reaproveitamos um Path2D por bucket/tier para evitar churn no GC.
    const NTIERS = 2;
    const paths = [];
    for (let t = 0; t < nCols * NTIERS; t++) paths.push(new Path2D());

    // mapeia escala do atrator (~ -2..2) para a tela com margem
    function scale() { return Math.min(W, H) * 0.46; }

    function clearBG() {
      c2d.globalCompositeOperation = 'source-over';
      c2d.fillStyle = palette.bg || '#05060a';
      c2d.fillRect(0, 0, W, H);
    }

    function reset() {
      px = 0.1; py = 0.1;
      offA = 0; offC = 0;
      clearBG();
    }

    reset();

    return {
      frame(t, dt) {
        if (W <= 0 || H <= 0) return;
        const d = Math.min(dt, 0.05);

        // --- dissolução: fade translúcido do fundo apaga estrutura antiga ---
        c2d.globalCompositeOperation = 'source-over';
        c2d.fillStyle = 'rgba(' + bgRGB[0] + ',' + bgRGB[1] + ',' + bgRGB[2] + ',' + P.dissolve + ')';
        c2d.fillRect(0, 0, W, H);

        // --- metamorfose: deriva lenta dos parâmetros via noise ---
        const m = P.morph;
        const a = base.a + noise.n2(t * 0.05 * m, 0.0) * 1.6 + offA;
        const b = base.b + noise.n2(0.0, t * 0.045 * m + 9.1) * 1.6;
        const c = base.c + noise.n2(t * 0.043 * m + 4.2, 1.7) * 1.6 + offC;
        const dd = base.d + noise.n2(3.3, t * 0.05 * m + 2.8) * 1.6;

        // --- ponteiro: empurra a e c suavemente (sculpting ao vivo) ---
        const tgtA = pointerActive ? (pointerX - 0.5) * 2.4 : 0;
        const tgtC = pointerActive ? (pointerY - 0.5) * 2.4 : 0;
        const k = Math.min(1, d * 4);
        offA += (tgtA - offA) * k;
        offC += (tgtC - offC) * k;

        // --- escala / centro ---
        const cx = W * 0.5, cy = H * 0.5;
        const sc = scale() * 0.5;

        // reseta os paths (reaproveitando os objetos não é possível em Path2D,
        // então recriamos uma vez por frame — N pequeno e constante).
        for (let i = 0; i < paths.length; i++) paths[i] = new Path2D();

        // --- itera o atrator, acumulando retângulos 1px nos buckets ---
        let N = P.points | 0;
        if (N < 0) N = 0;
        if (N > MAX_POINTS) N = MAX_POINTS;

        let lx = px, ly = py;
        for (let i = 0; i < N; i++) {
          const nx = Math.sin(a * ly) - Math.cos(b * lx);
          const ny = Math.sin(c * lx) - Math.cos(dd * ly);

          const vx = nx - lx, vy = ny - ly;
          const speed = vx * vx + vy * vy;            // 0 .. ~16

          // cor por velocidade (filamentos rápidos x densos)
          let ci = (speed * 0.9) | 0;
          if (ci >= nCols) ci = nCols - 1;

          // tier de alpha: vértices lentos -> núcleo mais brilhante
          const tier = speed < 0.4 ? 0 : 1;

          const sx = (cx + nx * sc) | 0;
          const sy = (cy + ny * sc) | 0;
          paths[ci * NTIERS + tier].rect(sx, sy, 1, 1);

          lx = nx; ly = ny;
        }
        // guarda finito: se algo degenerou, reseta a semente
        if (!Number.isFinite(lx) || !Number.isFinite(ly)) { lx = 0.1; ly = 0.1; }
        px = lx; py = ly;

        // --- desenha buckets com 'lighter' (glow aditivo) ---
        c2d.globalCompositeOperation = 'lighter';
        const exp = P.exposure;
        for (let ci = 0; ci < nCols; ci++) {
          const col = cols[ci];
          for (let tier = 0; tier < NTIERS; tier++) {
            const al = exp * (tier === 0 ? 1.8 : 1.0);
            c2d.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + al + ')';
            c2d.fill(paths[ci * NTIERS + tier]);
          }
        }

        // --- aura sutil no cursor enquanto arrasta ---
        if (pointerActive) {
          const ax = pointerX * W, ay = pointerY * H;
          const g = c2d.createRadialGradient(ax, ay, 0, ax, ay, 70);
          g.addColorStop(0, 'rgba(' + auraRGB[0] + ',' + auraRGB[1] + ',' + auraRGB[2] + ',0.10)');
          g.addColorStop(1, 'rgba(' + auraRGB[0] + ',' + auraRGB[1] + ',' + auraRGB[2] + ',0)');
          c2d.fillStyle = g;
          c2d.beginPath();
          c2d.arc(ax, ay, 70, 0, Math.PI * 2);
          c2d.fill();
        }

        c2d.globalCompositeOperation = 'source-over';
      },

      pointer(p) {
        if (W <= 0 || H <= 0) return;
        pointerX = Math.max(0, Math.min(1, p.x / W));
        pointerY = Math.max(0, Math.min(1, p.y / H));
        if (p.type === 'down') {
          pointerActive = true;
          if (ctx.audio && ctx.audio.ping) ctx.audio.ping(180 + pointerY * 220, { dur: 0.12 });
        } else if (p.type === 'up') {
          pointerActive = false;
        } else if (p.type === 'move') {
          pointerActive = !!p.down;
        }
      },

      resize(w, h) {
        W = Math.max(1, w | 0);
        H = Math.max(1, h | 0);
        // rebuild: limpa o canvas redimensionado para o fundo
        clearBG();
      },

      setParam(k, v) {
        if (!(k in P)) return;
        const n = +v;
        if (!Number.isFinite(n)) return;
        P[k] = n;
      },

      reset() { reset(); },

      dispose() { pointerActive = false; },
    };
  }
});
