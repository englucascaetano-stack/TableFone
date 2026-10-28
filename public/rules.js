'use strict';
// Regras resumidas de cada jogo, mostradas no botao "Regras" (canto superior direito da sala).
// Resumo do que esta implementado aqui; em caso de duvida, vale o texto de cada jogo no lobby.
window.GameRules = {
  truco: {
    goal: 'Ganhar 12 pontos. 2 jogadores ou 4 em duplas (assentos 1 e 3 contra 2 e 4).',
    items: [
      'Baralho de 40 cartas (sem 8, 9 e 10). Ordem, da menor para a maior: 4 5 6 7 Q J K A 2 3.',
      'A carta virada (vira) define a manilha: o valor seguinte. Manilhas, da maior para a menor: paus (zap), copas, espadas, ouros.',
      'Cada mão tem até 3 rodadas; quem vence 2 leva a mão (vale 1 ponto).',
      'Truco (3), seis (6), nove (9) e doze (12): quem recebe aceita, corre (o pedinte leva o valor anterior) ou aumenta. Quem pediu não pode pedir de novo em seguida.',
      'Mão de onze: a equipe com 11 pontos vê a mão e decide jogar (vale 3) ou correr. Mão de ferro (11 x 11): vale 1, sem truco.',
    ],
  },
  buraco: {
    goal: 'A dupla que somar 3000 pontos primeiro. 2 jogadores ou 4 em duplas.',
    items: [
      'Cada jogador recebe 11 cartas e há 2 "mortos" de 11 cartas. Baralho duplo com coringas.',
      'No turno: compre do monte ou pegue todo o descarte; baixe jogos; descarte uma carta.',
      'Jogos são só sequências do mesmo naipe, com 3 ou mais cartas (o A pode ser baixo ou alto). Coringas: o 2 e o JK, no máximo 1 por jogo.',
      'Canastra: jogo com 7 ou mais cartas. Limpa vale 200, suja 100, real (A a K) 500.',
      'Ao ficar sem cartas, a dupla pega o morto. Sem morto, só pode bater quem tem canastra. Quem bate ganha 100; quem não pegou o morto perde 100.',
    ],
  },
  caxeta: {
    goal: 'Ser o primeiro a bater: organizar as 9 cartas em jogos de 3 ou mais. 2 a 6 jogadores.',
    items: [
      'Cada jogador recebe 9 cartas (2 baralhos e 4 coringas).',
      'No turno: compre do monte ou pegue o topo do descarte e depois descarte 1 carta.',
      'Jogo: sequência do mesmo naipe (A baixo ou alto) ou trinca/quadra de mesmo valor e naipes diferentes. O coringa vale qualquer carta, no máximo 1 por jogo.',
      'Bate quem, depois de comprar, descarta 1 carta e consegue usar todas as 9 restantes em jogos.',
    ],
  },
  uno: {
    goal: 'Zerar a mão e somar 500 pontos no total. 2 a 8 jogadores.',
    items: [
      'Jogue carta da mesma cor ou do mesmo número/símbolo da carta do topo. Sem jogada, compre 1; se servir, pode jogá-la.',
      'Não acumula +2 nem +4. Com 2 jogadores, Inverte vale como Pula.',
      'Coringa +4: o próximo pode desafiar. Desafio certo: quem jogou compra 4. Desafio errado: o desafiante compra 6. Sem desafio: compra 4.',
      'Coringa Trocar as Mãos: escolha a cor e um jogador; vocês trocam todas as cartas (não pode ser a última carta).',
      'UNO: automático por padrão; no modo manual, toque em UNO! ao ficar com 1 carta, ou outro jogador pode "Pegar" você (compra 2).',
      'Quem zera a mão soma as cartas dos outros: números valem o número; +2, Inverte e Pula valem 20; coringas valem 50.',
    ],
  },
  bang: {
    goal: 'Cada papel tem um objetivo (secreto, menos o Xerife). 4 a 7 jogadores.',
    items: [
      'Xerife e Delegados eliminam os Fora-da-lei e o Renegado. Fora-da-lei vencem se o Xerife morrer. O Renegado quer ser o último vivo.',
      'No início cada um recebe 2 personagens diferentes e escolhe 1.',
      'No turno: compre 2 cartas, jogue as que quiser (só 1 BANG! por turno) e descarte até ficar com tantas cartas quanto vidas.',
      'Distância e alcance contam: o BANG! alcança 1; armas, Mira e Mustang mudam isso. Cartas azuis ficam na mesa.',
      'Quem leva um tiro pode responder com Errou!. Com Barril, você escolhe se tenta usá-lo (sorteio de copas).',
      'Quem elimina um Fora-da-lei compra 3 cartas. O Xerife que elimina um Delegado descarta todas as suas cartas.',
    ],
  },
  coup: {
    goal: 'Ser o último jogador com influência. 2 a 6 jogadores.',
    items: [
      'Cada um tem 2 cartas viradas para baixo (sua influência) e 2 moedas.',
      'No turno, escolha uma ação: Renda (+1), Ajuda externa (+2, pode ser bloqueada por Duque), Golpe (paga 7; alvo perde 1 influência; obrigatório com 10+ moedas).',
      'Ações de personagem (podem ser blefe): Taxar/Duque (+3), Assassinar/Assassino (paga 3), Extorquir/Capitão (rouba 2), Trocar/Embaixador.',
      'Qualquer jogador pode desafiar um personagem declarado. Quem erra o desafio (ou é pego blefando) perde 1 influência.',
      'Assassinato é bloqueado pela Condessa; extorsão pelo Capitão ou Embaixador. Bloqueios também podem ser desafiados.',
    ],
  },
  codenames: {
    goal: 'Encontrar todos os seus agentes antes da outra equipe. 4 a 8 jogadores em duas equipes.',
    items: [
      'Vermelha (assentos pares) contra Azul (ímpares). O assento 1 é o espião Vermelho e o 2 é o espião Azul; os demais são agentes.',
      'Tabuleiro 5x5 de palavras: 9 agentes para quem começa, 8 para a outra equipe, 7 inocentes e 1 assassino.',
      'O espião dá uma pista de uma palavra e um número; os agentes tocam nas palavras que acham ser da sua cor (até número + 1 palpites).',
      'Palavra inocente ou da outra equipe encerra a vez. Se tocar no assassino, a equipe perde na hora.',
      'A pista não pode ser uma palavra do tabuleiro ainda não revelada.',
    ],
  },
  damas: {
    goal: 'Capturar ou bloquear todas as peças do adversário. 2 jogadores.',
    items: [
      'Dama brasileira 8x8. As brancas começam. Peças andam na diagonal, só em casas escuras.',
      'A peça simples anda para a frente e captura para a frente e para trás.',
      'A captura é obrigatória e vale a lei da maioria: é preciso escolher a sequência que captura mais peças.',
      'Ao chegar à última linha, vira dama (voadora): anda e captura qualquer distância na diagonal.',
      'Empate após 20 lances de cada lado só com damas e sem captura.',
    ],
  },
  azul: {
    goal: 'Ter mais pontos ao fim da partida (quando alguém completa uma linha da parede). 2 a 4 jogadores.',
    items: [
      'No turno, pegue TODOS os azulejos de uma cor de uma fábrica (os demais vão ao centro) ou do centro.',
      'Coloque-os em UMA linha de padrão vazia ou da mesma cor, cuja linha da parede ainda não tenha essa cor. O que sobrar cai no chão (pontos negativos).',
      'Quem pega do centro primeiro leva o marcador de primeiro jogador (vai para o chão) e abre a próxima rodada.',
      'No fim da rodada, cada linha cheia leva 1 azulejo à parede e pontua pelas sequências vizinhas.',
      'Bônus finais: +2 por linha completa, +7 por coluna completa, +10 por cor completa.',
    ],
  },
  catan: {
    goal: 'Chegar a 10 pontos no próprio turno. 3 a 4 jogadores.',
    items: [
      'Preparação: cada jogador põe colônia + estrada, depois (na ordem inversa) a segunda; ela rende 1 recurso de cada hexágono vizinho.',
      'No turno: role os dados; cada hexágono com esse número produz 1 recurso por colônia e 2 por cidade. Depois comercie, construa e encerre.',
      'Com 7: quem tem mais de 7 cartas descarta metade; mova o ladrão e roube 1 carta de quem tem construção ali.',
      'Custos: estrada = argila + madeira; colônia = argila + madeira + lã + grãos; cidade = 2 grãos + 3 minério; carta de desenvolvimento = lã + grãos + minério.',
      'Colônias ficam a pelo menos 2 arestas de qualquer outra e ligadas a uma estrada sua. Troca com o banco: 4:1, ou 3:1 / 2:1 com portos.',
      'Maior estrada (5 ou mais) e maior exército (3 ou mais cavaleiros) valem 2 pontos cada.',
    ],
  },
  scrabble: {
    goal: 'Somar mais pontos formando palavras no tabuleiro 15x15. 2 a 4 jogadores.',
    items: [
      'Cada jogador tem 7 peças. A primeira palavra passa pela casa central (★); depois toda jogada se liga às palavras postas.',
      'Coloque as peças numa só linha ou coluna. Todas as palavras formadas, inclusive as cruzadas, precisam existir no dicionário. Acentos são ignorados; o Ç é uma peça.',
      'PD/PT dobram/triplicam a palavra; LD/LT dobram/triplicam a letra, só para peças postas na jogada. O coringa vale 0.',
      'Usar as 7 peças de uma vez dá +50. Você pode passar ou trocar peças (com 7 ou mais no saco).',
      'Fim: o saco esvazia e alguém fica sem peças, ou 6 jogadas seguidas sem pontuar. Peças restantes descontam pontos.',
    ],
  },
  war: {
    goal: 'Cumprir o seu objetivo secreto. 3 a 6 jogadores.',
    items: [
      'Os territórios são distribuídos ao acaso; cada jogador reparte 5 exércitos e, numa segunda volta, mais 3.',
      'Turno: 1) reforços (metade dos territórios, mínimo 3, + bônus de continente + troca de cartas); 2) ataques; 3) remanejar (opcional, encerra o turno).',
      'Ataque: de um território com 2 ou mais exércitos contra um vizinho inimigo, até 3 dados contra até 3 de defesa. Maiores contra maiores; empate favorece a defesa.',
      'Quem conquistou ao menos um território no turno compra uma carta. Troca: 3 do mesmo símbolo ou 1 de cada vale 4, 6, 8, 10, 12, 15 e depois +5. Com 5 cartas a troca é obrigatória.',
    ],
  },
  war2: {
    goal: 'Cumprir o seu objetivo secreto. 3 a 6 jogadores.',
    items: [
      'Como o War, mas com 12 Centros Estratégicos (CE): cada CE rende 1 exército e 1 bombardeiro por turno.',
      'Preparação: os CEs são sorteados e os jogadores ocupam, um por vez, os territórios vagos. Na primeira rodada todos reforçam e só depois atacam.',
      'Reforços: metade dos territórios + bônus de continente (total ou maioria) + 1 por CE; mínimo 3.',
      'Bombardeiros atacam do ar, da base aérea ou da caixa de peças (com cartas). Cartas de território e numeradas servem para exércitos, bombardeiros ou transporte.',
      'Deslocamento no fim do turno, inclusive aerotransporte entre CEs. Quem conquistou um território compra 3 cartas (máximo 5 na mão).',
    ],
  },
  paciencia: {
    goal: 'Levar todas as cartas para as 4 fundações, por naipe, de A a K. Jogo solo.',
    items: [
      'Sete colunas: monte cartas em ordem decrescente, alternando cor (vermelha/preta).',
      'Só o Rei (ou uma sequência começando por Rei) pode ocupar uma coluna vazia.',
      'Toque no monte para comprar (1 ou 3 cartas, escolha antes da primeira jogada). Quando acabar, o descarte volta ao monte.',
      'Dá para desfazer jogadas.',
    ],
  },
};

// Simbolos dos jogos (biblioteca): SVG simples 24x24, traco na cor do texto.
const _svg = (inner) => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
window.GameIcons = {
  truco: _svg('<rect x="4" y="5" width="10" height="14" rx="2" transform="rotate(-12 9 12)"/><rect x="10" y="5" width="10" height="14" rx="2" transform="rotate(10 15 12)"/>'),
  buraco: _svg('<rect x="3" y="6" width="9" height="13" rx="2"/><rect x="8" y="4" width="9" height="13" rx="2"/><rect x="13" y="7" width="8" height="12" rx="2"/>'),
  caxeta: _svg('<rect x="3" y="5" width="8" height="13" rx="2"/><rect x="9" y="5" width="8" height="13" rx="2" transform="rotate(8 13 11)"/><path d="M19 8v8"/>'),
  uno: _svg('<rect x="5" y="3" width="14" height="18" rx="3"/><ellipse cx="12" cy="12" rx="3.5" ry="6.5" transform="rotate(35 12 12)"/>'),
  bang: _svg('<path d="M12 3l2.4 5 5.4.7-4 3.7 1 5.4L12 15l-4.8 2.8 1-5.4-4-3.7 5.4-.7z"/>'),
  coup: _svg('<path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z"/><path d="M4 21h16"/>'),
  codenames: _svg('<rect x="4" y="4" width="4.5" height="4.5"/><rect x="9.8" y="4" width="4.5" height="4.5"/><rect x="15.5" y="4" width="4.5" height="4.5"/><rect x="4" y="9.8" width="4.5" height="4.5"/><rect x="9.8" y="9.8" width="4.5" height="4.5"/><rect x="15.5" y="9.8" width="4.5" height="4.5"/><rect x="4" y="15.5" width="4.5" height="4.5"/><rect x="9.8" y="15.5" width="4.5" height="4.5"/><rect x="15.5" y="15.5" width="4.5" height="4.5"/>'),
  damas: _svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2.2"/>'),
  azul: _svg('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><path d="M13 13l7 7M20 13l-7 7"/>'),
  catan: _svg('<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="3"/>'),
  scrabble: _svg('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8.5 17l3.5-10 3.5 10M9.7 13.6h4.6"/>'),
  war: _svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/>'),
  war2: _svg('<circle cx="11" cy="13" r="7.5"/><path d="M3.5 13h15M11 5.5c2.7 2.8 2.7 12.2 0 15M11 5.5c-2.7 2.8-2.7 12.2 0 15M16 4l5 2-5 2z"/>'),
  paciencia: _svg('<rect x="4" y="4" width="7" height="10" rx="1.5"/><rect x="13" y="4" width="7" height="10" rx="1.5"/><rect x="4" y="16" width="7" height="4" rx="1"/><rect x="13" y="16" width="7" height="4" rx="1"/>'),
};
