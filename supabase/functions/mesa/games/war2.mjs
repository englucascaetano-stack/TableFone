// GERADO por scripts/build-edge.js a partir de games/war2/game.js. Nao edite.
'use strict';
// War II (Grow), 3 a 6 jogadores. Regras conforme o manual do War II, com mapa, Centros Estratégicos e tabelas lidos do tabuleiro.
//
// Diferenças em relação ao War: 12 Centros Estratégicos (CE) que rendem 1 exército e 1 bombardeiro por turno; ataques aéreos
// com bombardeiros (da base aérea ou, com cartas, da caixa de peças); cartas de território e numeradas usadas para exércitos,
// bombardeiros ou transporte; aerotransporte entre CEs; territórios escolhidos pelos jogadores (não sorteados).
//
// Preparação: os CEs são sorteados (2 exércitos em cada; com 5 jogadores há uma escolha especial); depois cada jogador, na ordem,
// ocupa um território vago por vez com 1 exército até não haver mais vagos. Na primeira rodada todos reforçam e só depois atacam.
// Turno: 1) reforços (metade dos territórios + bônus de continente + 1 por CE; mínimo 3) e 1 bombardeiro por CE na base aérea;
// 2) ataques terrestres e aéreos; 3) cartas (a qualquer momento); 4) deslocamento e aerotransporte; 5) 3 cartas se conquistou
// um território (no máximo 5 na mão).
//
// NAO FORAM CONFIRMADOS (dados que o PDF do manual nao traz) e estao marcados como provisorios:
//  - o agrupamento das 21 cartas de territorio que nao sao CE (ha 12 cartas de CE, uma por CE);
//  - os valores das 28 cartas numeradas (adotado: dez 1, nove 2, nove 3);
//  - o texto dos 20 objetivos (adotados os 14 do War: 8 de conquista + 6 de destruir uma cor);
//  - as faces dos dados aereos (adotado: 3 lisas, 1, 2 e 3);
//  - fronteiras e ligacoes lidas de uma foto do tabuleiro (ver _map.adj).
// Nao implementado: opcao do Centro de Informacoes e espionagem.

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 6;
const COLOR_NAME = ['Vermelho', 'Azul', 'Verde', 'Amarelo', 'Preto', 'Branco'];
const COLOR_PLURAL = ['Vermelhos', 'Azuis', 'Verdes', 'Amarelos', 'Pretos', 'Brancos'];
const PLANES = 10;
const HAND_MAX = 5;

// total = bonus por ter o continente inteiro; major = territorios para a maioria; maj = bonus da maioria (tabelas do tabuleiro)
const CONTINENTS = [
  { name: 'América do Norte', total: 7, major: 6, maj: 5 },
  { name: 'América do Sul', total: 3, major: 3, maj: 2 },
  { name: 'Europa', total: 7, major: 4, maj: 5 },
  { name: 'África', total: 4, major: 4, maj: 3 },
  { name: 'Ásia', total: 10, major: 7, maj: 7 },
  { name: 'Oceania', total: 3, major: 3, maj: 2 },
];

const TERRITORIES = [
  ['Alasca', 0], ['Mackenzie', 0], ['Groenlândia', 0], ['Vancouver', 0], ['Ottawa', 0], ['Labrador', 0], ['Califórnia', 0], ['Nova York', 0], ['México', 0], ['Cuba', 0],
  ['Venezuela', 1], ['Peru', 1], ['Brasil', 1], ['Argentina', 1],
  ['Islândia', 2], ['Inglaterra', 2], ['Suécia', 2], ['Alemanha', 2], ['França', 2], ['Polônia', 2], ['Moscou', 2],
  ['Argélia', 3], ['Egito', 3], ['Sudão', 3], ['Congo', 3], ['África do Sul', 3], ['Madagascar', 3],
  ['Aral', 4], ['Omsk', 4], ['Dudinka', 4], ['Sibéria', 4], ['Tchita', 4], ['Vladivostok', 4], ['Mongólia', 4], ['Japão', 4], ['China', 4], ['Índia', 4], ['Vietnã', 4], ['Oriente Médio', 4],
  ['Sumatra', 5], ['Bornéu', 5], ['Nova Guiné', 5], ['Austrália', 5],
].map(([name, cont]) => ({ name, cont }));
const N = TERRITORIES.length; // 43
const idxOf = Object.fromEntries(TERRITORIES.map((t, i) => [t.name, i]));

// Centros Estrategicos (simbolo no tabuleiro)
const CE = ['Ottawa', 'Nova York', 'Inglaterra', 'Alemanha', 'Moscou', 'Egito', 'Oriente Médio', 'China', 'Japão', 'Brasil', 'África do Sul', 'Austrália'].map((n) => idxOf[n]);
const isCE = (i) => CE.includes(i);

// Fronteiras terrestres e ligacoes (linhas brancas) lidas do tabuleiro
const EDGES = [
  ['Alasca', 'Mackenzie'], ['Alasca', 'Vancouver'], ['Alasca', 'Vladivostok'], ['Mackenzie', 'Vancouver'], ['Mackenzie', 'Ottawa'], ['Mackenzie', 'Groenlândia'],
  ['Vancouver', 'Ottawa'], ['Vancouver', 'Califórnia'], ['Ottawa', 'Califórnia'], ['Ottawa', 'Nova York'], ['Ottawa', 'Labrador'], ['Labrador', 'Nova York'], ['Labrador', 'Groenlândia'],
  ['Califórnia', 'Nova York'], ['Califórnia', 'México'], ['Nova York', 'México'], ['Nova York', 'Cuba'], ['México', 'Cuba'], ['México', 'Venezuela'], ['Cuba', 'Venezuela'], ['Groenlândia', 'Islândia'],
  ['Venezuela', 'Peru'], ['Venezuela', 'Brasil'], ['Peru', 'Brasil'], ['Peru', 'Argentina'], ['Brasil', 'Argentina'], ['Brasil', 'Argélia'],
  ['Islândia', 'Inglaterra'], ['Islândia', 'Suécia'], ['Inglaterra', 'Suécia'], ['Inglaterra', 'França'], ['Suécia', 'Alemanha'], ['Suécia', 'Moscou'], ['Alemanha', 'Moscou'],
  ['Alemanha', 'Polônia'], ['Alemanha', 'França'], ['Polônia', 'Moscou'], ['Polônia', 'França'], ['Polônia', 'Oriente Médio'], ['Moscou', 'Oriente Médio'], ['Moscou', 'Aral'], ['Moscou', 'Omsk'],
  ['França', 'Argélia'], ['França', 'Egito'], ['Polônia', 'Egito'],
  ['Argélia', 'Egito'], ['Argélia', 'Sudão'], ['Argélia', 'Congo'], ['Egito', 'Sudão'], ['Egito', 'Oriente Médio'], ['Sudão', 'Congo'], ['Sudão', 'África do Sul'], ['Congo', 'África do Sul'],
  ['Sudão', 'Madagascar'], ['África do Sul', 'Madagascar'],
  ['Aral', 'Omsk'], ['Aral', 'Dudinka'], ['Aral', 'China'], ['Aral', 'Índia'], ['Aral', 'Oriente Médio'], ['Omsk', 'Dudinka'], ['Dudinka', 'Sibéria'], ['Dudinka', 'Tchita'], ['Dudinka', 'Mongólia'],
  ['Sibéria', 'Tchita'], ['Sibéria', 'Vladivostok'], ['Tchita', 'Vladivostok'], ['Tchita', 'Mongólia'], ['Mongólia', 'China'], ['China', 'Vladivostok'], ['China', 'Índia'], ['China', 'Vietnã'],
  ['Índia', 'Vietnã'], ['Índia', 'Oriente Médio'], ['China', 'Japão'], ['Vladivostok', 'Japão'], ['Índia', 'Sumatra'], ['Vietnã', 'Bornéu'],
  ['Sumatra', 'Austrália'], ['Bornéu', 'Nova Guiné'], ['Bornéu', 'Austrália'], ['Nova Guiné', 'Austrália'],
];
const ADJ = TERRITORIES.map(() => []);
for (const [a, b] of EDGES) {
  if (idxOf[a] === undefined || idxOf[b] === undefined) throw new Error(`territorio desconhecido: ${a} / ${b}`);
  ADJ[idxOf[a]].push(idxOf[b]);
  ADJ[idxOf[b]].push(idxOf[a]);
}

/* ---------- cartas ----------
   ids 0..11: cartas de CE (uma por CE); 12..32: demais cartas de territorio (agrupamento provisorio); 33..60: numeradas (1, 2 ou 3). */
const OTHER_CARDS = [
  ['Alasca', 'Mackenzie'], ['Groenlândia', 'Labrador'], ['Vancouver', 'Califórnia'], ['México'], ['Cuba'],
  ['Venezuela', 'Peru'], ['Argentina'],
  ['Islândia', 'Suécia'], ['Polônia'], ['França'],
  ['Argélia', 'Sudão'], ['Congo'], ['Madagascar'],
  ['Aral', 'Omsk'], ['Dudinka', 'Sibéria'], ['Tchita', 'Vladivostok'], ['Mongólia'], ['Índia'], ['Vietnã'],
  ['Sumatra', 'Bornéu'], ['Nova Guiné'],
].map((names) => names.map((n) => idxOf[n]));
const NUM_VALUES = [...Array(10).fill(1), ...Array(9).fill(2), ...Array(9).fill(3)];
const CARDS = [
  ...CE.map((t) => ({ kind: 'ce', terrs: [t], value: 0 })),
  ...OTHER_CARDS.map((terrs) => ({ kind: 'terr', terrs, value: 0 })),
  ...NUM_VALUES.map((value) => ({ kind: 'num', terrs: [], value })),
];
const CARD_COUNT = CARDS.length; // 61
const isTerrCard = (id) => CARDS[id].kind !== 'num';

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
  // dado aereo: 3 faces lisas (0) e faces 1, 2 e 3
  air() {
    return [0, 0, 0, 1, 2, 3][this.int(6)];
  },
};

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- objetivos (provisorios: os 14 do War) ---------- */
// k: 'cont' (c = continentes, extra = mais um a escolha), 'terr' (n), 'terr2' (n com 2+ exercitos), 'ce' (n Centros Estrategicos), 'kill' (t = cor)
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
const FALLBACK_OBJECTIVE = { k: 'ce', n: 3 };

function objectiveText(o) {
  if (o.k === 'cont') return `Conquistar ${o.c.map((c) => CONTINENTS[c].name).join(' e ')}${o.extra ? ' e mais um continente à sua escolha' : ''}.`;
  if (o.k === 'terr') return `Conquistar ${o.n} territórios à sua escolha.`;
  if (o.k === 'terr2') return `Conquistar ${o.n} territórios e ocupar cada um com pelo menos 2 exércitos.`;
  if (o.k === 'ce') return `Conquistar ${o.n} Centros Estratégicos quaisquer.`;
  return `Destruir completamente os exércitos ${COLOR_PLURAL[o.t]}. Se forem eliminados por outro jogador, conquistar 24 territórios.`;
}

function dealObjectives(players) {
  // objetivos de eliminar cores que nao participam saem do sorteio
  const deck = [...CONQUER_OBJECTIVES, ...COLOR_NAME.slice(0, players).map((_, t) => ({ k: 'kill', t }))];
  for (let tries = 0; tries < 1000; tries++) {
    shuffle(deck);
    const hand = deck.slice(0, players);
    if (hand.every((o, seat) => !(o.k === 'kill' && o.t === seat))) return hand.map((o) => JSON.parse(JSON.stringify(o)));
  }
  return deck.slice(0, players).map((o, seat) => (o.k === 'kill' && o.t === seat ? { k: 'terr', n: 24 } : o));
}

const ownedBy = (s, seat) => s.owner.map((o, i) => (o === seat ? i : -1)).filter((i) => i >= 0);
const continentsOwned = (s, seat) => CONTINENTS.map((_, c) => TERRITORIES.every((t, i) => t.cont !== c || s.owner[i] === seat));

function objectiveFor(s, seat) {
  return s.reduced[seat] ? FALLBACK_OBJECTIVE : s.objectives[seat];
}

function objectiveDone(s, seat) {
  let o = objectiveFor(s, seat);
  const mine = ownedBy(s, seat);
  if (o.k === 'kill') {
    const t = o.t;
    if (!s.alive[t] && s.killedBy[t] === seat) return true;
    if (s.alive[t]) return false;
    o = { k: 'terr', n: 24 };
  }
  if (o.k === 'terr') return mine.length >= o.n;
  if (o.k === 'terr2') return mine.filter((i) => s.armies[i] >= 2).length >= o.n;
  if (o.k === 'ce') return mine.filter(isCE).length >= o.n;
  const owned = continentsOwned(s, seat);
  if (!o.c.every((c) => owned[c])) return false;
  return !o.extra || owned.some((has, c) => has && !o.c.includes(c));
}

/* ---------- estado ---------- */
function lobbyState(players = 0) {
  return { phase: 'lobby', players, owner: [], armies: [], objectives: [], reduced: [], hands: [], deck: [], discard: [], alive: [], killedBy: [], turn: 0, first: 0, dealer: 0, stage: 'place', pool: { free: 0, cont: [0, 0, 0, 0, 0, 0] }, opening: false, openLeft: 0, base: [], conquered: false, occupy: null, fresh: [], lastAttack: null, lastAir: null, ceLeft: [], ceDone: 0, winner: null, log: '' };
}

const setup = () => lobbyState(0);
const acceptsSeat = (s) => s.phase === 'lobby';
const seatJoined = (s, seat) => (s.phase === 'lobby' ? { ...s, players: Math.max(s.players, seat + 1) } : s);

function deal(players) {
  const owner = new Array(N).fill(-1);
  const armies = new Array(N).fill(0);
  const ces = shuffle(CE.slice());
  const dealt = players === 5 ? 10 : 12;
  for (let k = 0; k < dealt; k++) {
    owner[ces[k]] = k % players;
    armies[ces[k]] = 2;
  }
  const dealer = rng.int(players);
  const s = {
    phase: players === 5 ? 'ce5' : 'claim',
    players,
    owner,
    armies,
    objectives: dealObjectives(players),
    reduced: new Array(players).fill(false),
    hands: Array.from({ length: players }, () => []),
    deck: [],
    discard: [],
    alive: new Array(players).fill(true),
    killedBy: new Array(players).fill(null),
    turn: dealer,
    first: dealer,
    dealer,
    stage: 'place',
    pool: { free: 0, cont: [0, 0, 0, 0, 0, 0] },
    opening: false,
    openLeft: 0,
    base: new Array(players).fill(0),
    conquered: false,
    occupy: null,
    fresh: new Array(N).fill(0),
    lastAttack: null,
    lastAir: null,
    ceLeft: players === 5 ? ces.slice(10) : [],
    ceDone: 0,
    winner: null,
    log: '',
  };
  s.deck = shuffle(Array.from({ length: CARD_COUNT }, (_, i) => i));
  s.log = players === 5 ? 'Centros Estratégicos sorteados (2 vagas restantes): cada jogador escolhe um CE ou dois territórios.' : 'Centros Estratégicos sorteados. Cada jogador ocupa um território vago por vez.';
  if (players !== 5) s.log += ` ${COLOR_NAME[dealer]} começa a ocupar.`;
  return s;
}

const restart = (state) => (state.players >= MIN_PLAYERS ? deal(state.players) : state);

/* ---------- reforcos ---------- */
function reinforcement(s, seat) {
  const mine = ownedBy(s, seat);
  const cont = CONTINENTS.map((c, i) => {
    const n = mine.filter((t) => TERRITORIES[t].cont === i).length;
    const size = TERRITORIES.filter((t) => t.cont === i).length;
    return n === size ? c.total : n >= c.major ? c.maj : 0;
  });
  const ces = mine.filter(isCE);
  let free = Math.floor(mine.length / 2);
  const total = free + cont.reduce((a, b) => a + b, 0) + ces.length;
  if (total < 3) free += 3 - total;
  return { free, cont, ces };
}

const poolTotal = (p) => p.free + p.cont.reduce((a, b) => a + b, 0);

// Comeca a fase de reforcos de `seat`: exercito de cada CE (automatico) e bombardeiros para a base aerea.
function beginPlace(s, seat) {
  const r = reinforcement(s, seat);
  for (const t of r.ces) s.armies[t] += 1;
  const gain = Math.min(r.ces.length, PLANES - s.base[seat]);
  s.base[seat] += gain;
  s.pool = { free: r.free, cont: r.cont };
  s.stage = 'place';
  s.fresh = new Array(N).fill(0);
  s.conquered = false;
  s.occupy = null;
  s.log = `Vez de ${COLOR_NAME[seat]}: ${poolTotal(s.pool)} exércitos para colocar, ${r.ces.length} nos CEs e ${gain} bombardeiro${gain === 1 ? '' : 's'}.`;
}

function nextAlive(s, from) {
  let n = from;
  do n = (n + 1) % s.players; while (!s.alive[n]);
  return n;
}

function discardCards(s, cards) {
  s.discard.push(...cards);
  if (s.discard.length >= 10) {
    s.deck = shuffle(s.deck.concat(s.discard));
    s.discard = [];
  }
}

function drawCards(s, seat) {
  for (let k = 0; k < 3 && s.hands[seat].length < HAND_MAX; k++) {
    if (!s.deck.length && s.discard.length) {
      s.deck = shuffle(s.discard);
      s.discard = [];
    }
    if (!s.deck.length) break;
    s.hands[seat].push(s.deck.pop());
  }
}

function updateReduced(s) {
  for (let p = 0; p < s.players; p++) {
    if (s.alive[p] && !s.reduced[p] && s.owner.filter((o) => o === p).length === 1) s.reduced[p] = true;
  }
}

function finishIfWon(s, seat) {
  if (s.phase === 'ended') return true;
  const alive = s.alive.filter(Boolean).length;
  if (alive === 1 || objectiveDone(s, seat)) {
    s.phase = 'ended';
    s.winner = alive === 1 ? s.alive.indexOf(true) : seat;
    s.pool = { free: 0, cont: [0, 0, 0, 0, 0, 0] };
    s.log = `${COLOR_NAME[s.winner]} cumpriu o objetivo e venceu!`;
    return true;
  }
  return false;
}

function endTurn(s) {
  const seat = s.turn;
  if (s.conquered) drawCards(s, seat);
  s.turn = nextAlive(s, seat);
  s.conquered = false;
  s.occupy = null;
  s.fresh = new Array(N).fill(0);
  if (s.opening) {
    s.openLeft -= 1;
    if (s.openLeft <= 0) s.opening = false;
  }
  if (s.opening) {
    s.stage = 'attack';
    s.pool = { free: 0, cont: [0, 0, 0, 0, 0, 0] };
    s.log = `Vez de ${COLOR_NAME[s.turn]}: primeira rodada, pode atacar.`;
  } else beginPlace(s, s.turn);
  return s;
}

/* ---------- cartas ---------- */
const handCards = (s, seat, idx) => {
  if (!Array.isArray(idx) || !idx.length || new Set(idx).size !== idx.length || idx.some((i) => !Number.isInteger(i) || i < 0 || i >= s.hands[seat].length)) return null;
  return idx.map((i) => s.hands[seat][i]);
};
const takeCards = (s, seat, idx) => {
  const ids = idx.map((i) => s.hands[seat][i]);
  s.hands[seat] = s.hands[seat].filter((_, i) => !idx.includes(i));
  discardCards(s, ids);
};
// 1 carta de territorio + numeradas
function splitCards(ids) {
  const terr = ids.filter(isTerrCard);
  const nums = ids.filter((c) => !isTerrCard(c));
  return { terr, nums, bonus: nums.reduce((a, c) => a + CARDS[c].value, 0) };
}

/* ---------- combate aereo ---------- */
function airCombat(s, seat, target, planes) {
  const rec = { target, by: seat, planes, lostPlanes: 0, lostArmies: 0, rounds: 0 };
  let n = planes;
  for (let round = 0; round < 200 && n > 0 && s.armies[target] > 1; round++) {
    rec.rounds += 1;
    const def = rng.air();
    if (def > 0) {
      const k = Math.min(def, n);
      n -= k;
      rec.lostPlanes += k;
    }
    if (n <= 0) break;
    const att = rng.air();
    if (att > 0) {
      const k = Math.min(att, s.armies[target] - 1);
      s.armies[target] -= k;
      rec.lostArmies += k;
    }
  }
  return rec; // todos os bombardeiros voltam a caixa: base + caixa = 10
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
  if (!['ce5', 'claim', 'playing'].includes(state.phase)) return { error: 'A partida terminou. Use "Nova partida" para jogar outra.' };
  if (seat >= state.players || !state.alive[seat]) return { error: 'Você não está mais na partida.' };
  if (seat !== state.turn) return { error: 'Não é a sua vez.' };

  const s = JSON.parse(JSON.stringify(state));
  const own = (i) => Number.isInteger(i) && i >= 0 && i < N && s.owner[i] === seat;

  /* escolha especial com 5 jogadores */
  if (s.phase === 'ce5') {
    if (req.t !== 'ceChoose') return { error: 'Escolha um CE ou dois territórios.' };
    const remainingPlayers = s.players - s.ceDone;
    if (req.ce !== undefined) {
      if (!s.ceLeft.includes(req.ce)) return { error: 'Esse Centro Estratégico não está disponível.' };
      s.ceLeft = s.ceLeft.filter((c) => c !== req.ce);
      s.owner[req.ce] = seat;
      s.armies[req.ce] = 2;
    } else {
      if (s.ceLeft.length >= remainingPlayers) return { error: 'Restam só Centros Estratégicos para os últimos jogadores: escolha um deles.' };
      const t = req.terrs;
      if (!Array.isArray(t) || t.length !== 2 || t[0] === t[1] || t.some((i) => !Number.isInteger(i) || i < 0 || i >= N || s.owner[i] !== -1 || isCE(i))) return { error: 'Escolha 2 territórios vagos que não sejam CE.' };
      if (TERRITORIES[t[0]].cont === TERRITORIES[t[1]].cont) return { error: 'Os dois territórios devem ser de continentes diferentes.' };
      for (const i of t) { s.owner[i] = seat; s.armies[i] = 1; }
    }
    s.ceDone += 1;
    if (s.ceDone >= s.players) {
      s.phase = 'claim';
      s.turn = s.dealer;
      s.log = `Agora cada jogador ocupa um território vago por vez. ${COLOR_NAME[s.turn]} começa.`;
    } else {
      s.turn = (s.turn + 1) % s.players;
      s.log = `${COLOR_NAME[s.turn]} escolhe.`;
    }
    return { state: s };
  }

  /* ocupacao dos territorios vagos */
  if (s.phase === 'claim') {
    if (req.t !== 'claim') return { error: 'Ocupe um território vago.' };
    if (!Number.isInteger(req.i) || req.i < 0 || req.i >= N || s.owner[req.i] !== -1) return { error: 'Escolha um território vago.' };
    s.owner[req.i] = seat;
    s.armies[req.i] = 1;
    if (s.owner.every((o) => o !== -1)) {
      s.phase = 'playing';
      s.opening = true;
      s.first = nextAlive(s, seat);
      s.turn = s.first;
      beginPlace(s, s.turn);
      s.log = `Todos os territórios ocupados. Primeira rodada: todos reforçam e depois atacam. ${s.log}`;
    } else {
      s.turn = (seat + 1) % s.players;
      s.log = `${COLOR_NAME[s.turn]} ocupa um território.`;
    }
    return { state: s };
  }

  /* jogo */
  if (s.occupy) {
    if (req.t !== 'occupy') return { error: `Escolha quantos exércitos levar para ${TERRITORIES[s.occupy.to].name}.` };
    const n = req.n;
    if (!Number.isInteger(n) || n < 1 || n > s.occupy.max) return { error: `Leve de 1 a ${s.occupy.max} exércitos.` };
    const { from, to } = s.occupy;
    s.armies[from] -= n;
    s.armies[to] = n;
    s.occupy = null;
    finishIfWon(s, seat);
    return { state: s };
  }

  if (req.t === 'place') {
    if (s.stage !== 'place') return { error: 'A fase de reforços já passou.' };
    const plan = req.plan;
    if (!Array.isArray(plan) || !plan.length || plan.some((p) => !Array.isArray(p) || !own(p[0]) || !Number.isInteger(p[1]) || p[1] < 1)) return { error: 'Distribua os exércitos entre os seus territórios.' };
    const total = plan.reduce((a, p) => a + p[1], 0);
    const need = poolTotal(s.pool);
    if (total !== need) return { error: `Distribua exatamente ${need} exército${need === 1 ? '' : 's'} (você distribuiu ${total}).` };
    for (let c = 0; c < CONTINENTS.length; c++) {
      const inC = plan.filter((p) => TERRITORIES[p[0]].cont === c).reduce((a, p) => a + p[1], 0);
      if (inC < s.pool.cont[c]) return { error: `${s.pool.cont[c]} exército${s.pool.cont[c] === 1 ? '' : 's'} de ${CONTINENTS[c].name} deve${s.pool.cont[c] === 1 ? '' : 'm'} ficar nesse continente.` };
    }
    for (const [i, n] of plan) s.armies[i] += n;
    s.pool = { free: 0, cont: [0, 0, 0, 0, 0, 0] };
    if (s.opening) {
      const next = nextAlive(s, seat);
      if (next !== s.first) {
        s.turn = next;
        beginPlace(s, next);
        return { state: s };
      }
      s.turn = s.first;
      s.stage = 'attack';
      s.openLeft = s.alive.filter(Boolean).length;
      s.log = `Reforços da primeira rodada concluídos. ${COLOR_NAME[s.first]} ataca primeiro.`;
      return { state: s };
    }
    s.stage = 'attack';
    s.log = `${COLOR_NAME[seat]} reforçou. Hora de atacar.`;
    finishIfWon(s, seat);
    return { state: s };
  }

  /* cartas, a qualquer momento da propria jogada */
  if (req.t === 'cardArmy') {
    const ids = handCards(s, seat, req.cards);
    if (!ids) return { error: 'Escolha cartas da sua mão.' };
    const { terr, bonus } = splitCards(ids);
    if (terr.length !== 1) return { error: 'Use 1 carta de território (e, se quiser, cartas numeradas).' };
    if (!CARDS[terr[0]].terrs.includes(req.terr) || !own(req.terr)) return { error: 'Escolha um território da carta que seja seu.' };
    s.armies[req.terr] += 1 + bonus;
    takeCards(s, seat, req.cards);
    s.log = `${COLOR_NAME[seat]} trocou cartas por ${1 + bonus} exército${bonus ? 's' : ''} em ${TERRITORIES[req.terr].name}.`;
    finishIfWon(s, seat);
    return { state: s };
  }

  if (req.t === 'cardAir') {
    if (s.stage === 'shift') return { error: 'O deslocamento já começou.' };
    const ids = handCards(s, seat, req.cards);
    if (!ids) return { error: 'Escolha cartas da sua mão.' };
    const { terr, bonus } = splitCards(ids);
    if (terr.length !== 1) return { error: 'Use 1 carta de território inimigo (e, se quiser, cartas numeradas).' };
    const t = req.terr;
    if (!CARDS[terr[0]].terrs.includes(t) || s.owner[t] === seat || s.owner[t] < 0) return { error: 'Escolha um território da carta que seja de um adversário.' };
    if (s.armies[t] < 2) return { error: 'O território atacado precisa ter 2 ou mais exércitos.' };
    const n = 1 + bonus;
    if (PLANES - s.base[seat] < n) return { error: `Faltam bombardeiros na caixa (preciso de ${n}, há ${PLANES - s.base[seat]}).` };
    takeCards(s, seat, req.cards);
    s.lastAir = airCombat(s, seat, t, n);
    s.log = `${COLOR_NAME[seat]} atacou ${TERRITORIES[t].name} pelo ar com ${n} bombardeiro${n === 1 ? '' : 's'}: −${s.lastAir.lostArmies} exércitos, −${s.lastAir.lostPlanes} aviões.`;
    return { state: s };
  }

  if (req.t === 'cardMove') {
    const ids = handCards(s, seat, req.cards);
    if (!ids || ids.length !== 2 || !ids.every(isTerrCard)) return { error: 'Use 2 cartas de território.' };
    const { from, to, n } = req;
    if (!own(from) || !own(to) || from === to || !CARDS[ids[0]].terrs.includes(from) || !CARDS[ids[1]].terrs.includes(to)) return { error: 'A 1ª carta indica a origem e a 2ª o destino, ambos seus.' };
    if (!Number.isInteger(n) || n < 1 || n > s.armies[from] - 1) return { error: 'Número de exércitos inválido (sempre fica 1 na origem).' };
    s.armies[from] -= n;
    s.armies[to] += n;
    takeCards(s, seat, req.cards);
    s.log = `${COLOR_NAME[seat]} transportou ${n} exército${n === 1 ? '' : 's'} de ${TERRITORIES[from].name} para ${TERRITORIES[to].name}.`;
    finishIfWon(s, seat);
    return { state: s };
  }

  if (req.t === 'discard') {
    const idx = req.cards;
    if (!handCards(s, seat, idx)) return { error: 'Escolha cartas da sua mão.' };
    takeCards(s, seat, idx);
    s.log = `${COLOR_NAME[seat]} descartou ${idx.length} carta${idx.length === 1 ? '' : 's'}.`;
    return { state: s };
  }

  if (s.stage === 'place') return { error: 'Primeiro distribua os reforços.' };

  if (req.t === 'attack') {
    if (s.stage !== 'attack') return { error: 'A fase de ataques já passou.' };
    const { from, to } = req;
    if (!own(from)) return { error: 'Ataque a partir de um território seu.' };
    if (!Number.isInteger(to) || to < 0 || to >= N || s.owner[to] === seat) return { error: 'Escolha um território inimigo.' };
    if (!ADJ[from].includes(to)) return { error: 'Os territórios não são vizinhos nem ligados por uma linha.' };
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
      const max = Math.max(1, Math.min(dice, s.armies[from] - 1));
      s.owner[to] = seat;
      s.armies[to] = 0;
      s.occupy = { from, to, max };
      s.conquered = true;
      rec.moved = null;
      s.log = `${COLOR_NAME[seat]} conquistou ${TERRITORIES[to].name}! Escolha quantos exércitos levar (1 a ${max}).`;
      if (!s.owner.includes(defender)) {
        s.alive[defender] = false;
        s.killedBy[defender] = seat;
        s.hands[seat].push(...s.hands[defender]);
        s.hands[defender] = [];
        s.base[defender] = 0;
        s.log += ` Os ${COLOR_PLURAL[defender]} foram eliminados.`;
      }
    } else {
      s.log = `${COLOR_NAME[seat]} atacou ${TERRITORIES[to].name}: perdeu ${rec.lossA}, causou ${rec.lossD}.`;
    }
    s.lastAttack = rec;
    updateReduced(s);
    if (!rec.conquered) finishIfWon(s, seat);
    return { state: s };
  }

  if (req.t === 'air') {
    if (s.stage !== 'attack') return { error: 'A fase de ataques já passou.' };
    const t = req.target;
    const n = req.n;
    if (!Number.isInteger(t) || t < 0 || t >= N || s.owner[t] === seat || s.owner[t] < 0) return { error: 'Escolha um território de um adversário.' };
    if (s.armies[t] < 2) return { error: 'O território atacado precisa ter 2 ou mais exércitos.' };
    if (!Number.isInteger(n) || n < 1 || n > s.base[seat]) return { error: `Escolha de 1 a ${s.base[seat]} bombardeiros da base aérea.` };
    s.base[seat] -= n;
    s.lastAir = airCombat(s, seat, t, n);
    s.log = `${COLOR_NAME[seat]} atacou ${TERRITORIES[t].name} pelo ar com ${n} bombardeiro${n === 1 ? '' : 's'}: −${s.lastAir.lostArmies} exércitos, −${s.lastAir.lostPlanes} aviões.`;
    return { state: s };
  }

  if (req.t === 'shift') {
    const { from, to, n } = req;
    if (!own(from) || !own(to) || from === to) return { error: 'Mova exércitos entre dois territórios seus.' };
    if (!ADJ[from].includes(to) && !(isCE(from) && isCE(to))) return { error: 'Só entre territórios vizinhos ou, por aerotransporte, entre dois CEs.' };
    const free = s.armies[from] - 1 - s.fresh[from];
    if (!Number.isInteger(n) || n < 1 || n > free) return { error: `Pode mover de 1 a ${Math.max(free, 0)} (fica 1 de ocupação e quem acabou de chegar não se move de novo).` };
    s.armies[from] -= n;
    s.armies[to] += n;
    s.fresh[to] += n;
    s.stage = 'shift';
    s.log = `${COLOR_NAME[seat]} deslocou ${n} exército${n === 1 ? '' : 's'} de ${TERRITORIES[from].name} para ${TERRITORIES[to].name}.`;
    finishIfWon(s, seat);
    return { state: s };
  }

  if (req.t === 'end') {
    if (s.hands[seat].length > HAND_MAX) return { error: `Use ou descarte cartas até ficar com ${HAND_MAX}.` };
    if (finishIfWon(s, seat)) return { state: s };
    endTurn(s);
    return { state: s };
  }

  return { error: 'Jogada inválida.' };
}

/* ---------- visoes ---------- */
function view(state) {
  const ended = state.phase === 'ended';
  const mapped = state.owner.length > 0;
  const live = ['ce5', 'claim', 'playing'].includes(state.phase);
  return {
    phase: state.phase,
    players: state.players,
    owner: state.owner,
    armies: state.armies,
    turn: live ? state.turn : null,
    stage: state.stage,
    opening: state.opening,
    pool: state.pool,
    air: state.base,
    cards: state.hands.map((h) => h.length),
    terr: mapped ? Array.from({ length: state.players }, (_, p) => state.owner.filter((o) => o === p).length) : [],
    alive: state.alive,
    ceLeft: state.ceLeft,
    occupy: state.occupy,
    lastAttack: state.lastAttack,
    lastAir: state.lastAir,
    conquered: state.conquered,
    winner: state.winner,
    reveal: ended ? state.objectives.map((o, seat) => objectiveText(objectiveFor(state, seat))) : null,
    log: state.log,
    draw: false,
    over: ended,
  };
}

function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby' || seat >= state.players) return null;
  const mine = ['ce5', 'claim', 'playing'].includes(state.phase) && state.turn === seat && state.alive[seat];
  const hand = state.hands[seat];
  const playing = state.phase === 'playing';
  return {
    objective: objectiveText(objectiveFor(state, seat)),
    done: objectiveDone(state, seat),
    hand: hand.map((id) => ({ id, kind: CARDS[id].kind, terrs: CARDS[id].terrs, value: CARDS[id].value })),
    box: PLANES - state.base[seat],
    owned: ownedBy(state, seat).length,
    canPlace: mine && playing && state.stage === 'place' && !state.occupy,
    canAttack: mine && playing && state.stage === 'attack' && !state.occupy,
    canShift: mine && playing && state.stage !== 'place' && !state.occupy,
    mustOccupy: mine && !!state.occupy,
    mustDiscard: mine && hand.length > HAND_MAX,
    canCards: mine && playing && !state.occupy,
    freeShift: state.fresh.map((f, i) => (state.owner[i] === seat ? Math.max(0, state.armies[i] - 1 - f) : 0)),
    reinforce: playing ? (() => { const r = reinforcement(state, seat); return poolTotal(r) + r.ces.length; })() : 0,
  };
}

// Piloto automatico: ocupa o primeiro territorio vago, reforca sem cuidado, leva todos os exercitos na conquista e encerra o turno.
function waitingOn(state) {
  return ['ce5', 'claim', 'playing'].includes(state.phase) ? [state.turn] : [];
}

function autoMove(state, seat) {
  if (state.phase === 'ce5') {
    if (state.ceLeft.length) return { t: 'ceChoose', ce: state.ceLeft[0] };
    const vacant = state.owner.map((o, i) => (o === -1 && !isCE(i) ? i : -1)).filter((i) => i >= 0);
    for (const a of vacant) for (const b of vacant) if (TERRITORIES[a].cont !== TERRITORIES[b].cont) return { t: 'ceChoose', terrs: [a, b] };
    return null;
  }
  if (state.phase === 'claim') {
    const i = state.owner.indexOf(-1);
    return i < 0 ? null : { t: 'claim', i };
  }
  if (state.occupy) return { t: 'occupy', n: state.occupy.max };
  if (state.hands[seat].length > HAND_MAX) return { t: 'discard', cards: Array.from({ length: state.hands[seat].length - HAND_MAX }, (_, i) => i) };
  if (state.stage === 'place') {
    const mine = ownedBy(state, seat);
    const plan = [];
    state.pool.cont.forEach((n, c) => {
      const t = mine.find((i) => TERRITORIES[i].cont === c);
      if (n > 0 && t !== undefined) plan.push([t, n]);
    });
    if (state.pool.free > 0) plan.push([mine[0], state.pool.free]);
    return plan.length ? { t: 'place', plan } : { t: 'end' };
  }
  return { t: 'end' };
}

export default {
  id: 'war2',
  name: 'War II',
  description: 'War II (Grow): Centros Estratégicos, bombardeiros, cartas e objetivos secretos. De 3 a 6 jogadores.',
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
  _map: { territories: TERRITORIES, adj: ADJ, continents: CONTINENTS, ce: CE, cards: CARDS },
  _rng: rng,
  _deal: deal,
  _reinforcement: reinforcement,
  _objectiveDone: objectiveDone,
  _airCombat: airCombat,
};
