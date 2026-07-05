# CLAUDE.md — Integração pyRevit MCP

Este arquivo define como o Claude Code deve operar ao trabalhar com o **Revit**
via **pyRevit MCP Server** neste repositório. Leia antes de rodar qualquer
tarefa contra um modelo do Revit.

> Nota: `underscience` em si é um laboratório de arte generativa (site estático,
> ver `README.md`). Estas regras existem porque este repositório também guarda a
> configuração e as regras de operação da integração pyRevit MCP. Ao mexer no
> site, ignore esta seção; ao operar o Revit, siga-a à risca.

## O que é a integração

O pyRevit MCP Server conecta o Claude Code ao Revit via Model Context Protocol.
O servidor MCP (`uv`) faz a ponte para o **pyRevit Routes server**, que roda
_dentro_ do Revit e executa a API do Revit em tempo real. A tool exposta é
`execute_revit_code`: gera e roda código Python contra a API do Revit na hora.

Setup completo, instalação e troubleshooting: **`docs/pyrevit-mcp.md`**.
Config de exemplo do MCP: **`.mcp.json.example`**.

## Configuração de conexão (fixa — não alterar)

- Host: `127.0.0.1` — **NÃO** usar `localhost` (causa falha/timeout de conexão)
- Porta: `48884`
- Servidor: **pyRevit Routes server**, instalado via Extensions do pyRevit

## Ordem de inicialização obrigatória

1. Abrir o Revit primeiro, com o modelo desejado já carregado.
2. Só então abrir/reiniciar o Claude Code.
3. Se a conexão falhar: fechar tudo e repetir na mesma ordem (Revit → modelo →
   Claude Code).

## Regras de execução

- **Nunca** rodar tarefas destrutivas em projeto ativo/produção sem confirmação
  explícita. Sempre perguntar antes de deletar, sobrescrever ou modificar
  elementos em massa.
- Antes de qualquer modificação em lote (deletar, mover, renomear categorias
  inteiras), descrever o plano e pedir confirmação.
- Preferir testar em modelo de cópia/teste antes de aplicar no modelo real.
- Se o `uv` falhar ao instalar pacotes Python, não insistir: usar o Python do
  sistema e ajustar a configuração do MCP (ver `docs/pyrevit-mcp.md`).

## Sobre o motor de execução

- Este MCP **não tem tools pré-prontas** (diferente do MCP oficial da Autodesk).
  Ele gera código Python via `execute_revit_code` e roda contra a API do Revit.
- Consequência: mais lento que MCPs com tools fixas; tarefas com múltiplas
  caixas de diálogo/UI podem falhar ou exigir ajuste manual.
- Sempre que a operação envolver geometria complexa ou UI interativa, avisar que
  o resultado pode precisar de revisão manual no Revit.

## Formato de resposta esperado

- Respostas diretas, sem rodeio, um passo de cada vez.
- Ao rodar uma tarefa no modelo, resumir o que foi feito: contagem de elementos
  afetados, avisos gerados, e o que precisa de revisão humana.
- Se algo no modelo parecer inconsistente com o pedido (ex.: contagem estranha
  de warnings, elementos que não deveriam existir), avisar antes de seguir.

## Troubleshooting rápido

| Sintoma | Causa provável | Ação |
|---|---|---|
| Conexão recusada | Revit fechado, ou aberto depois do Claude Code | Fechar tudo, abrir Revit → modelo → Claude Code |
| Timeout no host | `localhost` no lugar de `127.0.0.1` | Corrigir no config do MCP |
| `uv` falha ao instalar Python | Ambiente sem permissão / rede | Usar Python do sistema e ajustar o path no config do MCP |
| Comando não reflete no Revit | Modelo errado ativo, ou sessão desconectada | Reconferir view/documento ativo antes de rodar |
