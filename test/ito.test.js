'use strict';
const assert = require('assert');
const g = require('../games/ito/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const lobby = (k) => { let s = g.setup(); for (let i = 0; i < k; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r)); return r.state; };
const fail = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.error, 'esperava erro'); return r.error; };
const started = (k = 3) => play(lobby(k), 0, { t: 'start' });
// todos dao pista em todas as cartas
const clued = (s) => { for (const c of s.cards) s = play(s, c.owner, { t: 'clue', card: c.id, text: `pista ${'abcdefghijklmnopqrstuvwxyz'[c.id]}` }); return s; };
const confirmAll = (s) => { for (let i = 0; i < s.players; i++) s = play(s, i, { t: 'ready' }); return s; };
// ordena as cartas do jeito certo (ou errado) antes de confirmar
const order = (s, right) => {
  const ids = s.cards.map((c) => c.id).sort((a, b) => (right ? s.cards[a].n - s.cards[b].n : s.cards[b].n - s.cards[a].n));
  s.order = ids;
  return s;
};

t('inicio: minimo de 2, so o anfitriao; 1 carta por jogador de 1 a 100 sem repeticao', () => {
  assert.ok(/pelo menos 2/.test(fail(lobby(1), 0, { t: 'start' })));
  assert.ok(/anfitri/.test(fail(lobby(3), 1, { t: 'start' })));
  const s = started(4);
  assert.strictEqual(s.cards.length, 4);
  assert.strictEqual(new Set(s.cards.map((c) => c.n)).size, 4);
  s.cards.forEach((c) => assert.ok(c.n >= 1 && c.n <= 100));
  assert.deepStrictEqual(s.cards.map((c) => c.owner), [0, 1, 2, 3]);
  assert.strictEqual(s.step, 'clue');
  assert.strictEqual(s.lives, 3);
});

t('temas: lista grande, sem repeticao e cada tema com extremos', () => {
  assert.ok(g._THEMES.length >= 50);
  g._THEMES.forEach(([q, lo, hi]) => assert.ok(q && lo && hi));
  assert.strictEqual(new Set(g._THEMES.map((x) => x[0])).size, g._THEMES.length);
});

t('privacidade: pistas so aparecem depois de todos darem; numeros so na revelacao; cada um ve os seus', () => {
  let s = started(3);
  s = play(s, 0, { t: 'clue', card: 0, text: 'tubarão' });
  let v = g.view(s);
  assert.strictEqual(v.cards[0].clue, null);
  assert.strictEqual(v.cards[0].hasClue, true);
  assert.ok(v.cards.every((c) => c.n === null));
  assert.strictEqual(g.viewFor(s, 0).mine[0].clue, 'tubarão');
  assert.strictEqual(g.viewFor(s, 0).mine[0].n, s.cards[0].n);
  assert.strictEqual(g.viewFor(s, 1).mine.length, 1);
  assert.ok(!JSON.stringify(g.viewFor(s, 1)).includes(`"id":0`));
  s = play(s, 1, { t: 'clue', card: 1, text: 'gato' });
  s = play(s, 2, { t: 'clue', card: 2, text: 'formiga' });
  assert.strictEqual(s.step, 'arrange');
  v = g.view(s);
  assert.strictEqual(v.cards[0].clue, 'tubarão');
  assert.ok(v.cards.every((c) => c.n === null), 'numeros continuam secretos ao ordenar');
});

t('pistas: so da propria carta, sem numeros, nao vazia, com limite de tamanho', () => {
  const s = started(3);
  assert.ok(/não é sua/.test(fail(s, 1, { t: 'clue', card: 0, text: 'x' })));
  assert.ok(/números/.test(fail(s, 0, { t: 'clue', card: 0, text: 'quase 50' })));
  assert.ok(/Escreva/.test(fail(s, 0, { t: 'clue', card: 0, text: '   ' })));
  assert.ok(/longa/.test(fail(s, 0, { t: 'clue', card: 0, text: 'a'.repeat(41) })));
  assert.ok(/hora/.test(fail(s, 0, { t: 'ready' })));
  assert.ok(/hora/.test(fail(s, 0, { t: 'move', id: 0, to: 1 })));
});

t('ordenar: qualquer um move cartas, mexer cancela as confirmacoes, todos confirmam e revela', () => {
  let s = clued(started(3));
  const before = s.order.slice();
  const id = before[0];
  s = play(s, 2, { t: 'move', id, to: 2 });
  assert.strictEqual(s.order[2], id);
  assert.strictEqual(new Set(s.order).size, 3);
  assert.ok(/inválida/.test(fail(s, 0, { t: 'move', id, to: 3 })));
  assert.ok(/inválida/.test(fail(s, 0, { t: 'move', id: 99, to: 0 })));
  s = play(s, 0, { t: 'ready' });
  s = play(s, 1, { t: 'ready' });
  assert.deepStrictEqual(g.waitingOn(s), [2]);
  s = play(s, 1, { t: 'move', id, to: 0 });
  assert.deepStrictEqual(s.ready, [], 'mover cancela as confirmacoes');
  s = play(s, 0, { t: 'ready' });
  s = play(s, 0, { t: 'ready', ok: false });
  assert.deepStrictEqual(s.ready, []);
  s = confirmAll(s);
  assert.strictEqual(s.step, 'reveal');
});

t('vitoria da rodada: ordem crescente sobe de etapa e o proximo jogador ganha a 2a carta', () => {
  let s = order(clued(started(3)), true);
  s = confirmAll(s);
  assert.ok(s.result.ok);
  assert.strictEqual(s.stage, 1);
  assert.strictEqual(s.lives, 3);
  assert.ok(g.view(s).cards.every((c) => c.n !== null), 'numeros reveladas');
  s = play(s, 1, { t: 'next' });
  assert.strictEqual(s.step, 'clue');
  assert.strictEqual(s.cards.length, 4);
  assert.strictEqual(s.cards.filter((c) => c.owner === 0).length, 2);
  assert.strictEqual(new Set(s.cards.map((c) => c.n)).size, 4);
});

t('derrota da rodada: ordem errada perde vida, aponta as cartas fora do lugar e repete a etapa', () => {
  let s = order(clued(started(3)), false);
  s.cards[0].n = 10; s.cards[1].n = 50; s.cards[2].n = 90;
  s.order = [2, 1, 0];
  s = confirmAll(s);
  assert.strictEqual(s.result.ok, false);
  assert.deepStrictEqual(s.result.wrong.sort(), [0, 2]);
  assert.strictEqual(s.lives, 2);
  assert.strictEqual(s.stage, 0);
  s = play(s, 0, { t: 'next' });
  assert.strictEqual(s.cards.length, 3);
  assert.strictEqual(s.phase, 'playing');
});

t('fim: 3 derrotas acabam o jogo; vencer com todos de 2 cartas e vitoria total', () => {
  let s = started(2);
  for (let i = 0; i < 3; i++) {
    s = clued(s);
    s.cards.forEach((c, k) => { c.n = 10 + k * 40; });
    s.order = [1, 0];
    s = confirmAll(s);
    assert.strictEqual(s.lives, 2 - i);
    s = play(s, 0, { t: 'next' });
  }
  assert.strictEqual(s.phase, 'ended');
  assert.strictEqual(g.view(s).won, false);
  assert.ok(/terminou/.test(fail(s, 0, { t: 'clue', card: 0, text: 'x' })));

  // vitoria: 2 jogadores precisam de 3 etapas (0, 1 e 2 jogadores com 2 cartas)
  let w = started(2);
  for (let stage = 0; stage <= 2; stage++) {
    assert.strictEqual(w.stage, stage);
    w = order(clued(w), true);
    w = confirmAll(w);
    assert.ok(w.result.ok);
    w = play(w, 0, { t: 'next' });
  }
  assert.strictEqual(w.phase, 'ended');
  assert.strictEqual(g.view(w).won, true);
  assert.strictEqual(g.restart(w).phase, 'playing');
});

t('piloto automatico: cada etapa segue sozinha ate o fim', () => {
  let s = started(3);
  for (let guard = 0; guard < 300 && s.phase === 'playing'; guard++) {
    const who = g.waitingOn(s)[0];
    s = play(s, who, g.autoMove(s, who));
  }
  assert.strictEqual(s.phase, 'ended');
});

console.log(`\n${n} testes passaram.`);
