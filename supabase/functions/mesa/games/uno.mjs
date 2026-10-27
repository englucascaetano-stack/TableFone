// GERADO por scripts/build-edge.js a partir de games/uno/game.js. Nao edite.
'use strict';
// Uno (2 a 8 jogadores). Baralho oficial de 108 cartas, sem acumular +2/+4.
// Carta: "<cor>-<valor>"; cor R Y G B (W = coringa); valor 0-9, S (pula), V (inverte), +2;
// coringas: "W-C" (escolhe cor) e "W-+4". A mao de cada jogador so vai ao proprio jogador (viewFor).
//
// Regras adotadas:
//  - Sem jogada possivel, compra 1 carta; se ela servir, pode jogar (ou passar).
//  - Coringa +4 so pode ser jogado sem nenhuma carta da cor atual na mao.
//  - Com 2 jogadores, "inverte" funciona como "pula".
//  - "UNO!" e anunciado automaticamente ao restar 1 carta. Vence quem zerar a mao primeiro.

const COLORS = ['R', 'Y', 'G', 'B'];
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const HAND = 7;

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
  for (const c of COLORS) {
    d.push(`${c}-0`);
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'S', 'V', '+2']) d.push(`${c}-${v}`, `${c}-${v}`);
  }
  for (let i = 0; i < 4; i++) d.push('W-C', 'W-+4');
  return shuffle(d);
}

const colorOf = (c) => c.split('-')[0];
const valueOf = (c) => c.split('-')[1];
const ORDER = { R: 0, Y: 1, G: 2, B: 3, W: 4 };
const sortHand = (h) =>
  h.sort((a, b) => ORDER[colorOf(a)] - ORDER[colorOf(b)] || String(valueOf(a)).localeCompare(String(valueOf(b)), 'en', { numeric: true }));

function lobbyState(players = 0) {
  return { phase: 'lobby', players, hands: [], draw: [], discard: [], turn: 0, dir: 1, color: 'R', drawn: null, winner: null, log: '' };
}

function setup() {
  return lobbyState(0);
}

function acceptsSeat(state) {
  return state.phase === 'lobby';
}

function seatJoined(state, seat) {
  if (state.phase !== 'lobby') return state;
  return { ...state, players: Math.max(state.players, seat + 1) };
}

const nextSeat = (state, from, steps = 1) => (((from + state.dir * steps) % state.players) + state.players * 8) % state.players;

function refill(state) {
  if (state.draw.length === 0 && state.discard.length > 1) {
    const top = state.discard.pop();
    state.draw = shuffle(state.discard);
    state.discard = [top];
  }
}

function drawCards(state, seat, n) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    refill(state);
    if (!state.draw.length) break;
    state.hands[seat].push(state.draw.pop());
    got++;
  }
  sortHand(state.hands[seat]);
  return got;
}

function deal(players) {
  let draw = newDeck();
  const hands = [];
  for (let i = 0; i < players; i++) hands.push(sortHand(draw.splice(draw.length - HAND, HAND)));
  let first = draw.pop();
  while (first === 'W-+4') {
    draw.unshift(first);
    shuffle(draw);
    first = draw.pop();
  }
  const state = { phase: 'playing', players, hands, draw, discard: [first], turn: 0, dir: 1, color: colorOf(first), drawn: null, winner: null, log: '' };
  const v = valueOf(first);
  if (colorOf(first) === 'W') state.color = COLORS[randomInt(4)];
  if (v === 'S') state.turn = nextSeat(state, 0);
  else if (v === 'V') {
    if (players === 2) state.turn = 1;
    else {
      state.dir = -1;
      state.turn = players - 1;
    }
  } else if (v === '+2') {
    drawCards(state, 0, 2);
    state.turn = nextSeat(state, 0);
  }
  state.log = 'A partida começou.';
  return state;
}

function restart(state) {
  return state.players >= MIN_PLAYERS ? deal(state.players) : state;
}

function canPlay(state, hand, card) {
  const top = state.discard[state.discard.length - 1];
  const col = colorOf(card);
  if (col === 'W') {
    if (card === 'W-+4') return !hand.some((c) => colorOf(c) === state.color);
    return true;
  }
  return col === state.color || (colorOf(top) !== 'W' && valueOf(card) === valueOf(top));
}

function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    if (state.players < MIN_PLAYERS) return { error: 'São necessários pelo menos 2 jogadores.' };
    return { state: deal(state.players) };
  }
  if (state.phase !== 'playing') return { error: 'A partida não está em andamento.' };
  if (seat !== state.turn) return { error: 'Não é a sua vez.' };

  const next = JSON.parse(JSON.stringify(state));
  const hand = next.hands[seat];

  if (req.t === 'draw') {
    if (next.drawn !== null) return { error: 'Você já comprou. Jogue a carta comprada ou passe.' };
    const got = drawCards(next, seat, 1);
    if (!got) {
      next.log = 'Não há cartas para comprar. Vez passada.';
      next.turn = nextSeat(next, seat);
      return { state: next };
    }
    // a carta comprada e a que acabou de entrar na mao (a mao e reordenada), entao comparamos por valor
    const drawnCard = findDrawn(state, next, seat);
    if (canPlay(next, hand, drawnCard)) {
      next.drawn = drawnCard;
      next.log = `${'Comprou 1 carta e pode jogá-la.'}`;
    } else {
      next.log = 'Comprou 1 carta e passou a vez.';
      next.turn = nextSeat(next, seat);
    }
    return { state: next };
  }

  if (req.t === 'pass') {
    if (next.drawn === null) return { error: 'Só é possível passar depois de comprar.' };
    next.drawn = null;
    next.log = 'Passou a vez.';
    next.turn = nextSeat(next, seat);
    return { state: next };
  }

  if (req.t === 'play') {
    const card = req.card;
    const idx = hand.indexOf(card);
    if (typeof card !== 'string' || idx < 0) return { error: 'Você não tem essa carta.' };
    if (next.drawn !== null && card !== next.drawn) return { error: 'Depois de comprar, só pode jogar a carta comprada.' };
    if (!canPlay(next, hand, card)) {
      return { error: card === 'W-+4' ? 'O +4 só pode ser jogado sem cartas da cor atual.' : 'Essa carta não pode ser jogada agora.' };
    }
    const col = colorOf(card);
    if (col === 'W' && !COLORS.includes(req.color)) return { error: 'Escolha uma cor.' };
    hand.splice(idx, 1);
    next.discard.push(card);
    next.color = col === 'W' ? req.color : col;
    next.drawn = null;
    const v = valueOf(card);
    let skip = 0;
    let log = '';
    if (v === 'S') {
      skip = 1;
      log = 'jogou Pula.';
    } else if (v === 'V') {
      if (next.players === 2) skip = 1;
      else next.dir = -next.dir;
      log = 'jogou Inverte.';
    } else if (v === '+2') {
      drawCards(next, nextSeat(next, seat), 2);
      skip = 1;
      log = 'jogou +2.';
    } else if (v === '+4') {
      drawCards(next, nextSeat(next, seat), 4);
      skip = 1;
      log = `jogou +4 e escolheu ${{ R: 'vermelho', Y: 'amarelo', G: 'verde', B: 'azul' }[next.color]}.`;
    } else if (col === 'W') {
      log = `jogou Coringa e escolheu ${{ R: 'vermelho', Y: 'amarelo', G: 'verde', B: 'azul' }[next.color]}.`;
    } else {
      log = 'jogou.';
    }
    next.log = log;
    next.lastSeat = seat;
    if (hand.length === 0) {
      next.phase = 'ended';
      next.winner = seat;
      return { state: next };
    }
    if (hand.length === 1) next.log += ' UNO!';
    next.turn = nextSeat(next, seat, 1 + skip);
    return { state: next };
  }

  return { error: 'Jogada inválida.' };
}

// Descobre qual carta foi comprada: a que existe a mais na mao nova em relacao a antiga.
function findDrawn(before, after, seat) {
  const counts = new Map();
  for (const c of before.hands[seat]) counts.set(c, (counts.get(c) || 0) + 1);
  for (const c of after.hands[seat]) {
    const n = counts.get(c) || 0;
    if (n === 0) return c;
    counts.set(c, n - 1);
  }
  return after.hands[seat][after.hands[seat].length - 1];
}

function view(state) {
  return {
    phase: state.phase,
    players: state.players,
    counts: state.hands.map((h) => h.length),
    top: state.discard.length ? state.discard[state.discard.length - 1] : null,
    color: state.color,
    turn: state.phase === 'playing' ? state.turn : null,
    dir: state.dir,
    drawCount: state.draw.length,
    log: state.log,
    lastSeat: state.lastSeat === undefined ? null : state.lastSeat,
    winner: state.winner,
    draw: false,
    over: state.phase === 'ended',
  };
}

function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby') return null;
  const hand = state.hands[seat] || [];
  const mine = seat === state.turn && state.phase === 'playing';
  const playable = mine
    ? [...new Set(hand.filter((c) => (state.drawn === null || c === state.drawn) && canPlay(state, hand, c)))]
    : [];
  return {
    hand,
    playable,
    canDraw: mine && state.drawn === null,
    canPass: mine && state.drawn !== null,
    drawn: mine ? state.drawn : null,
  };
}

// Piloto automatico: joga uma carta que sirva (evita coringa), senao compra e passa.
function waitingOn(state) {
  return state.phase === 'playing' ? [state.turn] : [];
}

function autoMove(state, seat) {
  const v = viewFor(state, seat);
  if (!v) return null;
  if (v.playable.length) {
    const card = v.playable.find((c) => colorOf(c) !== 'W') || v.playable[0];
    if (colorOf(card) !== 'W') return { t: 'play', card };
    const count = {};
    for (const c of state.hands[seat]) if (colorOf(c) !== 'W') count[colorOf(c)] = (count[colorOf(c)] || 0) + 1;
    const color = COLORS.slice().sort((a, b) => (count[b] || 0) - (count[a] || 0))[0];
    return { t: 'play', card, color };
  }
  if (v.canDraw) return { t: 'draw' };
  if (v.canPass) return { t: 'pass' };
  return null;
}

export default {
  id: 'uno',
  name: 'Uno',
  description: 'Uno clássico, de 2 a 8 jogadores, com a mão de cada um escondida.',
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
  _deal: deal,
  _canPlay: canPlay,
};
