// GERADO por scripts/build-edge.js a partir de games/azul/game.js. Nao edite.
'use strict';
// Azul, 2 a 4 jogadores. 100 azulejos (5 cores x 20), fabricas de 4 azulejos, painel com linhas de padrao,
// parede 5x5, linha de chao e marcador de primeiro jogador.
//
// Regras implementadas (versao classica, parede colorida):
//  - Fabricas: 5 (2 jogadores), 7 (3) ou 9 (4). Cada rodada, cada fabrica recebe 4 azulejos do saco.
//  - No turno: pegue TODOS os azulejos de uma cor de uma fabrica (os demais vao para o centro) ou do centro.
//    Quem pega do centro pela primeira vez leva o marcador de primeiro jogador (vai para o chao, -1) e abre a proxima rodada.
//  - Os azulejos vao para UMA linha de padrao (1 a 5 casas) que esteja vazia ou ja tenha so aquela cor, e cuja linha
//    da parede ainda nao tenha a cor. O que nao couber, ou se escolher o chao, cai na linha de chao.
//  - Fim da rodada (tudo vazio): cada linha de padrao cheia manda 1 azulejo para a parede (de cima para baixo) e pontua:
//    1 ponto se isolado; senao, tamanho da sequencia horizontal (se >1) + tamanho da vertical (se >1).
//    Os demais azulejos da linha vao para a tampa. Chao: -1, -1, -2, -2, -2, -3, -3 (pontuacao nunca fica abaixo de 0).
//  - A partida acaba ao fim da rodada em que alguem completa uma linha horizontal da parede.
//    Bonus: +2 por linha completa, +7 por coluna completa, +10 por cor completa (5 azulejos).
//  - Vence quem tiver mais pontos; empate: mais linhas completas; persistindo, vitoria compartilhada.

const COLORS = ['Azul', 'Amarelo', 'Vermelho', 'Preto', 'Turquesa'];
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const FACTORIES = { 2: 5, 3: 7, 4: 9 };
const PENALTY = [-1, -1, -2, -2, -2, -3, -3];
const MARKER = 'M';

function randomInt(n) {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) {
    const limit = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    do c.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}

// cor que fica na coluna col da linha row da parede
const colorAt = (row, col) => (col - row + 5) % 5;
const colAt = (row, color) => (color + row) % 5;

const sum = (a) => a.reduce((x, y) => x + y, 0);

function emptyBoard() {
  return {
    pattern: Array.from({ length: 5 }, () => ({ color: -1, n: 0 })),
    wall: Array.from({ length: 5 }, () => new Array(5).fill(false)),
    floor: [],
    score: 0,
  };
}

function lobbyState(players = 0) {
  return {
    phase: 'lobby', players, bag: [], box: [], factories: [], center: [], marker: false, boards: [],
    turn: 0, first: 0, nextFirst: 0, round: 0, winners: [], bonus: [], lastRound: null, log: '',
  };
}

const setup = () => lobbyState(0);
const acceptsSeat = (s) => s.phase === 'lobby';
const seatJoined = (s, seat) => (s.phase === 'lobby' ? { ...s, players: Math.max(s.players, seat + 1) } : s);

// Tira um azulejo do saco (reabastece com a tampa quando acaba). Retorna -1 se nao ha mais nenhum.
function draw(s) {
  if (sum(s.bag) === 0) {
    s.bag = s.box;
    s.box = [0, 0, 0, 0, 0];
  }
  const total = sum(s.bag);
  if (!total) return -1;
  let r = randomInt(total);
  for (let c = 0; c < 5; c++) {
    if (r < s.bag[c]) {
      s.bag[c]--;
      return c;
    }
    r -= s.bag[c];
  }
  return -1;
}

function fillFactories(s) {
  s.factories = Array.from({ length: FACTORIES[s.players] }, () => []);
  for (const f of s.factories) {
    for (let i = 0; i < 4; i++) {
      const c = draw(s);
      if (c >= 0) f.push(c);
    }
    f.sort((a, b) => a - b);
  }
  s.center = [];
  s.marker = true;
}

function deal(prev, first) {
  const s = {
    ...prev,
    phase: 'playing',
    bag: [20, 20, 20, 20, 20],
    box: [0, 0, 0, 0, 0],
    boards: Array.from({ length: prev.players }, emptyBoard),
    turn: first,
    first,
    nextFirst: first,
    round: 1,
    winners: [],
    bonus: [],
    lastRound: null,
    log: 'Nova partida.',
  };
  fillFactories(s);
  return s;
}

function restart(state) {
  if (state.players < MIN_PLAYERS) return state;
  return deal(state, state.phase === 'lobby' ? 0 : (state.first + 1) % state.players);
}

// Casas livres da linha de padrao `row` para a cor, ou -1 se nao pode receber.
function room(board, row, color) {
  const line = board.pattern[row];
  if (board.wall[row][colAt(row, color)]) return -1;
  if (line.n > 0 && line.color !== color) return -1;
  return row + 1 - line.n;
}

// Joga os azulejos no chao; o que passar de 7 vai para a tampa.
function toFloor(s, board, tiles) {
  for (const t of tiles) {
    if (board.floor.length < PENALTY.length) board.floor.push(t);
    else if (t !== MARKER) s.box[t]++;
  }
}

function wallScore(wall, row, col) {
  let h = 1;
  for (let c = col - 1; c >= 0 && wall[row][c]; c--) h++;
  for (let c = col + 1; c < 5 && wall[row][c]; c++) h++;
  let v = 1;
  for (let r = row - 1; r >= 0 && wall[r][col]; r--) v++;
  for (let r = row + 1; r < 5 && wall[r][col]; r++) v++;
  if (h === 1 && v === 1) return 1;
  return (h > 1 ? h : 0) + (v > 1 ? v : 0);
}

const rowsDone = (wall) => wall.filter((r) => r.every(Boolean)).length;

function endRound(s, nameOf) {
  const lines = [];
  s.boards.forEach((b, seat) => {
    let gain = 0;
    for (let r = 0; r < 5; r++) {
      const line = b.pattern[r];
      if (line.n !== r + 1) continue;
      const col = colAt(r, line.color);
      b.wall[r][col] = true;
      gain += wallScore(b.wall, r, col);
      s.box[line.color] += r; // o primeiro vai para a parede, o resto para a tampa
      b.pattern[r] = { color: -1, n: 0 };
    }
    let loss = 0;
    b.floor.forEach((t, i) => {
      loss += PENALTY[i];
      if (t !== MARKER) s.box[t]++;
    });
    b.floor = [];
    const before = b.score;
    b.score = Math.max(0, b.score + gain + loss);
    lines.push({ seat, gain, loss, delta: b.score - before });
  });
  s.lastRound = { round: s.round, lines };

  if (s.boards.some((b) => rowsDone(b.wall) > 0)) {
    finish(s);
    return;
  }
  s.round++;
  s.first = s.nextFirst;
  s.turn = s.first;
  fillFactories(s);
  if (s.factories.every((f) => !f.length)) {
    // saco e tampa vazios: nao ha o que distribuir, encerra a partida
    finish(s);
    return;
  }
  s.log = `Rodada ${s.round}. ${nameOf ? nameOf(s.turn) : ''}`.trim();
}

function finish(s) {
  s.bonus = s.boards.map((b) => {
    const rows = rowsDone(b.wall);
    let cols = 0;
    for (let c = 0; c < 5; c++) if (b.wall.every((r) => r[c])) cols++;
    let colors = 0;
    for (let k = 0; k < 5; k++) if ([0, 1, 2, 3, 4].every((r) => b.wall[r][colAt(r, k)])) colors++;
    const total = rows * 2 + cols * 7 + colors * 10;
    b.score += total;
    return { rows, cols, colors, total };
  });
  const best = Math.max(...s.boards.map((b) => b.score));
  let tied = s.boards.map((b, i) => i).filter((i) => s.boards[i].score === best);
  if (tied.length > 1) {
    const mostRows = Math.max(...tied.map((i) => s.bonus[i].rows));
    tied = tied.filter((i) => s.bonus[i].rows === mostRows);
  }
  s.winners = tied;
  s.phase = 'ended';
  s.log = 'Fim da partida.';
}

function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    if (state.players < MIN_PLAYERS) return { error: 'São necessários pelo menos 2 jogadores.' };
    return { state: deal(state, 0) };
  }
  if (state.phase !== 'playing') return { error: 'A partida terminou. Use "Nova partida" para jogar outra.' };
  if (seat !== state.turn) return { error: 'Não é a sua vez.' };
  if (req.t !== 'take') return { error: 'Jogada inválida.' };

  const { src, color, row } = req;
  if (!Number.isInteger(color) || color < 0 || color > 4) return { error: 'Cor inválida.' };
  if (!Number.isInteger(row) || row < 0 || row > 5) return { error: 'Linha inválida.' };
  const s = JSON.parse(JSON.stringify(state));
  const board = s.boards[seat];

  let taken;
  if (src === 'c') {
    taken = s.center.filter((t) => t === color).length;
    if (!taken) return { error: 'Não há azulejos dessa cor no centro.' };
  } else {
    if (!Number.isInteger(src) || src < 0 || src >= s.factories.length) return { error: 'Fábrica inválida.' };
    taken = s.factories[src].filter((t) => t === color).length;
    if (!taken) return { error: 'Não há azulejos dessa cor nessa fábrica.' };
  }
  let space = 0;
  if (row < 5) {
    space = room(board, row, color);
    if (space < 0) return { error: 'Essa linha não pode receber essa cor.' };
    if (space === 0) return { error: 'Essa linha já está cheia.' };
  }

  // retira da origem
  const floorTiles = [];
  if (src === 'c') {
    s.center = s.center.filter((t) => t !== color);
    if (s.marker) {
      s.marker = false;
      s.nextFirst = seat;
      floorTiles.push(MARKER);
    }
  } else {
    const f = s.factories[src];
    s.center.push(...f.filter((t) => t !== color));
    s.center.sort((a, b) => a - b);
    s.factories[src] = [];
  }

  let placed = 0;
  if (row < 5) {
    placed = Math.min(taken, space);
    board.pattern[row].color = color;
    board.pattern[row].n += placed;
  }
  for (let i = 0; i < taken - placed; i++) floorTiles.push(color);
  toFloor(s, board, floorTiles);

  s.log = `${COLORS[color]} x${taken}${row < 5 ? ` na linha ${row + 1}` : ' no chão'}.`;

  if (s.factories.every((f) => !f.length) && !s.center.length) endRound(s);
  else s.turn = (seat + 1) % s.players;
  return { state: s };
}

function view(state) {
  const ended = state.phase === 'ended';
  const playing = state.phase === 'playing';
  return {
    phase: state.phase,
    players: state.players,
    turn: playing ? state.turn : null,
    round: state.round,
    first: state.first,
    factories: state.factories,
    center: state.center,
    marker: state.marker,
    boards: state.boards,
    bagCount: sum(state.bag),
    boxCount: sum(state.box),
    lastRound: state.lastRound,
    bonus: ended ? state.bonus : null,
    winners: ended ? state.winners : [],
    log: state.log,
    draw: false,
    over: ended,
  };
}

// Piloto automatico: escolhe a jogada que aproveita melhor os azulejos e evita o chao. Nunca recusa a vez.
function waitingOn(state) {
  return state.phase === 'playing' ? [state.turn] : [];
}

function autoMove(state, seat) {
  const board = state.boards[seat];
  let best = null;
  const sources = state.factories.map((f, i) => ({ src: i, tiles: f }));
  sources.push({ src: 'c', tiles: state.center });
  for (const { src, tiles } of sources) {
    for (let color = 0; color < 5; color++) {
      const taken = tiles.filter((t) => t === color).length;
      if (!taken) continue;
      for (let row = 0; row <= 5; row++) {
        let value;
        if (row === 5) value = -3 * taken;
        else {
          const space = room(board, row, color);
          if (space <= 0) continue;
          const placed = Math.min(taken, space);
          const over = taken - placed;
          const fills = placed === space ? 3 : 0;
          const started = board.pattern[row].n > 0 ? 1 : 0;
          value = placed * 2 + fills + started - over * 2.5 - (row === 0 && placed === 1 ? 0 : 0);
        }
        if (src === 'c' && state.marker) value -= 1;
        if (!best || value > best.value) best = { value, move: { t: 'take', src, color, row } };
      }
    }
  }
  return best ? best.move : null;
}

export default {
  id: 'azul',
  name: 'Azul',
  description: 'Azul: escolha azulejos nas fábricas e monte sua parede de mosaicos. De 2 a 4 jogadores.',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  roles: Array.from({ length: MAX_PLAYERS }, (_, i) => `Jogador ${i + 1}`),
  setup,
  acceptsSeat,
  seatJoined,
  restart,
  move,
  view,
  waitingOn,
  autoMove,
  // expostos para teste
  _deal: deal,
  _wallScore: wallScore,
  _colorAt: colorAt,
  _room: room,
  _PENALTY: PENALTY,
};
