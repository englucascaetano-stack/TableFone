'use strict';
const assert = require('assert');
const g = require('../games/codenames/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const lobby = (k) => { let s = g.setup(); for (let i = 0; i < k; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r)); return r.state; };
const fail = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.error, 'deveria falhar: ' + JSON.stringify(req)); return r.error; };
const started = (k = 4) => play(lobby(k), 0, { t: 'start' });
const idx = (s, k) => s.key.map((c, i) => (c === k ? i : -1)).filter((i) => i >= 0);

t('lista de palavras: sem repeticao (ignorando acentos) e sem espacos', () => {
  assert.ok(g._words.length >= 300);
  assert.strictEqual(new Set(g._words.map(g._norm)).size, g._words.length);
  g._words.forEach((w) => assert.ok(/^\S+$/.test(w)));
});

t('inicio: minimo de 4 jogadores, so o anfitriao; tabuleiro 9/8/7/1', () => {
  assert.ok(g.move(lobby(3), 0, { t: 'start' }).error);
  assert.ok(g.move(lobby(4), 1, { t: 'start' }).error);
  const s = started(5);
  assert.strictEqual(s.words.length, 25); assert.strictEqual(new Set(s.words).size, 25);
  assert.strictEqual(idx(s, 'R').length, 9); assert.strictEqual(idx(s, 'B').length, 8);
  assert.strictEqual(idx(s, 'N').length, 7); assert.strictEqual(idx(s, 'A').length, 1);
  assert.strictEqual(s.phase, 'clue'); assert.strictEqual(s.turn, 0); assert.strictEqual(g.view(s).team, 0);
  assert.ok(!g.acceptsSeat(s));
});

t('visao publica nao revela a chave; so os espioes veem', () => {
  const s = started(4);
  assert.ok(g.view(s).colors.every((c) => c === null));
  assert.strictEqual(g.viewFor(s, 0).key.length, 25); assert.strictEqual(g.viewFor(s, 1).key.length, 25);
  assert.strictEqual(g.viewFor(s, 2).key, null); assert.strictEqual(g.viewFor(s, 3).key, null);
  assert.strictEqual(g.viewFor(s, null), null);
  assert.ok(!JSON.stringify(g.view(s)).includes('"A"'));
});

t('pista: so o espiao da vez; uma palavra; nao pode ser do tabuleiro; numero 0-9', () => {
  const s = started(4);
  fail(s, 1, { t: 'clue', word: 'mar', number: 2 });
  fail(s, 2, { t: 'clue', word: 'mar', number: 2 });
  fail(s, 0, { t: 'clue', word: 'duas palavras', number: 2 });
  fail(s, 0, { t: 'clue', word: '', number: 2 });
  fail(s, 0, { t: 'clue', word: 'ok', number: 12 });
  fail(s, 0, { t: 'clue', word: 'ok', number: 1.5 });
  const w = s.words[3];
  fail(s, 0, { t: 'clue', word: g._norm(w).toUpperCase(), number: 1 });
  const p = play(s, 0, { t: 'clue', word: 'Oceano', number: 2 });
  assert.strictEqual(p.phase, 'guess'); assert.strictEqual(p.left, 3);
  fail(p, 0, { t: 'clue', word: 'outra', number: 1 });
});

t('palpite: acerto continua ate numero+1; erro inocente e do adversario passam a vez', () => {
  let s = started(4);
  s = play(s, 0, { t: 'clue', word: 'Oceano', number: 1 });
  fail(s, 0, { t: 'guess', i: 0 }); fail(s, 1, { t: 'guess', i: 0 }); fail(s, 3, { t: 'guess', i: 0 });
  fail(s, 2, { t: 'pass' });
  const [r1, r2, r3] = idx(s, 'R');
  s = play(s, 2, { t: 'guess', i: r1 }); assert.strictEqual(s.turn, 0); assert.strictEqual(s.left, 1);
  fail(s, 2, { t: 'guess', i: r1 });
  s = play(s, 2, { t: 'guess', i: r2 }); assert.strictEqual(s.turn, 1); assert.strictEqual(s.phase, 'clue');
  // inocente
  s = play(s, 1, { t: 'clue', word: 'Terra', number: 3 });
  s = play(s, 3, { t: 'guess', i: idx(s, 'N')[0] }); assert.strictEqual(s.turn, 0);
  // adversario
  s = play(s, 0, { t: 'clue', word: 'Fogo', number: 3 });
  s = play(s, 2, { t: 'guess', i: idx(s, 'B')[0] }); assert.strictEqual(s.turn, 1);
  assert.strictEqual(g.view(s).left[1], 7);
  void r3;
});

t('encerrar so depois de um palpite; numero 0 nao limita', () => {
  let s = started(4);
  s = play(s, 0, { t: 'clue', word: 'Livre', number: 0 });
  assert.strictEqual(g.view(s).guesses, null);
  fail(s, 2, { t: 'pass' });
  s = play(s, 2, { t: 'guess', i: idx(s, 'R')[0] });
  assert.strictEqual(s.turn, 0); assert.ok(g.viewFor(s, 2).canPass);
  s = play(s, 2, { t: 'pass' }); assert.strictEqual(s.turn, 1);
});

t('assassino derrota quem o tocou', () => {
  let s = started(4);
  s = play(s, 0, { t: 'clue', word: 'Perigo', number: 1 });
  s = play(s, 2, { t: 'guess', i: idx(s, 'A')[0] });
  assert.strictEqual(s.phase, 'ended'); assert.strictEqual(s.winner, 1); assert.strictEqual(s.cause, 'assassin');
  assert.ok(g.view(s).over); assert.ok(g.view(s).colors.every((c) => c !== null));
  fail(s, 2, { t: 'guess', i: 0 });
});

t('vence quem encontra todos os agentes; se o adversario completa, ele vence', () => {
  let s = started(4);
  const reds = idx(s, 'R');
  for (let k = 0; k < 9; k++) {
    if (s.phase === 'clue') s = play(s, s.turn, { t: 'clue', word: 'Pista' + k, number: 9 });
    s = play(s, 2, { t: 'guess', i: reds[k] });
  }
  assert.strictEqual(s.phase, 'ended'); assert.strictEqual(s.winner, 0);
  // azul revela o ultimo vermelho
  let u = started(4);
  const rs = idx(u, 'R');
  u.revealed = u.revealed.map((r, i) => r || (rs.slice(0, 8).includes(i)));
  u = play(u, 0, { t: 'clue', word: 'Alvo', number: 1 });
  u = play(u, 2, { t: 'guess', i: idx(u, 'N')[0] });
  u = play(u, 1, { t: 'clue', word: 'Erro', number: 1 });
  u = play(u, 3, { t: 'guess', i: rs[8] });
  assert.strictEqual(u.winner, 0);
});

t('nova partida alterna a equipe que comeca', () => {
  let s = started(4);
  s = g.restart(s); assert.strictEqual(s.startTeam, 1); assert.strictEqual(s.turn, 1);
  assert.strictEqual(idx(s, 'B').length, 9);
  s = g.restart(s); assert.strictEqual(s.startTeam, 0);
});

t('piloto automatico: espiao e agentes ausentes passam a vez; so se toda a equipe estiver ausente', () => {
  let s = started(6);
  s = { ...s, auto: [0] };
  assert.deepStrictEqual(g.waitingOn(s, [0]), [0]);
  s = play(s, 0, g.autoMove(s, 0)); assert.strictEqual(s.turn, 1); assert.strictEqual(s.phase, 'clue');
  fail({ ...s, auto: [] }, 1, { t: 'skip' });
  s = play({ ...s, auto: [1] }, 1, { t: 'clue', word: 'Zzpista', number: 1 });
  assert.deepStrictEqual(g.waitingOn(s, null), [3, 5]);
  assert.deepStrictEqual(g.waitingOn({ ...s, auto: [3] }, [3]), [5]);
  assert.deepStrictEqual(g.waitingOn({ ...s, auto: [3, 5] }, [3, 5]), [3]);
  fail({ ...s, auto: [3] }, 5, { t: 'skip' });
  fail({ ...s, auto: [1] }, 1, { t: 'skip' });
  const p = play({ ...s, auto: [3, 5] }, 3, { t: 'skip' }); assert.strictEqual(p.turn, 0);
});

t('simulacao: 200 partidas aleatorias terminam sem erro', () => {
  for (let game = 0; game < 200; game++) {
    const players = 4 + (game % 5);
    let s = started(players); let steps = 0;
    while (s.phase !== 'ended') {
      assert.ok(++steps < 2000, 'partida longa demais');
      if (s.phase === 'clue') { s = play(s, s.turn, { t: 'clue', word: 'p' + steps, number: Math.floor(Math.random() * 4) }); continue; }
      const agents = Array.from({ length: players }, (_, i) => i).filter((i) => i % 2 === s.turn && i > 1);
      const free = s.revealed.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
      const seat = agents[Math.floor(Math.random() * agents.length)];
      if (s.guessed > 0 && Math.random() < 0.2) s = play(s, seat, { t: 'pass' });
      else s = play(s, seat, { t: 'guess', i: free[Math.floor(Math.random() * free.length)] });
    }
    assert.ok(s.winner === 0 || s.winner === 1);
  }
});

console.log(`${n} testes de Código Secreto passaram.`);
