# Mesa de Jogos

Plataforma privada de jogos de tabuleiro para celular. Roda no navegador (Android e iPhone),
sem instalar nada nos aparelhos dos jogadores. Um aparelho (ou computador) roda o servidor;
os outros abrem o endereço dele.

Jogos na biblioteca:

| Jogo | Jogadores | Observações |
|---|---|---|
| Dama | 2 | Brasileira 8x8, captura obrigatória e dama voadora |
| Paciência | 1 (outros assistem) | Klondike, compra de 1 ou 3, desfazer |
| Uno | 2 a 8 | Sem acumular +2/+4 |
| Truco | 2 ou 4 (duplas) | Paulista: manilha pela vira, truco/seis/nove/doze, mão de onze |
| Buraco | 2 ou 4 (duplas) | Só sequências, 2 baralhos + 4 coringas, canastras e 2 mortos |
| Caxeta | 2 a 6 | 9 cartas, bate quem fechar jogos de 3+ cartas |
| Coup | 2 a 6 | Blefe, desafios e bloqueios; 15 cartas de personagem |

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
    node test/core.test.mjs        # logica da funcao da nuvem (banco em memoria)

## Limitações conhecidas

- Partidas ficam só na memória do servidor: reiniciar o servidor apaga as salas.
- Não há senha: quem souber o endereço e o código de 4 letras entra (como jogador, se houver vaga, ou como espectador).
- Se a tela de um celular bloquear, a conexão cai e volta ao desbloquear; o estado é mantido no servidor.
