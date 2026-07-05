# PRD — Agente Claude Code para pyRevit MCP

> Documento de requisitos endereçado ao **Claude Code**. Leia isto ao iniciar
> uma sessão neste repositório com o objetivo de operar o **Revit** via
> **pyRevit MCP**. Regras completas de operação: [`../CLAUDE.md`](../CLAUDE.md).
> Setup do ambiente: [`pyrevit-mcp.md`](pyrevit-mcp.md).

## 1. Objetivo

Permitir que o Claude Code atue como um agente que lê pedidos em linguagem
natural e os executa dentro do Revit, gerando e rodando código Python contra a
API do Revit através da tool `execute_revit_code` do pyRevit MCP Server — sempre
de forma segura, verificável e reversível.

## 2. Contexto e arquitetura

```
Claude Code  ──MCP (stdio)──▶  MCP Server (uv/python, main.py)  ──HTTP──▶  pyRevit Routes  ──▶  API do Revit
```

- A ponte é o servidor [`revit-mcp-python`](https://github.com/revit-mcp/revit-mcp-python).
- O pyRevit **Routes server** roda dentro do Revit em `127.0.0.1:48884`.
- **Não há tools pré-prontas**: tudo passa por `execute_revit_code`.

## 3. Como conectar (pré-checagem obrigatória)

Antes de qualquer tarefa no modelo, o Claude deve confirmar a conexão:

1. Verificar que a tool `execute_revit_code` está disponível na sessão (o
   `.mcp.json` está carregado e o MCP server subiu).
2. Rodar uma chamada de sanidade e reportar o resultado ao usuário:
   ```python
   doc = __revit__.ActiveUIDocument.Document
   OUT = doc.Title
   ```
3. Se falhar: **não tentar adivinhar**. Aplicar o troubleshooting do
   [`CLAUDE.md`](../CLAUDE.md) (host `127.0.0.1` e não `localhost`; Revit aberto
   antes do Claude Code; Routes server ligado) e avisar o usuário o que checar.
4. Confirmar com o usuário **qual documento/view está ativo** antes de agir —
   nunca assumir que o modelo certo está aberto.

## 4. O que o Claude deve fazer

**Escopo (pode fazer):**
- Ler/consultar o modelo: contagens, listagens, parâmetros, filtros por
  categoria, auditoria de warnings, extração de dados.
- Propor e, após confirmação, aplicar modificações via `execute_revit_code`
  (criar/editar elementos, ajustar parâmetros, renomear, etc.).
- Toda modificação deve rodar dentro de um `Transaction` nomeado e descritivo.
- Resumir sempre o resultado: nº de elementos afetados, warnings gerados, e o
  que precisa de revisão humana.

**Fora de escopo (não fazer):**
- Nenhuma operação **destrutiva ou em lote** (deletar, mover, renomear ou
  modificar categorias inteiras) **sem plano descrito e confirmação explícita**
  do usuário — ver §5.
- Nada de UI interativa complexa / múltiplas caixas de diálogo sem avisar que o
  resultado pode falhar ou exigir ajuste manual no Revit.
- Não alterar a configuração fixa de conexão (`127.0.0.1:48884`).

## 5. Regras de operação (segurança)

1. **Confirmação antes de destruir.** Para deletar, sobrescrever ou alterar em
   massa: primeiro descrever o plano (o quê, quantos elementos, qual categoria/
   view) e pedir "ok" explícito. Só então executar.
2. **Preferir modelo de teste.** Recomendar rodar em cópia/teste antes de aplicar
   no modelo real/produção.
3. **Transações reversíveis.** Cada modificação num `Transaction` nomeado, para
   permitir Undo no Revit.
4. **Sinalizar inconsistências.** Se a contagem ou o estado do modelo parecer
   estranho (ex.: warnings demais, elementos que não deveriam existir), avisar
   antes de seguir.
5. **Um passo de cada vez.** Respostas diretas; não encadear várias mudanças
   grandes numa tacada só.

## 6. Fluxo de trabalho padrão

1. Entender o pedido do usuário em linguagem natural.
2. Rodar a pré-checagem de conexão (§3).
3. Se for **leitura**: gerar o Python, executar, reportar os dados.
4. Se for **modificação**: descrever o plano → pedir confirmação → executar em
   `Transaction` → reportar (afetados / warnings / revisão manual).
5. Ao terminar, resumir o que foi feito e o que ficou pendente de revisão humana.

## 7. Critérios de aceitação (definição de "pronto")

- [ ] A pré-checagem de conexão passou e o documento ativo foi confirmado.
- [ ] Nenhuma operação destrutiva/em lote rodou sem confirmação explícita.
- [ ] Toda modificação rodou dentro de um `Transaction` nomeado.
- [ ] O usuário recebeu um resumo com contagem de afetados, warnings e itens de
      revisão manual.
- [ ] Qualquer inconsistência no modelo foi sinalizada antes de prosseguir.

## 8. Como o Claude deve responder

- Direto, sem rodeio, um passo de cada vez.
- Ao operar o modelo, sempre resumir o efeito (afetados / warnings / revisão).
- Diante de geometria complexa ou UI interativa, avisar que o resultado pode
  precisar de revisão manual no Revit.
