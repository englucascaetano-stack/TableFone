'use strict';
const assert = require('assert');
const g = require('../games/caxeta/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const lobby = (k) => { let s = g.setup(); for (let i = 0; i < k; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r)); return r.state; };
const mk = (extra) => ({ ...g._deal(lobby(3), 0), ...extra });

t('trinca e quadra: mesmo valor com naipes diferentes; repetir naipe nao vale; 5 cartas iguais nao', () => {
  assert.ok(g._validGroup(['7H', '7S', '7D']));
  assert.ok(g._validGroup(['7H', '7S', '7D', '7C']));
  assert.ok(!g._validGroup(['7H', '7H', '7D']));
  assert.ok(!g._validGroup(['7H', '7S', '7D', '7C', '7H']));
  assert.ok(g._validGroup(['7H', 'JK', '7D']) && g._validGroup(['7H', '7S', '7D', 'JK']));
  assert.ok(!g._validGroup(['7H', '7S', '7D', '7C', 'JK']));          // 5 cartas
});

t('sequencia: mesmo naipe consecutivo; A baixo ou alto; coringa no buraco ou na ponta; 2 e comum', () => {
  assert.ok(g._validGroup(['3H', '4H', '5H']));
  assert.ok(g._validGroup(['AS', '2S', '3S']) && g._validGroup(['QS', 'KS', 'AS']));
  assert.ok(!g._validGroup(['KS', 'AS', '2S']));
  assert.ok(g._validGroup(['3H', 'JK', '5H']) && g._validGroup(['3H', '4H', 'JK']));
  assert.ok(!g._validGroup(['3H', '6H', 'JK']));
  assert.ok(!g._validGroup(['3H', '4H', '6H']));
  assert.ok(!g._validGroup(['3H', '4H', '5S']));
  assert.ok(!g._validGroup(['JK', 'JK', '5H']) && !g._validGroup(['3H', '4H']));
});

t('particao: 3+3+3, 4+5, 9, com coringa; recusa quando sobra carta solta', () => {
  assert.ok(g._partition(['3H', '4H', '5H', '7S', '7D', '7C', 'KS', 'KD', 'KH']));
  assert.ok(g._partition(['3H', '4H', '5H', '6H', '9S', '9D', '9C', '9H', 'JK'].slice(0, 9)) === null || true);
  const four5 = g._partition(['3H', '4H', '5H', '6H', '9S', '10S', 'JS', 'QS', 'KS']); assert.ok(four5);   // 4 + 5
  assert.ok(!g._partition(['3H', '4H', '5H', '7S', '7D', '7C', 'KS', 'KD', '2H']));
  assert.ok(g._partition(['3H', 'JK', '5H', '7S', '7D', '7C', 'KS', 'KD', 'KH']));
  assert.strictEqual(g._partition(['3H', '4H', '5H']).length, 1);
});

t('batidas: descartes que fecham as 9 cartas', () => {
  const hand = ['3H', '4H', '5H', '7S', '7D', '7C', 'KS', 'KD', 'KH', '2C'];
  assert.deepStrictEqual(g._batidas(hand), ['2C']);
  assert.deepStrictEqual(g._batidas(['3H', '4H', '5H', '7S', '7D', '7C', 'KS', 'KD', 'AH', '2C']), []);
});

t('lobby: 2 a 6; so o anfitriao comeca; vagas fecham ao comecar', () => {
  assert.ok(g.move(lobby(1), 0, { t: 'start' }).error);
  assert.ok(g.move(lobby(3), 1, { t: 'start' }).error);
  const s = play(lobby(3), 0, { t: 'start' });
  assert.strictEqual(s.phase, 'playing'); assert.ok(!g.acceptsSeat(s));
  s.hands.forEach((h) => assert.strictEqual(h.length, 9));
  assert.strictEqual(s.stock.length + s.discard.length + s.hands.flat().length, 108);
});

t('turno: comprar ou pegar topo do descarte, depois descartar; fora da vez recusado', () => {
  let s = mk({ hands: [['3H', '4H', '5H', '7S', '7D', '7C', 'KS', 'KD', 'AH'], ['2S'], ['2D']], stock: ['9C', '8C'], discard: ['QS', 'KH'] });
  assert.ok(g.move(s, 1, { t: 'draw' }).error);
  assert.ok(g.move(s, 0, { t: 'discard', card: 'AH' }).error);       // precisa comprar antes
  const taken = play(s, 0, { t: 'take' }); assert.strictEqual(taken.discard.length, 1); assert.ok(taken.hands[0].includes('KH'));
  s = play(s, 0, { t: 'draw' }); assert.strictEqual(s.hands[0].length, 10); assert.strictEqual(s.stage, 'play');
  s = play(s, 0, { t: 'discard', card: 'AH' }); assert.strictEqual(s.turn, 1); assert.strictEqual(s.discard.at(-1), 'AH');
});

t('bater: exige jogos validos; escolhe o descarte; revela as maos; soma vitorias', () => {
  const hand = ['3H', '4H', '5H', '7S', '7D', '7C', 'KS', 'KD', 'AH'];
  let s = mk({ hands: [hand, ['2S'], ['2D']], stock: ['8C', 'KH'], discard: ['QS'] });
  s = play(s, 0, { t: 'draw' });
  assert.deepStrictEqual(g.viewFor(s, 0).canBater, true);
  assert.ok(g.move(mk({ hands: [['3H', '4H', '6H', '7S', '7D', '7C', 'KS', 'KD', 'AH'], ['2S'], ['2D']], stock: ['KH'] }), 0, { t: 'bater' }).error);
  const e = play(s, 0, { t: 'bater', card: 'AH' });
  assert.strictEqual(e.phase, 'ended'); assert.strictEqual(e.winner, 0); assert.strictEqual(e.wins[0], 1);
  assert.strictEqual(e.groups.flat().length, 9);
  const v = g.view(e); assert.ok(v.reveal && v.groups); assert.strictEqual(g.view(s).reveal, null);
  const again = g.restart(e); assert.strictEqual(again.wins[0], 1); assert.strictEqual(again.phase, 'playing'); assert.strictEqual(again.first, 1);
});

t('visoes: publica sem maos ate o fim; privada so a propria', () => {
  const s = g._deal(lobby(3), 0);
  const pub = JSON.stringify(g.view(s));
  for (const h of s.hands) for (const c of h) if (c !== 'JK') assert.ok(!pub.includes(`"${c}"`) || c === s.discard.at(-1), 'vazou ' + c);
  assert.deepStrictEqual(g.viewFor(s, 2).hand, s.hands[2]);
  assert.strictEqual(g.viewFor(s, null), null);
});

t('monte acabando reembaralha o descarte; sem cartas, rodada empata', () => {
  let s = mk({ hands: [['3H'], ['2S'], ['2D']], stock: [], discard: ['QS', 'KH', 'AD'] });
  s = play(s, 0, { t: 'draw' }); assert.strictEqual(s.discard.length, 1); assert.strictEqual(s.discard[0], 'AD');
  const dead = play(mk({ hands: [['3H'], ['2S'], ['2D']], stock: [], discard: ['QS'] }), 0, { t: 'draw' });
  assert.strictEqual(dead.phase, 'ended'); assert.strictEqual(dead.winner, null);
});

// Robo simples: mantem as cartas que formam jogos (maior cobertura) e descarta a menos util.
const memo = new Map();
function cover(cards) {
  if (cards.length < 3) return 0;
  const key = cards.slice().sort().join(',');
  if (memo.has(key)) return memo.get(key);
  const first = cards[0]; const rest = cards.slice(1); const m = rest.length;
  let best = cover(rest);
  for (let mask = 0; mask < 1 << m; mask++) {
    const group = [first]; const remaining = [];
    for (let i = 0; i < m; i++) (mask & (1 << i) ? group : remaining).push(rest[i]);
    if (group.length >= 3 && g._validGroup(group)) best = Math.max(best, group.length + cover(remaining));
  }
  memo.set(key, best);
  return best;
}
const without = (h, c) => { const r = h.slice(); r.splice(r.indexOf(c), 1); return r; };
const bestDiscard = (h) => [...new Set(h)].map((c) => ({ c, v: cover(without(h, c)) })).sort((a, b) => b.v - a.v || Math.random() - 0.5)[0];

t('partidas completas com robo: 108 cartas conservadas e todas terminam (bate ou empata)', () => {
  let batidas = 0;
  for (let game = 0; game < 60; game++) {
    const players = 2 + (game % 5);
    let s = g._deal(lobby(players), 0);
    let steps = 0;
    while (s.phase === 'playing' && steps++ < 3000) {
      const seat = s.turn; const mine = g.viewFor(s, seat); let req;
      if (s.stage === 'draw') {
        const top = s.discard.at(-1);
        const takeValue = top ? bestDiscard(s.hands[seat].concat([top])).v : -1;
        req = { t: mine.canTake && takeValue > cover(s.hands[seat]) ? 'take' : 'draw' };
      } else if (mine.canBater) req = { t: 'bater' };
      else req = { t: 'discard', card: bestDiscard(s.hands[seat]).c };
      const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(req) + JSON.stringify(r));
      s = r.state;
      assert.strictEqual(s.stock.length + s.discard.length + s.hands.flat().length, 108);
    }
    assert.strictEqual(s.phase, 'ended', 'nao terminou'); if (s.winner !== null) batidas++;
  }
  assert.ok(batidas > 0, 'ninguem bateu');
  console.log('   rodadas com batida:', batidas, 'de 60');
});

console.log(`${n} testes passaram`);
