// UNDERSCIENCE specimen — Campo de Fluxo (simplex flow field)
// ~3500 partículas escorrem por um campo vetorial de ruído, deixando rastros aditivos.
// O cursor cria um vórtice que dobra as correntes próximas.
UNDERSCIENCE.register({
  id: 'flow-field',
  title: 'Campo de Fluxo',
  subtitle: 'Simplex flow field · ~3500 partículas luminosas',
  description: 'Milhares de partículas escorrem por um campo vetorial invisível esculpido em ruído simplex, deixando rastros de luz. O cursor abre um vórtice que dobra as correntes ao seu redor.',
  tags: ['fluxo', 'ruído', 'partículas', 'vórtice', 'rastros'],
  accent: '#7cff6b',
  params: [
    { key: 'particulas', label: 'Partículas', min: 800,  max: 4000, step: 50,    value: 3500 },
    { key: 'escala',     label: 'Escala',     min: 0.5,  max: 4,    step: 0.05,  value: 1.6  },
    { key: 'velocidade', label: 'Velocidade', min: 0.2,  max: 3,    step: 0.05,  value: 1.2  },
    { key: 'rastro',     label: 'Rastro',     min: 0.01, max: 0.2,  step: 0.005, value: 0.06 },
  ],

  create(ctx) {
    const TAU = Math.PI * 2;
    const MAX = 4000;          // teto rígido de partículas
    const c2d = ctx.c2d;

    // estado lido pelos sliders (inicia dos defaults de params)
    const st = {
      particulas: 3500,
      escala: 1.6,
      velocidade: 1.2,
      rastro: 0.06,
    };

    let W = Math.max(1, ctx.width);
    let H = Math.max(1, ctx.height);

    // buffers alocados UMA vez (typed arrays para o caminho quente)
    const px = new Float32Array(MAX);   // posição
    const py = new Float32Array(MAX);
    const life = new Float32Array(MAX); // vida restante até respawn
    const hue = new Uint8Array(MAX);    // índice de cor (em palette.accents)

    const accents = (ctx.palette && ctx.palette.accents && ctx.palette.accents.length)
      ? ctx.palette.accents
      : ['#00e5ff', '#ff2d75', '#7cff6b', '#b06bff', '#ffd23f'];
    const bg = (ctx.palette && ctx.palette.bg) || '#05060a';
    const accent = ctx.accent || '#7cff6b';

    // vórtice do ponteiro
    const vortex = { active: false, x: 0, y: 0, vx: 0, vy: 0, strength: 0 };

    function rnd(a, b) { return ctx.rand ? ctx.rand(a, b) : a + Math.random() * (b - a); }
    function rIndex(n) { return ctx.randInt ? ctx.randInt(0, n - 1) : (Math.random() * n) | 0; }

    function spawn(i) {
      px[i] = rnd(0, W);
      py[i] = rnd(0, H);
      life[i] = rnd(40, 220);
      hue[i] = rIndex(accents.length);
    }

    function initAll() {
      for (let i = 0; i < MAX; i++) spawn(i);
    }
    initAll();

    function clearBg() {
      c2d.globalCompositeOperation = 'source-over';
      c2d.globalAlpha = 1;
      c2d.fillStyle = bg;
      c2d.fillRect(0, 0, W, H);
    }
    clearBg();

    // envolve um valor em [0, m) de forma robusta (passos grandes inclusos)
    function wrap(v, m) {
      v = v % m;
      if (v < 0) v += m;
      return v;
    }

    function frame(t, dt) {
      // garante estado de composição limpo mesmo nos caminhos de saída
      c2d.globalCompositeOperation = 'source-over';
      c2d.globalAlpha = 1;
      if (W <= 0 || H <= 0) return;

      const d = Math.min(dt, 0.05) * 60; // passo normalizado (~1 a 60fps, até ~3 num quadro lento)

      // rastro: véu translúcido do fundo por cima do quadro anterior
      c2d.fillStyle = bg;
      c2d.globalAlpha = st.rastro;
      c2d.fillRect(0, 0, W, H);
      c2d.globalAlpha = 1;

      // amortece o vórtice quando o ponteiro está solto
      if (!vortex.active) vortex.strength *= 0.92;

      const scale = st.escala * 0.0035;             // escala do ruído em espaço de tela
      const spd = st.velocidade * 1.6;              // px por passo base
      const zt = t * 0.05;                          // deriva temporal do campo
      const count = Math.min(MAX, st.particulas | 0);
      const vr = 170;                               // raio de influência do vórtice
      const vr2 = vr * vr;
      const maxStep = 64;                           // teto de deslocamento por passo (anti-streak)

      // desenho aditivo dos segmentos
      c2d.globalCompositeOperation = 'lighter';
      c2d.lineWidth = 1.05;
      c2d.lineCap = 'round';

      const vActive = vortex.strength > 0.001;

      for (let i = 0; i < count; i++) {
        const x = px[i], y = py[i];

        // ângulo a partir do campo de ruído simplex
        const n = ctx.noise.n3(x * scale, y * scale, zt); // ~ -1..1
        const ang = n * TAU * 1.4;
        let vx = Math.cos(ang) * spd;
        let vy = Math.sin(ang) * spd;

        // contribuição do vórtice: rotaciona o vetor ao redor do cursor
        if (vActive) {
          const dx = x - vortex.x;
          const dy = y - vortex.y;
          const dd = dx * dx + dy * dy;
          if (dd < vr2) {
            const dist = Math.sqrt(dd) + 0.001;
            const falloff = (1 - dist / vr) * vortex.strength;
            // tangente (perpendicular ao raio) gera o redemoinho
            const tx = -dy / dist;
            const ty = dx / dist;
            // leve sucção para dentro + arrasto da velocidade do cursor
            const inx = -dx / dist;
            const iny = -dy / dist;
            vx += (tx * 2.6 + inx * 0.7) * falloff * spd + vortex.vx * falloff * 0.25;
            vy += (ty * 2.6 + iny * 0.7) * falloff * spd + vortex.vy * falloff * 0.25;
          }
        }

        // deslocamento do passo, com teto para nunca cruzar a tela inteira
        let stepx = vx * d;
        let stepy = vy * d;
        const sl = Math.sqrt(stepx * stepx + stepy * stepy);
        if (sl > maxStep) {
          const k = maxStep / sl;
          stepx *= k; stepy *= k;
        }

        const nx = x + stepx;
        const ny = y + stepy;

        // intensidade da cor pela velocidade do segmento
        const sp = Math.sqrt(vx * vx + vy * vy);
        const a = Math.min(0.55, 0.12 + sp * 0.06);

        c2d.strokeStyle = accents[hue[i]];
        c2d.globalAlpha = a;
        c2d.beginPath();
        c2d.moveTo(x, y);
        c2d.lineTo(nx, ny);
        c2d.stroke();

        // envolve nas bordas de forma robusta (detecta para não riscar a tela ao saltar)
        const wx = wrap(nx, W);
        const wy = wrap(ny, H);
        px[i] = wx;
        py[i] = wy;

        // respawn ocasional para renovar o fluxo
        life[i] -= d;
        if (life[i] <= 0) spawn(i);
      }

      // núcleo brilhante do vórtice
      if (vortex.strength > 0.02) {
        const r = 26 + vortex.strength * 40;
        const g = c2d.createRadialGradient(vortex.x, vortex.y, 0, vortex.x, vortex.y, r);
        g.addColorStop(0, accent);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c2d.globalAlpha = Math.min(0.5, vortex.strength * 0.5);
        c2d.fillStyle = g;
        c2d.beginPath();
        c2d.arc(vortex.x, vortex.y, r, 0, TAU);
        c2d.fill();
      }

      c2d.globalAlpha = 1;
      c2d.globalCompositeOperation = 'source-over';
    }

    function pointer(p) {
      if (!p) return;
      if (p.type === 'down') {
        vortex.active = true;
        vortex.x = p.x; vortex.y = p.y;
        vortex.vx = 0; vortex.vy = 0;
        vortex.strength = 1;
        if (ctx.audio && ctx.audio.ping) ctx.audio.ping(220, { dur: 0.2 });
      } else if (p.type === 'move') {
        if (vortex.active || p.down) {
          vortex.active = true;
          vortex.vx = p.x - vortex.x;
          vortex.vy = p.y - vortex.y;
          vortex.x = p.x; vortex.y = p.y;
          vortex.strength = Math.min(1.4, vortex.strength + 0.12);
        }
      } else if (p.type === 'up') {
        vortex.active = false; // strength amortece sozinho no frame
      }
    }

    function resize(w, h) {
      W = Math.max(1, w);
      H = Math.max(1, h);
      // reposiciona partículas que ficaram fora das novas dimensões
      for (let i = 0; i < MAX; i++) {
        if (px[i] >= W || py[i] >= H || px[i] < 0 || py[i] < 0) spawn(i);
      }
      // vórtice pode ter centro fora da nova área; descarta
      vortex.active = false;
      vortex.strength = 0;
      clearBg();
    }

    function setParam(k, v) {
      if (k in st) {
        const nv = +v;
        if (nv === nv) st[k] = nv; // ignora NaN
      }
    }

    function reset() {
      vortex.active = false;
      vortex.strength = 0;
      initAll();
      clearBg();
    }

    function dispose() { /* sem recursos externos para liberar */ }

    return { frame, pointer, resize, setParam, reset, dispose };
  }
});
