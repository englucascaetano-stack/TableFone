// GERADO por scripts/build-edge.js a partir de games/uno/game.js. Nao edite.
'use strict';
// Uno (2 a 8 jogadores). Baralho de 109 cartas: as 108 classicas + 1 Coringa Trocar as Maos. Sem acumular +2/+4.
// Carta: "<cor>-<valor>"; cor R Y G B (W = coringa); valor 0-9, S (pula), V (inverte), +2;
// coringas: "W-C" (escolhe cor), "W-+4" e "W-H" (Trocar as Maos). A mao de cada jogador so vai ao proprio jogador (viewFor).
//
// Regras (conforme o manual de 112 cartas; sem a Coringa Branca, que depende de regra escrita a mao):
//  - Sem jogada possivel, compra 1 carta; se ela servir, pode jogar (ou passar).
//  - Coringa +4: pode ser jogado a qualquer momento, mas o jogador que o recebe pode DESAFIAR. O +4 so e legal
//    sem carta da cor em jogo na mao (numero ou acao que combine nao impede). Desafio certo: quem jogou compra 4 e o
//    desafiante joga normalmente. Desafio errado: o desafiante compra 6 (4 + 2) e perde a vez. Sem desafio: compra 4 e perde a vez.
//  - Coringa Trocar as Maos: escolhe cor e um jogador; os dois trocam todas as cartas. Nao pode ser a ultima carta.
//  - Com 2 jogadores, "inverte" funciona como "pula".
//  - Pontuacao: a rodada acaba quando alguem zera a mao. Quem zera soma o valor das cartas dos demais
//    (numero = valor; +2, Inverte e Pula = 20; coringas = 50). Vence o jogo quem chegar primeiro a 500 pontos;
//    "Nova partida" joga a proxima rodada com o placar acumulado.
//  - UNO: automatico por padrao. No modo manual, quem fica com 1 carta precisa tocar em "UNO!" antes de o proximo jogar;
//    qualquer outro jogador pode "Pegar" o esquecimento nesse intervalo e o esquecido compra 2.

const COLORS = ['R', 'Y', 'G', 'B'];
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const HAND = 7;
const TARGET = 500;

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
  d.push('W-H');
  return shuffle(d);
}

const colorOf = (c) => c.split('-')[0];
const valueOf = (c) => c.split('-')[1];
const ORDER = { R: 0, Y: 1, G: 2, B: 3, W: 4 };
const sortHand = (h) =>
  h.sort((a, b) => ORDER[colorOf(a)] - ORDER[colorOf(b)] || String(valueOf(a)).localeCompare(String(valueOf(b)), 'en', { numeric: true }));
const COLOR_NAME = { R: 'vermelho', Y: 'amarelo', G: 'verde', B: 'azul' };

function cardPoints(card) {
  if (colorOf(card) === 'W') return 50;
  const v = valueOf(card);
  return v === 'S' || v === 'V' || v === '+2' ? 20 : Number(v);
}

function lobbyState(players = 0) {
  return {
    phase: 'lobby', players, hands: [], draw: [], discard: [], turn: 0, dir: 1, color: 'R', drawn: null, winner: null, log: '',
    scores: [], roundPoints: 0, gameWinner: null, manual: false, uno: null, pending: null, first: 0,
  };
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

// opts: { manual, scores, first }
function deal(players, opts = {}) {
  const f = opts.first || 0;
  let draw = newDeck();
  const hands = [];
  for (let i = 0; i < players; i++) hands.push(sortHand(draw.splice(draw.length - HAND, HAND)));
  let first = draw.pop();
  while (first === 'W-+4' || first === 'W-H') {
    draw.unshift(first);
    shuffle(draw);
    first = draw.pop();
  }
  const state = {
    phase: 'playing', players, hands, draw, discard: [first], turn: f, dir: 1, color: colorOf(first), drawn: null, winner: null, log: '',
    scores: opts.scores && opts.scores.length === players ? opts.scores.slice() : new Array(players).fill(0),
    roundPoints: 0, gameWinner: null, manual: Boolean(opts.manual), uno: null, pending: null, first: f,
  };
  const v = valueOf(first);
  if (colorOf(first) === 'W') state.color = COLORS[randomInt(4)];
  if (v === 'S') state.turn = nextSeat(state, f);
  else if (v === 'V') {
    if (players === 2) state.turn = (f + 1) % 2;
    else {
      state.dir = -1;
      state.turn = (f - 1 + players) % players;
    }
  } else if (v === '+2') {
    drawCards(state, f, 2);
    state.turn = nextSeat(state, f);
  }
  state.log = 'A rodada começou.';
  return state;
}

// "Nova partida": continua o placar entre rodadas; zera quando o jogo ja teve vencedor (500 pontos) ou saindo do lobby.
function restart(state) {
  if (state.players < MIN_PLAYERS) return state;
  const decided = state.phase === 'lobby' || state.gameWinner !== null;
  return deal(state.players, { manual: state.manual, scores: decided ? null : state.scores, first: decided ? 0 : (state.first + 1) % state.players });
}

// Coringa +4 sempre pode ser jogado (o adversario decide se desafia); Trocar as Maos nao pode ser a ultima carta.
function canPlay(state, hand, card) {
  const top = state.discard[state.discard.length - 1];
  const col = colorOf(card);
  if (col === 'W') return card === 'W-H' ? hand.length > 1 : true;
  return col === state.color || (colorOf(top) !== 'W' && valueOf(card) === valueOf(top));
}

function closeUno(next) {
  if (next.uno) next.uno = null;
}

function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    if (state.players < MIN_PLAYERS) return { error: 'São necessários pelo menos 2 jogadores.' };
    return { state: deal(state.players, { manual: req.manual === true }) };
  }
  if (state.phase !== 'playing') return { error: 'A rodada terminou. Use "Nova partida" para continuar.' };
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players) return { error: 'Você não está nesta partida.' };

  const next = JSON.parse(JSON.stringify(state));

  // UNO manual: fora da vez
  if (req.t === 'uno') {
    if (!next.uno || next.uno.seat !== seat || next.uno.shouted) return { error: 'Não há UNO para gritar agora.' };
    next.uno.shouted = true;
    next.log = 'UNO!';
    return { state: next };
  }
  if (req.t === 'catch') {
    if (!next.uno || next.uno.shouted) return { error: 'Ninguém esqueceu de gritar UNO.' };
    if (next.uno.seat === seat) return { error: 'Você não pode pegar a si mesmo.' };
    const who = next.uno.seat;
    drawCards(next, who, 2);
    next.uno = null;
    next.log = 'Esqueceu de gritar UNO e comprou 2 cartas.';
    next.lastSeat = who;
    return { state: next };
  }

  // Resposta ao Coringa +4: desafiar ou aceitar (so quem o recebeu)
  if (next.pending) {
    const p = next.pending;
    if (seat !== p.victim) return { error: 'Aguardando a resposta ao +4.' };
    closeUno(next);
    if (req.t === 'accept') {
      drawCards(next, p.victim, 4);
      next.pending = null;
      next.turn = nextSeat(next, p.victim);
      next.log = 'Aceitou o +4 e comprou 4 cartas.';
      return { state: next };
    }
    if (req.t === 'challenge') {
      next.pending = null;
      if (p.hadColor) {
        drawCards(next, p.by, 4);
        next.log = `Desafio certo! Quem jogou o +4 tinha carta ${COLOR_NAME[p.prevColor]} e comprou 4.`;
        next.lastSeat = p.by;
        return { state: next }; // o desafiante joga normalmente (a vez continua com ele)
      }
      drawCards(next, p.victim, 6);
      next.turn = nextSeat(next, p.victim);
      next.log = 'Desafio errado: o +4 era legal. Comprou 6 cartas e perdeu a vez.';
      return { state: next };
    }
    return { error: 'Responda ao +4: aceitar ou desafiar.' };
  }

  if (seat !== state.turn) return { error: 'Não é a sua vez.' };
  const hand = next.hands[seat];

  if (req.t === 'draw') {
    if (next.drawn !== null) return { error: 'Você já comprou. Jogue a carta comprada ou passe.' };
    closeUno(next);
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
      next.log = 'Comprou 1 carta e pode jogá-la.';
    } else {
      next.log = 'Comprou 1 carta e passou a vez.';
      next.turn = nextSeat(next, seat);
    }
    return { state: next };
  }

  if (req.t === 'pass') {
    if (next.drawn === null) return { error: 'Só é possível passar depois de comprar.' };
    closeUno(next);
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
      return { error: card === 'W-H' ? 'A carta Trocar as Mãos não pode ser a última carta.' : 'Essa carta não pode ser jogada agora.' };
    }
    const col = colorOf(card);
    if (col === 'W' && !COLORS.includes(req.color)) return { error: 'Escolha uma cor.' };
    if (card === 'W-H' && (!Number.isInteger(req.target) || req.target === seat || req.target < 0 || req.target >= next.players)) {
      return { error: 'Escolha o jogador para trocar de mãos.' };
    }
    closeUno(next);
    const prevColor = next.color;
    const hadColor = hand.some((c) => colorOf(c) === prevColor); // para o desafio do +4 (antes de tirar a carta)
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
      log = `jogou +4 e escolheu ${COLOR_NAME[next.color]}.`;
      if (hand.length === 0) {
        drawCards(next, nextSeat(next, seat), 4); // ultima carta: sem desafio, o proximo compra e a rodada acaba
        skip = 1;
      } else {
        const victim = nextSeat(next, seat);
        next.pending = { kind: 'plus4', by: seat, victim, prevColor, hadColor };
      }
    } else if (v === 'H') {
      const t = req.target;
      const mine = next.hands[seat];
      next.hands[seat] = sortHand(next.hands[t]);
      next.hands[t] = sortHand(mine);
      log = `jogou Trocar as Mãos e trocou de cartas com o jogador ${t + 1} (cor ${COLOR_NAME[next.color]}).`;
    } else if (col === 'W') {
      log = `jogou Coringa e escolheu ${COLOR_NAME[next.color]}.`;
    } else {
      log = 'jogou.';
    }
    next.log = log;
    next.lastSeat = seat;
    if (hand.length === 0) return { state: endRound(next, seat) };
    if (next.hands[seat].length === 1) {
      if (!next.manual || (state.auto || []).includes(seat)) next.log += ' UNO!';
      else next.uno = { seat, shouted: false };
    }
    if (next.pending) {
      next.turn = next.pending.victim; // o destinatario do +4 decide: aceitar ou desafiar
      return { state: next };
    }
    next.turn = nextSeat(next, seat, 1 + skip);
    return { state: next };
  }

  return { error: 'Jogada inválida.' };
}

function endRound(next, seat) {
  let pts = 0;
  next.hands.forEach((h, i) => { if (i !== seat) pts += h.reduce((a, c) => a + cardPoints(c), 0); });
  next.phase = 'roundEnd';
  next.winner = seat;
  next.roundPoints = pts;
  next.scores = next.scores.slice();
  next.scores[seat] += pts;
  next.uno = null;
  next.pending = null;
  if (next.scores[seat] >= TARGET) next.gameWinner = seat;
  return next;
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
    scores: state.scores,
    target: TARGET,
    roundPoints: state.roundPoints,
    gameWinner: state.gameWinner,
    manual: state.manual,
    uno: state.uno ? { seat: state.uno.seat, shouted: state.uno.shouted } : null,
    pending: state.pending ? { kind: state.pending.kind, by: state.pending.by, victim: state.pending.victim } : null,
    draw: false,
    over: state.phase === 'roundEnd',
  };
}

function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby') return null;
  const hand = state.hands[seat] || [];
  const mine = seat === state.turn && state.phase === 'playing' && !state.pending;
  const playable = mine
    ? [...new Set(hand.filter((c) => (state.drawn === null || c === state.drawn) && canPlay(state, hand, c)))]
    : [];
  const window = state.phase === 'playing' && state.uno && !state.uno.shouted;
  return {
    hand,
    playable,
    canDraw: mine && state.drawn === null,
    canPass: mine && state.drawn !== null,
    drawn: mine ? state.drawn : null,
    mustRespond: state.phase === 'playing' && !!state.pending && state.pending.victim === seat,
    canUno: Boolean(window) && state.uno.seat === seat,
    canCatch: Boolean(window) && state.uno.seat !== seat && seat < state.players,
  };
}

// Piloto automatico: joga uma carta que sirva (evita coringa, nunca blefa com +4 e nunca troca de maos), senao compra e passa.
function waitingOn(state) {
  if (state.phase !== 'playing') return [];
  return state.pending ? [state.pending.victim] : [state.turn];
}

function autoMove(state, seat) {
  if (state.pending) return state.pending.victim === seat ? { t: 'accept' } : null;
  const v = viewFor(state, seat);
  if (!v) return null;
  const hand = state.hands[seat];
  const safe = v.playable.filter((c) => c !== 'W-H' && (c !== 'W-+4' || !hand.some((x) => colorOf(x) === state.color)));
  if (safe.length) {
    const card = safe.find((c) => colorOf(c) !== 'W') || safe[0];
    if (colorOf(card) !== 'W') return { t: 'play', card };
    const count = {};
    for (const c of hand) if (colorOf(c) !== 'W') count[colorOf(c)] = (count[colorOf(c)] || 0) + 1;
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
  description: 'Uno clássico, de 2 a 8 jogadores, com a mão de cada um escondida. Jogo até 500 pontos.',
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
  _points: cardPoints,
};
