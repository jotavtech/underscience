UNDERSCIENCE.register({
  id: 'gravity',
  title: 'Gravidade (N-corpos)',
  subtitle: 'Gravitação softened · órbitas e atratores',
  description: 'Um enxame de partículas-teste cai em direção a atratores massivos, traçando órbitas luminosas. Pressione para acender uma nova estrela e ver a multidão se reorganizar.',
  tags: ['gravidade', 'n-corpos', 'órbitas', 'atratores'],
  accent: '#ffd23f',
  params: [
    { key: 'gravity',    label: 'Gravidade',  min: 0.1, max: 3,    step: 0.05, value: 1 },
    { key: 'count',      label: 'Partículas', min: 400, max: 2500, step: 50,   value: 1200 },
    { key: 'trail',      label: 'Rastro',     min: 0.02, max: 0.25, step: 0.01, value: 0.08 },
    { key: 'attractors', label: 'Atratores',  min: 1,   max: 5,    step: 1,    value: 3 },
  ],

  create(ctx) {
    const { c2d, noise, rand, palette } = ctx;
    let W = Math.max(1, ctx.width | 0), H = Math.max(1, ctx.height | 0);

    // ---- estado lido pelos sliders (inicializado pelos defaults) ----
    const S = { gravity: 1, count: 1200, trail: 0.08, attractors: 3 };

    const MAXP = 2500;           // teto de alocação (nunca cresce em frame)
    const SOFT = 900;            // epsilon^2 de softening -> evita singularidades
    const VMAX = 520;            // clamp de velocidade (px/s)
    const MAX_ATTRACTORS = 6;    // teto duro de atratores (sliders + estrelas nascidas)

    // buffers de partículas (alocados UMA vez)
    const px = new Float32Array(MAXP), py = new Float32Array(MAXP);
    const vx = new Float32Array(MAXP), vy = new Float32Array(MAXP);

    // atratores: {x,y,mass,ang,orbR,cx,cy,born,pinned}
    let attractors = [];

    // ponteiro / estrela nascente
    const ptr = { x: W * 0.5, y: H * 0.5, down: false, mass: 0 };

    // paleta defensiva (garante 5 cores mesmo se o host mudar)
    const A = (palette.accents && palette.accents.length >= 5)
      ? palette.accents
      : ['#00e5ff', '#ff2d75', '#7cff6b', '#b06bff', '#ffd23f'];

    // cores frias (lento) -> quentes (rápido)
    function speedColor(s) {
      if (s < 0.25)      return A[0]; // ciano (frio)
      else if (s < 0.5)  return A[3]; // roxo
      else if (s < 0.72) return A[2]; // verde
      else if (s < 0.88) return A[4]; // amarelo
      else               return A[1]; // rosa quente
    }

    // halo aditivo simples (núcleo brilhante). Declarada antes do uso.
    function drawCore(x, y, r, col) {
      c2d.fillStyle = col;
      c2d.globalAlpha = 0.9;
      c2d.beginPath(); c2d.arc(x, y, r, 0, Math.PI * 2); c2d.fill();
      c2d.globalAlpha = 0.12;
      c2d.beginPath(); c2d.arc(x, y, Math.max(r, 0.5) * 4, 0, Math.PI * 2); c2d.fill();
    }

    function spawnParticle(i, fromEdge) {
      if (fromEdge) {
        // reaparece numa borda com leve velocidade tangencial
        const e = (Math.random() * 4) | 0;
        if (e === 0) { px[i] = rand(0, W); py[i] = 0; }
        else if (e === 1) { px[i] = W; py[i] = rand(0, H); }
        else if (e === 2) { px[i] = rand(0, W); py[i] = H; }
        else { px[i] = 0; py[i] = rand(0, H); }
      } else {
        px[i] = rand(0, W); py[i] = rand(0, H);
      }
      // velocidade inicial via ruído -> dá rotação coerente ao enxame
      const ang = noise.n2(px[i] * 0.004, py[i] * 0.004) * Math.PI * 2;
      const sp = rand(20, 90);
      vx[i] = Math.cos(ang) * sp;
      vy[i] = Math.sin(ang) * sp;
    }

    // (re)cria SOMENTE os atratores "de slider", preservando estrelas nascidas.
    function makeAttractors(n) {
      n = Math.max(1, Math.min(MAX_ATTRACTORS, n | 0));
      // mantém as estrelas que o usuário acendeu (pinned)
      const pinned = attractors.filter(a => a.pinned);
      const base = [];
      const minWH = Math.min(W, H);
      for (let k = 0; k < n; k++) {
        base.push({
          x: rand(W * 0.2, W * 0.8),
          y: rand(H * 0.2, H * 0.8),
          mass: rand(1400, 2600),
          ang: rand(0, Math.PI * 2),
          orbR: rand(40, Math.max(40, minWH * 0.18)),
          cx: W * 0.5, cy: H * 0.5,
          born: 0, pinned: false,
        });
      }
      attractors = base.concat(pinned).slice(0, MAX_ATTRACTORS);
    }

    function initAll() {
      for (let i = 0; i < MAXP; i++) spawnParticle(i, false);
      attractors = []; // reset total: descarta estrelas nascidas
      makeAttractors(S.attractors);
    }
    initAll();

    let tGlobal = 0;

    return {
      frame(t, dt) {
        if (W <= 0 || H <= 0) return;
        tGlobal = t;
        const d = Math.min(dt, 0.05);
        if (d <= 0) return;
        const N = Math.max(0, Math.min(S.count | 0, MAXP));
        const G = S.gravity * 90;

        // --- crescimento da estrela nascente enquanto pressionado ---
        if (ptr.down) {
          ptr.mass = Math.min(ptr.mass + d * 5200, 14000);
        }

        // --- atratores de fundo orbitam lentamente (vida); estrelas pinned ficam ---
        for (let k = 0; k < attractors.length; k++) {
          const a = attractors[k];
          if (a.pinned) continue;
          a.ang += d * 0.12;
          a.x = a.cx + Math.cos(a.ang) * a.orbR;
          a.y = a.cy + Math.sin(a.ang) * a.orbR * 0.6;
        }

        // --- trilha: pinta bg translúcido por cima (rastros luminosos) ---
        c2d.globalCompositeOperation = 'source-over';
        c2d.fillStyle = palette.bg;
        c2d.globalAlpha = S.trail;
        c2d.fillRect(0, 0, W, H);
        c2d.globalAlpha = 1;

        // --- integra partículas e desenha em modo aditivo ---
        c2d.globalCompositeOperation = 'lighter';
        const nA = attractors.length;
        const usePtr = ptr.mass > 1;
        for (let i = 0; i < N; i++) {
          let ax = 0, ay = 0;
          // força de cada atrator (softened)
          for (let k = 0; k < nA; k++) {
            const a = attractors[k];
            const dx = a.x - px[i], dy = a.y - py[i];
            const r2 = dx * dx + dy * dy + SOFT;
            const inv = G * a.mass / (r2 * Math.sqrt(r2));
            ax += dx * inv; ay += dy * inv;
          }
          // estrela nascente no cursor
          if (usePtr) {
            const dx = ptr.x - px[i], dy = ptr.y - py[i];
            const r2 = dx * dx + dy * dy + SOFT;
            const inv = G * ptr.mass / (r2 * Math.sqrt(r2));
            ax += dx * inv; ay += dy * inv;
          }

          vx[i] += ax * d; vy[i] += ay * d;

          // clamp de velocidade
          let sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
          if (sp > VMAX) { const f = VMAX / sp; vx[i] *= f; vy[i] *= f; sp = VMAX; }

          const ox = px[i], oy = py[i];
          px[i] += vx[i] * d; py[i] += vy[i] * d;

          // respawn nas bordas se escapar
          if (px[i] < -40 || px[i] > W + 40 || py[i] < -40 || py[i] > H + 40) {
            spawnParticle(i, true);
            continue;
          }

          // cor por velocidade
          const sn = sp / VMAX;
          c2d.strokeStyle = speedColor(sn);
          c2d.globalAlpha = 0.18 + sn * 0.55;
          c2d.lineWidth = 0.8 + sn * 1.4;
          c2d.beginPath();
          c2d.moveTo(ox, oy);
          c2d.lineTo(px[i], py[i]);
          c2d.stroke();
        }

        // --- desenha os atratores como núcleos com halo ---
        for (let k = 0; k < nA; k++) {
          const a = attractors[k];
          drawCore(a.x, a.y, 3 + a.mass * 0.0016, a.pinned ? A[1] : A[4]);
        }
        // estrela nascente (pré-visualização sob o cursor)
        if (usePtr) {
          const r = 2 + ptr.mass * 0.0018;
          drawCore(ptr.x, ptr.y, r, ptr.down ? A[1] : A[4]);
        }

        // restaura estado do contexto para o host / próximo frame
        c2d.globalAlpha = 1;
        c2d.globalCompositeOperation = 'source-over';
      },

      pointer(p) {
        if (!p) return;
        ptr.x = p.x; ptr.y = p.y;
        if (p.type === 'down') {
          ptr.down = true; ptr.mass = 1200;
          if (ctx.audio) ctx.audio.ping(180, { dur: 0.3 });
        } else if (p.type === 'up') {
          ptr.down = false;
          // "uma estrela nasce": fixa o atrator se ganhou massa suficiente
          if (ptr.mass > 2600 && attractors.length < MAX_ATTRACTORS) {
            attractors.push({
              x: ptr.x, y: ptr.y, mass: ptr.mass,
              ang: rand(0, Math.PI * 2), orbR: rand(20, 70),
              cx: ptr.x, cy: ptr.y, born: tGlobal, pinned: true,
            });
            if (ctx.audio) ctx.audio.ping(440, { dur: 0.5 });
          }
          ptr.mass = 0;
        }
      },

      resize(w, h) {
        W = Math.max(1, w | 0); H = Math.max(1, h | 0);
        const minWH = Math.min(W, H);
        // reposiciona centros de órbita / estrelas dentro do novo quadro
        for (let k = 0; k < attractors.length; k++) {
          const a = attractors[k];
          a.cx = Math.min(Math.max(a.cx, W * 0.15), W * 0.85);
          a.cy = Math.min(Math.max(a.cy, H * 0.15), H * 0.85);
          a.orbR = Math.min(a.orbR, Math.max(20, minWH * 0.2));
          // mantém estrelas fixas dentro da tela
          a.x = Math.min(Math.max(a.x, 0), W);
          a.y = Math.min(Math.max(a.y, 0), H);
        }
        ptr.x = Math.min(Math.max(ptr.x, 0), W);
        ptr.y = Math.min(Math.max(ptr.y, 0), H);
        for (let i = 0; i < MAXP; i++) spawnParticle(i, false);
      },

      setParam(k, v) {
        if (k in S) S[k] = +v;
        if (k === 'attractors') makeAttractors(S.attractors);
      },

      reset() {
        ptr.down = false; ptr.mass = 0;
        initAll();
      },

      dispose() {},
    };
  }
});
