'use strict';
const assert = require('assert');
const g = require('../games/buraco/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const ok = (cards) => g._arrange(cards);
const lobby = (k) => { let s = g.setup(); for (let i = 0; i < k; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r)); return r.state; };

t('sequencia valida: mesmo naipe, consecutivas; ordem crescente na saida', () => {
  assert.deepStrictEqual(ok(['5H', '3H', '4H']).cards, ['3H', '4H', '5H']);
  assert.strictEqual(ok(['3H', '4H', '5H']).wildAt, null);
  assert.ok(!ok(['3H', '4H', '6H']));                  // buraco na sequencia, sem coringa
  assert.ok(!ok(['3H', '4H', '5S']));                  // naipes diferentes
  assert.ok(!ok(['3H', '4H']));                        // menos de 3
  assert.ok(!ok(['3H', '3H', '4H']));                  // repetida
});

t('As baixo e alto (A-2-3 e Q-K-A), sem dar a volta (K-A-2)', () => {
  assert.deepStrictEqual(ok(['AS', '2S', '3S']).cards, ['AS', '2S', '3S']);
  assert.deepStrictEqual(ok(['QS', 'KS', 'AS']).cards, ['QS', 'KS', 'AS']);
  assert.ok(!ok(['KS', 'AS', '3S']));                  // nao da a volta
  assert.ok(ok(['KS', 'AS', '2S']).wildAt !== null);   // mas o 2 pode ser coringa no lugar da Dama (Q-K-A)
  assert.deepStrictEqual(ok(['JS', 'QS', 'KS', 'AS', '10S']).cards, ['10S', 'JS', 'QS', 'KS', 'AS']);
});

t('coringa (JK ou 2): preenche buraco ou estende; no maximo 1 por jogo', () => {
  const a = ok(['3H', '5H', 'JK']); assert.deepStrictEqual(a.cards, ['3H', 'JK', '5H']); assert.strictEqual(a.wildAt, 1);
  const b = ok(['3H', '4H', '2S']); assert.strictEqual(b.wildAt !== null, true);    // 2 de outro naipe e coringa
  assert.ok(ok(['3H', '4H', '5H', 'JK']));
  assert.ok(!ok(['3H', '4H', 'JK', 'JK']));            // dois coringas
  assert.ok(!ok(['3H', '6H', 'JK']));                  // coringa so preenche 1 buraco
  assert.ok(!ok(['3H', '5H', 'JK', '2S']));            // dois coringas (JK e 2 de outro naipe)
});

t('2 do mesmo naipe na posicao natural e carta comum (sequencia limpa)', () => {
  const a = ok(['AH', '2H', '3H', '4H']); assert.strictEqual(a.wildAt, null);
  const b = ok(['2H', '3H', '4H']); assert.strictEqual(b.wildAt, null);
  const c = ok(['3H', '4H', '5H', '2H']); assert.strictEqual(c.wildAt, null);        // 2-3-4-5 limpa
  const d = ok(['4H', '5H', '6H', '2H']);                                          // 2 vira coringa estendendo (3H)
  assert.ok(d && d.wildAt !== null);
});

t('pontos das cartas', () => {
  assert.deepStrictEqual(['3S', '7S', '8S', '10S', 'KS', 'AS', '2S', 'JK'].map(g._points), [5, 5, 10, 10, 10, 15, 20, 50]);
});

t('distribuicao: 11 cartas por jogador, 2 mortos de 11, 1 descarte, 108 cartas', () => {
  for (const p of [2, 4]) {
    const s = g._dealRound(lobby(p), p, 0, [0, 0]);
    const total = s.stock.length + s.discard.length + s.dead.flat().length + s.hands.flat().length;
    assert.strictEqual(total, 108); s.hands.forEach((h) => assert.strictEqual(h.length, 11));
    assert.deepStrictEqual(s.dead.map((d) => d.length), [11, 11]);
  }
});

t('lobby: 2 ou 4; so o anfitriao comeca', () => {
  let s = lobby(3);
  assert.ok(g.move(s, 0, { t: 'start', players: 3 }).error);
  assert.ok(g.move(s, 1, { t: 'start', players: 2 }).error);
  assert.ok(g.move(s, 0, { t: 'start', players: 4 }).error);
  const r = play(s, 0, { t: 'start', players: 2 });
  assert.strictEqual(r.phase, 'playing'); assert.strictEqual(g.viewFor(r, 2), null);
});

const mk = (extra) => ({ ...g._dealRound(lobby(2), 2, 0, [0, 0]), ...extra });

t('turno: comprar ou pegar descarte antes de baixar/descartar; descarte passa a vez', () => {
  let s = mk({ hands: [['3H', '4H', '5H', '9C', 'KD'], ['2S']], stock: ['7C', '8C'], discard: ['QS'] });
  assert.ok(g.move(s, 0, { t: 'discard', card: 'KD' }).error);
  assert.ok(g.move(s, 1, { t: 'draw' }).error);
  s = play(s, 0, { t: 'draw' }); assert.strictEqual(s.hands[0].length, 6); assert.strictEqual(s.stage, 'play');
  assert.ok(g.move(s, 0, { t: 'draw' }).error);
  s = play(s, 0, { t: 'discard', card: 'KD' }); assert.strictEqual(s.turn, 1); assert.strictEqual(s.stage, 'draw'); assert.strictEqual(s.discard.at(-1), 'KD');
  const t2 = play(mk({ hands: [['3H'], ['2S']], discard: ['QS', 'KD', '4C'] }), 0, { t: 'take' });
  assert.strictEqual(t2.hands[0].length, 4); assert.strictEqual(t2.discard.length, 0);
});

t('baixar jogo novo e ampliar jogo da dupla; recusar combinacao invalida', () => {
  let s = mk({ hands: [['3H', '4H', '5H', '6H', '9C', 'KD', 'QD'], ['2S']], stage: 'play' });
  assert.ok(g.move(s, 0, { t: 'meld', cards: ['3H', '4H'] }).error);
  assert.ok(g.move(s, 0, { t: 'meld', cards: ['3H', '4H', '9C'] }).error);
  assert.ok(g.move(s, 0, { t: 'meld', cards: ['3H', '4H', '7H'] }).error);          // nao tem
  s = play(s, 0, { t: 'meld', cards: ['3H', '4H', '5H'] });
  assert.strictEqual(s.melds[0].length, 1);
  s = play(s, 0, { t: 'meld', cards: ['6H'], target: 0 });
  assert.deepStrictEqual(s.melds[0][0].cards, ['3H', '4H', '5H', '6H']);
  assert.ok(g.move(s, 0, { t: 'meld', cards: ['KD'], target: 0 }).error);
  assert.ok(g.move(s, 1, { t: 'meld', cards: ['KD'], target: 0 }).error);          // fora da vez
});

t('canastra: 7+ cartas; limpa 200, suja 100, real 500; pontuacao da rodada', () => {
  const s = mk({ phase: 'playing', deadTaken: [true, false], melds: [[
    { cards: ['3H', '4H', '5H', '6H', '7H', '8H', '9H'], wildAt: null, suit: 'H' },            // limpa 7 cartas
    { cards: ['3S', '4S', 'JK', '6S', '7S', '8S', '9S'], wildAt: 2, suit: 'S' },               // suja
  ], []], hands: [['KD'], ['AS', '2D']] });
  g._score(s, 0, 'teste');
  const d = s.roundScores;
  assert.strictEqual(d[0].melded, (5 + 5 + 5 + 5 + 5 + 10 + 10) + (5 + 5 + 50 + 5 + 5 + 10 + 10));
  assert.strictEqual(d[0].canastras, 300); assert.strictEqual(d[0].bater, 100); assert.strictEqual(d[0].hand, -10); assert.strictEqual(d[0].morto, 0);
  assert.strictEqual(d[1].hand, -35); assert.strictEqual(d[1].morto, -100);
  assert.deepStrictEqual(s.totals, [d[0].total, d[1].total]);
  const real = mk({ melds: [[{ cards: ['AS', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', '10S', 'JS', 'QS', 'KS'], wildAt: null, suit: 'S' }], []], hands: [[], []], deadTaken: [true, true] });
  g._score(real, 0, 'x'); assert.strictEqual(real.roundScores[0].canastras, 500);
});

t('mao zerada: pega o morto uma vez; sem morto so bate com canastra', () => {
  // zera a mao descartando a ultima carta, com morto disponivel
  let s = mk({ hands: [['9C'], ['2S']], stage: 'play' });
  const dead0 = s.dead[0].slice();
  s = play(s, 0, { t: 'discard', card: '9C' });
  assert.strictEqual(s.deadTaken[0], true); assert.strictEqual(s.hands[0].length, 11); assert.strictEqual(s.turn, 1);
  assert.deepStrictEqual(s.hands[0].slice().sort(), dead0.slice().sort());
  // sem morto e sem canastra: recusa descartar a ultima
  const stuck = mk({ hands: [['9C'], ['2S']], stage: 'play', deadTaken: [true, false] });
  assert.ok(g.move(stuck, 0, { t: 'discard', card: '9C' }).error);
  // com canastra: bate
  const win = mk({ hands: [['9C'], ['2S']], stage: 'play', deadTaken: [true, false], melds: [[{ cards: ['3H', '4H', '5H', '6H', '7H', '8H', '9H'], wildAt: null, suit: 'H' }], []] });
  const r = play(win, 0, { t: 'discard', card: '9C' });
  assert.strictEqual(r.phase, 'roundEnd'); assert.strictEqual(r.roundScores[0].bater, 100);
  // baixar deixando 1 carta sem poder descartar: recusa antecipada
  const guard = mk({ hands: [['3H', '4H', '5H', '9C'], ['2S']], stage: 'play', deadTaken: [true, false] });
  assert.ok(g.move(guard, 0, { t: 'meld', cards: ['3H', '4H', '5H'] }).error);
});

t('monte vazio encerra a rodada; fim de jogo ao somar 3000', () => {
  const s = mk({ stock: [], hands: [['3H'], ['2S']] });
  const r = play(s, 0, { t: 'draw' }); assert.strictEqual(r.phase, 'roundEnd');
  const last = play(mk({ stock: ['7C'], hands: [['3H', '4H'], ['2S']] }), 0, { t: 'draw' });      // compra a ultima carta
  assert.strictEqual(last.phase, 'playing');
  assert.strictEqual(play(last, 0, { t: 'discard', card: '3H' }).phase, 'roundEnd');             // termina apos o descarte
  const big = mk({ stock: [], totals: [2990, 100], hands: [['3H'], ['2S']], melds: [[{ cards: ['3H', '4H', '5H'], wildAt: null, suit: 'H' }], []], deadTaken: [true, true] });
  const e = play(big, 0, { t: 'draw' }); assert.strictEqual(e.winner, 0);
  const again = g.restart(e); assert.deepStrictEqual(again.totals, [0, 0]);
  const next = g.restart(r); assert.deepStrictEqual(next.totals, r.totals);
});

t('visoes: publica sem maos, melds e descarte visiveis; privada so a propria', () => {
  const s = g._dealRound(lobby(4), 4, 0, [0, 0]);
  const pub = JSON.stringify(g.view(s));
  assert.ok(!pub.includes('hands') && !pub.includes('"stock"'));
  assert.deepStrictEqual(g.viewFor(s, 1).hand, s.hands[1]); assert.strictEqual(g.viewFor(s, 1).team, 1); assert.strictEqual(g.viewFor(s, 2).team, 0);
});

// ----- partidas aleatorias -----
function bot(s) {
  const seat = s.turn; const mine = g.viewFor(s, seat);
  if (s.stage === 'draw') return { t: Math.random() < 0.15 && mine.canTake ? 'take' : mine.canDraw ? 'draw' : mine.canTake ? 'take' : 'draw' };
  const hand = s.hands[seat];
  // tenta baixar um jogo de 3 cartas
  for (let a = 0; a < hand.length; a++) for (let b = a + 1; b < hand.length; b++) for (let c = b + 1; c < hand.length; c++) {
    const cards = [hand[a], hand[b], hand[c]];
    if (g._arrange(cards) && Math.random() < 0.7) { const r = g.move(s, seat, { t: 'meld', cards }); if (r.state) return { t: 'meld', cards }; }
  }
  const team = seat % 2 === 0 || s.players === 2 ? (s.players === 2 ? seat : 0) : 1;
  for (const card of hand) for (let i = 0; i < s.melds[team].length; i++) {
    if (Math.random() < 0.5) { const r = g.move(s, seat, { t: 'meld', cards: [card], target: i }); if (r.state) return { t: 'meld', cards: [card], target: i }; }
  }
  for (const card of hand.slice().sort(() => Math.random() - 0.5)) { const r = g.move(s, seat, { t: 'discard', card }); if (r.state) return { t: 'discard', card }; }
  throw new Error('bot sem jogada: ' + JSON.stringify(g.view(s)));
}
t('partidas aleatorias completas (2 e 4 jogadores): sem travar, 108 cartas conservadas, rodadas terminam', () => {
  for (let game = 0; game < 120; game++) {
    const p = game % 2 ? 4 : 2;
    let s = g._dealRound(lobby(p), p, 0, [0, 0]);
    let steps = 0;
    while (s.phase === 'playing' && steps++ < 4000) {
      const req = bot(s);
      const r = g.move(s, s.turn, req);
      assert.ok(r.state, JSON.stringify(req) + JSON.stringify(r));
      s = r.state;
      const inMelds = s.melds.flat().reduce((a, m) => a + m.cards.length, 0);
      assert.strictEqual(s.stock.length + s.discard.length + s.dead.flat().length + s.hands.flat().length + inMelds, 108);
    }
    assert.strictEqual(s.phase, 'roundEnd', 'rodada nao terminou');
  }
});

console.log(`${n} testes passaram`);
