// GERADO por scripts/build-edge.js a partir de games/war/game.js. Nao edite.
'use strict';
// War (estilo Risk), 3 a 6 jogadores. 42 territórios em 6 continentes, objetivos secretos, cartas de território e dados.
//
// Preparação: os territórios são distribuídos ao acaso (1 exército em cada); depois cada jogador, na ordem, reparte
// 5 exércitos e, numa segunda volta, mais 3. Cada jogador recebe um objetivo secreto (14 objetivos, como no jogo original).
//
// Turno: 1) reforços: metade dos territórios (mínimo 3) + bônus de continente + troca de cartas; 2) ataques: de um território
// com 2 ou mais exércitos contra um vizinho inimigo, até 3 dados de ataque (sempre deixando 1 exército) contra até 3 de defesa;
// maiores dados contra maiores dados, empate favorece a defesa; 3) remanejar (opcional): mover exércitos para um vizinho seu,
// o que encerra o turno. Quem conquistou ao menos um território no turno compra uma carta ao final.
// Cartas: 3 do mesmo símbolo ou 1 de cada símbolo valem 4, 6, 8, 10, 12, 15 e depois +5 a cada troca; o coringa serve como qualquer símbolo.
// Com 5 ou mais cartas a troca é obrigatória antes de reforçar. Quem elimina um jogador fica com as cartas dele.
//
// Simplificações (confira com a sua mesa): o mapa é uma adaptação do mapa clássico de 42 territórios; as trocas não dão
// o bônus de +2 exércitos no território da carta; na preparação os exércitos podem ir para qualquer território seu;
// ao conquistar, move-se para o território novo o mesmo número de exércitos que o de dados do ataque (o resto pode ser remanejado).
// Vence quem cumprir o objetivo; o restante do tabuleiro continua em disputa até alguém cumprir o seu.

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 6;
const COLOR_NAME = ['Vermelho', 'Azul', 'Verde', 'Amarelo', 'Preto', 'Branco'];
const COLOR_PLURAL = ['Vermelhos', 'Azuis', 'Verdes', 'Amarelos', 'Pretos', 'Brancos'];

const CONTINENTS = [
  { name: 'América do Norte', bonus: 5 },
  { name: 'América do Sul', bonus: 2 },
  { name: 'Europa', bonus: 5 },
  { name: 'África', bonus: 3 },
  { name: 'Ásia', bonus: 7 },
  { name: 'Oceania', bonus: 2 },
];

const TERRITORIES = [
  ['Alasca', 0], ['Mackenzie', 0], ['Groenlândia', 0], ['Vancouver', 0], ['Ottawa', 0], ['Labrador', 0], ['Califórnia', 0], ['Nova York', 0], ['México', 0],
  ['Colômbia', 1], ['Peru', 1], ['Brasil', 1], ['Argentina', 1],
  ['Islândia', 2], ['Inglaterra', 2], ['Suécia', 2], ['Alemanha', 2], ['Portugal', 2], ['Polônia', 2], ['Moscou', 2],
  ['Argélia', 3], ['Egito', 3], ['Sudão', 3], ['Congo', 3], ['África do Sul', 3], ['Madagascar', 3],
  ['Aral', 4], ['Omsk', 4], ['Dudinka', 4], ['Sibéria', 4], ['Tchita', 4], ['Vladivostok', 4], ['Mongólia', 4], ['Japão', 4], ['China', 4], ['Índia', 4], ['Vietnã', 4], ['Oriente Médio', 4],
  ['Sumatra', 5], ['Bornéu', 5], ['Nova Guiné', 5], ['Austrália', 5],
].map(([name, cont]) => ({ name, cont }));

const idxOf = Object.fromEntries(TERRITORIES.map((t, i) => [t.name, i]));
const EDGES = [
  // América do Norte
  ['Alasca', 'Mackenzie'], ['Alasca', 'Vancouver'], ['Alasca', 'Vladivostok'], ['Mackenzie', 'Vancouver'], ['Mackenzie', 'Ottawa'], ['Mackenzie', 'Groenlândia'],
  ['Groenlândia', 'Ottawa'], ['Groenlândia', 'Labrador'], ['Groenlândia', 'Islândia'], ['Vancouver', 'Ottawa'], ['Vancouver', 'Califórnia'], ['Ottawa', 'Labrador'],
  ['Ottawa', 'Califórnia'], ['Ottawa', 'Nova York'], ['Labrador', 'Nova York'], ['Califórnia', 'Nova York'], ['Califórnia', 'México'], ['Nova York', 'México'], ['México', 'Colômbia'],
  // América do Sul
  ['Colômbia', 'Peru'], ['Colômbia', 'Brasil'], ['Peru', 'Brasil'], ['Peru', 'Argentina'], ['Brasil', 'Argentina'], ['Brasil', 'Argélia'],
  // Europa
  ['Islândia', 'Inglaterra'], ['Islândia', 'Suécia'], ['Inglaterra', 'Suécia'], ['Inglaterra', 'Alemanha'], ['Inglaterra', 'Portugal'], ['Suécia', 'Alemanha'], ['Suécia', 'Moscou'],
  ['Alemanha', 'Portugal'], ['Alemanha', 'Polônia'], ['Alemanha', 'Moscou'], ['Portugal', 'Polônia'], ['Portugal', 'Argélia'], ['Polônia', 'Moscou'], ['Polônia', 'Oriente Médio'],
  ['Polônia', 'Egito'], ['Polônia', 'Argélia'], ['Moscou', 'Aral'], ['Moscou', 'Omsk'], ['Moscou', 'Oriente Médio'],
  // África
  ['Argélia', 'Egito'], ['Argélia', 'Sudão'], ['Argélia', 'Congo'], ['Egito', 'Sudão'], ['Egito', 'Oriente Médio'], ['Sudão', 'Congo'], ['Sudão', 'África do Sul'], ['Sudão', 'Madagascar'],
  ['Sudão', 'Oriente Médio'], ['Congo', 'África do Sul'], ['África do Sul', 'Madagascar'],
  // Ásia
  ['Aral', 'Dudinka'], ['Aral', 'China'], ['Aral', 'Omsk'], ['Omsk', 'China'], ['Omsk', 'Índia'], ['Omsk', 'Oriente Médio'], ['Dudinka', 'Sibéria'], ['Dudinka', 'Tchita'], ['Dudinka', 'Mongólia'],
  ['Dudinka', 'China'], ['Sibéria', 'Tchita'], ['Sibéria', 'Vladivostok'], ['Tchita', 'Vladivostok'], ['Tchita', 'Mongólia'], ['Vladivostok', 'Mongólia'], ['Vladivostok', 'Japão'],
  ['Mongólia', 'Japão'], ['Mongólia', 'China'], ['China', 'Índia'], ['China', 'Vietnã'], ['Índia', 'Vietnã'], ['Índia', 'Oriente Médio'], ['Vietnã', 'Sumatra'],
  // Oceania
  ['Sumatra', 'Bornéu'], ['Sumatra', 'Austrália'], ['Bornéu', 'Nova Guiné'], ['Bornéu', 'Austrália'], ['Nova Guiné', 'Austrália'],
];
const ADJ = TERRITORIES.map(() => []);
for (const [a, b] of EDGES) {
  if (idxOf[a] === undefined || idxOf[b] === undefined) throw new Error(`territorio desconhecido: ${a} / ${b}`);
  ADJ[idxOf[a]].push(idxOf[b]);
  ADJ[idxOf[b]].push(idxOf[a]);
}

const N = TERRITORIES.length; // 42
const CARD_COUNT = N + 2; // 42 territorios + 2 coringas
const cardSym = (c) => (c >= N ? 3 : c % 3); // 0 circulo, 1 quadrado, 2 triangulo, 3 coringa
const TRADE_VALUES = [4, 6, 8, 10, 12, 15];
const tradeValue = (k) => (k < TRADE_VALUES.length ? TRADE_VALUES[k] : 15 + 5 * (k - TRADE_VALUES.length + 1));

const rng = {
  int(n) {
    const c = globalThis.crypto;
    if (c && c.getRandomValues) {
      const limit = Math.floor(0x100000000 / n) * n;
      const buf = new Uint32Array(1);
      do c.getRandomValues(buf); while (buf[0] >= limit);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  },
  roll() {
    return this.int(6) + 1;
  },
};

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- objetivos ---------- */
// k: 'cont' (c = continentes obrigatorios, extra = mais um a escolha), 'terr' (n territorios), 'terr2' (n territorios com 2+ exercitos), 'kill' (t = jogador)
const CONQUER_OBJECTIVES = [
  { k: 'cont', c: [4, 1], extra: 0 },
  { k: 'cont', c: [4, 3], extra: 0 },
  { k: 'cont', c: [0, 3], extra: 0 },
  { k: 'cont', c: [0, 5], extra: 0 },
  { k: 'terr', n: 24 },
  { k: 'terr2', n: 18 },
  { k: 'cont', c: [2, 1], extra: 1 },
  { k: 'cont', c: [2, 5], extra: 1 },
];

function objectiveText(o, players) {
  if (o.k === 'cont') {
    const names = o.c.map((c) => CONTINENTS[c].name);
    return `Conquistar ${names.join(' e ')}${o.extra ? ' e mais um continente à sua escolha' : ''}.`;
  }
  if (o.k === 'terr') return `Conquistar ${o.n} territórios à sua escolha.`;
  if (o.k === 'terr2') return `Conquistar ${o.n} territórios e ocupar cada um com pelo menos 2 exércitos.`;
  const absent = o.t >= players;
  return `Destruir completamente os exércitos ${COLOR_PLURAL[o.t]}.${absent ? ' (Cor fora da partida: conquistar 24 territórios.)' : ' Se forem eliminados por outro jogador, ou se forem os seus, conquistar 24 territórios.'}`;
}

function dealObjectives(players) {
  const deck = [...CONQUER_OBJECTIVES, ...COLOR_NAME.map((_, t) => ({ k: 'kill', t }))];
  for (let tries = 0; tries < 1000; tries++) {
    shuffle(deck);
    const hand = deck.slice(0, players);
    if (hand.every((o, seat) => !(o.k === 'kill' && o.t === seat))) return hand.map((o) => JSON.parse(JSON.stringify(o)));
  }
  return deck.slice(0, players).map((o, seat) => (o.k === 'kill' && o.t === seat ? { k: 'terr', n: 24 } : o));
}

const ownedBy = (s, seat) => s.owner.map((o, i) => (o === seat ? i : -1)).filter((i) => i >= 0);
const continentsOwned = (s, seat) => CONTINENTS.map((_, c) => TERRITORIES.every((t, i) => t.cont !== c || s.owner[i] === seat));

function objectiveDone(s, seat) {
  let o = s.objectives[seat];
  const mine = ownedBy(s, seat);
  const owned = continentsOwned(s, seat);
  if (o.k === 'kill') {
    const t = o.t;
    if (t < s.players && t !== seat) {
      if (!s.alive[t] && s.killedBy[t] === seat) return true;
      if (s.alive[t] || s.killedBy[t] === seat) return false;
    }
    o = { k: 'terr', n: 24 }; // alvo fora da partida, eliminado por outro ou propria cor
  }
  if (o.k === 'terr') return mine.length >= o.n;
  if (o.k === 'terr2') return mine.filter((i) => s.armies[i] >= 2).length >= o.n;
  if (!o.c.every((c) => owned[c])) return false;
  return !o.extra || owned.some((has, c) => has && !o.c.includes(c));
}

/* ---------- estado ---------- */
function lobbyState(players = 0) {
  return { phase: 'lobby', players, owner: [], armies: [], objectives: [], hands: [], deck: [], discard: [], alive: [], killedBy: [], turn: 0, stage: 'place', pool: 0, lap: 1, tradeCount: 0, conquered: false, lastAttack: null, winner: null, log: '' };
}

const setup = () => lobbyState(0);
const acceptsSeat = (s) => s.phase === 'lobby';
const seatJoined = (s, seat) => (s.phase === 'lobby' ? { ...s, players: Math.max(s.players, seat + 1) } : s);

function deal(players) {
  const order = shuffle(Array.from({ length: N }, (_, i) => i));
  const owner = new Array(N).fill(0);
  order.forEach((t, k) => { owner[t] = k % players; });
  return {
    phase: 'setup',
    players,
    owner,
    armies: new Array(N).fill(1),
    objectives: dealObjectives(players),
    hands: Array.from({ length: players }, () => []),
    deck: shuffle(Array.from({ length: CARD_COUNT }, (_, i) => i)),
    discard: [],
    alive: new Array(players).fill(true),
    killedBy: new Array(players).fill(null),
    turn: 0,
    stage: 'place',
    pool: 5,
    lap: 1,
    tradeCount: 0,
    conquered: false,
    lastAttack: null,
    winner: null,
    log: 'Preparação: cada jogador reparte 5 exércitos pelos seus territórios (depois mais 3).',
  };
}

const restart = (state) => (state.players >= MIN_PLAYERS ? deal(state.players) : state);

function reinforcement(s, seat) {
  const mine = ownedBy(s, seat);
  const owned = continentsOwned(s, seat);
  return Math.max(3, Math.floor(mine.length / 2)) + CONTINENTS.reduce((a, c, i) => a + (owned[i] ? c.bonus : 0), 0);
}

function nextAlive(s, from) {
  let n = from;
  do n = (n + 1) % s.players; while (!s.alive[n]);
  return n;
}

function drawCard(s, seat) {
  if (!s.deck.length && s.discard.length) {
    s.deck = shuffle(s.discard);
    s.discard = [];
  }
  if (s.deck.length) s.hands[seat].push(s.deck.pop());
}

function finishIfWon(s, seat) {
  if (s.phase === 'ended') return true;
  const alive = s.alive.filter(Boolean).length;
  if (alive === 1 || objectiveDone(s, seat)) {
    s.phase = 'ended';
    s.winner = alive === 1 ? s.alive.indexOf(true) : seat;
    s.pool = 0;
    s.log = `${COLOR_NAME[s.winner]} cumpriu o objetivo e venceu!`;
    return true;
  }
  return false;
}

function endTurn(s) {
  const seat = s.turn;
  if (s.conquered) drawCard(s, seat);
  s.turn = nextAlive(s, seat);
  s.stage = 'place';
  s.conquered = false;
  s.pool = reinforcement(s, s.turn);
  s.log = `Vez de ${COLOR_NAME[s.turn]}: ${s.pool} exércitos para reforçar.`;
  return s;
}

const validTrade = (hand, idx) => {
  if (!Array.isArray(idx) || idx.length !== 3 || new Set(idx).size !== 3 || idx.some((i) => !Number.isInteger(i) || i < 0 || i >= hand.length)) return false;
  const syms = idx.map((i) => cardSym(hand[i])).filter((x) => x !== 3);
  const kinds = new Set(syms).size;
  return kinds === 1 || kinds === syms.length;
};

function findTrade(hand) {
  for (let a = 0; a < hand.length; a++) for (let b = a + 1; b < hand.length; b++) for (let c = b + 1; c < hand.length; c++) if (validTrade(hand, [a, b, c])) return [a, b, c];
  return null;
}

/* ---------- jogadas ---------- */
function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    if (state.players < MIN_PLAYERS) return { error: `São necessários pelo menos ${MIN_PLAYERS} jogadores.` };
    return { state: deal(state.players) };
  }
  if (state.phase !== 'setup' && state.phase !== 'playing') return { error: 'A partida terminou. Use "Nova partida" para jogar outra.' };
  if (seat >= state.players || !state.alive[seat]) return { error: 'Você não está mais na partida.' };
  if (seat !== state.turn) return { error: 'Não é a sua vez.' };

  const s = JSON.parse(JSON.stringify(state));
  const own = (i) => Number.isInteger(i) && i >= 0 && i < N && s.owner[i] === seat;

  if (req.t === 'place') {
    if (s.stage !== 'place') return { error: 'A fase de reforços já passou.' };
    if (s.phase === 'playing' && s.hands[seat].length >= 5) return { error: 'Você tem 5 ou mais cartas: troque antes de reforçar.' };
    const plan = req.plan;
    if (!Array.isArray(plan) || !plan.length || plan.some((p) => !Array.isArray(p) || !own(p[0]) || !Number.isInteger(p[1]) || p[1] < 1)) return { error: 'Distribua os exércitos entre os seus territórios.' };
    const total = plan.reduce((a, p) => a + p[1], 0);
    if (total !== s.pool) return { error: `Distribua exatamente ${s.pool} exército${s.pool === 1 ? '' : 's'} (você distribuiu ${total}).` };
    for (const [i, n] of plan) s.armies[i] += n;
    s.pool = 0;
    if (s.phase === 'setup') {
      const next = s.turn + 1;
      if (next < s.players) {
        s.turn = next;
        s.pool = s.lap === 1 ? 5 : 3;
        s.log = `${COLOR_NAME[s.turn]} reparte ${s.pool} exércitos.`;
      } else if (s.lap === 1) {
        s.lap = 2;
        s.turn = 0;
        s.pool = 3;
        s.log = 'Segunda volta: cada jogador reparte mais 3 exércitos.';
      } else {
        s.phase = 'playing';
        s.turn = 0;
        s.pool = reinforcement(s, 0);
        s.log = `A guerra começa! ${COLOR_NAME[0]} tem ${s.pool} exércitos para reforçar.`;
      }
      return { state: s };
    }
    s.stage = 'attack';
    s.log = `${COLOR_NAME[seat]} reforçou. Hora de atacar.`;
    finishIfWon(s, seat);
    return { state: s };
  }

  if (s.phase !== 'playing') return { error: 'Aguarde o fim da preparação.' };

  if (req.t === 'trade') {
    if (s.stage !== 'place') return { error: 'Só é possível trocar cartas na fase de reforços.' };
    if (!validTrade(s.hands[seat], req.cards)) return { error: 'Escolha 3 cartas: do mesmo símbolo, ou de 3 símbolos diferentes (coringa vale qualquer um).' };
    const value = tradeValue(s.tradeCount);
    const picked = req.cards.slice().sort((a, b) => b - a);
    for (const i of picked) s.discard.push(s.hands[seat].splice(i, 1)[0]);
    s.tradeCount += 1;
    s.pool += value;
    s.log = `${COLOR_NAME[seat]} trocou 3 cartas por ${value} exércitos.`;
    return { state: s };
  }

  if (s.stage !== 'attack') return { error: 'Primeiro distribua os reforços.' };

  if (req.t === 'attack') {
    const { from, to } = req;
    if (!own(from)) return { error: 'Ataque a partir de um território seu.' };
    if (!Number.isInteger(to) || to < 0 || to >= N || s.owner[to] === seat) return { error: 'Escolha um território inimigo.' };
    if (!ADJ[from].includes(to)) return { error: 'Os territórios não são vizinhos.' };
    if (s.armies[from] < 2) return { error: 'É preciso ter 2 ou mais exércitos para atacar.' };
    const until = req.until === true;
    const defender = s.owner[to];
    const rec = { from, to, by: seat, att: [], def: [], lossA: 0, lossD: 0, conquered: false };
    let dice = 0;
    for (let round = 0; round < 200; round++) {
      const maxDice = Math.min(3, s.armies[from] - 1);
      dice = until || !Number.isInteger(req.dice) ? maxDice : Math.max(1, Math.min(req.dice, maxDice));
      const att = Array.from({ length: dice }, () => rng.roll()).sort((a, b) => b - a);
      const def = Array.from({ length: Math.min(3, s.armies[to]) }, () => rng.roll()).sort((a, b) => b - a);
      for (let k = 0; k < Math.min(att.length, def.length); k++) {
        if (att[k] > def[k]) { s.armies[to] -= 1; rec.lossD += 1; } else { s.armies[from] -= 1; rec.lossA += 1; }
      }
      rec.att = att;
      rec.def = def;
      if (s.armies[to] <= 0) { rec.conquered = true; break; }
      if (!until || s.armies[from] < 2) break;
    }
    if (rec.conquered) {
      const moved = Math.max(1, Math.min(dice, s.armies[from] - 1));
      s.owner[to] = seat;
      s.armies[from] -= moved;
      s.armies[to] = moved;
      s.conquered = true;
      rec.moved = moved;
      s.log = `${COLOR_NAME[seat]} conquistou ${TERRITORIES[to].name}!`;
      if (!s.owner.includes(defender)) {
        s.alive[defender] = false;
        s.killedBy[defender] = seat;
        s.hands[seat].push(...s.hands[defender]);
        s.hands[defender] = [];
        s.log += ` Os ${COLOR_PLURAL[defender]} foram eliminados.`;
      }
    } else {
      s.log = `${COLOR_NAME[seat]} atacou ${TERRITORIES[to].name}: perdeu ${rec.lossA}, causou ${rec.lossD}.`;
    }
    s.lastAttack = rec;
    finishIfWon(s, seat);
    return { state: s };
  }

  if (req.t === 'move') {
    const { from, to, n } = req;
    if (!own(from) || !own(to) || !ADJ[from].includes(to)) return { error: 'Mova exércitos entre dois territórios seus que sejam vizinhos.' };
    if (!Number.isInteger(n) || n < 1 || n > s.armies[from] - 1) return { error: 'Número de exércitos inválido (sempre fica 1 no território de origem).' };
    s.armies[from] -= n;
    s.armies[to] += n;
    finishIfWon(s, seat);
    if (s.phase === 'ended') return { state: s };
    endTurn(s);
    return { state: s };
  }

  if (req.t === 'end') {
    endTurn(s);
    return { state: s };
  }

  return { error: 'Jogada inválida.' };
}

/* ---------- visoes ---------- */
function view(state) {
  const ended = state.phase === 'ended';
  const mapped = state.owner.length > 0;
  return {
    phase: state.phase,
    players: state.players,
    owner: state.owner,
    armies: state.armies,
    turn: state.phase === 'setup' || state.phase === 'playing' ? state.turn : null,
    stage: state.stage,
    pool: state.pool,
    lap: state.lap,
    cards: state.hands.map((h) => h.length),
    terr: mapped ? Array.from({ length: state.players }, (_, p) => state.owner.filter((o) => o === p).length) : [],
    alive: state.alive,
    nextTrade: tradeValue(state.tradeCount),
    conquered: state.conquered,
    lastAttack: state.lastAttack,
    winner: state.winner,
    reveal: ended ? state.objectives.map((o) => objectiveText(o, state.players)) : null,
    log: state.log,
    draw: false,
    over: ended,
  };
}

function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby' || seat >= state.players) return null;
  const mine = (state.phase === 'setup' || state.phase === 'playing') && state.turn === seat && state.alive[seat];
  const hand = state.hands[seat];
  const mustTrade = mine && state.phase === 'playing' && state.stage === 'place' && hand.length >= 5;
  const owned = ownedBy(state, seat);
  return {
    objective: objectiveText(state.objectives[seat], state.players),
    done: objectiveDone(state, seat),
    hand,
    symbols: hand.map(cardSym),
    cardTerr: hand.map((c) => (c >= N ? null : c)),
    mustTrade,
    canTrade: mine && state.phase === 'playing' && state.stage === 'place' && !!findTrade(hand),
    canPlace: mine && state.stage === 'place' && !mustTrade,
    canAttack: mine && state.phase === 'playing' && state.stage === 'attack',
    reinforce: state.phase === 'playing' ? reinforcement(state, seat) : 0,
    owned: owned.length,
  };
}

// Piloto automatico: troca cartas quando obrigatorio, reforca o primeiro territorio e encerra o turno (nunca ataca).
function waitingOn(state) {
  return state.phase === 'setup' || state.phase === 'playing' ? [state.turn] : [];
}

function autoMove(state, seat) {
  if (state.stage === 'place') {
    const hand = state.hands[seat];
    if (state.phase === 'playing' && hand.length >= 5) {
      const t = findTrade(hand);
      if (t) return { t: 'trade', cards: t };
    }
    const first = state.owner.indexOf(seat);
    return first < 0 ? null : { t: 'place', plan: [[first, state.pool]] };
  }
  return { t: 'end' };
}

export default {
  id: 'war',
  name: 'War',
  description: 'War: conquista do mundo com dados, cartas e objetivos secretos. De 3 a 6 jogadores.',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  roles: COLOR_NAME,
  setup,
  acceptsSeat,
  seatJoined,
  restart,
  move,
  view,
  viewFor,
  waitingOn,
  autoMove,
  // expostos para teste
  _map: { territories: TERRITORIES, adj: ADJ, continents: CONTINENTS, colors: COLOR_NAME },
  _rng: rng,
  _deal: deal,
  _reinforcement: reinforcement,
  _objectiveDone: objectiveDone,
  _tradeValue: tradeValue,
  _validTrade: validTrade,
  _objectiveText: objectiveText,
};
