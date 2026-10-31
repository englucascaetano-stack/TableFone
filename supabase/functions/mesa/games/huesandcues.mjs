// GERADO por scripts/build-edge.js a partir de games/huesandcues/game.js. Nao edite.
'use strict';
// Hues and Cues (Tons e Pistas), 3 a 10 jogadores. Tabuleiro de 480 cores: 30 colunas (1 a 30) por 16 linhas (A a P).
//
// Cada rodada tem um "dador de pista", que recebe em segredo uma cor-alvo:
//   1) o dador diz UMA palavra que descreva a cor (a pista nao pode ser nome de cor nem apontar a posicao: regra de honra);
//   2) cada outro jogador, em ordem, coloca um marcador na cor que acha ser a do alvo;
//   3) o dador diz uma segunda pista, de ATE DUAS palavras;
//   4) cada outro jogador coloca o segundo marcador;
//   5) o alvo e revelado e a pontuacao e feita.
// Pontuacao dos adivinhadores, por marcador (distancia = maior diferenca de coluna ou linha ate o alvo):
//   alvo exato 3 pontos; vizinho (distancia 1) 2 pontos; distancia 2, 1 ponto.
// Pontuacao do dador: 1 ponto por marcador (de qualquer jogador, nas duas pistas) a distancia 1 ou menos do alvo
// (a "moldura" 3x3); com 3 jogadores, 2 pontos por marcador.
// Cada jogador e dador 2 vezes (1 vez com 7 ou mais jogadores). Vence quem tiver mais pontos.
// Simplificacoes: um marcador por casa; a ordem dos palpites comeca no jogador seguinte ao dador.

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const ROWS = 16;
const COLS = 30;
const LETTERS = 'ABCDEFGHIJKLMNOP';

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

const turnsEach = (players) => (players >= 7 ? 1 : 2);
const inBoard = (r, c) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < ROWS && c >= 0 && c < COLS;
const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const guessPoints = (target, r, c) => {
  const d = dist(target, [r, c]);
  return d === 0 ? 3 : d === 1 ? 2 : d === 2 ? 1 : 0;
};
const coord = (r, c) => `${LETTERS[r]}${c + 1}`;

function lobbyState(players = 0) {
  return { phase: 'lobby', players, scores: [], round: 0, totalRounds: 0, first: 0, cuer: 0, step: null, target: null, clues: [], tokens: [], order: [], pos: 0, last: null, winners: [], log: '' };
}
const setup = () => lobbyState(0);
const acceptsSeat = (s) => s.phase === 'lobby';
const seatJoined = (s, seat) => (s.phase === 'lobby' ? { ...s, players: Math.max(s.players, seat + 1) } : s);

function startRound(s) {
  s.cuer = (s.first + s.round) % s.players;
  s.target = [randomInt(ROWS), randomInt(COLS)];
  s.step = 'clue1';
  s.clues = [null, null];
  s.tokens = [];
  s.order = Array.from({ length: s.players - 1 }, (_, i) => (s.cuer + 1 + i) % s.players);
  s.pos = 0;
  s.last = null;
  s.log = `Rodada ${s.round + 1} de ${s.totalRounds}: Jogador ${s.cuer + 1} vai dar as pistas.`;
}

function deal(prev, first) {
  const s = { ...lobbyState(prev.players), phase: 'playing', first };
  s.scores = new Array(s.players).fill(0);
  s.totalRounds = s.players * turnsEach(s.players);
  startRound(s);
  return s;
}

function restart(state) {
  if (state.players < MIN_PLAYERS) return state;
  return deal(state, randomInt(state.players));
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const words = (t) => t.trim().split(/\s+/).filter(Boolean);

function reveal(s) {
  const results = s.order.map((seat) => {
    const toks = s.tokens.filter((t) => t.seat === seat).map((t) => ({ r: t.r, c: t.c, n: t.n, pts: guessPoints(s.target, t.r, t.c) }));
    return { seat, tokens: toks, total: toks.reduce((a, t) => a + t.pts, 0) };
  });
  const inFrame = s.tokens.filter((t) => dist(s.target, [t.r, t.c]) <= 1).length;
  const cuerPts = inFrame * (s.players === 3 ? 2 : 1);
  for (const r of results) s.scores[r.seat] += r.total;
  s.scores[s.cuer] += cuerPts;
  s.step = 'reveal';
  s.last = { cuer: s.cuer, target: s.target, clues: s.clues.slice(), results, cuerPts, inFrame };
  s.log = `A cor era ${coord(s.target[0], s.target[1])}. Jogador ${s.cuer + 1} fez ${cuerPts} ponto${cuerPts === 1 ? '' : 's'} com as pistas.`;
}

function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    if (state.players < MIN_PLAYERS) return { error: 'São necessários pelo menos 3 jogadores.' };
    return { state: deal(state, randomInt(state.players)) };
  }
  if (state.phase !== 'playing') return { error: 'A partida terminou. Use "Nova partida" para jogar outra.' };
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players) return { error: 'Você não está jogando.' };
  const s = clone(state);

  if (req.t === 'next') {
    if (s.step !== 'reveal') return { error: 'A rodada ainda não terminou.' };
    s.round += 1;
    if (s.round >= s.totalRounds) {
      s.phase = 'ended';
      s.step = null;
      const best = Math.max(...s.scores);
      s.winners = s.scores.map((_, i) => i).filter((i) => s.scores[i] === best);
      s.log = 'Fim da partida.';
      return { state: s };
    }
    startRound(s);
    return { state: s };
  }

  if (req.t === 'clue') {
    if (s.step !== 'clue1' && s.step !== 'clue2') return { error: 'Não é hora de dar a pista.' };
    if (seat !== s.cuer) return { error: 'Só o dador da pista pode dar a pista.' };
    const text = typeof req.text === 'string' ? req.text.trim() : '';
    const n = words(text).length;
    if (!n) return { error: 'Escreva a pista.' };
    if (text.length > 40) return { error: 'Pista longa demais (máximo de 40 letras).' };
    if (s.step === 'clue1' && n !== 1) return { error: 'A primeira pista tem de ser uma única palavra.' };
    if (s.step === 'clue2' && n > 2) return { error: 'A segunda pista pode ter no máximo duas palavras.' };
    s.clues[s.step === 'clue1' ? 0 : 1] = text;
    s.step = s.step === 'clue1' ? 'guess1' : 'guess2';
    s.pos = 0;
    s.log = `Pista ${s.step === 'guess1' ? 1 : 2}: "${text}". Agora os outros colocam o marcador.`;
    return { state: s };
  }

  if (req.t === 'place') {
    if (s.step !== 'guess1' && s.step !== 'guess2') return { error: 'Não é hora de colocar marcadores.' };
    if (seat !== s.order[s.pos]) return { error: 'Não é a sua vez de colocar o marcador.' };
    if (!inBoard(req.r, req.c)) return { error: 'Casa inválida.' };
    if (s.tokens.some((t) => t.r === req.r && t.c === req.c)) return { error: 'Já há um marcador nessa casa.' };
    s.tokens.push({ seat, r: req.r, c: req.c, n: s.step === 'guess1' ? 1 : 2 });
    s.pos += 1;
    if (s.pos >= s.order.length) {
      if (s.step === 'guess1') { s.step = 'clue2'; s.pos = 0; s.log = `Jogador ${s.cuer + 1} dá a segunda pista (até duas palavras).`; } else reveal(s);
    } else s.log = `Jogador ${seat + 1} colocou o marcador.`;
    return { state: s };
  }

  return { error: 'Jogada inválida.' };
}

function view(state) {
  if (state.phase === 'lobby') return { phase: 'lobby', players: state.players, log: '', draw: false, over: false };
  const ended = state.phase === 'ended';
  return {
    phase: state.phase,
    players: state.players,
    rows: ROWS,
    cols: COLS,
    round: state.round,
    totalRounds: state.totalRounds,
    cuer: state.cuer,
    step: state.step,
    clues: state.clues,
    tokens: state.tokens,
    turn: ended ? null : state.step === 'guess1' || state.step === 'guess2' ? state.order[state.pos] : state.cuer,
    placing: state.step === 'guess1' || state.step === 'guess2' ? state.order.slice(state.pos) : [],
    scores: state.scores,
    last: state.step === 'reveal' ? state.last : null,
    winners: ended ? state.winners : [],
    log: state.log,
    draw: false,
    over: ended,
  };
}

// So o dador ve a cor-alvo, e so ate a revelacao.
function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby' || seat >= state.players) return null;
  const secret = state.phase === 'playing' && state.step !== 'reveal' && seat === state.cuer;
  return { target: secret ? state.target : null };
}

function waitingOn(state) {
  if (state.phase !== 'playing') return [];
  if (state.step === 'clue1' || state.step === 'clue2' || state.step === 'reveal') return [state.cuer];
  return [state.order[state.pos]];
}

// Piloto automatico: pista generica e marcador em casa livre ao acaso; segue para a proxima rodada.
function autoMove(state) {
  if (state.step === 'clue1') return { t: 'clue', text: 'cor' };
  if (state.step === 'clue2') return { t: 'clue', text: 'sem pista' };
  if (state.step === 'reveal') return { t: 'next' };
  for (let i = 0; i < 200; i++) {
    const r = randomInt(ROWS);
    const c = randomInt(COLS);
    if (!state.tokens.some((t) => t.r === r && t.c === c)) return { t: 'place', r, c };
  }
  return null;
}

export default {
  id: 'huesandcues',
  name: 'Hues and Cues',
  description: 'Hues and Cues (Tons e Pistas): descreva uma cor com palavras e veja quem chega mais perto. De 3 a 10 jogadores.',
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
  // expostos para teste
  _deal: deal,
  _guessPoints: guessPoints,
  _coord: coord,
  _ROWS: ROWS,
  _COLS: COLS,
};
