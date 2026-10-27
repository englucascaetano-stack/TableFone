'use strict';
const assert = require('assert');
const g = require('../games/damas/game.js');

const empty = () => Array.from({ length: 8 }, () => Array(8).fill(null));
const st = (board, turn = 0) => ({ board, turn, winner: null, draw: false, quietPlies: 0, lastMove: null });
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('posicao inicial: 12 pecas por lado e 7 lances brancos', () => {
  const s = g.setup();
  const count = (ch) => s.board.flat().filter((p) => p === ch).length;
  assert.strictEqual(count('w'), 12);
  assert.strictEqual(count('b'), 12);
  assert.strictEqual(g._legalMoves(s.board, 0).length, 7);
  assert.strictEqual(g._legalMoves(s.board, 1).length, 7);
});

t('captura e obrigatoria', () => {
  const b = empty();
  b[5][2] = 'w'; b[4][3] = 'b'; b[7][0] = 'w';
  const m = g._legalMoves(b, 0);
  assert.ok(m.every((x) => x.captured.length === 1));
  assert.strictEqual(m.length, 1);
  assert.deepStrictEqual(m[0].path, [[3, 4]]);
});

t('peca simples captura para tras', () => {
  const b = empty();
  b[3][2] = 'w'; b[4][3] = 'b';
  const m = g._legalMoves(b, 0);
  assert.strictEqual(m.length, 1);
  assert.deepStrictEqual(m[0].path, [[5, 4]]);
});

t('lei da maioria: obriga a sequencia maior', () => {
  const b = empty();
  // w em (7,0): captura 1 por (6,1)->(5,2); w em (7,4): captura 2 em sequencia
  b[7][0] = 'w'; b[6][1] = 'b';
  b[7][4] = 'w'; b[6][5] = 'b'; b[4][5] = 'b';
  const m = g._legalMoves(b, 0);
  assert.strictEqual(m.length, 1);
  assert.strictEqual(m[0].captured.length, 2);
  assert.deepStrictEqual(m[0].from, [7, 4]);
});

t('peca capturada nao e removida no meio da sequencia (nao salta duas vezes)', () => {
  const b = empty();
  b[7][0] = 'w'; b[6][1] = 'b'; b[4][3] = 'b'; b[4][1] = 'b';
  const m = g._legalMoves(b, 0);
  assert.ok(m.every((x) => new Set(x.captured.map(String)).size === x.captured.length));
});

t('dama voadora captura a distancia e escolhe casa de pouso', () => {
  const b = empty();
  b[7][0] = 'W'; b[4][3] = 'b';
  const m = g._legalMoves(b, 0);
  assert.strictEqual(m.length, 4); // pousos em (3,4), (2,5), (1,6), (0,7)
});

t('promocao ao fim do lance', () => {
  const b = empty();
  b[1][2] = 'w'; b[7][6] = 'b';
  const r = g.move(st(b, 0), 0, { from: [1, 2], path: [[0, 1]] });
  assert.strictEqual(r.state.board[0][1], 'W');
});

t('peca passando pela ultima linha em captura continua simples se puder capturar', () => {
  const b = empty();
  // w captura (1,2)->pousa (0,3)?? nao: montar: w em (2,1) captura b em (1,2) pousa (0,3) e fim -> vira dama
  b[2][1] = 'w'; b[1][2] = 'b'; b[7][6] = 'b';
  const r = g.move(st(b, 0), 0, { from: [2, 1], path: [[0, 3]] });
  assert.strictEqual(r.state.board[0][3], 'W');
  assert.strictEqual(r.state.board[1][2], null);
});

t('rejeita jogada fora da vez e jogada ilegal', () => {
  const s = g.setup();
  assert.ok(g.move(s, 1, { from: [2, 1], path: [[3, 0]] }).error);
  assert.ok(g.move(s, 0, { from: [5, 0], path: [[3, 2]] }).error);
  assert.ok(g.move(s, 0, { from: [5, 0], path: [[4, 1]] }).state);
});

t('vitoria quando o adversario nao tem lances', () => {
  const b = empty();
  b[5][2] = 'w'; b[4][3] = 'b';
  const r = g.move(st(b, 0), 0, { from: [5, 2], path: [[3, 4]] });
  assert.strictEqual(r.state.winner, 0);
  assert.ok(g.move(r.state, 1, { from: [0, 0], path: [[1, 1]] }).error);
});

t('empate apos 40 meios-lances so com damas sem captura', () => {
  const b = empty();
  b[7][0] = 'W'; b[0][7] = 'B';
  const s = st(b, 0);
  s.quietPlies = 39;
  const r = g.move(s, 0, { from: [7, 0], path: [[6, 1]] });
  assert.strictEqual(r.state.draw, true);
});

console.log(`${n} testes passaram`);
