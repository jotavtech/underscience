# Setup — pyRevit MCP + Claude Code

Guia para conectar o Claude Code ao Revit via **pyRevit MCP Server**. As regras
de operação (segurança, ordem de inicialização, formato de resposta) estão em
[`../CLAUDE.md`](../CLAUDE.md).

## Arquitetura

```
Claude Code  ──MCP (stdio)──▶  MCP Server (uv, main.py)  ──HTTP──▶  pyRevit Routes  ──▶  API do Revit
                                                                    (dentro do Revit)
```

- **pyRevit Routes server**: REST API leve que roda _dentro_ do processo do
  Revit. Escuta em `http://127.0.0.1:48884/` e executa código da API do Revit.
- **MCP Server** (`main.py` do projeto `revit-mcp-python`): fala o protocolo MCP
  para o Claude Code e traduz as chamadas em requisições HTTP para o Routes.
- **Tool exposta**: `execute_revit_code` — gera e roda Python contra a API do
  Revit em tempo real. Não há tools pré-prontas.

## Pré-requisitos

- Revit (2024–2027) com **pyRevit** instalado.
- [`uv`](https://docs.astral.sh/uv/) instalado (gerenciador de ambiente Python).
- O servidor MCP: clonar `revit-mcp-python`
  (<https://github.com/revit-mcp/revit-mcp-python>).

## Passo 1 — Ativar o pyRevit Routes server

1. No Revit, aba **pyRevit → Settings**.
2. Seção **Routes** → ativar **Routes Server**.
3. Confirmar que ele escuta em `http://127.0.0.1:48884/`.
4. Instalar a extensão do MCP: pyRevit **Extensions**, ou adicionar manualmente a
   pasta clonada (com sufixo `.extension`) ao caminho de extensões customizadas.
5. Recarregar o pyRevit (**Reload**) para o Routes subir.

> **Host:** use sempre `127.0.0.1`, nunca `localhost`. Em algumas máquinas
> `localhost` resolve para IPv6 (`::1`) e o Routes só escuta em IPv4, o que gera
> timeout/conexão recusada.

## Passo 2 — Configurar o MCP no Claude Code

Copie o template [`../.mcp.json.example`](../.mcp.json.example) para `.mcp.json`
(na raiz do projeto ou na config global do Claude Code) e ajuste o **caminho
absoluto** de `main.py`:

```json
{
  "mcpServers": {
    "revit": {
      "command": "uv",
      "args": ["run", "--with", "mcp[cli]", "mcp", "run", "/caminho/absoluto/revit-mcp-python/main.py"]
    }
  }
}
```

Alternativa por CLI:

```bash
claude mcp add revit -- uv run --with "mcp[cli]" mcp run /caminho/absoluto/revit-mcp-python/main.py
```

### Se o `uv` falhar

Se `uv` não conseguir instalar os pacotes (ambiente sem permissão ou sem rede),
**não insista**. Use o Python do sistema com o `mcp[cli]` já instalado e aponte
o comando direto para o interpretador:

```bash
pip install "mcp[cli]"        # uma vez, no Python do sistema
```

```json
{
  "mcpServers": {
    "revit": {
      "command": "python",
      "args": ["/caminho/absoluto/revit-mcp-python/main.py"]
    }
  }
}
```

Ajuste `python` para o executável correto (`python3`, ou o caminho completo do
interpretador que tem o `mcp[cli]`).

## Passo 3 — Ordem de inicialização (obrigatória)

1. **Abrir o Revit primeiro**, com o modelo desejado já carregado.
2. Só então **abrir/reiniciar o Claude Code**.
3. Se falhar: feche tudo e repita nessa ordem (Revit → modelo → Claude Code).

O MCP server sobe sob demanda quando o Claude Code inicia; se o Revit/Routes não
estiver de pé antes, a primeira chamada de tool falha.

## Passo 4 — Verificar a conexão

Peça ao Claude uma chamada trivial via `execute_revit_code`, por exemplo obter o
título do documento ativo:

```python
doc = __revit__.ActiveUIDocument.Document
OUT = doc.Title
```

Se voltar o nome do modelo, a ponte está funcionando.

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Conexão recusada | Revit fechado, ou aberto depois do Claude Code | Fechar tudo, abrir Revit → modelo → Claude Code |
| Timeout no host | `localhost` no lugar de `127.0.0.1` | Corrigir no `.mcp.json` e no config do Routes |
| `uv` falha ao instalar Python | Ambiente sem permissão / rede | Usar o Python do sistema (ver acima) e ajustar o path |
| Comando não reflete no Revit | Modelo errado ativo, ou sessão desconectada | Reconferir view/documento ativo antes de rodar |
| Tool não aparece no Claude Code | `.mcp.json` não carregado / path de `main.py` errado | Conferir caminho absoluto e reiniciar o Claude Code |

## Limitações conhecidas

- Sem tools pré-prontas: tudo passa por `execute_revit_code`, então é **mais
  lento** que MCPs com tools fixas (ex.: o MCP oficial da Autodesk).
- Tarefas com múltiplas caixas de diálogo / UI interativa podem falhar ou exigir
  ajuste manual dentro do Revit.
- Geometria complexa: sempre revisar o resultado manualmente no Revit.

## Fontes

- [revit-mcp-python (GitHub)](https://github.com/revit-mcp/revit-mcp-python)
- [pyRevit + MCP + Claude Code — tutorial (BIMpure)](https://www.bimpure.com/blog/pyrevit-mcp-claude-code-tutorial)
