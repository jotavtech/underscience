UNDERSCIENCE.register({
  id: 'cymatics',
  title: 'Cimática',
  subtitle: 'Cimática · campo de interferência de ondas estacionárias',
  description: 'Vários osciladores pontuais emitem ondas que se somam e se cancelam, esculpindo nós e ventres luminosos num campo estacionário que treme e pulsa.',
  tags: ['ondas', 'interferência', 'cimática', 'padrões', 'física'],
  accent: '#b06bff',
  params: [
    { key: 'freq', label: 'Frequência', min: 0.5, max: 6, step: 0.01, value: 2.2 },
    { key: 'wavelength', label: 'Comprimento', min: 4, max: 40, step: 0.5, value: 16 },
    { key: 'sources', label: 'Fontes', min: 1, max: 8, step: 1, value: 3 },
    { key: 'exposure', label: 'Brilho', min: 0.5, max: 3, step: 0.01, value: 1.4 },
  ],

  create(ctx) {
    const { c2d, palette, audio } = ctx;

    // ---- grade interna em baixa resolução (campo cimático é calculado aqui) ----
    const GW = 200, GH = 120;        // <= 240x150, mantém custo controlado
    const NCELL = GW * GH;
    const MAX_SRC = 8;

    // estado local mutável, semeado pelos defaults dos params
    const state = { freq: 2.2, wavelength: 16, sources: 3, exposure: 1.4 };

    let W = Math.max(1, ctx.width | 0);
    let H = Math.max(1, ctx.height | 0);

    // buffer offscreen do tamanho da grade; pintamos ImageData e ampliamos
    let buf = document.createElement('canvas');
    buf.width = GW; buf.height = GH;
    let bctx = buf.getContext('2d');
    let img = bctx.createImageData(GW, GH);
    let data = img.data;

    // acumulador do campo de amplitude (reutilizado a cada frame)
    const field = new Float32Array(NCELL);

    // fontes osciladoras em coordenadas de GRADE (0..GW, 0..GH)
    const srcX = new Float32Array(MAX_SRC);
    const srcY = new Float32Array(MAX_SRC);
    const srcPhase = new Float32Array(MAX_SRC);
    let srcCount = 0;
    let dragIdx = -1; // índice da fonte sendo arrastada (-1 = nenhuma)

    // LUT de cor (256 -> rgb) construída a partir da paleta
    const lut = new Uint8Array(256 * 3);
    function hexRGB(h) {
      if (typeof h !== 'string' || h[0] !== '#') return [176, 107, 255];
      const n = parseInt(h.slice(1), 16);
      if (!isFinite(n)) return [176, 107, 255];
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function buildLUT() {
      // vazio escuro -> sombra roxa -> accent -> realce ciano -> núcleo branco
      const c0 = hexRGB(palette.bg);
      const c1 = hexRGB('#3a1d6e');
      const c2 = hexRGB((palette.accents && palette.accents[3]) || '#b06bff');
      const c3 = hexRGB((palette.accents && palette.accents[0]) || '#00e5ff');
      const c4 = [255, 255, 255];
      const stops = [
        [0.00, c0], [0.30, c1], [0.58, c2], [0.82, c3], [1.00, c4],
      ];
      for (let i = 0; i < 256; i++) {
        const t = i / 255;
        let a = stops[0], b = stops[stops.length - 1];
        for (let s = 0; s < stops.length - 1; s++) {
          if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
        }
        const span = (b[0] - a[0]) || 1;
        const lt = (t - a[0]) / span;
        lut[i * 3]     = (a[1][0] + (b[1][0] - a[1][0]) * lt) | 0;
        lut[i * 3 + 1] = (a[1][1] + (b[1][1] - a[1][1]) * lt) | 0;
        lut[i * 3 + 2] = (a[1][2] + (b[1][2] - a[1][2]) * lt) | 0;
      }
    }
    buildLUT();

    // distribui N fontes simetricamente em torno do centro (honra state.sources)
    function placeSymmetric() {
      const n = Math.max(1, Math.min(MAX_SRC, state.sources | 0));
      srcCount = n;
      dragIdx = -1;
      const cx = GW / 2, cy = GH / 2, r = Math.min(GW, GH) * 0.28;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        srcX[i] = cx + Math.cos(a) * r;
        srcY[i] = cy + Math.sin(a) * r;
        srcPhase[i] = i * 0.6;
      }
    }
    placeSymmetric();

    // converte ponteiro (CSS px) -> coords de grade
    function toGrid(x, y) {
      return [ (x / W) * GW, (y / H) * GH ];
    }

    function addSource(gx, gy) {
      let idx;
      if (srcCount < MAX_SRC) {
        idx = srcCount++;
      } else {
        // recicla a mais antiga (desloca e acrescenta no fim)
        for (let i = 0; i < MAX_SRC - 1; i++) {
          srcX[i] = srcX[i + 1]; srcY[i] = srcY[i + 1]; srcPhase[i] = srcPhase[i + 1];
        }
        idx = MAX_SRC - 1;
      }
      srcX[idx] = Math.max(0, Math.min(GW, gx));
      srcY[idx] = Math.max(0, Math.min(GH, gy));
      srcPhase[idx] = ctx.rand ? ctx.rand(0, Math.PI * 2) : Math.random() * 6.28;
      dragIdx = idx;
      if (audio && audio.ping) audio.ping(180 + srcCount * 55, { dur: 0.18, type: 'sine' });
    }

    function render(t) {
      const n = srcCount;
      if (n <= 0) {
        // sem fontes: campo nulo -> pinta fundo
        data.fill(0);
        for (let i = 0; i < NCELL; i++) {
          const o = i * 4;
          data[o] = lut[0]; data[o + 1] = lut[1]; data[o + 2] = lut[2]; data[o + 3] = 255;
        }
        bctx.putImageData(img, 0, 0);
        return;
      }

      const k = (Math.PI * 2) / Math.max(0.001, state.wavelength); // número de onda espacial
      const w = state.freq * 3.2;                                  // freq angular temporal
      const invN = 1 / n;
      const tw = t * w;

      // acumula o campo de interferência
      let mn = 1e9, mx = -1e9;
      for (let yy = 0; yy < GH; yy++) {
        const rowBase = yy * GW;
        for (let xx = 0; xx < GW; xx++) {
          let sum = 0;
          for (let s = 0; s < n; s++) {
            const dx = xx - srcX[s], dy = yy - srcY[s];
            const d = Math.sqrt(dx * dx + dy * dy);
            const atten = 1 / (1 + d * 0.02); // decaimento radial evita estouro perto da fonte
            sum += Math.sin(d * k - tw + srcPhase[s]) * atten;
          }
          sum *= invN;
          field[rowBase + xx] = sum;
          if (sum < mn) mn = sum;
          if (sum > mx) mx = sum;
        }
      }

      const range = (mx - mn) || 1;
      const invRange = 1 / range;
      const exposure = state.exposure;
      const shimmer = 0.85 + 0.15 * Math.sin(t * 1.7);
      const expShim = exposure * shimmer;

      // mapeia campo -> intensidade de onda estacionária -> cor da LUT
      for (let i = 0; i < NCELL; i++) {
        const v = (field[i] - mn) * invRange;   // 0..1 bruto
        let inten = Math.abs(v * 2 - 1);         // 0 no meio, 1 nos extremos (ventres)
        inten = Math.pow(inten, 0.7) * expShim;
        if (inten > 1) inten = 1;
        else if (inten < 0) inten = 0;
        const l3 = ((inten * 255) | 0) * 3;
        const o = i * 4;
        data[o]     = lut[l3];
        data[o + 1] = lut[l3 + 1];
        data[o + 2] = lut[l3 + 2];
        data[o + 3] = 255;
      }
      bctx.putImageData(img, 0, 0);
    }

    return {
      frame(t, dt) {
        if (W <= 0 || H <= 0) return;
        if (!bctx) return; // descartado
        render(t);

        // amplia o buffer para o canvas todo (suavizado para look orgânico)
        c2d.globalCompositeOperation = 'source-over';
        c2d.imageSmoothingEnabled = true;
        c2d.globalAlpha = 1;
        c2d.drawImage(buf, 0, 0, GW, GH, 0, 0, W, H);

        // vinheta sutil via borda translúcida do bg
        const g = c2d.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.72);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, palette.bg);
        c2d.fillStyle = g;
        c2d.fillRect(0, 0, W, H);

        // marcadores das fontes com glow aditivo
        c2d.globalCompositeOperation = 'lighter';
        const sx = W / GW, sy = H / GH;
        for (let s = 0; s < srcCount; s++) {
          const px = srcX[s] * sx, py = srcY[s] * sy;
          const pulse = 4 + 2.5 * Math.sin(t * state.freq * 3.2 + srcPhase[s]);
          const rad = 22 + pulse * 2;
          const rg = c2d.createRadialGradient(px, py, 0, px, py, rad);
          const ac = (s === dragIdx) ? ((palette.accents && palette.accents[0]) || '#00e5ff')
                                     : ((palette.accents && palette.accents[3]) || '#b06bff');
          rg.addColorStop(0, ac);
          rg.addColorStop(0.25, 'rgba(176,107,255,0.35)');
          rg.addColorStop(1, 'rgba(0,0,0,0)');
          c2d.fillStyle = rg;
          c2d.globalAlpha = 0.8;
          c2d.beginPath();
          c2d.arc(px, py, rad, 0, Math.PI * 2);
          c2d.fill();
          // núcleo quente
          c2d.globalAlpha = 1;
          c2d.fillStyle = palette.fg;
          c2d.beginPath();
          c2d.arc(px, py, Math.max(0.5, pulse), 0, Math.PI * 2);
          c2d.fill();
        }
        c2d.globalAlpha = 1;
        c2d.globalCompositeOperation = 'source-over';
      },

      pointer(p) {
        if (W <= 0 || H <= 0) return;
        const [gx, gy] = toGrid(p.x, p.y);
        if (p.type === 'down') {
          addSource(gx, gy);
        } else if (p.type === 'move' && p.down && dragIdx >= 0 && dragIdx < srcCount) {
          srcX[dragIdx] = Math.max(0, Math.min(GW, gx));
          srcY[dragIdx] = Math.max(0, Math.min(GH, gy));
        } else if (p.type === 'up') {
          dragIdx = -1; // solta o arraste e remove o realce de "arrastando"
        }
      },

      resize(w, h) {
        W = Math.max(1, w | 0);
        H = Math.max(1, h | 0);
        // a grade é independente da resolução do canvas; nada a realocar.
        // garante que o contexto offscreen ainda existe (caso pós-dispose).
        if (!buf) {
          buf = document.createElement('canvas');
          buf.width = GW; buf.height = GH;
          bctx = buf.getContext('2d');
          img = bctx.createImageData(GW, GH);
          data = img.data;
        }
      },

      setParam(k, v) {
        if (!(k in state)) return;
        const num = +v;
        if (!isFinite(num)) return;
        state[k] = num;
        if (k === 'sources') {
          const target = Math.max(1, Math.min(MAX_SRC, num | 0));
          if (target < srcCount) {
            srcCount = target;
            if (dragIdx >= srcCount) dragIdx = -1;
          } else if (target > srcCount) {
            // adiciona fontes em torno do centro até atingir o alvo
            const cx = GW / 2, cy = GH / 2, r = Math.min(GW, GH) * 0.3;
            while (srcCount < target) {
              const a = ctx.rand ? ctx.rand(0, Math.PI * 2) : Math.random() * Math.PI * 2;
              srcX[srcCount] = cx + Math.cos(a) * r;
              srcY[srcCount] = cy + Math.sin(a) * r;
              srcPhase[srcCount] = ctx.rand ? ctx.rand(0, Math.PI * 2) : Math.random() * 6.28;
              srcCount++;
            }
          }
        }
      },

      reset() {
        placeSymmetric();
      },

      dispose() {
        buf = null; bctx = null; img = null; data = null;
      },
    };
  },
});
