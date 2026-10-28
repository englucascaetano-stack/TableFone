# Dicionário do Scrabble

`dict.js` é gerado por `tools/scrabble-dict.py` a partir do dicionário ortográfico **VERO (Hunspell pt_BR)**,
de Raimundo Santos Moura, publicado em <https://github.com/LibreOffice/dictionaries/tree/master/pt_BR>
(licenças LGPLv3 e MPL; ver o cabeçalho do `pt_BR.aff`). O arquivo gerado é um derivado desse dicionário e mantém as mesmas licenças.

Como foi gerado: expansão dos afixos (plurais, femininos, conjugações), descarte de nomes próprios, siglas, palavras com hífen
e sem vogais, remoção de acentos (o Ç é mantido) e de palavras com menos de 2 ou mais de 15 letras; 2.198.877 formas, gravadas como
DAWG em base64 (cerca de 2,2 MB).

Limitações conhecidas:
- É uma lista **generosa**: o VERO gera algumas formas que não estão em listas oficiais de Scrabble (por exemplo formas raras de
  verbos) e pode aceitar palavras que a lista oficial não aceita. Não deve recusar palavras comuns.
- Não há K, W e Y: o jogo não tem essas peças, então palavras com essas letras ficam de fora.

Para gerar de novo:

    mkdir /tmp/vero && cd /tmp/vero
    curl -LO https://raw.githubusercontent.com/LibreOffice/dictionaries/master/pt_BR/pt_BR.aff
    curl -LO https://raw.githubusercontent.com/LibreOffice/dictionaries/master/pt_BR/pt_BR.dic
    cd - && python3 tools/scrabble-dict.py /tmp/vero games/scrabble/dict.js && node scripts/build-edge.js
