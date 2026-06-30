UNDERSCIENCE.register({
  id: 'boids',
  title: 'Revoada (Boids)',
  subtitle: 'Reynolds · murmuração emergente',
  description: 'Centenas de agentes simples obedecem a três regras — separar, alinhar, coesão — e do caos nasce a dança coletiva de um bando vivo.',
  tags: ['enxame', 'emergência', 'vida-artificial', 'murmuração'],
  accent: '#ff2d75',
  params: [
    { key: 'bando',       label: 'Bando',       min: 150, max: 700, step: 1,    value: 450 },
    { key: 'coesao',      label: 'Coesão',      min: 0,   max: 2,   step: 0.01, value: 1 },
    { key: 'separacao',   label: 'Separação',   min: 0,   max: 3,   step: 0.01, value: 1.4 },
    { key: 'alinhamento', label: 'Alinhamento', min: 0,   max: 2,   step: 0.01, value: 1 },
  ],
  create(ctx) {
    const { c2d, noise, palette, audio } = ctx;
    let W = Math.max(1, ctx.width), H = Math.max(1, ctx.height);

    // --- estado dos parâmetros (inicia dos defaults) ---
    const P = { bando: 450, coesao: 1, separacao: 1.4, alinhamento: 1 };

    // --- limites de performance ---
    const MAX = 700;          // teto absoluto de boids
    const PERC = 36;          // raio de percepção (px)
    const PERC2 = PERC * PERC;
    const SEP = 18;           // raio de separação (px)
    const SEP2 = SEP * SEP;
    const MAXSPD = 130;       // velocidade máx (px/s)
    const MINSPD = 30;        // velocidade mín (px/s)
    const MAXFRC = 220;       // força máx (px/s^2)

    // --- buffers alocados UMA vez (typed arrays, paralelos) ---
    const px = new Float32Array(MAX), py = new Float32Array(MAX);
    const vx = new Float32Array(MAX), vy = new Float32Array(MAX);
    const hueOff = new Float32Array(MAX); // pequena variação de cor por boid
    let N = 0; // boids ativos

    // --- grade espacial (hashing por células) ---
    const cell = PERC;                  // tamanho da célula = raio de percepção
    let cols = 1, rows = 1;
    let gridHead = new Int32Array(1);   // primeira partícula de cada célula (-1 vazio)
    const gridNext = new Int32Array(MAX); // próxima partícula na mesma célula

    // ponteiro
    const ptr = { x: W * 0.5, y: H * 0.5, down: false };
    let predator = false; // alterna entre atração e predador a cada toque

    // accents pré-parseados para coloração rápida
    const ACC = (palette.accents && palette.accents.length)
      ? palette.accents
      : ['#00e5ff', '#ff2d75', '#7cff6b', '#b06bff', '#ffd23f'];
    const nAcc = ACC.length;

    // --- véu de trilha a partir de palette.bg (fallback near-black) ---
    function bgVeil(alpha) {
      const bg = palette.bg || '#05060a';
      let r = 5, g = 6, b = 10;
      if (bg[0] === '#' && (bg.length === 7 || bg.length === 4)) {
        if (bg.length === 7) {
          r = parseInt(bg.slice(1, 3), 16);
          g = parseInt(bg.slice(3, 5), 16);
          b = parseInt(bg.slice(5, 7), 16);
        } else {
          r = parseInt(bg[1] + bg[1], 16);
          g = parseInt(bg[2] + bg[2], 16);
          b = parseInt(bg[3] + bg[3], 16);
        }
      }
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }
    const VEIL = bgVeil(0.22);

    function rebuildGrid() {
      cols = Math.max(1, Math.ceil(W / cell));
      rows = Math.max(1, Math.ceil(H / cell));
      const need = cols * rows;
      // realoca apenas quando o tamanho muda (evita lixo por frame; sempre em resize)
      if (gridHead.length !== need) gridHead = new Int32Array(need);
    }

    function spawn(i) {
      px[i] = ctx.rand(0, W);
      py[i] = ctx.rand(0, H);
      const a = ctx.rand(0, Math.PI * 2);
      const s = ctx.rand(40, MAXSPD);
      vx[i] = Math.cos(a) * s;
      vy[i] = Math.sin(a) * s;
      hueOff[i] = ctx.rand(-0.12, 0.12);
    }

    function setCount(n) {
      n = Math.max(1, Math.min(MAX, Math.floor(n)));
      if (n > N) for (let i = N; i < n; i++) spawn(i);
      N = n;
    }

    function reset() {
      N = 0;
      setCount(P.bando);
    }

    rebuildGrid();
    reset();

    function frame(t, dt) {
      if (W <= 0 || H <= 0) return;
      dt = Math.min(dt, 0.05) || 0.016;

      // --- trilha cinematográfica: véu translúcido sobre o fundo ---
      c2d.globalCompositeOperation = 'source-over';
      c2d.globalAlpha = 1;
      c2d.fillStyle = VEIL;
      c2d.fillRect(0, 0, W, H);

      // --- preenche a grade espacial ---
      gridHead.fill(-1);
      const invCell = 1 / cell;
      for (let i = 0; i < N; i++) {
        let cx = (px[i] * invCell) | 0; if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
        let cy = (py[i] * invCell) | 0; if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
        const ci = cy * cols + cx;
        gridNext[i] = gridHead[ci];
        gridHead[ci] = i;
      }

      const cohW = P.coesao, sepW = P.separacao, aliW = P.alinhamento;
      // ligeira turbulência global via noise — dá vida orgânica ao bando
      const windA = noise.n2(t * 0.05, 0) * Math.PI;
      const windX = Math.cos(windA) * 14, windY = Math.sin(windA) * 14;

      for (let i = 0; i < N; i++) {
        const xi = px[i], yi = py[i];
        let cxx = 0, cyy = 0, cN = 0;   // coesão (média de posições)
        let axx = 0, ayy = 0;           // alinhamento (média de velocidades)
        let sxx = 0, syy = 0;           // separação

        let ccx = (xi * invCell) | 0; if (ccx < 0) ccx = 0; else if (ccx >= cols) ccx = cols - 1;
        let ccy = (yi * invCell) | 0; if (ccy < 0) ccy = 0; else if (ccy >= rows) ccy = rows - 1;

        // visita 3x3 células vizinhas
        for (let oy = -1; oy <= 1; oy++) {
          const gy = ccy + oy; if (gy < 0 || gy >= rows) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const gx = ccx + ox; if (gx < 0 || gx >= cols) continue;
            let j = gridHead[gy * cols + gx];
            while (j !== -1) {
              if (j !== i) {
                const dx = px[j] - xi, dy = py[j] - yi;
                const d2 = dx * dx + dy * dy;
                if (d2 < PERC2) {
                  cxx += px[j]; cyy += py[j];
                  axx += vx[j]; ayy += vy[j];
                  cN++;
                  if (d2 < SEP2 && d2 > 0.0001) {
                    const inv = 1 / d2; // mais perto => mais forte
                    sxx -= dx * inv; syy -= dy * inv;
                  }
                }
              }
              j = gridNext[j];
            }
          }
        }

        // acumula aceleração
        let accx = windX, accy = windY;

        if (cN > 0) {
          // coesão: rumo ao centro local
          const dcx = cxx / cN - xi, dcy = cyy / cN - yi;
          const dl = Math.hypot(dcx, dcy) || 1;
          accx += (dcx / dl) * MAXFRC * 0.45 * cohW;
          accy += (dcy / dl) * MAXFRC * 0.45 * cohW;
          // alinhamento: casa com a velocidade média
          const dal = Math.hypot(axx, ayy) || 1;
          accx += (axx / dal) * MAXFRC * 0.5 * aliW;
          accy += (ayy / dal) * MAXFRC * 0.5 * aliW;
        }
        // separação (já é vetor afastante)
        const sl = Math.hypot(sxx, syy);
        if (sl > 0.0001) {
          accx += (sxx / sl) * MAXFRC * 1.1 * sepW;
          accy += (syy / sl) * MAXFRC * 1.1 * sepW;
        }

        // --- interação do ponteiro ---
        if (ptr.down) {
          const dx = ptr.x - xi, dy = ptr.y - yi;
          const dd = Math.hypot(dx, dy) || 1;
          if (predator) {
            // predador: dispersa quando perto
            if (dd < 160) {
              const f = (1 - dd / 160) * MAXFRC * 3.2;
              accx -= (dx / dd) * f;
              accy -= (dy / dd) * f;
            }
          } else {
            // atrator: puxa o bando para o cursor
            const f = MAXFRC * 1.6;
            accx += (dx / dd) * f;
            accy += (dy / dd) * f;
          }
        }

        // integra velocidade
        let nvx = vx[i] + accx * dt;
        let nvy = vy[i] + accy * dt;
        // limita velocidade
        const sp = Math.hypot(nvx, nvy);
        if (sp > MAXSPD) { const k = MAXSPD / sp; nvx *= k; nvy *= k; }
        else if (sp < MINSPD && sp > 0.001) { const k = MINSPD / sp; nvx *= k; nvy *= k; }
        else if (sp <= 0.001) { nvx = MINSPD; nvy = 0; } // boid parado: dá um empurrão
        vx[i] = nvx; vy[i] = nvy;

        // integra posição
        let nx = xi + nvx * dt;
        let ny = yi + nvy * dt;
        // toroidal (wrap) — murmuração contínua. while p/ saltos grandes.
        if (nx < 0) { nx += W; if (nx < 0) nx = 0; } else if (nx >= W) { nx -= W; if (nx >= W) nx = W - 0.001; }
        if (ny < 0) { ny += H; if (ny < 0) ny = 0; } else if (ny >= H) { ny -= H; if (ny >= H) ny = H - 0.001; }
        px[i] = nx; py[i] = ny;
      }

      // --- render: triângulos brilhantes (modo aditivo) ---
      c2d.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i++) {
        const vxx = vx[i], vyy = vy[i];
        const sp = Math.hypot(vxx, vyy) || 1;
        const ang = Math.atan2(vyy, vxx);
        // cor por direção do movimento, com leve offset por boid
        let hf = (ang / (Math.PI * 2) + 0.5 + hueOff[i]);
        hf = hf - Math.floor(hf);            // mantém em [0,1)
        let idx = (hf * nAcc) | 0;           // índice em [0, nAcc)
        if (idx >= nAcc) idx = nAcc - 1;     // guarda contra hf == 1.0
        const col = ACC[idx];

        const x = px[i], y = py[i];
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const len = 7, wid = 3.2;
        // ponta na frente, base atrás
        const tx = x + ca * len, ty = y + sa * len;
        const blx = x - ca * len * 0.5 + -sa * wid;
        const bly = y - sa * len * 0.5 + ca * wid;
        const brx = x - ca * len * 0.5 - -sa * wid;
        const bry = y - sa * len * 0.5 - ca * wid;

        // brilho proporcional à velocidade
        c2d.globalAlpha = 0.25 + 0.4 * (sp / MAXSPD);
        c2d.fillStyle = col;
        c2d.beginPath();
        c2d.moveTo(tx, ty);
        c2d.lineTo(blx, bly);
        c2d.lineTo(brx, bry);
        c2d.closePath();
        c2d.fill();
      }
      c2d.globalAlpha = 1;
      c2d.globalCompositeOperation = 'source-over';

      // --- halo do ponteiro quando ativo ---
      if (ptr.down) {
        c2d.globalCompositeOperation = 'lighter';
        const r = predator ? 160 : 90;
        const g = c2d.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, r);
        const c = predator ? (ACC[1] || ACC[0]) : ACC[0];
        g.addColorStop(0, c);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c2d.globalAlpha = 0.18;
        c2d.fillStyle = g;
        c2d.beginPath();
        c2d.arc(ptr.x, ptr.y, r, 0, Math.PI * 2);
        c2d.fill();
        c2d.globalAlpha = 1;
        c2d.globalCompositeOperation = 'source-over';
      }
    }

    return {
      frame,
      pointer(p) {
        ptr.x = p.x; ptr.y = p.y;
        if (p.type === 'down') {
          ptr.down = true;
          predator = !predator; // alterna atrator <-> predador a cada toque
          if (audio && audio.ping) audio.ping(predator ? 180 : 440, { dur: 0.12 });
        } else if (p.type === 'up') {
          ptr.down = false;
        }
        // 'move' apenas atualiza posição; não mexe em ptr.down para não
        // interromper um arrasto ativo quando p.down vier ausente/false.
      },
      resize(w, h) {
        W = Math.max(1, w); H = Math.max(1, h);
        rebuildGrid();
        // mantém o ponteiro dentro dos novos limites
        if (ptr.x >= W) ptr.x = W * 0.5;
        if (ptr.y >= H) ptr.y = H * 0.5;
        // reposiciona boids fora dos limites
        for (let i = 0; i < N; i++) {
          if (px[i] < 0 || px[i] >= W) px[i] = ctx.rand(0, W);
          if (py[i] < 0 || py[i] >= H) py[i] = ctx.rand(0, H);
        }
      },
      setParam(k, v) {
        if (k in P) P[k] = +v;
        if (k === 'bando') setCount(v);
      },
      reset,
      dispose() {},
    };
  }
});
