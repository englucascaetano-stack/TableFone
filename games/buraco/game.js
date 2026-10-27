'use strict';
// Buraco (2 jogadores, ou 4 em duplas: assentos 0 e 2 contra 1 e 3).
// 2 baralhos + 4 coringas (108 cartas). Cada jogador recebe 11 cartas; ha 2 "mortos" de 11 cartas.
//
// Regras adotadas (confira se coincidem com as da sua mesa):
//  - Jogos: somente SEQUENCIAS do mesmo naipe, com 3 ou mais cartas. A pode ser baixo (A-2-3) ou alto (Q-K-A).
//  - Coringas: os "2" e os coringas (JK). No maximo 1 coringa por jogo; um 2 do mesmo naipe na sua posicao natural
//    (A-2-3) e carta comum, nao coringa.
//  - Canastra: jogo com 7 ou mais cartas. Limpa (sem coringa) = 200; suja = 100; real (limpa de A a K) = 500.
//  - Turno: comprar do monte OU pegar todo o descarte (buraco aberto); baixar jogos (novos ou ampliando os da dupla);
//    descartar uma carta.
//  - Ao ficar sem cartas, a dupla pega um morto e continua. Sem morto, so pode "bater" (encerrar) quem tem canastra.
//  - Fim da rodada: alguem bate, ou o monte acaba (a rodada termina apos o descarte de quem comprou a ultima carta). Pontos: valor das cartas baixadas + canastras + 100 de quem bate
//    - valor das cartas na mao - 100 se a dupla nao pegou o morto. Cartas: A 15, 2 20, 3 a 7 = 5, 8 a K = 10, coringa 50.
//  - O jogo termina quando uma dupla soma 3000 pontos ou mais.

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const HAND = 11;
const TARGET = 3000;

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

function newDeck() {
  const d = [];
  for (let k = 0; k < 2; k++) for (const s of SUITS) for (const r of RANKS) d.push(`${r}${s}`);
  d.push('JK', 'JK', 'JK', 'JK');
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const rankOf = (c) => (c === 'JK' ? 'JK' : c.slice(0, -1));
const suitOf = (c) => (c === 'JK' ? null : c.slice(-1));
const teamOf = (seat, players) => (players === 2 ? seat : seat % 2);

function points(card) {
  const r = rankOf(card);
  if (r === 'JK') return 50;
  if (r === 'A') return 15;
  if (r === '2') return 20;
  if (['J', 'Q', 'K', '8', '9', '10'].includes(r)) return 10;
  return 5;
}

const posOf = (rank, ace) => (rank === 'A' ? (ace === 'high' ? 14 : 1) : rank === 'J' ? 11 : rank === 'Q' ? 12 : rank === 'K' ? 13 : Number(rank));

// Organiza as cartas como sequencia valida (ou devolve null). Retorna { cards (em ordem), wildAt, suit }.
function arrange(cards) {
  if (cards.length < 3 || cards.length > 14) return null;
  const wildCandidates = [];
  cards.forEach((c, i) => {
    if (c === 'JK' || rankOf(c) === '2') wildCandidates.push(i);
  });
  for (const w of [null, ...wildCandidates]) {
    const naturals = cards.filter((_, i) => i !== w);
    if (naturals.some((c) => c === 'JK')) continue;
    const suit = suitOf(naturals[0]);
    if (naturals.some((c) => suitOf(c) !== suit)) continue;
    for (const ace of ['low', 'high']) {
      const items = naturals.map((c) => ({ card: c, pos: posOf(rankOf(c), ace) })).sort((a, b) => a.pos - b.pos);
      const pos = items.map((x) => x.pos);
      if (new Set(pos).size !== pos.length) continue;
      const min = pos[0];
      const max = pos[pos.length - 1];
      const gaps = max - min + 1 - pos.length;
      let wildPos = null;
      if (w === null) {
        if (gaps !== 0) continue;
      } else if (gaps > 1) {
        continue;
      } else if (gaps === 1) {
        for (let p = min; p <= max; p++) if (!pos.includes(p)) wildPos = p;
      } else if (min > 1) wildPos = min - 1;
      else if (max < 14) wildPos = max + 1;
      else continue;
      const all = items.slice();
      if (w !== null) all.push({ card: cards[w], pos: wildPos, wild: true });
      all.sort((a, b) => a.pos - b.pos);
      const wildAt = all.findIndex((x) => x.wild);
      return { cards: all.map((x) => x.card), wildAt: wildAt < 0 ? null : wildAt, suit };
    }
  }
  return null;
}

const isCanastra = (m) => m.cards.length >= 7;
const canastraBonus = (m) => (!isCanastra(m) ? 0 : m.wildAt === null ? (m.cards.length >= 13 ? 500 : 200) : 100);

const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 };
const RANK_ORDER = Object.fromEntries(RANKS.map((r, i) => [r, i]));
function sortHand(h) {
  return h.sort((a, b) => {
    if (a === 'JK' || b === 'JK') return a === b ? 0 : a === 'JK' ? 1 : -1;
    return SUIT_ORDER[suitOf(a)] - SUIT_ORDER[suitOf(b)] || RANK_ORDER[rankOf(a)] - RANK_ORDER[rankOf(b)];
  });
}

function lobbyState(joined = 0) {
  return { phase: 'lobby', players: joined, joined, hands: [], stock: [], discard: [], dead: [], deadTaken: [false, false], melds: [[], []], turn: 0, stage: 'draw', first: 0, totals: [0, 0], roundScores: null, winner: null, log: '' };
}

const setup = () => lobbyState(0);
const acceptsSeat = (s) => s.phase === 'lobby';
const seatJoined = (s, seat) => (s.phase === 'lobby' ? { ...s, joined: Math.max(s.joined, seat + 1), players: Math.max(s.players, seat + 1) } : s);

function dealRound(prev, players, first, totals) {
  const deck = newDeck();
  const hands = [];
  for (let i = 0; i < players; i++) hands.push(sortHand(deck.splice(0, HAND)));
  const dead = [deck.splice(0, HAND), deck.splice(0, HAND)];
  const discard = [deck.pop()];
  return {
    ...prev,
    phase: 'playing',
    players,
    hands,
    stock: deck,
    discard,
    dead,
    deadTaken: [false, false],
    melds: [[], []],
    turn: first,
    stage: 'draw',
    first,
    totals,
    roundScores: null,
    winner: null,
    log: 'Nova rodada.',
  };
}

function restart(state) {
  if (state.players < 2) return state;
  const decided = state.winner !== null;
  const totals = decided || state.phase === 'lobby' ? [0, 0] : state.totals;
  return dealRound(state, state.players, (state.first + 1) % state.players, totals);
}

function scoreRound(s, batedTeam, why) {
  const players = s.players;
  const scores = [0, 0];
  const detail = [0, 1].map((t) => ({ melded: 0, canastras: 0, bater: 0, hand: 0, morto: 0, total: 0 }));
  for (let t = 0; t < 2; t++) {
    for (const m of s.melds[t]) {
      detail[t].melded += m.cards.reduce((a, c) => a + points(c), 0);
      detail[t].canastras += canastraBonus(m);
    }
    if (batedTeam === t) detail[t].bater = 100;
    if (!s.deadTaken[t]) detail[t].morto = -100;
  }
  s.hands.forEach((h, seat) => {
    detail[teamOf(seat, players)].hand -= h.reduce((a, c) => a + points(c), 0);
  });
  for (let t = 0; t < 2; t++) {
    const d = detail[t];
    d.total = d.melded + d.canastras + d.bater + d.hand + d.morto;
    scores[t] = d.total;
  }
  s.roundScores = detail;
  s.totals = [s.totals[0] + scores[0], s.totals[1] + scores[1]];
  s.phase = 'roundEnd';
  if (Math.max(...s.totals) >= TARGET && s.totals[0] !== s.totals[1]) s.winner = s.totals[0] > s.totals[1] ? 0 : 1;
  s.log = why;
  return s;
}

const removeCards = (hand, cards) => {
  const copy = hand.slice();
  for (const c of cards) {
    const i = copy.indexOf(c);
    if (i < 0) return null;
    copy.splice(i, 1);
  }
  return copy;
};

// Se a mao zerou: pega o morto (se a dupla ainda pode) ou bate (se tem canastra); senao a jogada e recusada.
function handEmptied(s, seat, how) {
  const team = teamOf(seat, s.players);
  if (!s.deadTaken[team] && s.dead.length > 0) {
    s.hands[seat] = sortHand(s.dead.shift());
    s.deadTaken[team] = true;
    s.log = 'Pegou o morto.';
    return { continueTurn: how === 'meld' };
  }
  if (s.melds[team].some(isCanastra)) {
    scoreRound(s, team, `Equipe ${team + 1} bateu!`);
    return { ended: true };
  }
  return { error: 'Sem morto e sem canastra não é possível ficar sem cartas.' };
}

function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    if (req.players !== 2 && req.players !== 4) return { error: 'O buraco é jogado em 2 ou 4 jogadores.' };
    if (req.players > state.joined) return { error: `Há apenas ${state.joined} jogador(es) na sala.` };
    return { state: dealRound({ ...state, joined: state.joined }, req.players, 0, [0, 0]) };
  }
  if (state.phase !== 'playing') return { error: 'A rodada terminou. Use "Nova partida" para jogar outra.' };
  if (seat >= state.players) return { error: 'Você não está jogando esta partida.' };
  if (seat !== state.turn) return { error: 'Não é a sua vez.' };

  const s = JSON.parse(JSON.stringify(state));
  const team = teamOf(seat, s.players);
  const hand = s.hands[seat];

  if (s.stage === 'draw') {
    if (req.t === 'draw') {
      if (!s.stock.length) return { state: scoreRound(s, null, 'O monte acabou. Fim da rodada.') };
      hand.push(s.stock.pop());
      sortHand(hand);
      s.stage = 'play';
      s.log = 'Comprou do monte.';
      return { state: s };
    }
    if (req.t === 'take') {
      if (!s.discard.length) return { error: 'O descarte está vazio.' };
      const n = s.discard.length;
      hand.push(...s.discard);
      s.discard = [];
      sortHand(hand);
      s.stage = 'play';
      s.log = `Pegou o descarte (${n} carta${n > 1 ? 's' : ''}).`;
      return { state: s };
    }
    return { error: 'Primeiro compre do monte ou pegue o descarte.' };
  }

  // stage === 'play'
  if (req.t === 'meld') {
    const cards = req.cards;
    if (!Array.isArray(cards) || cards.length === 0 || cards.some((c) => typeof c !== 'string')) return { error: 'Escolha as cartas do jogo.' };
    const rest = removeCards(hand, cards);
    if (!rest) return { error: 'Você não tem essas cartas.' };
    const target = req.target === null || req.target === undefined ? null : Number(req.target);
    let arranged;
    if (target === null) {
      arranged = arrange(cards);
      if (!arranged) return { error: 'Isso não é uma sequência válida (mesmo naipe, 3 ou mais cartas seguidas, no máximo 1 coringa).' };
    } else {
      const m = s.melds[team][target];
      if (!m) return { error: 'Jogo não encontrado.' };
      arranged = arrange(m.cards.concat(cards));
      if (!arranged) return { error: 'Essas cartas não se encaixam nesse jogo.' };
    }
    const guardLeft = rest.length;
    if (guardLeft === 1) {
      // exige poder descartar a ultima carta (morto disponivel ou canastra) depois de baixar
      const willHaveCanastra = s.melds[team].some((m, i) => (i === target ? arranged.cards.length >= 7 : isCanastra(m))) || (target === null && arranged.cards.length >= 7);
      const morto = !s.deadTaken[team] && s.dead.length > 0;
      if (!morto && !willHaveCanastra) return { error: 'Deixe ao menos 2 cartas: sem morto e sem canastra você não pode ficar sem cartas.' };
    }
    s.hands[seat] = rest;
    if (target === null) s.melds[team].push({ cards: arranged.cards, wildAt: arranged.wildAt, suit: arranged.suit });
    else s.melds[team][target] = { cards: arranged.cards, wildAt: arranged.wildAt, suit: arranged.suit };
    s.log = 'Baixou um jogo.';
    if (rest.length === 0) {
      const r = handEmptied(s, seat, 'meld');
      if (r.error) return { error: r.error };
    }
    return { state: s };
  }

  if (req.t === 'discard') {
    const i = hand.indexOf(req.card);
    if (typeof req.card !== 'string' || i < 0) return { error: 'Você não tem essa carta.' };
    hand.splice(i, 1);
    s.discard.push(req.card);
    s.log = 'Descartou.';
    if (hand.length === 0) {
      const r = handEmptied(s, seat, 'discard');
      if (r.error) return { error: r.error };
      if (r.ended) return { state: s };
    }
    if (s.stock.length === 0) return { state: scoreRound(s, null, 'O monte acabou. Fim da rodada.') };
    s.turn = (seat + 1) % s.players;
    s.stage = 'draw';
    return { state: s };
  }

  return { error: 'Jogada inválida.' };
}

function view(state) {
  return {
    phase: state.phase,
    players: state.players,
    joined: state.joined,
    turn: state.phase === 'playing' ? state.turn : null,
    stage: state.stage,
    stockCount: state.stock.length,
    discardTop: state.discard.length ? state.discard[state.discard.length - 1] : null,
    discardCount: state.discard.length,
    deadLeft: state.dead.length,
    deadTaken: state.deadTaken,
    counts: state.hands.map((h) => h.length),
    melds: state.melds,
    totals: state.totals,
    roundScores: state.roundScores,
    winner: state.winner,
    target: TARGET,
    log: state.log,
    draw: false,
    over: state.phase === 'roundEnd',
  };
}

function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby' || seat >= state.players) return null;
  const mine = state.phase === 'playing' && seat === state.turn;
  return {
    hand: state.hands[seat],
    team: teamOf(seat, state.players),
    canDraw: mine && state.stage === 'draw' && state.stock.length > 0,
    canTake: mine && state.stage === 'draw' && state.discard.length > 0,
    canEnd: mine && state.stage === 'draw' && state.stock.length === 0 && state.discard.length === 0,
    canPlay: mine && state.stage === 'play',
  };
}

module.exports = {
  id: 'buraco',
  name: 'Buraco',
  description: 'Buraco com 2 baralhos, em dupla ou individual: sequências, canastras e mortos.',
  minPlayers: 2,
  maxPlayers: 4,
  roles: ['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 4'],
  setup,
  acceptsSeat,
  seatJoined,
  restart,
  move,
  view,
  viewFor,
  _arrange: arrange,
  _points: points,
  _dealRound: dealRound,
  _score: scoreRound,
};
