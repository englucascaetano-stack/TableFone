'use strict';
// Caxeta (Cacheta), 2 a 6 jogadores. 2 baralhos + 4 coringas (108 cartas); 9 cartas por jogador.
//
// Regras adotadas (confira se coincidem com as da sua mesa):
//  - No turno: compre do monte OU pegue a carta do topo do descarte; depois descarte 1 carta (volta a 9 na mao).
//  - Bate quem, depois de comprar, consegue descartar 1 carta e organizar as 9 restantes em jogos de 3 ou mais cartas,
//    usando todas (ex.: 3+3+3, 4+5, 3+6 ou 9).
//  - Jogo = sequencia do mesmo naipe (A baixo ou alto, sem dar a volta) OU trinca/quadra (mesmo valor, naipes diferentes).
//  - Coringa (JK) substitui qualquer carta; no maximo 1 por jogo. O 2 e carta comum.
//  - Se o monte acabar, o descarte (menos o topo) e reembaralhado. Sem cartas em nenhum dos dois, a rodada empata.

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const HAND = 9;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

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

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newDeck() {
  const d = [];
  for (let k = 0; k < 2; k++) for (const s of SUITS) for (const r of RANKS) d.push(`${r}${s}`);
  d.push('JK', 'JK', 'JK', 'JK');
  return shuffle(d);
}

const rankOf = (c) => (c === 'JK' ? 'JK' : c.slice(0, -1));
const suitOf = (c) => (c === 'JK' ? null : c.slice(-1));
const posOf = (rank, ace) => (rank === 'A' ? (ace === 'high' ? 14 : 1) : rank === 'J' ? 11 : rank === 'Q' ? 12 : rank === 'K' ? 13 : Number(rank));

function validSequence(nat, jokers) {
  const suit = suitOf(nat[0]);
  if (nat.some((c) => suitOf(c) !== suit)) return false;
  for (const ace of ['low', 'high']) {
    const pos = nat.map((c) => posOf(rankOf(c), ace)).sort((a, b) => a - b);
    if (new Set(pos).size !== pos.length) continue;
    const min = pos[0];
    const max = pos[pos.length - 1];
    const gaps = max - min + 1 - pos.length;
    if (gaps > jokers) continue;
    if (gaps < jokers && !(min > 1 || max < 14)) continue; // coringa sobrando precisa de espaco nas pontas
    return true;
  }
  return false;
}

function validGroup(cards) {
  const jokers = cards.filter((c) => c === 'JK').length;
  const nat = cards.filter((c) => c !== 'JK');
  if (cards.length < 3 || jokers > 1 || nat.length < 2) return false;
  const r0 = rankOf(nat[0]);
  if (nat.every((c) => rankOf(c) === r0)) {
    if (new Set(nat.map(suitOf)).size === nat.length && cards.length <= 4) return true; // trinca ou quadra
  }
  return validSequence(nat, jokers);
}

// Divide todas as cartas em jogos validos (ou null).
function partition(cards) {
  if (cards.length === 0) return [];
  if (cards.length < 3) return null;
  const first = cards[0];
  const rest = cards.slice(1);
  const n = rest.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    let bits = 0;
    for (let m = mask; m; m &= m - 1) bits++;
    if (bits < 2) continue;
    const group = [first];
    const remaining = [];
    for (let i = 0; i < n; i++) (mask & (1 << i) ? group : remaining).push(rest[i]);
    if (!validGroup(group)) continue;
    const tail = partition(remaining);
    if (tail) return [group, ...tail];
  }
  return null;
}

// Cartas que, descartadas da mao de 10, deixam 9 cartas organizaveis em jogos.
function batidas(hand) {
  const out = [];
  for (const c of new Set(hand)) {
    const rest = hand.slice();
    rest.splice(rest.indexOf(c), 1);
    if (partition(rest)) out.push(c);
  }
  return out;
}

const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 };
const RANK_ORDER = Object.fromEntries(RANKS.map((r, i) => [r, i]));
const sortHand = (h) =>
  h.sort((a, b) => {
    if (a === 'JK' || b === 'JK') return a === b ? 0 : a === 'JK' ? 1 : -1;
    return SUIT_ORDER[suitOf(a)] - SUIT_ORDER[suitOf(b)] || RANK_ORDER[rankOf(a)] - RANK_ORDER[rankOf(b)];
  });

function lobbyState(players = 0) {
  return { phase: 'lobby', players, hands: [], stock: [], discard: [], turn: 0, stage: 'draw', first: 0, wins: [], winner: null, groups: null, log: '' };
}

const setup = () => lobbyState(0);
const acceptsSeat = (s) => s.phase === 'lobby';
const seatJoined = (s, seat) => (s.phase === 'lobby' ? { ...s, players: Math.max(s.players, seat + 1) } : s);

function deal(prev, first) {
  const n = prev.players;
  const deck = newDeck();
  const hands = [];
  for (let i = 0; i < n; i++) hands.push(sortHand(deck.splice(0, HAND)));
  const wins = prev.wins && prev.wins.length === n ? prev.wins : new Array(n).fill(0);
  return { ...prev, phase: 'playing', hands, stock: deck, discard: [deck.pop()], turn: first, first, stage: 'draw', wins, winner: null, groups: null, log: 'Nova rodada.' };
}

function restart(state) {
  if (state.players < MIN_PLAYERS) return state;
  return deal(state, (state.first + 1) % state.players);
}

function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    if (state.players < MIN_PLAYERS) return { error: 'São necessários pelo menos 2 jogadores.' };
    return { state: deal(state, 0) };
  }
  if (state.phase !== 'playing') return { error: 'A rodada terminou. Use "Nova partida" para jogar outra.' };
  if (seat !== state.turn) return { error: 'Não é a sua vez.' };

  const s = JSON.parse(JSON.stringify(state));
  const hand = s.hands[seat];

  if (s.stage === 'draw') {
    if (req.t === 'draw') {
      if (!s.stock.length) {
        if (s.discard.length > 1) {
          const top = s.discard.pop();
          s.stock = shuffle(s.discard);
          s.discard = [top];
        } else {
          s.phase = 'ended';
          s.log = 'Acabaram as cartas: rodada empatada.';
          return { state: s };
        }
      }
      hand.push(s.stock.pop());
      sortHand(hand);
      s.stage = 'play';
      s.log = 'Comprou do monte.';
      return { state: s };
    }
    if (req.t === 'take') {
      if (!s.discard.length) return { error: 'O descarte está vazio.' };
      hand.push(s.discard.pop());
      sortHand(hand);
      s.stage = 'play';
      s.log = 'Pegou a carta do descarte.';
      return { state: s };
    }
    return { error: 'Primeiro compre do monte ou pegue a carta do descarte.' };
  }

  if (req.t === 'discard') {
    const i = hand.indexOf(req.card);
    if (typeof req.card !== 'string' || i < 0) return { error: 'Você não tem essa carta.' };
    hand.splice(i, 1);
    s.discard.push(req.card);
    s.turn = (seat + 1) % s.players;
    s.stage = 'draw';
    s.log = 'Descartou.';
    return { state: s };
  }

  if (req.t === 'bater') {
    const options = batidas(hand);
    if (!options.length) return { error: 'Suas cartas ainda não formam jogos para bater.' };
    const card = options.includes(req.card) ? req.card : options[0];
    hand.splice(hand.indexOf(card), 1);
    s.discard.push(card);
    s.groups = partition(hand);
    s.phase = 'ended';
    s.winner = seat;
    s.wins = s.wins.slice();
    s.wins[seat] += 1;
    s.log = 'Bateu!';
    return { state: s };
  }

  return { error: 'Jogada inválida.' };
}

function view(state) {
  const ended = state.phase === 'ended';
  return {
    phase: state.phase,
    players: state.players,
    turn: state.phase === 'playing' ? state.turn : null,
    stage: state.stage,
    stockCount: state.stock.length,
    discardTop: state.discard.length ? state.discard[state.discard.length - 1] : null,
    counts: state.hands.map((h) => h.length),
    wins: state.wins,
    winner: state.winner,
    groups: ended ? state.groups : null,
    reveal: ended ? state.hands : null, // no fim, todas as maos ficam visiveis
    log: state.log,
    draw: false,
    over: ended,
  };
}

function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby') return null;
  const mine = state.phase === 'playing' && seat === state.turn;
  const hand = state.hands[seat];
  return {
    hand,
    canDraw: mine && state.stage === 'draw',
    canTake: mine && state.stage === 'draw' && state.discard.length > 0,
    canDiscard: mine && state.stage === 'play',
    canBater: mine && state.stage === 'play' && batidas(hand).length > 0,
  };
}

// Piloto automatico: compra do monte e descarta a carta menos util. Nunca bate (quem esta ausente nao vence).
function waitingOn(state) {
  return state.phase === 'playing' ? [state.turn] : [];
}

function usefulness(card, hand) {
  if (card === 'JK') return 100;
  let score = 0;
  for (const other of hand) {
    if (other === card || other === 'JK') continue;
    if (rankOf(other) === rankOf(card) && suitOf(other) !== suitOf(card)) score += 2;
    if (suitOf(other) === suitOf(card)) {
      const d = Math.abs(posOf(rankOf(other), 'low') - posOf(rankOf(card), 'low'));
      if (d === 1) score += 3;
      else if (d === 2) score += 1;
    }
  }
  return score;
}

function autoMove(state, seat) {
  if (state.stage === 'draw') return { t: 'draw' };
  const hand = state.hands[seat];
  const worst = hand.slice().sort((a, b) => usefulness(a, hand) - usefulness(b, hand))[0];
  return worst ? { t: 'discard', card: worst } : null;
}

module.exports = {
  id: 'caxeta',
  name: 'Caxeta',
  description: 'Caxeta (Cacheta): 9 cartas, forme jogos de 3 ou mais e bata primeiro. De 2 a 6 jogadores.',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  roles: Array.from({ length: MAX_PLAYERS }, (_, i) => `Jogador ${i + 1}`),
  setup,
  acceptsSeat,
  seatJoined,
  restart,
  move,
  view,
  viewFor,
  waitingOn,
  autoMove,
  _validGroup: validGroup,
  _partition: partition,
  _batidas: batidas,
  _deal: deal,
};
