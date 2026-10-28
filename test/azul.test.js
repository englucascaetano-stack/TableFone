'use strict';
const assert = require('assert');
const g = require('../games/azul/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const lobby = (k) => { let s = g.setup(); for (let i = 0; i < k; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r)); return r.state; };
const fail = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.error, 'esperava erro'); };
const total = (s) => s.bag.reduce((a, b) => a + b, 0) + s.box.reduce((a, b) => a + b, 0) + s.factories.flat().length + s.center.length +
  s.boards.reduce((a, b) => a + b.pattern.reduce((x, l) => x + l.n, 0) + b.wall.flat().filter(Boolean).length + b.floor.filter((x) => x !== 'M').length, 0);

t('preparacao: fabricas por numero de jogadores e 100 azulejos', () => {
  for (const [p, f] of [[2, 5], [3, 7], [4, 9]]) {
    const s = g._deal(lobby(p), 0);
    assert.strictEqual(s.factories.length, f);
    assert.ok(s.factories.every((x) => x.length === 4));
    assert.strictEqual(total(s), 100);
  }
});

t('parede: cada cor aparece uma vez por linha e coluna', () => {
  for (let r = 0; r < 5; r++) assert.strictEqual(new Set([0, 1, 2, 3, 4].map((c) => g._colorAt(r, c))).size, 5);
  for (let c = 0; c < 5; c++) assert.strictEqual(new Set([0, 1, 2, 3, 4].map((r) => g._colorAt(r, c))).size, 5);
  assert.strictEqual(g._colorAt(0, 0), 0);
  assert.strictEqual(g._colorAt(1, 0), 4);
});

t('pontuacao da parede: isolado 1; horizontal; vertical; cruz', () => {
  const w = Array.from({ length: 5 }, () => new Array(5).fill(false));
  w[2][2] = true;
  assert.strictEqual(g._wallScore(w, 2, 2), 1);
  w[2][3] = true;
  assert.strictEqual(g._wallScore(w, 2, 3), 2);
  w[1][3] = true; w[3][3] = true;
  assert.strictEqual(g._wallScore(w, 2, 3), 2 + 3);
});

t('pegar de fabrica: o resto vai para o centro; jogada vai para a linha', () => {
  let s = g._deal(lobby(2), 0);
  s.factories[0] = [0, 0, 1, 2];
  s = play(s, 0, { t: 'take', src: 0, color: 0, row: 1 });
  assert.deepStrictEqual(s.center, [1, 2]);
  assert.deepStrictEqual(s.factories[0], []);
  assert.deepStrictEqual(s.boards[0].pattern[1], { color: 0, n: 2 });
  assert.strictEqual(s.turn, 1);
});

t('excedente vai para o chao; chao direto; linha com outra cor e cor ja na parede sao recusadas', () => {
  let s = g._deal(lobby(2), 0);
  s.factories[0] = [3, 3, 3, 1];
  s.factories[1] = [1, 1, 2, 2];
  let a = play(s, 0, { t: 'take', src: 0, color: 3, row: 0 });
  assert.strictEqual(a.boards[0].pattern[0].n, 1);
  assert.strictEqual(a.boards[0].floor.length, 2);
  a = play(s, 0, { t: 'take', src: 0, color: 3, row: 5 });
  assert.strictEqual(a.boards[0].floor.length, 3);
  s.boards[0].wall[0][0] = true; // Azul ja na parede da linha 0
  s.factories[2] = [0, 0, 0, 0];
  fail(s, 0, { t: 'take', src: 2, color: 0, row: 0 });
  s.boards[0].pattern[1] = { color: 2, n: 1 };
  fail(s, 0, { t: 'take', src: 1, color: 1, row: 1 });
  s.boards[0].pattern[3] = { color: 1, n: 3 };
  s.factories[3] = [1, 1, 1, 1];
  const full = play(s, 0, { t: 'take', src: 3, color: 1, row: 3 });
  assert.strictEqual(full.boards[0].pattern[3].n, 4);
  assert.strictEqual(full.boards[0].floor.length, 3);
});

t('centro: primeiro a pegar leva o marcador (chao) e abre a proxima rodada', () => {
  let s = g._deal(lobby(3), 0);
  s.center = [4, 4, 2];
  s = play(s, 0, { t: 'take', src: 'c', color: 4, row: 2 });
  assert.strictEqual(s.marker, false);
  assert.strictEqual(s.nextFirst, 0);
  assert.deepStrictEqual(s.boards[0].floor, ['M']);
  assert.deepStrictEqual(s.center, [2]);
  const r = g.move(s, 1, { t: 'take', src: 'c', color: 2, row: 0 });
  assert.deepStrictEqual(r.state.boards[1].floor, []);
});

t('validacoes: fora da vez, cor ausente, origem invalida', () => {
  const s = g._deal(lobby(2), 0);
  fail(s, 1, { t: 'take', src: 0, color: 0, row: 5 });
  s.factories[0] = [0, 0, 0, 0];
  fail(s, 0, { t: 'take', src: 0, color: 1, row: 5 });
  fail(s, 0, { t: 'take', src: 99, color: 0, row: 5 });
  fail(s, 0, { t: 'take', src: 'c', color: 0, row: 5 });
  fail(s, 0, { t: 'take', src: 0, color: 0, row: 6 });
});

t('fim de rodada: pontua parede, penaliza chao (minimo 0), descarta na tampa, marcador define quem abre', () => {
  let s = g._deal(lobby(2), 0);
  s.factories = [[0, 0], [], [], [], []];
  s.center = [];
  s.marker = false;
  s.nextFirst = 1;
  s.boards[0].pattern[1] = { color: 0, n: 0 };
  s.boards[1].pattern[0] = { color: 2, n: 1 };
  s.boards[1].floor = [1, 1, 1];
  s.boards[1].score = 2;
  s = play(s, 0, { t: 'take', src: 0, color: 0, row: 1 });
  assert.strictEqual(s.round, 2);
  assert.ok(s.boards[0].wall[1][1]);                        // Azul na linha 2 fica na coluna 2 (indice 1)
  assert.strictEqual(s.boards[0].score, 1);
  assert.ok(s.boards[1].wall[0][2]);                        // Vermelho na linha 1: coluna 3
  assert.strictEqual(s.boards[1].score, 0);                 // 2 + 1 - (1+1+2) = -1 -> 0
  assert.strictEqual(s.turn, 1);
  assert.strictEqual(s.marker, true);
});

t('pontuacao nunca fica abaixo de zero', () => {
  let s = g._deal(lobby(2), 0);
  s.factories = [[0], [], [], [], []];
  s.boards[1].floor = [1, 1, 1, 1, 1, 1, 1];
  s.boards[1].score = 3;
  s = play(s, 0, { t: 'take', src: 0, color: 0, row: 5 });
  assert.strictEqual(s.boards[1].score, 0);
});

t('fim da partida: linha completa, bonus e vencedor', () => {
  let s = g._deal(lobby(2), 0);
  s.factories = [[0], [], [], [], []];
  s.boards[0].wall[0] = [false, true, true, true, true];
  s.boards[0].score = 10;
  s.boards[1].score = 5;
  s = play(s, 0, { t: 'take', src: 0, color: 0, row: 0 });
  assert.strictEqual(s.phase, 'ended');
  assert.strictEqual(s.bonus[0].rows, 1);
  assert.deepStrictEqual(s.winners, [0]);
  assert.ok(s.boards[0].score >= 10 + 5 + 2);
  fail(s, 1, { t: 'take', src: 0, color: 0, row: 5 });
  const r = g.restart(s);
  assert.strictEqual(r.phase, 'playing');
  assert.strictEqual(r.turn, 1);
});

t('saco vazio e reabastecido com a tampa', () => {
  const s = g._deal(lobby(2), 0);
  s.bag = [0, 0, 0, 0, 0];
  s.box = [8, 0, 0, 0, 0];
  const a = g._deal(lobby(2), 0);
  assert.ok(a);
  // simula nova rodada via fim de rodada
  s.factories = [[1], [], [], [], []];
  const r = play(s, 0, { t: 'take', src: 0, color: 1, row: 5 });
  assert.strictEqual(r.factories.flat().length + r.bag.reduce((x, y) => x + y, 0), 9); // 8 da tampa + o azulejo do chao
});

t('piloto automatico: sempre devolve jogada valida e termina partidas', () => {
  for (let games = 0; games < 60; games++) {
    const p = 2 + (games % 3);
    let s = g._deal(lobby(p), 0);
    let steps = 0;
    while (s.phase === 'playing') {
      assert.deepStrictEqual(g.waitingOn(s), [s.turn]);
      const m = g.autoMove(s, s.turn);
      assert.ok(m);
      s = play(s, s.turn, m);
      if (s.phase === 'playing') assert.strictEqual(total(s), 100);
      assert.ok(++steps < 2000);
    }
    assert.ok(s.winners.length >= 1);
    assert.ok(s.boards.every((b) => b.score >= 0));
  }
});

t('visao publica contem tudo e estado inicial do lobby', () => {
  const s = g._deal(lobby(2), 0);
  const v = g.view(s);
  assert.strictEqual(v.factories.length, 5);
  assert.strictEqual(v.bagCount, 80);
  assert.strictEqual(v.turn, 0);
  const l = g.view(lobby(2));
  assert.strictEqual(l.phase, 'lobby');
  assert.strictEqual(g.move(lobby(1), 0, { t: 'start' }).error !== undefined, true);
  assert.strictEqual(g.move(lobby(2), 1, { t: 'start' }).error !== undefined, true);
});

console.log(`\n${n} testes passaram.`);
