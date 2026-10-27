'use strict';
// Dama brasileira (8x8): peca simples captura para frente e para tras,
// dama (rainha) voadora, captura obrigatoria e lei da maioria.
//
// Tabuleiro: board[r][c], r = 0 e o topo. Casas escuras: (r + c) % 2 === 1.
// Pecas: 'w' / 'W' (brancas, sobem), 'b' / 'B' (pretas, descem). Maiuscula = dama.
// Assento 0 = brancas (comeca), assento 1 = pretas.

const SIZE = 8;
const COLORS = ['w', 'b'];
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const DRAW_PLIES = 40; // 20 lances de cada lado so com damas, sem captura

const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const colorOf = (p) => (p ? p.toLowerCase() : null);
const isKing = (p) => p === 'W' || p === 'B';

function setup() {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 !== 1) continue;
      if (r < 3) board[r][c] = 'b';
      else if (r > 4) board[r][c] = 'w';
    }
  }
  return { board, turn: 0, winner: null, draw: false, quietPlies: 0, lastMove: null };
}

// Sequencias de captura a partir de (r0, c0). A peca que se move sai da casa de
// origem; as pecas capturadas so saem do tabuleiro ao fim da sequencia, portanto
// continuam bloqueando e nao podem ser capturadas duas vezes.
function captureSequences(board, r0, c0) {
  const piece = board[r0][c0];
  const color = colorOf(piece);
  const king = isKing(piece);
  const results = [];
  const taken = new Set();
  board[r0][c0] = null;

  const dfs = (r, c, path, caps) => {
    let extended = false;
    for (const [dr, dc] of DIRS) {
      let nr = r + dr;
      let nc = c + dc;
      if (king) {
        while (inside(nr, nc) && board[nr][nc] === null) {
          nr += dr;
          nc += dc;
        }
      }
      if (!inside(nr, nc)) continue;
      const target = board[nr][nc];
      if (!target || colorOf(target) === color || taken.has(nr * SIZE + nc)) continue;
      let lr = nr + dr;
      let lc = nc + dc;
      const key = nr * SIZE + nc;
      while (inside(lr, lc) && board[lr][lc] === null) {
        extended = true;
        taken.add(key);
        dfs(lr, lc, path.concat([[lr, lc]]), caps.concat([[nr, nc]]));
        taken.delete(key);
        if (!king) break;
        lr += dr;
        lc += dc;
      }
    }
    if (!extended && caps.length > 0) {
      results.push({ from: [r0, c0], path, captured: caps });
    }
  };

  dfs(r0, c0, [], []);
  board[r0][c0] = piece;
  return results;
}

function simpleMoves(board, r, c) {
  const piece = board[r][c];
  const king = isKing(piece);
  const forward = colorOf(piece) === 'w' ? -1 : 1;
  const moves = [];
  for (const [dr, dc] of DIRS) {
    if (!king && dr !== forward) continue;
    let nr = r + dr;
    let nc = c + dc;
    while (inside(nr, nc) && board[nr][nc] === null) {
      moves.push({ from: [r, c], path: [[nr, nc]], captured: [] });
      if (!king) break;
      nr += dr;
      nc += dc;
    }
  }
  return moves;
}

function legalMoves(board, seat) {
  const color = COLORS[seat];
  let captures = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (colorOf(board[r][c]) === color) captures = captures.concat(captureSequences(board, r, c));
    }
  }
  if (captures.length > 0) {
    const max = Math.max(...captures.map((m) => m.captured.length));
    return captures.filter((m) => m.captured.length === max);
  }
  let moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (colorOf(board[r][c]) === color) moves = moves.concat(simpleMoves(board, r, c));
    }
  }
  return moves;
}

const samePos = (a, b) => a[0] === b[0] && a[1] === b[1];

function move(state, seat, req) {
  if (state.winner !== null || state.draw) return { error: 'A partida terminou.' };
  if (seat !== state.turn) return { error: 'Não é a sua vez.' };
  if (!req || !Array.isArray(req.from) || !Array.isArray(req.path) || req.path.length === 0) {
    return { error: 'Jogada inválida.' };
  }
  const legal = legalMoves(state.board, seat).find(
    (m) =>
      samePos(m.from, req.from) &&
      m.path.length === req.path.length &&
      m.path.every((p, i) => Array.isArray(req.path[i]) && samePos(p, req.path[i]))
  );
  if (!legal) return { error: 'Jogada não permitida.' };

  const next = JSON.parse(JSON.stringify(state));
  const [fr, fc] = legal.from;
  let piece = next.board[fr][fc];
  next.board[fr][fc] = null;
  for (const [cr, cc] of legal.captured) next.board[cr][cc] = null;
  const [lr, lc] = legal.path[legal.path.length - 1];
  const lastRow = COLORS[seat] === 'w' ? 0 : SIZE - 1;
  if (!isKing(piece) && lr === lastRow) piece = piece.toUpperCase();
  next.board[lr][lc] = piece;

  const quiet = legal.captured.length === 0 && isKing(next.board[lr][lc]) && isKing(state.board[fr][fc]);
  next.quietPlies = quiet ? state.quietPlies + 1 : 0;
  next.lastMove = { from: legal.from, path: legal.path, captured: legal.captured };
  next.turn = 1 - seat;

  if (legalMoves(next.board, next.turn).length === 0) next.winner = seat;
  else if (next.quietPlies >= DRAW_PLIES) next.draw = true;
  return { state: next };
}

function view(state) {
  const over = state.winner !== null || state.draw;
  return {
    board: state.board,
    turn: state.turn,
    winner: state.winner,
    draw: state.draw,
    over,
    lastMove: state.lastMove,
    legal: over ? [] : legalMoves(state.board, state.turn),
  };
}

// Piloto automatico (jogador dispensado): quem o jogo esta esperando e uma jogada segura.
function waitingOn(state) {
  return state.winner !== null || state.draw ? [] : [state.turn];
}

function autoMove(state, seat) {
  const moves = legalMoves(state.board, seat);
  if (!moves.length) return null;
  const m = moves[Math.floor(Math.random() * moves.length)];
  return { from: m.from, path: m.path };
}

module.exports = {
  id: 'damas',
  name: 'Dama',
  description: 'Dama brasileira, 8x8, captura obrigatória e dama voadora.',
  minPlayers: 2,
  maxPlayers: 2,
  roles: ['Brancas', 'Pretas'],
  setup,
  move,
  view,
  waitingOn,
  autoMove,
  // expostos para teste
  _legalMoves: legalMoves,
};
