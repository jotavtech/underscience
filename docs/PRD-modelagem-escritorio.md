# PRD — Modelagem de escritório completo no Revit (nível interiores)

> Documento de requisitos endereçado ao **Claude Code** operando o Revit via
> **pyRevit MCP** (`execute_revit_code`). Objetivo: modelar um **escritório
> completo**, no **nível de detalhamento de interiores**, a partir do **texto
> que o usuário digitar** e das **imagens de referência** que ele enviar.
> Regras gerais de operação: [`../CLAUDE.md`](../CLAUDE.md). Conexão e agente:
> [`PRD-pyrevit-mcp.md`](PRD-pyrevit-mcp.md).

## 1. Objetivo

Entregar, dentro de um modelo Revit, um escritório interior completo e coerente
com as referências fornecidas: envelope arquitetônico, divisórias, aberturas,
mobiliário, marcenaria, acabamentos, forro, iluminação e detalhes — pronto para
gerar plantas, cortes e vistas 3D de interiores.

## 2. Entradas (o que o usuário fornece)

1. **Texto** — descrição do programa (ex.: "recepção, 2 salas de reunião, 12
   estações de trabalho, copa, sala da diretoria, sanitários"), estilo desejado,
   restrições e dimensões conhecidas.
2. **Imagens de referência** — plantas, fotos de ambientes, moodboards. Servem
   para: layout/disposição, estilo e materiais, tipos de mobiliário, proporções
   e clima do ambiente.

> **Regra de imagens:** imagens definem **intenção de projeto** (estilo,
> disposição, tipo de peça), **não medidas exatas**. Toda dimensão não
> informada deve ser **estimada com premissa explícita** e confirmada com o
> usuário (ver §5).

## 3. Nível de detalhe (alvo: interiores, ~LOD 300–400)

O modelo deve conter, com geometria e materiais reais:

- **Arquitetura base:** níveis, paredes com composição (camadas), lajes/pisos,
  forros (gesso/modular), vigas/pilares se relevantes.
- **Aberturas:** portas e janelas com esquadrias e ferragens compatíveis com as
  referências.
- **Divisórias de interiores:** drywall, vidro, marcenaria, painéis acústicos.
- **Mobiliário:** estações de trabalho, cadeiras, mesas de reunião, sofás,
  recepção, armários, estantes.
- **Marcenaria sob medida:** bancadas, balcão de recepção, copa, nichos.
- **Acabamentos:** revestimentos de piso, parede e teto; rodapés; pintura;
  materiais aplicados com aparência (cor/textura) coerente às referências.
- **Iluminação:** luminárias (embutidas, pendentes, spots) posicionadas.
- **Louças e metais** nos sanitários/copa; **eletros** na copa.
- **Complementos:** cortinas/persianas, plantas, sinalização, quando pedidos.

## 4. Organização do modelo (padrões Revit)

- **Unidades:** métrico, milímetros (confirmar no início).
- **Níveis:** criar/usar os níveis do pavimento (piso acabado, forro, laje).
- **Grids/eixos:** criar se houver estrutura relevante.
- **Nomenclatura:** ambientes com **Rooms** nomeados; views organizadas por
  disciplina/fase.
- **Materiais:** criar/usar materiais nomeados (ex.: "Piso - Porcelanato
  Cinza", "Parede - Pintura Branca"), com aparência aproximada da referência.
- **Famílias:** preferir **famílias carregáveis** (loadable) do projeto/bibliteca
  para mobiliário e louças; usar geometria in-place só quando não houver família
  adequada (ver §7).

## 5. Fluxo de trabalho (obrigatório)

1. **Interpretar entradas.** Resumir, em texto, o que foi entendido das imagens
   e do briefing: programa de ambientes, estilo, materiais, peças-chave.
2. **Levantar lacunas.** Listar o que falta para modelar (dimensões da laje,
   pé-direito, medidas de salas, quantidade de estações). **Perguntar** ou
   propor **premissas explícitas** com valores default sensatos.
3. **Plano de modelagem por fases** (§6). Apresentar e **pedir confirmação**
   antes de executar.
4. **Executar fase a fase**, cada fase em uma `Transaction` nomeada. Ao fim de
   cada fase: resumir o que foi criado (contagens), warnings e o que precisa de
   revisão manual.
5. **Checkpoint com o usuário** entre fases grandes — não modelar o escritório
   inteiro de uma vez sem validação intermediária.
6. **Nunca** deletar/sobrescrever elementos existentes sem confirmação explícita.
   Preferir modelo de teste/cópia antes do modelo real.

## 6. Fases de modelagem (ordem sugerida)

1. **Setup:** unidades, níveis, pé-direito, contorno da laje/piso base.
2. **Envelope:** paredes externas com composição, laje, forro geral.
3. **Compartimentação:** divisórias internas conforme o layout das referências.
4. **Aberturas:** portas e janelas (vãos, esquadrias).
5. **Rooms e acabamentos:** criar Rooms nomeados; aplicar pisos, revestimentos
   de parede, forro por ambiente, rodapés, pintura/materiais.
6. **Mobiliário e marcenaria:** inserir/compor as peças por ambiente.
7. **Iluminação e instalações aparentes:** luminárias, louças, metais, eletros.
8. **Detalhes e refino:** cortinas, plantas, sinalização, ajustes finos.
9. **Entregáveis:** views de planta, cortes e 3D de interiores para conferência.

## 7. Como usar o motor (`execute_revit_code`) neste projeto

- Todo código roda em **IronPython dentro do Revit**, com `Transaction` nomeada
  e padrão `__revit__.ActiveUIDocument.Document`.
- **Geometria paramétrica complexa** (mobiliário detalhado, esquadrias
  elaboradas) sai melhor de **famílias carregáveis** do que gerada por código
  in-place. Quando a peça for complexa: **avisar** e (a) usar uma família
  existente, (b) pedir ao usuário uma família `.rfa`, ou (c) modelar uma versão
  simplificada e sinalizar para refino manual.
- Operações com **múltiplas caixas de diálogo/UI** podem falhar pelo MCP — nesse
  caso, avisar e indicar o passo manual no Revit.
- Sempre reportar contagem de elementos e o que ficou pendente de revisão.

## 8. Regras de segurança e qualidade

- Confirmar unidades, níveis e pé-direito **antes** de qualquer geometria.
- Cada fase em `Transaction` nomeada e reversível (Undo).
- Sinalizar inconsistências (medidas incompatíveis com as imagens, áreas fora de
  proporção, colisões óbvias) **antes** de prosseguir.
- Não inventar medidas críticas silenciosamente — premissa sempre explícita.
- Preferir modelo de teste antes de aplicar em modelo de produção.

## 9. Critérios de aceitação (definição de "pronto")

Por fase:
- [ ] Entradas (texto + imagens) interpretadas e resumidas ao usuário.
- [ ] Lacunas de dimensão levantadas; premissas explícitas confirmadas.
- [ ] Plano de fases aprovado antes da execução.
- [ ] Cada fase executada em `Transaction` nomeada, com resumo (criados /
      warnings / revisão manual).
- [ ] Ambientes como **Rooms** nomeados; materiais nomeados aplicados.
- [ ] Mobiliário/marcenaria coerentes com as referências, no nível de interiores.
- [ ] Views (planta, corte, 3D) geradas para conferência.
- [ ] Itens complexos sinalizados para refino manual em família.

Do escritório completo:
- [ ] Programa de ambientes do briefing atendido.
- [ ] Estilo e materiais coerentes com as imagens de referência.
- [ ] Modelo navegável e consistente (sem sobreposições grosseiras).

## 10. Fora de escopo (salvo pedido explícito)

- Documentação executiva completa (pranchas cotadas, tabelas de quantitativos).
- Dimensionamento estrutural, MEP detalhado, análises energéticas.
- Renderização fotorrealista final (o alvo é o modelo, não o render).

## 11. Formato de resposta esperado

- Direto, um passo/fase de cada vez.
- Sempre resumir efeito no modelo (criados / warnings / revisão manual).
- Diante de geometria complexa ou UI interativa, avisar que o resultado pode
  precisar de ajuste manual no Revit.
