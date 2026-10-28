// GERADO por scripts/build-edge.js a partir de games/scrabble/game.js. Nao edite.
'use strict';
// Scrabble em portugues, 2 a 4 jogadores. Tabuleiro 15x15, 120 pecas (3 coringas), cavalete de 7 pecas.
//
// Regras implementadas (Scrabble classico):
//  - A primeira palavra cobre a casa central e tem 2 ou mais letras; depois toda jogada se liga as pecas ja postas.
//  - Todas as pecas jogadas ficam na mesma linha ou coluna, sem lacunas (lacunas so de pecas ja postas).
//  - Todas as palavras formadas (a principal e as cruzadas) precisam existir no dicionario (validacao automatica, no lugar
//    do desafio entre jogadores). Acentos sao ignorados; o Ç e uma peca propria.
//  - Pontuacao: valor das letras; casas de letra dupla/tripla e palavra dupla/tripla valem so para as pecas postas na jogada;
//    coringa vale 0; usar as 7 pecas de uma vez rende 50 pontos extras (bingo).
//  - Vez: jogar, passar ou trocar pecas (so com 7 ou mais pecas no saco).
//  - Fim: o saco esta vazio e alguem fica sem pecas (recebe a soma das pecas dos outros, que a perdem), ou seis vezes seguidas
//    sem pontuar (passes/trocas). Vence quem tiver mais pontos; empate = vitoria compartilhada.
//
// Pecas (quantidade, valor), conferir com o seu jogo: A14/1 B3/3 C4/2 D5/2 E11/1 F2/4 G2/4 H2/4 I10/1 J2/5 L5/2 M6/1 N4/3
// O10/1 P4/2 Q1/6 R6/1 S8/1 T5/1 U7/1 V2/4 X1/8 Z1/8 Ç2/3 coringa x3 = 120 pecas. Nao ha K, W e Y.
// Dicionario: VERO (Hunspell pt_BR) expandido, ver tools/scrabble-dict.py. E generoso: aceita formas raras e algumas
// que a lista oficial nao tem; nunca recusa de proposito uma palavra comum.

import DICT from './scrabble-dict.mjs';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const SIZE = 15;
const CENTER = 7;
const RACK = 7;
const BINGO = 50;
const SCORELESS_LIMIT = 6;

const TILES = {
  a: [14, 1], b: [3, 3], c: [4, 2], d: [5, 2], e: [11, 1], f: [2, 4], g: [2, 4], h: [2, 4], i: [10, 1], j: [2, 5],
  l: [5, 2], m: [6, 1], n: [4, 3], o: [10, 1], p: [4, 2], q: [1, 6], r: [6, 1], s: [8, 1], t: [5, 1], u: [7, 1],
  v: [2, 4], x: [1, 8], z: [1, 8], 'ç': [2, 3], '?': [3, 0],
};
const LETTERS = Object.keys(TILES).filter((k) => k !== '?');
const VALUE = Object.fromEntries(Object.entries(TILES).map(([k, v]) => [k, v[1]]));

// Casas premiadas (simetricas): 3P/2P = palavra tripla/dupla, 3L/2L = letra tripla/dupla.
function buildPremium() {
  const g = Array.from({ length: SIZE }, () => new Array(SIZE).fill(''));
  const put = (r, c, k) => {
    for (const [rr, cc] of [[r, c], [r, 14 - c], [14 - r, c], [14 - r, 14 - c], [c, r], [c, 14 - r], [14 - c, r], [14 - c, 14 - r]]) g[rr][cc] = k;
  };
  for (const [r, c] of [[0, 0], [0, 7]]) put(r, c, 'TW');
  for (let i = 1; i <= 4; i++) put(i, i, 'DW');
  for (const [r, c] of [[1, 5], [5, 5]]) put(r, c, 'TL');
  for (const [r, c] of [[0, 3], [2, 6], [3, 7], [6, 6]]) put(r, c, 'DL');
  g[CENTER][CENTER] = 'DW';
  return g;
}
const PREMIUM = buildPremium();

/* ---------- dicionario ---------- */
const CODE = {};
[...DICT.letters].forEach((c, i) => { CODE[c] = i + 1; });
let EDGES = null;
function edges() {
  if (!EDGES) {
    const bin = typeof Buffer !== 'undefined' ? Uint8Array.from(Buffer.from(DICT.data, 'base64')) : Uint8Array.from(atob(DICT.data), (ch) => ch.charCodeAt(0));
    EDGES = new Uint32Array(bin.buffer, bin.byteOffset, bin.length >> 2);
  }
  return EDGES;
}
function isWord(w) {
  const a = edges();
  let node = DICT.root;
  for (let i = 0; i < w.length; i++) {
    const c = CODE[w[i]];
    if (!c) return false;
    let j = node;
    let hit = false;
    for (;;) {
      const v = a[j];
      if ((v & 31) === c) {
        hit = true;
        if (i === w.length - 1) return ((v >> 5) & 1) === 1;
        node = v >>> 7;
        if (!node) return false;
        break;
      }
      if ((v >> 6) & 1) return false;
      j++;
    }
    if (!hit) return false;
  }
  return false;
}

/* ---------- estado ---------- */
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
const newBag = () => shuffle(Object.entries(TILES).flatMap(([k, v]) => new Array(v[0]).fill(k)));
const emptyBoard = () => Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
const sumRack = (rack) => rack.reduce((a, t) => a + VALUE[t], 0);
const upper = (s) => s.toUpperCase();

function lobbyState(players = 0) {
  return { phase: 'lobby', players, board: [], bag: [], racks: [], scores: [], turn: 0, first: 0, scoreless: 0, last: null, winners: [], endBonus: null, log: '' };
}
const setup = () => lobbyState(0);
const acceptsSeat = (s) => s.phase === 'lobby';
const seatJoined = (s, seat) => (s.phase === 'lobby' ? { ...s, players: Math.max(s.players, seat + 1) } : s);

function fillRack(s, seat) {
  while (s.racks[seat].length < RACK && s.bag.length) s.racks[seat].push(s.bag.pop());
}

function deal(prev, first) {
  const s = {
    ...prev,
    phase: 'playing',
    board: emptyBoard(),
    bag: newBag(),
    racks: Array.from({ length: prev.players }, () => []),
    scores: new Array(prev.players).fill(0),
    turn: first,
    first,
    scoreless: 0,
    last: null,
    winners: [],
    endBonus: null,
    log: 'Nova partida. A primeira palavra deve passar pela casa central.',
  };
  for (let i = 0; i < prev.players; i++) fillRack(s, i);
  return s;
}

function restart(state) {
  if (state.players < MIN_PLAYERS) return state;
  return deal(state, state.phase === 'lobby' ? randomInt(state.players) : (state.first + 1) % state.players);
}

/* ---------- validacao e pontuacao de uma jogada ---------- */
const inB = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

// Palavra que passa por (r, c) na direcao (dr, dc), dada a grade `b` (celulas {l, blank}).
function runAt(b, r, c, dr, dc) {
  let r0 = r;
  let c0 = c;
  while (inB(r0 - dr, c0 - dc) && b[r0 - dr][c0 - dc]) { r0 -= dr; c0 -= dc; }
  const cells = [];
  let rr = r0;
  let cc = c0;
  while (inB(rr, cc) && b[rr][cc]) { cells.push([rr, cc]); rr += dr; cc += dc; }
  return cells;
}

function scoreWord(b, cells, fresh) {
  let sum = 0;
  let mult = 1;
  let text = '';
  for (const [r, c] of cells) {
    const t = b[r][c];
    text += t.l;
    let v = t.blank ? 0 : VALUE[t.l];
    if (fresh.has(r * SIZE + c)) {
      const p = PREMIUM[r][c];
      if (p === 'DL') v *= 2;
      else if (p === 'TL') v *= 3;
      else if (p === 'DW') mult *= 2;
      else if (p === 'TW') mult *= 3;
    }
    sum += v;
  }
  return { word: text, points: sum * mult };
}

// tiles: [{ r, c, ch, as? }] com ch = letra do cavalete ('?' = coringa, `as` = letra escolhida).
// Retorna { error } ou { words: [{word, points}], total, cells }.
function evaluate(state, tiles) {
  if (!Array.isArray(tiles) || !tiles.length) return { error: 'Coloque ao menos uma peça no tabuleiro.' };
  if (tiles.length > RACK) return { error: 'Peças demais.' };
  const seen = new Set();
  const placed = [];
  for (const t of tiles) {
    if (!t || !Number.isInteger(t.r) || !Number.isInteger(t.c) || !inB(t.r, t.c)) return { error: 'Posição inválida.' };
    if (state.board[t.r][t.c]) return { error: 'Já há uma peça nessa casa.' };
    const key = t.r * SIZE + t.c;
    if (seen.has(key)) return { error: 'Duas peças na mesma casa.' };
    seen.add(key);
    if (typeof t.ch !== 'string' || !TILES[t.ch]) return { error: 'Peça inválida.' };
    let letter = t.ch;
    let blank = false;
    if (t.ch === '?') {
      if (typeof t.as !== 'string' || !LETTERS.includes(t.as)) return { error: 'Escolha a letra do coringa.' };
      letter = t.as;
      blank = true;
    }
    placed.push({ r: t.r, c: t.c, l: letter, blank });
  }
  const rows = new Set(placed.map((p) => p.r));
  const cols = new Set(placed.map((p) => p.c));
  if (rows.size > 1 && cols.size > 1) return { error: 'As peças devem ficar na mesma linha ou na mesma coluna.' };

  const b = state.board.map((row) => row.slice());
  for (const p of placed) b[p.r][p.c] = { l: p.l, blank: p.blank };

  const horizontal = rows.size === 1;
  if (placed.length > 1) {
    // sem lacunas entre a primeira e a ultima peca
    const line = horizontal ? placed.map((p) => p.c) : placed.map((p) => p.r);
    const lo = Math.min(...line);
    const hi = Math.max(...line);
    for (let k = lo; k <= hi; k++) {
      const cell = horizontal ? b[placed[0].r][k] : b[k][placed[0].c];
      if (!cell) return { error: 'Há uma lacuna entre as peças.' };
    }
  }

  const empty = state.board.every((row) => row.every((x) => !x));
  if (empty) {
    if (!seen.has(CENTER * SIZE + CENTER)) return { error: 'A primeira palavra deve passar pela casa central.' };
    if (placed.length < 2) return { error: 'A primeira palavra precisa de pelo menos 2 letras.' };
  }

  const fresh = new Set(placed.map((p) => p.r * SIZE + p.c));
  const words = [];
  const done = new Set();
  const touchesOld = { v: false };
  const addRun = (cells) => {
    if (cells.length < 2) return;
    const key = `${cells[0][0]},${cells[0][1]},${cells.length},${cells[0][0] === cells[1][0] ? 'h' : 'v'}`;
    if (done.has(key)) return;
    done.add(key);
    if (cells.some(([r, c]) => !fresh.has(r * SIZE + c))) touchesOld.v = true;
    words.push({ ...scoreWord(b, cells, fresh), cells });
  };
  for (const p of placed) {
    addRun(runAt(b, p.r, p.c, 0, 1));
    addRun(runAt(b, p.r, p.c, 1, 0));
  }
  if (!words.length) return { error: 'A jogada precisa formar uma palavra de 2 ou mais letras.' };
  if (!empty && !touchesOld.v) return { error: 'A jogada deve se ligar às peças que já estão no tabuleiro.' };
  // a palavra principal tem que conter todas as pecas jogadas
  if (placed.length > 1) {
    const mainCells = runAt(b, placed[0].r, placed[0].c, horizontal ? 0 : 1, horizontal ? 1 : 0);
    if (!placed.every((p) => mainCells.some(([r, c]) => r === p.r && c === p.c))) return { error: 'Há uma lacuna entre as peças.' };
  }

  const bad = words.filter((w) => !isWord(w.word)).map((w) => upper(w.word));
  if (bad.length) return { error: `Palavra não encontrada no dicionário: ${bad.join(', ')}.` };

  let total = words.reduce((a, w) => a + w.points, 0);
  const bingo = placed.length === RACK;
  if (bingo) total += BINGO;
  return { words: words.map((w) => ({ word: upper(w.word), points: w.points })), total, bingo, placed };
}

/* ---------- jogadas ---------- */
const clone = (x) => JSON.parse(JSON.stringify(x));

function finishGame(s, why) {
  s.phase = 'ended';
  const bonus = new Array(s.players).fill(0);
  const out = s.racks.findIndex((r, i) => r.length === 0 && why === 'out');
  if (why === 'out') {
    let sum = 0;
    s.racks.forEach((r, i) => {
      if (i === out) return;
      const v = sumRack(r);
      bonus[i] = -v;
      sum += v;
    });
    bonus[out] = sum;
  } else {
    s.racks.forEach((r, i) => { bonus[i] = -sumRack(r); });
  }
  s.scores = s.scores.map((x, i) => x + bonus[i]);
  s.endBonus = bonus;
  const best = Math.max(...s.scores);
  s.winners = s.scores.map((x, i) => i).filter((i) => s.scores[i] === best);
  s.log = why === 'out' ? 'Fim da partida: um jogador ficou sem peças.' : 'Fim da partida: seis jogadas seguidas sem pontuar.';
}

function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    if (state.players < MIN_PLAYERS) return { error: 'São necessários pelo menos 2 jogadores.' };
    return { state: deal(state, randomInt(state.players)) };
  }
  if (state.phase !== 'playing') return { error: 'A partida terminou. Use "Nova partida" para jogar outra.' };
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players) return { error: 'Você não está jogando.' };
  if (seat !== state.turn) return { error: 'Não é a sua vez.' };

  const s = clone(state);
  const name = `Jogador ${seat + 1}`;

  if (req.t === 'pass') {
    s.scoreless += 1;
    s.last = { seat, kind: 'pass' };
    s.log = `${name} passou.`;
    if (s.scoreless >= SCORELESS_LIMIT) { finishGame(s, 'stuck'); return { state: s }; }
    s.turn = (seat + 1) % s.players;
    return { state: s };
  }

  if (req.t === 'exchange') {
    if (s.bag.length < RACK) return { error: 'Só é possível trocar com 7 ou mais peças no saco.' };
    const give = req.tiles;
    if (!Array.isArray(give) || !give.length || give.length > RACK) return { error: 'Escolha as peças para trocar.' };
    const rack = s.racks[seat].slice();
    for (const t of give) {
      const i = rack.indexOf(t);
      if (i < 0) return { error: 'Você não tem essas peças.' };
      rack.splice(i, 1);
    }
    s.racks[seat] = rack;
    fillRack(s, seat);
    s.bag.push(...give);
    shuffle(s.bag);
    s.scoreless += 1;
    s.last = { seat, kind: 'exchange', n: give.length };
    s.log = `${name} trocou ${give.length} peça${give.length > 1 ? 's' : ''}.`;
    if (s.scoreless >= SCORELESS_LIMIT) { finishGame(s, 'stuck'); return { state: s }; }
    s.turn = (seat + 1) % s.players;
    return { state: s };
  }

  if (req.t === 'play') {
    const res = evaluate(s, req.tiles);
    if (res.error) return { error: res.error };
    // as pecas precisam estar no cavalete
    const rack = s.racks[seat].slice();
    for (const t of req.tiles) {
      const i = rack.indexOf(t.ch);
      if (i < 0) return { error: 'Você não tem essas peças.' };
      rack.splice(i, 1);
    }
    for (const p of res.placed) s.board[p.r][p.c] = { l: p.l, blank: p.blank };
    s.racks[seat] = rack;
    fillRack(s, seat);
    s.scores[seat] += res.total;
    s.scoreless = 0;
    s.last = { seat, kind: 'play', words: res.words, total: res.total, bingo: res.bingo, cells: res.placed.map((p) => [p.r, p.c]) };
    s.log = `${name} fez ${res.total} ponto${res.total === 1 ? '' : 's'}: ${res.words.map((w) => w.word).join(', ')}${res.bingo ? ' (bingo! +50)' : ''}.`;
    if (!s.racks[seat].length && !s.bag.length) { finishGame(s, 'out'); return { state: s }; }
    s.turn = (seat + 1) % s.players;
    return { state: s };
  }

  return { error: 'Jogada inválida.' };
}

/* ---------- visoes ---------- */
function view(state) {
  if (state.phase === 'lobby') return { phase: 'lobby', players: state.players, log: '', draw: false, over: false };
  const ended = state.phase === 'ended';
  return {
    phase: state.phase,
    players: state.players,
    turn: ended ? null : state.turn,
    board: state.board,
    premium: PREMIUM,
    values: VALUE,
    scores: state.scores,
    counts: state.racks.map((r) => r.length),
    bagCount: state.bag.length,
    last: state.last,
    scoreless: state.scoreless,
    winners: ended ? state.winners : [],
    endBonus: ended ? state.endBonus : null,
    racks: ended ? state.racks : null,
    log: state.log,
    draw: false,
    over: ended,
  };
}

function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby' || seat >= state.players) return null;
  return { rack: state.racks[seat], canExchange: state.phase === 'playing' && state.bag.length >= RACK };
}

// Piloto automatico: passa a vez (nao tenta formar palavras).
function waitingOn(state) {
  return state.phase === 'playing' ? [state.turn] : [];
}
function autoMove() {
  return { t: 'pass' };
}

export default {
  id: 'scrabble',
  name: 'Scrabble',
  description: 'Scrabble em português: forme palavras no tabuleiro 15x15. De 2 a 4 jogadores.',
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
  _evaluate: evaluate,
  _isWord: isWord,
  _PREMIUM: PREMIUM,
  _TILES: TILES,
  _VALUE: VALUE,
};
