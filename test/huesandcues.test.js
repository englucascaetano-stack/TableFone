'use strict';
const assert = require('assert');
const g = require('../games/huesandcues/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const lobby = (k) => { let s = g.setup(); for (let i = 0; i < k; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r)); return r.state; };
const fail = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.error, 'esperava erro'); return r.error; };
const started = (k = 4) => g._deal(lobby(k), 0);
// fixa o alvo para montar cenarios
const withTarget = (s, r, c) => { s.target = [r, c]; return s; };

t('pontos dos adivinhadores: exato 3, vizinho 2, distancia 2 vale 1, longe 0', () => {
  assert.strictEqual(g._guessPoints([5, 10], 5, 10), 3);
  for (const [r, c] of [[4, 9], [4, 10], [4, 11], [5, 9], [5, 11], [6, 9], [6, 10], [6, 11]]) assert.strictEqual(g._guessPoints([5, 10], r, c), 2, `${r},${c}`);
  assert.strictEqual(g._guessPoints([5, 10], 3, 8), 1);
  assert.strictEqual(g._guessPoints([5, 10], 7, 10), 1);
  assert.strictEqual(g._guessPoints([5, 10], 8, 10), 0);
  assert.strictEqual(g._guessPoints([5, 10], 5, 13), 0);
});

t('tabuleiro: 30 colunas x 16 linhas e coordenadas A1..P30', () => {
  assert.strictEqual(g._ROWS * g._COLS, 480);
  assert.strictEqual(g._coord(0, 0), 'A1');
  assert.strictEqual(g._coord(15, 29), 'P30');
});

t('inicio: so o anfitriao, minimo de 3, rodadas por jogador', () => {
  assert.ok(/pelo menos 3/.test(fail(lobby(2), 0, { t: 'start' })));
  assert.ok(/anfitri/.test(fail(lobby(3), 1, { t: 'start' })));
  const s = play(lobby(4), 0, { t: 'start' });
  assert.strictEqual(s.phase, 'playing');
  assert.strictEqual(s.totalRounds, 8);
  assert.strictEqual(started(7).totalRounds, 7);
  assert.strictEqual(started(10).totalRounds, 10);
  assert.strictEqual(started(3).totalRounds, 6);
});

t('segredo: so o dador ve o alvo, e a visao publica nao o revela', () => {
  const s = started(4);
  const cuer = s.cuer;
  assert.deepStrictEqual(g.viewFor(s, cuer).target, s.target);
  for (let i = 0; i < 4; i++) if (i !== cuer) assert.strictEqual(g.viewFor(s, i).target, null);
  assert.strictEqual(g.viewFor(s, null), null);
  assert.strictEqual(g.view(s).last, null);
  assert.ok(!('target' in g.view(s)));
});

t('pistas: primeira com uma palavra, segunda com ate duas, so o dador', () => {
  let s = started(4);
  const c = s.cuer;
  const other = (c + 1) % 4;
  assert.ok(/dador/.test(fail(s, other, { t: 'clue', text: 'mar' })));
  assert.ok(/uma única palavra/.test(fail(s, c, { t: 'clue', text: 'azul claro' })));
  assert.ok(/Escreva/.test(fail(s, c, { t: 'clue', text: '   ' })));
  assert.ok(/colocar|hora/.test(fail(s, c, { t: 'place', r: 0, c: 0 })));
  s = play(s, c, { t: 'clue', text: 'mar' });
  assert.strictEqual(s.step, 'guess1');
  assert.strictEqual(s.clues[0], 'mar');
});

t('marcadores: ordem a partir do jogador seguinte ao dador, casa livre, dentro do tabuleiro', () => {
  let s = started(4);
  const c = s.cuer;
  s = play(s, c, { t: 'clue', text: 'mar' });
  const order = [(c + 1) % 4, (c + 2) % 4, (c + 3) % 4];
  assert.deepStrictEqual(s.order, order);
  assert.ok(/sua vez/.test(fail(s, order[1], { t: 'place', r: 0, c: 0 })));
  assert.ok(/sua vez/.test(fail(s, c, { t: 'place', r: 0, c: 0 })));
  assert.ok(/inválida/.test(fail(s, order[0], { t: 'place', r: 16, c: 0 })));
  assert.ok(/inválida/.test(fail(s, order[0], { t: 'place', r: 0, c: 30 })));
  s = play(s, order[0], { t: 'place', r: 3, c: 3 });
  assert.ok(/já há/i.test(fail(s, order[1], { t: 'place', r: 3, c: 3 })));
  assert.deepStrictEqual(g.view(s).placing, [order[1], order[2]]);
});

t('rodada completa: duas pistas, dois marcadores cada, revelacao e pontos', () => {
  let s = started(4);
  const c = s.cuer;
  withTarget(s, 8, 15);
  const [a, b, d] = s.order;
  s = play(s, c, { t: 'clue', text: 'mar' });
  s = play(s, a, { t: 'place', r: 8, c: 15 }); // exato: 3
  s = play(s, b, { t: 'place', r: 8, c: 16 }); // vizinho: 2
  s = play(s, d, { t: 'place', r: 0, c: 0 }); // longe: 0
  assert.strictEqual(s.step, 'clue2');
  assert.ok(/no máximo duas/.test(fail(s, c, { t: 'clue', text: 'um dois tres' })));
  s = play(s, c, { t: 'clue', text: 'fundo escuro' });
  s = play(s, a, { t: 'place', r: 9, c: 14 }); // vizinho: 2
  s = play(s, b, { t: 'place', r: 10, c: 15 }); // distancia 2: 1
  s = play(s, d, { t: 'place', r: 8, c: 17 }); // distancia 2: 1
  assert.strictEqual(s.step, 'reveal');
  assert.strictEqual(s.scores[a], 5);
  assert.strictEqual(s.scores[b], 3);
  assert.strictEqual(s.scores[d], 1);
  // dador: marcadores a distancia <= 1: (8,15), (8,16), (9,14) = 3
  assert.strictEqual(s.scores[c], 3);
  const v = g.view(s);
  assert.deepStrictEqual(v.last.target, [8, 15]);
  assert.strictEqual(v.last.cuerPts, 3);
  assert.strictEqual(g.viewFor(s, c).target, null, 'depois da revelacao nao ha mais segredo');
});

t('dador com 3 jogadores ganha 2 pontos por marcador na moldura', () => {
  let s = started(3);
  const c = s.cuer;
  withTarget(s, 5, 5);
  const [a, b] = s.order;
  s = play(s, c, { t: 'clue', text: 'verde' });
  s = play(s, a, { t: 'place', r: 5, c: 5 });
  s = play(s, b, { t: 'place', r: 5, c: 6 });
  s = play(s, c, { t: 'clue', text: 'folha seca' });
  s = play(s, a, { t: 'place', r: 10, c: 10 });
  s = play(s, b, { t: 'place', r: 1, c: 1 });
  assert.strictEqual(s.scores[c], 4);
});

t('proxima rodada troca o dador e o alvo; no fim declara vencedor(es)', () => {
  let s = started(3);
  const dadores = [];
  for (let r = 0; r < s.totalRounds; r++) {
    dadores.push(s.cuer);
    // joga a rodada inteira pelo piloto automatico
    for (let guard = 0; guard < 50 && s.step !== 'reveal'; guard++) {
      const who = g.waitingOn(s)[0];
      s = play(s, who, g.autoMove(s, who));
    }
    assert.strictEqual(s.step, 'reveal');
    s = play(s, 1, { t: 'next' });
  }
  assert.strictEqual(s.phase, 'ended');
  assert.deepStrictEqual(dadores.slice(0, 3).sort(), [0, 1, 2]);
  assert.ok(s.winners.length >= 1);
  const best = Math.max(...s.scores);
  s.winners.forEach((w) => assert.strictEqual(s.scores[w], best));
  assert.ok(/terminou/.test(fail(s, 0, { t: 'clue', text: 'x' })));
  assert.strictEqual(g.restart(s).phase, 'playing');
});

t('piloto automatico: espera o dador, depois cada jogador em ordem', () => {
  let s = started(4);
  assert.deepStrictEqual(g.waitingOn(s), [s.cuer]);
  s = play(s, s.cuer, { t: 'clue', text: 'mar' });
  assert.deepStrictEqual(g.waitingOn(s), [s.order[0]]);
  const m = g.autoMove(s, s.order[0]);
  assert.strictEqual(m.t, 'place');
  assert.ok(play(s, s.order[0], m));
});

console.log(`\n${n} testes passaram.`);
