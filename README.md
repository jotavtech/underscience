<div align="center">

# ⌁ UNDERSCIENCE

### a ciência por baixo da realidade

Um laboratório interativo no navegador. Sete fenômenos vivos —
calculados quadro a quadro, sem vídeo, sem imagem pré-renderizada,
**sem nenhuma dependência externa.**

</div>

---

## O que é isto

`underscience` é uma experiência web autossuficiente: você abre um arquivo e
entra num laboratório escuro e neon onde a matéria responde ao seu toque.
Cada "espécime" é uma **simulação real** rodando ao vivo em Canvas 2D, com
trilha sonora ambiente generativa em Web Audio. Tudo em português, tudo no seu
navegador, funcionando offline.

## Os sete espécimes

| # | Espécime | Fenômeno |
|---|----------|----------|
| 01 | **Reação-Difusão** | padrões de Turing (Gray–Scott) — pinte e veja a química viver |
| 02 | **Campo de Fluxo** | milhares de partículas seguindo um campo de ruído simplex |
| 03 | **Revoada (Boids)** | vida coletiva: bando que decide sem líder |
| 04 | **Cimática** | interferência de ondas e padrões estacionários |
| 05 | **Gravidade (N-corpos)** | partículas em órbita; clique e nasça uma estrela |
| 06 | **Atrator Estranho** | caos determinístico desenhando filamentos de luz |
| 07 | **Crescimento-L** | sistemas-L: plantas e cristais fractais crescendo |

## Como rodar

Não precisa de build. Qualquer servidor estático serve:

```bash
# opção 1 — python
python3 -m http.server 8080

# opção 2 — node
npx serve .
```

Depois abra <http://localhost:8080>. (Abrir o `index.html` direto também
funciona, mas alguns navegadores bloqueiam áudio/fontes via `file://` — um
servidor local é mais garantido.)

## Atalhos

| Tecla | Ação |
|-------|------|
| `1`–`7` | trocar de espécime |
| `←` `→` | navegar entre espécimes |
| `A` | ligar/desligar o som |
| `R` | reiniciar o espécime |
| `N` | randomizar os parâmetros |
| `?` | sobre |
| `⌁` | há uma sequência oculta... digite o nome do lugar |

## Arquitetura

```
index.html              # a casca / instrumento
css/style.css           # sistema visual
js/noise.js             # ruído simplex 2D/3D (domínio público)
js/audio.js             # motor de áudio ambiente generativo (Web Audio)
js/app.js               # host: registro, loop, ponteiro, UI, climas musicais
js/motion.js            # camada de movimento GSAP (intro, cursor, transições)
js/theatre.js           # integração Theatre.js (editor visual, estado em JSON)
js/theatre-state.json   # estado do Theatre.js (você edita / exporta)
js/experiments/*.js     # os sete espécimes, cada um autossuficiente
```

Cada espécime se registra via `UNDERSCIENCE.register({...})` e implementa um
contrato simples (`frame`, `pointer`, `resize`, `setParam`, `reset`,
`dispose`). O host roda um único loop de `requestAnimationFrame` e cuida de
tamanho, DPI, ponteiro e som. Quer criar o seu? Copie um espécime existente.

## Camada de movimento (GSAP + Theatre.js)

As simulações continuam **zero-dependência** (Canvas 2D puro). Por cima delas,
uma camada de movimento *opcional e progressiva* dá polimento cinematográfico:

- **GSAP + ScrollTrigger** (`js/motion.js`, via CDN) — timeline declarativa da
  intro, cursor personalizado com anel magnético, botões magnéticos, entrada
  em cascata do HUD e transição animada do acento a cada troca de espécime.
  Ajuste tudo no objeto `TUNE` no topo de `motion.js` — é declarativo de
  propósito. Se o GSAP não carregar (offline/`file://`), o site cai de volta
  nas animações CSS sem quebrar, e `prefers-reduced-motion` é respeitado.

- **Theatre.js** (`js/theatre.js`, via CDN ESM) — editor visual de animação
  cujo **estado é o arquivo `js/theatre-state.json`**. Fluxo IA + humano:
  1. abra o site com `?edit` na URL (ou em `localhost`) → o **Studio** abre;
  2. anime o objeto **`Hero`** (brilho do título, halo de acento, vinheta,
     scanlines) na timeline visual;
  3. no Studio: menu do projeto → **Export** → salve por cima de
     `js/theatre-state.json` e faça commit;
  4. em produção (sem `?edit`), o core apenas **toca** esse JSON.

  Enquanto o JSON for o placeholder (`definitionVersion: null`), o site usa os
  valores padrão definidos em `js/theatre.js`.

### E o @react-three/drei / r3f-perf / leva?

Esses três são do ecossistema **React + react-three-fiber (R3F)**. O site hoje
é HTML/JS vanilla, sem React nem cena Three.js, e faz deploy estático sem build
— então eles não entram sem uma migração para React + R3F + bundler (Vite).
Isso é um passo maior e à parte: o trabalho de GSAP/Theatre acima é aditivo,
reversível e um subconjunto do que uma migração R3F reusaria. Quando/se
quisermos a rota 3D, `drei` (helpers), `r3f-perf` e `leva` (medição/tuning)
entram nessa etapa.

---

## Integração pyRevit MCP

Este repositório também guarda a configuração da integração **pyRevit MCP** para
o Claude Code (conecta o Claude ao Revit via Model Context Protocol). Veja:

- [`CLAUDE.md`](CLAUDE.md) — regras de operação (conexão fixa, ordem de
  inicialização, segurança, formato de resposta).
- [`docs/pyrevit-mcp.md`](docs/pyrevit-mcp.md) — setup, configuração e troubleshooting.
- [`docs/PRD-pyrevit-mcp.md`](docs/PRD-pyrevit-mcp.md) — PRD do agente: como conectar e o que o Claude deve fazer.
- [`docs/PRD-modelagem-escritorio.md`](docs/PRD-modelagem-escritorio.md) — PRD de modelagem de escritório completo (nível interiores) por texto + imagens.
- [`revit/`](revit/) — extensão pyRevit **UnderScience Tools** (botão *Cotar Paredes*: cota paredes automaticamente com o tipo de cota escolhido).
- [`.mcp.json.example`](.mcp.json.example) — template de configuração do MCP.

---

<div align="center">
<sub>Canvas 2D · Web Audio · zero dependências · feito para rodar em qualquer lugar</sub>
</div>
