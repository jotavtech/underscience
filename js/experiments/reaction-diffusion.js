/* UNDERSCIENCE — Reação-Difusão (Gray–Scott) */
/* Dois reagentes A/B se difundem e reagem; o sistema de Turing faz
   emergir corais, impressões digitais e mitoses. O ponteiro injeta B. */
UNDERSCIENCE.register({
  id: 'reaction-diffusion',
  title: 'Reação-Difusão',
  subtitle: 'Gray–Scott · padrões de Turing',
  description: 'Dois reagentes químicos se difundem e se devoram numa dança instável, fazendo emergir corais, impressões digitais e mitoses vivas. Pinte com o mouse e cultive organismos onde tocar.',
  tags: ['química', 'turing', 'vida', 'morfogênese'],
  accent: '#00e5ff',
  params: [
    { key: 'feed',       label: 'Alimentação', min: 0.01, max: 0.09, step: 0.001, value: 0.037 },
    { key: 'kill',       label: 'Eliminação',  min: 0.04, max: 0.07, step: 0.001, value: 0.062 },
    { key: 'velocidade', label: 'Velocidade',  min: 1,    max: 10,   step: 1,     value: 8 },
    { key: 'zoom',       label: 'Zoom',        min: 0.5,  max: 2,    step: 0.05,  value: 1 },
  ],

  create(ctx) {
    const { c2d, palette } = ctx;

    // --- estado de parâmetros (atualizado em setParam, inicia nos defaults) ---
    const P = { feed: 0.037, kill: 0.062, velocidade: 8, zoom: 1 };

    // --- buffers da simulação (alocados uma vez por resize/zoom) ---
    let GW = 0, GH = 0;               // dimensões da grade
    let A = null, B = null, A2 = null, B2 = null; // Float32Array reagentes (atual + próximo)
    let img = null, idata = null;     // ImageData da grade + view Uint8 (idata = img.data)
    let grid = null, gctx = null;     // canvas off-screen do tamanho da grade
    let viewW = 0, viewH = 0;         // dimensões CSS do destino

    // ponteiro
    let pdown = false, px = 0, py = 0;

    // utilitário hex -> [r,g,b]
    function hexRGB(h) {
      const s = String(h || '#000000').replace('#', '');
      const n = parseInt(s.length === 3
        ? s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
        : s, 16) || 0;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    // cores de destino pré-parseadas (accent + segundo accent + bg)
    const acc = (palette.accents && palette.accents.length) ? palette.accents : ['#00e5ff'];
    const accent  = hexRGB(acc[0] || '#00e5ff');         // ciano base
    const accent2 = hexRGB(acc[3] || acc[acc.length - 1] || '#b06bff'); // realce (violeta)
    const bg      = hexRGB(palette.bg || '#05060a');
    const haloCol = accent; // halo do cursor usa o accent base

    // dimensiona a grade a partir das dimensões CSS e do zoom
    function alloc(w, h) {
      viewW = Math.max(1, w | 0);
      viewH = Math.max(1, h | 0);
      // grade limitada a 200x120; zoom controla densidade aparente
      const target = 200 / Math.max(0.5, P.zoom);
      GW = Math.max(40, Math.min(200, Math.round(target)));
      GH = Math.max(24, Math.min(120, Math.round(GW * (viewH / Math.max(1, viewW)))));
      const N = GW * GH;
      A = new Float32Array(N);
      B = new Float32Array(N);
      A2 = new Float32Array(N);
      B2 = new Float32Array(N);
      // off-screen do tamanho exato da grade
      if (!grid) grid = document.createElement('canvas');
      grid.width = GW; grid.height = GH;
      gctx = grid.getContext('2d');
      img = gctx.createImageData(GW, GH);
      idata = img.data;
      // garante alpha=255 em todo o ImageData (uma vez)
      for (let i = 3; i < idata.length; i += 4) idata[i] = 255;
      seed();
    }

    // semeia: A=1 em toda parte, alguns blobs de B
    function seed() {
      if (!A) return;
      A.fill(1); B.fill(0);
      const blobs = ctx.randInt(3, 6);
      for (let k = 0; k < blobs; k++) {
        const cx = ctx.randInt((GW * 0.15) | 0, (GW * 0.85) | 0);
        const cy = ctx.randInt((GH * 0.15) | 0, (GH * 0.85) | 0);
        splat(cx, cy, ctx.randInt(3, 7), 1);
      }
    }

    // injeta B numa região circular (raio r em células da grade)
    function splat(cx, cy, r, amount) {
      if (!B) return;
      const r2 = r * r;
      const x0 = Math.max(0, (cx - r) | 0), x1 = Math.min(GW - 1, (cx + r) | 0);
      const y0 = Math.max(0, (cy - r) | 0), y1 = Math.min(GH - 1, (cy + r) | 0);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy <= r2) {
            const i = y * GW + x;
            B[i] = Math.min(1, B[i] + amount);
            A[i] = Math.max(0, A[i] - amount * 0.5);
          }
        }
      }
    }

    // um passo de Gray–Scott com Laplaciano 3x3 (bordas com wrap toroidal)
    function step() {
      const f = P.feed, k = P.kill;
      const Da = 1.0, Db = 0.5;
      const W = GW, H = GH;
      const lA = A, lB = B, oA = A2, oB = B2; // referências locais (hot loop)
      for (let y = 0; y < H; y++) {
        const yu = (y - 1 + H) % H, yd = (y + 1) % H;
        const rowU = yu * W, rowC = y * W, rowD = yd * W;
        for (let x = 0; x < W; x++) {
          const xl = (x - 1 + W) % W, xr = (x + 1) % W;
          const c = rowC + x;
          const a = lA[c], b = lB[c];
          // Laplaciano (vizinhos diretos 0.2, diagonais 0.05, centro -1)
          const lapA =
            (lA[rowU + x] + lA[rowD + x] + lA[rowC + xl] + lA[rowC + xr]) * 0.2 +
            (lA[rowU + xl] + lA[rowU + xr] + lA[rowD + xl] + lA[rowD + xr]) * 0.05 - a;
          const lapB =
            (lB[rowU + x] + lB[rowD + x] + lB[rowC + xl] + lB[rowC + xr]) * 0.2 +
            (lB[rowU + xl] + lB[rowU + xr] + lB[rowD + xl] + lB[rowD + xr]) * 0.05 - b;
          const abb = a * b * b;
          const na = a + (Da * lapA - abb + f * (1 - a));
          const nb = b + (Db * lapB + abb - (k + f) * b);
          oA[c] = na < 0 ? 0 : na > 1 ? 1 : na;
          oB[c] = nb < 0 ? 0 : nb > 1 ? 1 : nb;
        }
      }
      // troca buffers
      let t = A; A = A2; A2 = t;
      t = B; B = B2; B2 = t;
    }

    // mapeia A-B -> cor (bg -> accent -> accent2 com brilho)
    function render() {
      const d = idata;
      const N = GW * GH;
      const lA = A, lB = B;
      const b0 = bg[0], b1 = bg[1], b2 = bg[2];
      const a0 = accent[0], a1 = accent[1], a2 = accent[2];
      const c0 = accent2[0], c1 = accent2[1], c2 = accent2[2];
      for (let i = 0; i < N; i++) {
        // contraste: realça paredes do padrão onde há reagente B
        let v = lA[i] - lB[i];     // ~ -1..1
        v = (v + 1) * 0.5;         // 0..1; baixo = região de B
        let s = 1 - v;             // s alto onde há B
        s = s * s;                 // gamma para escurecer o fundo
        let r, g, bl;
        if (s < 0.5) {
          const u = s * 2;
          r = b0 + (a0 - b0) * u;
          g = b1 + (a1 - b1) * u;
          bl = b2 + (a2 - b2) * u;
        } else {
          const u = (s - 0.5) * 2;
          r = a0 + (c0 - a0) * u;
          g = a1 + (c1 - a1) * u;
          bl = a2 + (c2 - a2) * u;
        }
        const j = i << 2;
        d[j] = r; d[j + 1] = g; d[j + 2] = bl; // alpha já é 255
      }
      gctx.putImageData(img, 0, 0);
    }

    return {
      frame(t, dt) {
        if (viewW <= 0 || viewH <= 0 || !A) return;

        // ponteiro pintando: injeta B continuamente enquanto pressionado
        if (pdown) {
          const gx = (px / viewW) * GW;
          const gy = (py / viewH) * GH;
          splat(gx, gy, Math.max(2, GW * 0.025), 0.7);
        }

        // múltiplos passos de simulação por frame (velocidade)
        const steps = Math.max(1, Math.min(10, Math.round(P.velocidade)));
        for (let s = 0; s < steps; s++) step();

        render();

        // fundo opaco (sem smear nem flicker) e desenha a grade ampliada
        c2d.globalCompositeOperation = 'source-over';
        c2d.globalAlpha = 1;
        c2d.fillStyle = palette.bg;
        c2d.fillRect(0, 0, viewW, viewH);
        c2d.imageSmoothingEnabled = true;
        c2d.drawImage(grid, 0, 0, GW, GH, 0, 0, viewW, viewH);

        // camada de brilho aditivo para realçar as paredes
        c2d.globalCompositeOperation = 'lighter';
        c2d.globalAlpha = 0.18;
        c2d.drawImage(grid, 0, 0, GW, GH, 0, 0, viewW, viewH);
        c2d.globalAlpha = 1;
        c2d.globalCompositeOperation = 'source-over';

        // halo do cursor quando pintando
        if (pdown) {
          const rad = Math.max(12, viewW * 0.03);
          const grd = c2d.createRadialGradient(px, py, 0, px, py, rad);
          grd.addColorStop(0, 'rgba(' + haloCol[0] + ',' + haloCol[1] + ',' + haloCol[2] + ',0.35)');
          grd.addColorStop(1, 'rgba(' + haloCol[0] + ',' + haloCol[1] + ',' + haloCol[2] + ',0)');
          c2d.globalCompositeOperation = 'lighter';
          c2d.fillStyle = grd;
          c2d.beginPath();
          c2d.arc(px, py, rad, 0, Math.PI * 2);
          c2d.fill();
          c2d.globalCompositeOperation = 'source-over';
        }
      },

      pointer(p) {
        px = p.x; py = p.y;
        if (p.type === 'down') {
          if (!pdown && ctx.audio) ctx.audio.ping(420, { dur: 0.15 });
          pdown = true;
        } else if (p.type === 'up') {
          pdown = false;
        } else if (p.type === 'move') {
          pdown = !!p.down;
        }
      },

      resize(w, h) {
        alloc(w, h);
      },

      setParam(k, v) {
        if (k in P) P[k] = v;
        // mudar zoom redimensiona a grade (e re-semeia)
        if (k === 'zoom' && viewW > 0) alloc(viewW, viewH);
      },

      reset() {
        seed();
      },

      dispose() {
        A = B = A2 = B2 = null;
        grid = gctx = img = idata = null;
      },
    };
  }
});
