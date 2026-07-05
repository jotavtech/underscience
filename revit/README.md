# UnderScience Tools — extensão pyRevit

Extensão pyRevit do laboratório. Hoje traz **um** botão:

## Cotar Paredes

Cria uma **cota de comprimento** para cada parede reta, usando o **tipo de cota
(família) que você escolher** numa lista.

### O que ele faz

1. Usa as **paredes selecionadas**. Se nada estiver selecionado, usa **todas as
   paredes do view ativo**.
2. Abre uma lista com os **tipos de cota linear** do projeto — você escolhe qual
   usar.
3. Para cada parede reta, encontra as duas faces de topo (os extremos) e cria
   uma cota paralela à parede, deslocada 600 mm, aplicando o tipo escolhido.
4. Tudo roda dentro de uma `Transaction` nomeada (**Cotar paredes
   automaticamente**) — dá pra desfazer com Ctrl+Z.
5. Ao final, mostra um resumo: cotas criadas, paredes curvas ignoradas e paredes
   sem faces de topo detectadas (para cotar manualmente).

### Onde funciona

Views de planta, corte, elevação e detalhe. Em 3D ou vistas sem esse tipo de
geometria ele avisa e sai.

### Limitações (revisão manual pode ser necessária)

- **Paredes curvas** são ignoradas (só paredes retas).
- Paredes **unidas/mitradas** nos cantos podem não ter as faces de topo
  detectadas — essas são contadas como "cotar manual".
- A posição da linha de cota é um offset fixo (600 mm); ajuste no Revit se
  encostar em outros elementos.
- Geometria complexa pode exigir ajuste manual — sempre revise o resultado.

## Instalação

1. Copie a pasta `UnderScienceTools.extension` para o caminho de extensões do
   pyRevit, por exemplo:
   ```
   C:\Users\<voce>\AppData\Roaming\pyRevit\Extensions\
   ```
   Ou adicione a pasta pai como *custom extension directory* em
   **pyRevit → Settings → Custom Extension Directories**.
2. No Revit: **pyRevit → Reload**.
3. Uma aba **UnderScience** aparece na ribbon, com o painel **Cotas** e o botão
   **Cotar Paredes**.

## Uso

1. Abra uma planta (ou corte/elevação).
2. (Opcional) selecione as paredes que quer cotar.
3. Clique em **UnderScience → Cotas → Cotar Paredes**.
4. Escolha o tipo de cota na lista e confirme.
5. Confira o resumo e revise as cotas no modelo.

## Estrutura

```
UnderScienceTools.extension/
  extension.yaml
  UnderScience.tab/
    Cotas.panel/
      CotarParedes.pushbutton/
        bundle.yaml
        script.py        # IronPython (roda dentro do Revit via pyRevit)
```
