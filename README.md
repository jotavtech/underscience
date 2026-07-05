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
js/experiments/*.js     # os sete espécimes, cada um autossuficiente
```

Cada espécime se registra via `UNDERSCIENCE.register({...})` e implementa um
contrato simples (`frame`, `pointer`, `resize`, `setParam`, `reset`,
`dispose`). O host roda um único loop de `requestAnimationFrame` e cuida de
tamanho, DPI, ponteiro e som. Quer criar o seu? Copie um espécime existente.

---

## Integração pyRevit MCP

Este repositório também guarda a configuração da integração **pyRevit MCP** para
o Claude Code (conecta o Claude ao Revit via Model Context Protocol). Veja:

- [`CLAUDE.md`](CLAUDE.md) — regras de operação (conexão fixa, ordem de
  inicialização, segurança, formato de resposta).
- [`docs/pyrevit-mcp.md`](docs/pyrevit-mcp.md) — setup, configuração e troubleshooting.
- [`.mcp.json.example`](.mcp.json.example) — template de configuração do MCP.

---

<div align="center">
<sub>Canvas 2D · Web Audio · zero dependências · feito para rodar em qualquer lugar</sub>
</div>
