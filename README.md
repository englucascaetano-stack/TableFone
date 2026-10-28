# Mesa de Jogos

Plataforma privada de jogos de tabuleiro para celular. Roda no navegador (Android e iPhone),
sem instalar nada nos aparelhos dos jogadores. Um aparelho (ou computador) roda o servidor;
os outros abrem o endereço dele.

Jogos na biblioteca:

| Jogo | Jogadores | Observações |
|---|---|---|
| Dama | 2 | Brasileira 8x8, captura obrigatória e dama voadora |
| Paciência | 1 (outros assistem) | Klondike, compra de 1 ou 3, desfazer |
| Uno | 2 a 8 | Sem acumular +2/+4; +4 com desafio; Coringa Trocar as Mãos; jogo até 500 pontos; UNO automático ou manual |
| Truco | 2 ou 4 (duplas) | Paulista: manilha pela vira, truco/seis/nove/doze, mão de onze |
| Buraco | 2 ou 4 (duplas) | Só sequências, 2 baralhos + 4 coringas, canastras e 2 mortos |
| Caxeta | 2 a 6 | 9 cartas, bate quem fechar jogos de 3+ cartas |
| Coup | 2 a 6 | Blefe, desafios e bloqueios; 15 cartas de personagem |
| War | 3 a 6 | Conquista do mundo: dados, cartas, objetivos secretos; mapa de 42 territórios |
| War II | 3 a 6 | War com Centros Estratégicos, bombardeiros e cartas (regras do manual do War II; mapa lido do tabuleiro) |
| BANG! | 4 a 7 | Faroeste com papéis secretos (Xerife, Delegados, Fora-da-lei, Renegado), 16 personagens e baralho de 80 cartas; Barril sob pedido; Sid cura a qualquer momento |
| Catan | 3 a 4 | Colonizar a ilha: dados, comércio com jogadores e banco, ladrão, cartas de desenvolvimento; vence com 10 pontos |
| Scrabble | 2 a 4 | Palavras cruzadas em português (15x15, 120 peças, dicionário VERO); o servidor confere as palavras |
| Azul | 2 a 4 | Montar a parede de mosaicos escolhendo azulejos das fábricas; pontuação por sequências |
| Código Secreto | 4 a 8 | Duas equipes, espiões dão pistas de uma palavra; 332 palavras em português |

As regras de cada jogo, com as premissas adotadas, estão no começo de `games/<id>/game.js` e na tela de espera de cada jogo.

## Rodar

Requer Node.js 16 ou superior. Não há dependências para instalar.

    node server.js          # porta 3000; para outra: PORT=8080 node server.js

O terminal mostra o endereço para os demais aparelhos, por exemplo `http://192.168.43.1:3000`.

## Modo offline (sem internet)

Basta que os aparelhos estejam na mesma rede local. Não precisa haver internet.

Opção A, celular Android como servidor (sem computador):

1. Instale o Termux (pela F-Droid; a versão da Play Store está desatualizada).
2. Com internet, uma única vez: `pkg install nodejs git` e copie esta pasta para o celular.
3. Ative o hotspot (roteador portátil) do celular host. Os demais entram nessa rede Wi-Fi.
4. No Termux: `termux-wake-lock` e depois `node server.js`.
5. Os outros abrem no navegador o endereço exibido no terminal. O host usa `http://localhost:3000`.

Se o terminal não mostrar o IP (alguns Androids bloqueiam essa consulta), veja o IP do
celular host nas configurações do hotspot. Costuma ser `192.168.x.1`.

Opção B, notebook como servidor: mesmo procedimento, na rede Wi-Fi comum ou no hotspot de um celular.

iPhone participa normalmente como cliente (Safari). Só não serve como servidor.

## Com internet (nuvem: Supabase + páginas estáticas)

Arquitetura:

- **Telas**: arquivos estáticos da pasta `public/` (GitHub Pages ou outra hospedagem estática).
- **Regras e partidas**: Edge Function `mesa` no Supabase (`supabase/functions/mesa`). Valida cada jogada e exige a senha do grupo.
- **Tempo real**: o celular lê a partida pelo Supabase Realtime (tabela `rooms`, somente leitura). Os dados privados ficam em `rooms_private`, que só a função acessa.
- **Conexão**: `public/config.js`, que **não fica no repositório**. É gerado no deploy a partir das Variáveis `SUPABASE_URL` e `SUPABASE_KEY` do GitHub (modelo em `public/config.example.js`).

Publicar:

1. A senha do grupo é o segredo `ACCESS_KEY` da função: Supabase > Edge Functions > Secrets.
2. Alterou regras em `games/<id>/game.js`? Rode `node scripts/build-edge.js` e publique a função de novo
   (a cópia em `supabase/functions/mesa/games/` é gerada e não deve ser editada à mão).
3. Publicação: o workflow `.github/workflows/pages.yml` envia `public/` ao GitHub Pages a cada push na `main`. Em Settings > Pages, fonte = GitHub Actions.

Sem `config.js` preenchido, ou com `node server.js` (que o desliga), o app usa o modo local.

Limitações do plano gratuito do Supabase (a confirmar na página oficial): projetos parados cerca de 7 dias são pausados e precisam ser reativados no painel; salas sem atividade há 30 dias são apagadas.

### Servidor local (opcional)

Variáveis de ambiente do `server.js`: `ACCESS_KEY` (senha), `PORT`, `DATA_FILE` (onde as partidas são gravadas).

## Jogador ausente (piloto automático)

Se o jogo fica esperando por alguém que sumiu, qualquer outro jogador pode tocar em **Dispensar** (aparece depois de
~45 s de espera, ou se a pessoa está desconectada, com confirmação). O servidor passa a fazer jogadas simples e seguras
por ela (passar, comprar, descartar, aceitar; nunca pede truco, não bate na Caxeta, não faz blefe). A pessoa reassume
o controle ao tocar em **Voltar ao jogo**, ao jogar ou ao entrar na sala de novo.
Para um jogo suportar isso, exporte `waitingOn(state, auto)` (por quem o jogo espera) e `autoMove(state, seat)` (uma jogada segura).

## Modo tablet (mesa compartilhada)

Um tablet (ou qualquer tela grande) pode ficar no meio da mesa espelhando a partida, enquanto cada celular mostra só a
mão de quem joga. O modo só existe enquanto o tablet está conectado; sem ele, tudo funciona como antes.

1. Com a sala aberta, quem está jogando toca em **Tablet** e depois em **Ativar modo tablet**. Aparece o **código do tablet**: 6 caracteres, próprio e diferente do código da sala. Com ele o sistema identifica a "mesa" daquela sala, que não é jogador.
2. No tablet, abra o site, vá em **Modo tablet**, digite só o código do tablet (ou abra o link copiado, no formato `#CODIGO`) e toque em **Abrir**.
3. Com o tablet online, os celulares passam a mostrar só a mão e os controles. Se o tablet sair ou desconectar, os celulares voltam a mostrar a mesa inteira sozinhos.
4. **Gerar novo código** desconecta o tablet atual; **Desativar modo tablet** encerra o modo.

O tablet só vê a parte pública da partida (nunca as mãos), não ocupa vaga e não joga: as jogadas continuam nos celulares.
Usa um identificador próprio, então o mesmo navegador pode ser jogador e tablet nos testes.

| Jogo | Tablet | Celular com tablet online |
|---|---|---|
| Uno, Truco, Caxeta, Buraco, BANG!, Coup | Mesa redonda com os jogadores em volta, monte, descarte, jogos baixados e histórico | Só a mão, os controles e o mínimo para decidir (carta do topo, descarte, jogos da própria dupla, alvos) |
| Scrabble, Catan, Dama, Azul, Código Secreto, War, War II, Paciência | O tabuleiro ampliado, em modo "assistindo" | Igual ao normal (o toque no tabuleiro continua no celular) |

Para dar uma tela própria de tablet a outro jogo, registre `window.TableUI[<id>] = (elemento, sala) => texto` em `public/tablet.js`;
para o celular mostrar só a mão, use `room.tableMode` na tela do jogo (`public/games/<id>.js`).
No servidor, o código do tablet fica só nos dados privados da sala e na tabela `tablet_codes` (código -> sala, sem acesso público); o `rooms` público só informa que existe uma mesa.

## Adicionar um jogo

1. `games/<id>/game.js` exporta `{ id, name, description, minPlayers, maxPlayers, roles, setup, move, view }`.
   O servidor chama `move(state, seat, jogada)` e valida tudo; o cliente só envia a intenção.
   `view(state)` é a visão pública (todos veem). Jogos com informação escondida (mão de cartas) também exportam
   `viewFor(state, seat)`, a visão privada de cada jogador (`seat` nulo = espectador).
   Jogos com sala de espera usam `acceptsSeat(state)`, `seatJoined(state, seat)` e `restart(state)`.
2. `public/games/<id>.js` registra `window.GameUI[<id>] = { render(el, room, send) }`.
3. Reinicie o servidor. O jogo aparece sozinho na biblioteca.

## Testes

    node test/damas.test.js        # regras da dama
    node test/paciencia.test.js    # regras da paciencia
    node test/uno.test.js          # uno, truco, buraco e caxeta: regras e partidas simuladas
    node test/truco.test.js
    node test/buraco.test.js
    node test/caxeta.test.js
    node test/coup.test.js
    node test/azul.test.js
    node test/catan.test.js
    node test/scrabble.test.js
    node test/bang.test.js
    node test/codenames.test.js
    node test/war.test.js
    node test/war2.test.js
    node test/core.test.mjs        # logica da funcao da nuvem (banco em memoria), inclui o modo tablet

## Limitações conhecidas

- Partidas ficam só na memória do servidor: reiniciar o servidor apaga as salas.
- Não há senha: quem souber o endereço e o código de 4 letras entra (como jogador, se houver vaga, ou como espectador).
- Se a tela de um celular bloquear, a conexão cai e volta ao desbloquear; o estado é mantido no servidor.
