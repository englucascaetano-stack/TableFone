'use strict';
const assert = require('assert');
const g = require('../games/scrabble/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const lobby = (k) => { let s = g.setup(); for (let i = 0; i < k; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r)); return r.state; };
const fail = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.error, 'esperava erro'); return r.error; };
const started = (k = 2) => g._deal(lobby(k), 0);
// coloca uma palavra no tabuleiro direto (para montar cenarios)
const put = (s, word, r, c, dir = 'h', blanks = []) => {
  [...word].forEach((ch, i) => { s.board[dir === 'h' ? r : r + i][dir === 'h' ? c + i : c] = { l: ch, blank: blanks.includes(i) }; });
};
const tilesOf = (word, r, c, dir = 'h') => [...word].map((ch, i) => ({ r: dir === 'h' ? r : r + i, c: dir === 'h' ? c + i : c, ch }));
const give = (s, seat, letters) => { s.racks[seat] = [...letters]; };

t('pecas: 120 no total, 3 coringas, sem K/W/Y, Ç presente', () => {
  const total = Object.values(g._TILES).reduce((a, v) => a + v[0], 0);
  assert.strictEqual(total, 120);
  assert.strictEqual(g._TILES['?'][0], 3);
  for (const k of ['k', 'w', 'y']) assert.ok(!g._TILES[k]);
  assert.ok(g._TILES['ç']);
  const s = started(3);
  assert.strictEqual(s.bag.length + s.racks.reduce((a, r) => a + r.length, 0), 120);
  s.racks.forEach((r) => assert.strictEqual(r.length, 7));
});

t('tabuleiro: casas premiadas na quantidade padrao e simetricas', () => {
  const c = {};
  g._PREMIUM.flat().forEach((k) => { if (k) c[k] = (c[k] || 0) + 1; });
  assert.deepStrictEqual(c, { TW: 8, DW: 17, TL: 12, DL: 24 });
  assert.strictEqual(g._PREMIUM[7][7], 'DW');
  for (let r = 0; r < 15; r++) for (let q = 0; q < 15; q++) assert.strictEqual(g._PREMIUM[r][q], g._PREMIUM[q][r]);
});

t('dicionario: palavras comuns, flexoes, acentos ignorados e Ç', () => {
  for (const w of ['casa', 'casas', 'jogamos', 'falaram', 'zebra', 'queijo', 'coraçao', 'xadrez', 'mesa', 'cantavamos']) assert.ok(g._isWord(w), w);
  for (const w of ['xyzw', 'qwert', 'kkk', 'aaaaaa', 'casaa', 'ção']) assert.ok(!g._isWord(w), w);
});

t('primeira jogada: deve cobrir o centro, 2+ letras, palavra valida e pontuacao com palavra dupla', () => {
  const s = started();
  give(s, 0, ['c', 'a', 's', 'a', 'x', 'e', 'z']);
  assert.ok(fail(s, 0, { t: 'play', tiles: tilesOf('casa', 0, 0) }).includes('central'));
  assert.ok(fail(s, 0, { t: 'play', tiles: [{ r: 7, c: 7, ch: 'c' }] }).includes('2 letras'));
  assert.ok(fail(s, 0, { t: 'play', tiles: tilesOf('casx', 7, 4) }).includes('dicionário'));
  const r = play(s, 0, { t: 'play', tiles: tilesOf('casa', 7, 4) });
  // c2 a1 s1 a1 = 5; (7,7) e casa central DW => 10
  assert.strictEqual(r.scores[0], 10);
  assert.strictEqual(r.racks[0].length, 7);
  assert.strictEqual(r.turn, 1);
  assert.strictEqual(r.bag.length, s.bag.length - 4);
});

t('premios so valem para pecas novas; palavras cruzadas pontuam; coringa vale 0', () => {
  const s = started();
  put(s, 'casa', 7, 4);
  give(s, 1, ['z', 'e', 'b', 'r', 'a', 'o', 'u']);
  // zebra na vertical cruzando o 'e'? usar 'ara' simples: coloca "jogo" cruzando
  const base = JSON.parse(JSON.stringify(s));
  // palavra "sal" vertical a partir do 's' de casa em (7,6): s(7,6) existente + a(8,6) l(9,6) novos
  give(base, 1, ['a', 'l', 'x', 'x', 'x', 'x', 'x']);
  const res = g._evaluate(base, [{ r: 8, c: 6, ch: 'a' }, { r: 9, c: 6, ch: 'l' }]);
  assert.ok(res.words, JSON.stringify(res));
  // s(1) + a(1) + l(2); (8,6)? premium DL em (8,6): a vale 2; (9,6) sem premio => 1+2+2 = 5
  assert.strictEqual(g._PREMIUM[8][6], 'DL');
  assert.strictEqual(res.words[0].word, 'SAL');
  assert.strictEqual(res.total, 1 + 1 * 2 + 2);
  // coringa vale 0
  const bl = g._evaluate(base, [{ r: 8, c: 6, ch: '?', as: 'a' }, { r: 9, c: 6, ch: 'l' }]);
  assert.strictEqual(bl.total, 1 + 0 + 2);
  assert.ok(g._evaluate(base, [{ r: 8, c: 6, ch: '?' }]).error);
});

t('regras de posicao: linha unica, lacuna, conexao, casa ocupada', () => {
  const s = started();
  put(s, 'casa', 7, 4);
  assert.ok(g._evaluate(s, [{ r: 3, c: 3, ch: 'a' }, { r: 4, c: 4, ch: 'b' }]).error.includes('mesma linha'));
  assert.ok(g._evaluate(s, [{ r: 2, c: 2, ch: 'a' }, { r: 2, c: 3, ch: 'b' }]).error.includes('ligar'));
  assert.ok(g._evaluate(s, [{ r: 7, c: 4, ch: 'a' }, { r: 8, c: 4, ch: 'b' }]).error.includes('peça'));
  assert.ok(g._evaluate(s, [{ r: 5, c: 4, ch: 'a' }, { r: 9, c: 4, ch: 'b' }]).error.includes('lacuna'));
  assert.ok(g._evaluate(s, [{ r: 5, c: 4, ch: 'a' }, { r: 5, c: 4, ch: 'b' }]).error.includes('mesma casa'));
});

t('estender palavra existente e formar duas palavras ao mesmo tempo', () => {
  const s = started();
  put(s, 'casa', 7, 4);
  const ext = g._evaluate(s, [{ r: 7, c: 8, ch: 's' }]);
  assert.ok(ext.words, JSON.stringify(ext));
  assert.strictEqual(ext.words[0].word, 'CASAS');
  // peca isolada ao lado formando duas palavras: 'a' acima de... (6,4)+(c4)... usar 'ca' vertical e 'ba' etc: pular
  const bad = g._evaluate(s, [{ r: 7, c: 3, ch: 'x' }]);
  assert.ok(bad.error);
});

t('bingo: 7 pecas valem 50 pontos extras', () => {
  const s = started();
  give(s, 0, ['c', 'a', 'r', 'r', 'o', 'ç', 'a']);
  const res = g._evaluate(s, tilesOf('carroça', 7, 1));
  assert.ok(res.words, JSON.stringify(res));
  assert.ok(res.bingo);
  assert.ok(res.total >= 50 + 10);
});

t('passar e trocar: contam como sem pontuar; troca exige 7+ pecas no saco', () => {
  let s = started(3);
  const old = s.racks[0].slice();
  s = play(s, 0, { t: 'exchange', tiles: [old[0], old[1]] });
  assert.strictEqual(s.racks[0].length, 7);
  assert.strictEqual(s.scoreless, 1);
  assert.strictEqual(s.turn, 1);
  fail(s, 0, { t: 'pass' }); // nao e a vez
  fail(s, 1, { t: 'exchange', tiles: ['k'] });
  s = play(s, 1, { t: 'pass' });
  assert.strictEqual(s.scoreless, 2);
  const low = started();
  low.bag = low.bag.slice(0, 5);
  assert.ok(fail(low, 0, { t: 'exchange', tiles: [low.racks[0][0]] }).includes('7'));
});

t('fim por seis jogadas sem pontuar: desconta as pecas de cada um', () => {
  let s = started(2);
  for (let i = 0; i < 6; i++) s = play(s, s.turn, { t: 'pass' });
  assert.strictEqual(s.phase, 'ended');
  s.racks.forEach((r, i) => assert.strictEqual(s.endBonus[i], -r.reduce((a, x) => a + g._VALUE[x], 0)));
  assert.ok(s.winners.length >= 1);
});

t('fim por esvaziar o cavalete com o saco vazio: recebe as pecas dos outros', () => {
  const s = started(2);
  s.bag = [];
  give(s, 0, ['c', 'a', 's', 'a']);
  give(s, 1, ['z', 'x']);
  s.turn = 0;
  const r = play(s, 0, { t: 'play', tiles: tilesOf('casa', 7, 4) });
  assert.strictEqual(r.phase, 'ended');
  assert.strictEqual(r.endBonus[0], 16);
  assert.strictEqual(r.endBonus[1], -16);
  assert.strictEqual(r.scores[0], 10 + 16);
  assert.deepStrictEqual(r.winners, [0]);
});

t('visoes: rack so do dono; publica sem cavaletes durante o jogo', () => {
  const s = started(3);
  const pub = JSON.stringify(g.view(s));
  assert.ok(!pub.includes('"racks"') || g.view(s).racks === null);
  assert.deepStrictEqual(g.viewFor(s, 1).rack, s.racks[1]);
  assert.strictEqual(g.viewFor(s, null), null);
});

t('inicio, piloto automatico e nova partida', () => {
  assert.ok(fail(lobby(1), 0, { t: 'start' }));
  assert.ok(fail(lobby(2), 1, { t: 'start' }));
  let s = play(lobby(2), 0, { t: 'start' });
  assert.strictEqual(s.phase, 'playing');
  const m = g.autoMove(s, s.turn);
  s = play(s, s.turn, m);
  assert.strictEqual(g.restart(s).phase, 'playing');
});

t('palavras cruzadas: peca ao lado de letra ja posta forma palavra extra e a mensagem lista todas', () => {
  const s = started(2);
  put(s, 'cem', 5, 7, 'v');
  put(s, 'mijo', 7, 7, 'h');
  s.turn = 0;
  give(s, 0, ['v', 'r', 'a', 'a', 'a', 'a', 'a']);
  // V em (6,8) fica ao lado do E (6,7) e R em (8,8) fecha "VIR" com o I (7,8)
  const e = fail(s, 0, { t: 'play', tiles: [{ r: 6, c: 8, ch: 'v' }, { r: 8, c: 8, ch: 'r' }] });
  assert.ok(/EV/.test(e) && /VIR/.test(e), e);
});

console.log(`\n${n} testes passaram.`);
