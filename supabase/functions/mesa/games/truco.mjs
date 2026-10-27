// GERADO por scripts/build-edge.js a partir de games/truco/game.js. Nao edite.
'use strict';
// Truco paulista, 2 jogadores (individual) ou 4 jogadores (duplas: assentos 0 e 2 contra 1 e 3).
// Baralho de 40 cartas (sem 8, 9, 10). Ordem das cartas, da menor para a maior:
//   4 5 6 7 Q J K A 2 3. A "vira" (carta virada na mesa) define a manilha: o valor seguinte na ordem.
// Manilhas, da maior para a menor: paus (zap), copas, espadas, ouros. Ganha a mao quem vencer 2 de 3 rodadas.
//
// Valor da mao: 1 ponto. Truco (3), seis (6), nove (9) e doze (12): quem pede nao pode pedir de novo
// em seguida; quem recebe aceita, corre (o pedinte leva o valor anterior) ou aumenta. Jogo vai a 12 pontos.
// Mao de onze: quem tem 11 pontos ve a propria mao e decide jogar (vale 3) ou correr (o adversario leva 1);
// sem truco nessa mao. Mao de ferro (11 x 11): vale 1, sem truco.
// Simplificacoes: nao ha "encobrir" carta; o "ferro" nao e jogado as cegas; empate nas 3 rodadas vence quem foi "mao".

const ORDER = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const SUITS = ['D', 'S', 'H', 'C']; // ouros < espadas < copas < paus (forca das manilhas)
const NEXT_VALUE = { 1: 3, 3: 6, 6: 9, 9: 12 };

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
  for (const r of ORDER) for (const s of SUITS) d.push(`${r}${s}`);
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const rankOf = (c) => c.slice(0, -1);
const suitOf = (c) => c.slice(-1);
const teamOf = (seat) => seat % 2;
const manilhaRank = (vira) => ORDER[(ORDER.indexOf(rankOf(vira)) + 1) % ORDER.length];

function strength(card, manilha) {
  if (rankOf(card) === manilha) return 100 + SUITS.indexOf(suitOf(card));
  return ORDER.indexOf(rankOf(card));
}

function lobbyState(players = 0) {
  return { phase: 'lobby', players, joined: players, hands: [], vira: null, mao: 0, turn: 0, rounds: [], table: [], roundLeader: 0, points: [0, 0], value: 1, call: null, lastRaiser: null, noTruco: false, decision: null, winner: null, log: '' };
}

const setup = () => lobbyState(0);
const acceptsSeat = (state) => state.phase === 'lobby';
const seatJoined = (state, seat) => (state.phase === 'lobby' ? { ...state, joined: Math.max(state.joined, seat + 1), players: Math.max(state.players, seat + 1) } : state);

// Nova mao: embaralha, da 3 cartas a cada jogador e vira uma carta.
function dealHand(prev, mao) {
  const n = prev.players;
  const deck = newDeck();
  const hands = [];
  for (let i = 0; i < n; i++) hands.push(deck.splice(0, 3));
  const s = {
    ...prev,
    phase: 'playing',
    hands,
    vira: deck.pop(),
    mao,
    turn: mao,
    roundLeader: mao,
    rounds: [],
    table: [],
    value: 1,
    call: null,
    lastRaiser: null,
    noTruco: false,
    decision: null,
  };
  const [a, b] = s.points;
  if (a === 11 && b === 11) {
    s.noTruco = true;
    s.log = 'Mão de ferro: valendo 1 ponto, sem truco.';
  } else if (a === 11 || b === 11) {
    s.decision = a === 11 ? 0 : 1;
    s.log = `Mão de onze: a equipe ${s.decision + 1} decide se joga (vale 3) ou corre.`;
  } else {
    s.log = 'Nova mão.';
  }
  return s;
}

function start(state, players) {
  const s = { ...lobbyState(players), joined: state.joined, points: [0, 0] };
  return dealHand(s, 0);
}

function restart(state) {
  if (state.players < 2) return state;
  return start(state, state.players);
}

// Resultado de uma lista de rodadas (cada uma: equipe vencedora ou null para empate). Retorna equipe ou undefined.
function handResult(rounds, maoTeam) {
  const w = rounds.map((r) => r.win);
  if (w.length >= 2) {
    const [r1, r2] = w;
    if (r1 !== null && r2 !== null && r1 === r2) return r1;
    if (r1 === null && r2 !== null) return r2;
    if (r1 !== null && r2 === null) return r1;
  }
  if (w.length === 3) {
    if (w[2] !== null) return w[2];
    if (w[0] !== null) return w[0];
    return maoTeam;
  }
  return undefined;
}

function award(state, team, points, why) {
  const s = state;
  s.points = s.points.slice();
  s.points[team] += points;
  s.log = `${why} Equipe ${team + 1} ganha ${points} ponto${points > 1 ? 's' : ''}.`;
  if (s.points[team] >= 12) {
    s.phase = 'ended';
    s.winner = team;
    s.call = null;
    s.decision = null;
    return s;
  }
  const log = s.log;
  const nextState = dealHand(s, (s.mao + 1) % s.players);
  nextState.log = `${log} ${nextState.log}`;
  return nextState;
}

function resolveRound(s) {
  const manilha = manilhaRank(s.vira);
  const plays = s.table.map((p) => ({ ...p, str: strength(p.card, manilha) }));
  const best = Math.max(...plays.map((p) => p.str));
  const top = plays.filter((p) => p.str === best);
  const teams = new Set(top.map((p) => teamOf(p.seat)));
  const win = teams.size === 1 ? teamOf(top[0].seat) : null;
  s.rounds = s.rounds.concat([{ win, cards: s.table }]);
  s.table = [];
  const result = handResult(s.rounds, teamOf(s.mao));
  if (result !== undefined) return award(s, result, s.value, `Mão decidida (${s.rounds.map((r) => (r.win === null ? 'empate' : `eq. ${r.win + 1}`)).join(', ')}).`);
  if (win !== null) s.roundLeader = top[0].seat;
  s.turn = s.roundLeader;
  s.log = win === null ? 'Rodada empatada.' : `Equipe ${win + 1} venceu a rodada.`;
  return s;
}

function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    const n = req.players;
    if (n !== 2 && n !== 4) return { error: 'O truco é jogado em 2 ou 4 jogadores.' };
    if (n > state.joined) return { error: `Há apenas ${state.joined} jogador(es) na sala.` };
    return { state: start(state, n) };
  }
  if (state.phase !== 'playing') return { error: 'A partida não está em andamento.' };
  if (seat >= state.players) return { error: 'Você não está jogando esta partida.' };

  const s = JSON.parse(JSON.stringify(state));
  const myTeam = teamOf(seat);

  // Mao de onze: decisao da equipe que tem 11 pontos
  if (s.decision !== null) {
    if (req.t !== 'onze') return { error: 'Aguardando a decisão da mão de onze.' };
    if (myTeam !== s.decision) return { error: 'A decisão é da equipe com 11 pontos.' };
    if (req.play === true) {
      s.decision = null;
      s.value = 3;
      s.noTruco = true;
      s.log = `Equipe ${myTeam + 1} joga a mão de onze (vale 3).`;
      return { state: s };
    }
    if (req.play === false) {
      s.decision = null;
      return { state: award(s, 1 - myTeam, 1, `Equipe ${myTeam + 1} correu da mão de onze.`) };
    }
    return { error: 'Jogada inválida.' };
  }

  // Resposta a um pedido de truco
  if (s.call) {
    if (myTeam === s.call.team) return { error: 'Aguardando a resposta do adversário.' };
    if (req.t === 'accept') {
      s.value = s.call.value;
      s.log = `Equipe ${myTeam + 1} aceitou: a mão vale ${s.value}.`;
      s.call = null;
      return { state: s };
    }
    if (req.t === 'run') {
      const caller = s.call.team;
      s.call = null;
      return { state: award(s, caller, s.value, `Equipe ${myTeam + 1} correu.`) };
    }
    if (req.t === 'raise') {
      if (!NEXT_VALUE[s.call.value]) return { error: 'Não é possível aumentar mais.' };
      s.value = s.call.value; // aceitou o pedido anterior ao aumentar
      s.call = { team: myTeam, value: NEXT_VALUE[s.value], by: seat };
      s.lastRaiser = myTeam;
      s.log = `Equipe ${myTeam + 1} pede ${callName(s.call.value)}!`;
      return { state: s };
    }
    return { error: 'Responda ao pedido: aceitar, correr ou aumentar.' };
  }

  if (seat !== s.turn) return { error: 'Não é a sua vez.' };

  if (req.t === 'truco') {
    if (s.noTruco) return { error: 'Nesta mão não é permitido pedir truco.' };
    if (s.lastRaiser === myTeam) return { error: 'Sua equipe acabou de aumentar. Aguarde.' };
    if (!NEXT_VALUE[s.value]) return { error: 'A mão já vale o máximo.' };
    s.call = { team: myTeam, value: NEXT_VALUE[s.value], by: seat };
    s.lastRaiser = myTeam;
    s.log = `Equipe ${myTeam + 1} pede ${callName(s.call.value)}!`;
    return { state: s };
  }

  if (req.t === 'play') {
    const hand = s.hands[seat];
    const idx = hand.indexOf(req.card);
    if (typeof req.card !== 'string' || idx < 0) return { error: 'Você não tem essa carta.' };
    hand.splice(idx, 1);
    s.table.push({ seat, card: req.card });
    if (s.table.length === s.players) return { state: resolveRound(s) };
    s.turn = (seat + 1) % s.players;
    s.log = '';
    return { state: s };
  }

  return { error: 'Jogada inválida.' };
}

const callName = (v) => ({ 3: 'TRUCO', 6: 'SEIS', 9: 'NOVE', 12: 'DOZE' }[v] || String(v));

function view(state) {
  return {
    phase: state.phase,
    players: state.players,
    joined: state.joined,
    points: state.points,
    vira: state.vira,
    manilha: state.vira ? manilhaRank(state.vira) : null,
    value: state.value,
    call: state.call ? { team: state.call.team, value: state.call.value, name: callName(state.call.value) } : null,
    decision: state.decision,
    noTruco: state.noTruco,
    mao: state.mao,
    turn: state.phase === 'playing' ? state.turn : null,
    handCounts: state.hands.map((h) => h.length),
    table: state.table,
    rounds: state.rounds,
    winner: state.winner,
    log: state.log,
    draw: false,
    over: state.phase === 'ended',
  };
}

function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby' || seat >= state.players) return null;
  const team = teamOf(seat);
  const idle = state.phase === 'playing' && !state.call && state.decision === null;
  const out = {
    hand: state.hands[seat],
    canPlay: idle && seat === state.turn,
    canTruco: idle && seat === state.turn && !state.noTruco && state.lastRaiser !== team && !!NEXT_VALUE[state.value],
    nextValue: NEXT_VALUE[state.value] || null,
    nextName: NEXT_VALUE[state.value] ? callName(NEXT_VALUE[state.value]) : null,
    mustRespond: state.phase === 'playing' && !!state.call && state.call.team !== team,
    canRaise: !!state.call && state.call.team !== team && !!NEXT_VALUE[state.call.value],
    raiseName: state.call && NEXT_VALUE[state.call.value] ? callName(NEXT_VALUE[state.call.value]) : null,
    mustDecide: state.decision === team,
    team,
  };
  if (state.decision === team && state.players === 4) out.partnerHand = state.hands[(seat + 2) % 4];
  return out;
}

// Piloto automatico: nunca pede truco; aceita pedidos; joga a carta mais fraca.
// Quando a resposta pode vir de qualquer um da equipe, so age se TODA a equipe estiver ausente.
function waitingOn(state, auto) {
  if (state.phase !== 'playing') return [];
  const teamSeats = (t) => Array.from({ length: state.players }, (_, i) => i).filter((i) => teamOf(i) === t);
  const group = (seats) => {
    if (!auto) return seats;
    const present = seats.filter((i) => !auto.includes(i));
    return present.length ? present : [seats[0]];
  };
  if (state.decision !== null) return group(teamSeats(state.decision));
  if (state.call) return group(teamSeats(1 - state.call.team));
  return [state.turn];
}

function autoMove(state, seat) {
  if (state.decision !== null) return { t: 'onze', play: true };
  if (state.call) return { t: 'accept' };
  const manilha = manilhaRank(state.vira);
  const hand = state.hands[seat].slice().sort((a, b) => strength(a, manilha) - strength(b, manilha));
  return hand.length ? { t: 'play', card: hand[0] } : null;
}

export default {
  id: 'truco',
  name: 'Truco',
  description: 'Truco paulista, 2 jogadores ou 4 em duplas, com truco, seis, nove e doze.',
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
  waitingOn,
  autoMove,
  _strength: strength,
  _manilhaRank: manilhaRank,
  _handResult: handResult,
  _dealHand: dealHand,
  _start: start,
};
