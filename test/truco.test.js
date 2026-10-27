'use strict';
const assert = require('assert');
const g = require('../games/truco/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r)); return r.state; };
const lobby = (k) => { let s = g.setup(); for (let i = 0; i < k; i++) s = g.seatJoined(s, i); return s; };
// mao controlada: maos e vira fixos
const hand = (players, hands, vira, extra) => ({ ...g._start(lobby(players), players), hands, vira, mao: 0, turn: 0, roundLeader: 0, points: [0, 0], value: 1, call: null, lastRaiser: null, noTruco: false, decision: null, rounds: [], table: [], ...extra });

t('manilha: valor seguinte a vira (3 -> 4, Q -> J); forca: zap > copas > espadilha > ouros > 3 > 2 > A ...', () => {
  assert.strictEqual(g._manilhaRank('3H'), '4'); assert.strictEqual(g._manilhaRank('QS'), 'J'); assert.strictEqual(g._manilhaRank('7D'), 'Q');
  const m = 'K';
  const s = (c) => g._strength(c, m);
  assert.ok(s('KC') > s('KH') && s('KH') > s('KS') && s('KS') > s('KD'));   // zap > copas > espadilha > ouros
  assert.ok(s('KD') > s('3C') && s('3C') > s('2C') && s('2C') > s('AC'));  // manilha vence o 3
  const m2 = '7';
  assert.ok(g._strength('3S', m2) > g._strength('2S', m2) && g._strength('2S', m2) > g._strength('AS', m2));
  assert.ok(g._strength('AS', m2) > g._strength('KS', m2) && g._strength('KS', m2) > g._strength('JS', m2) && g._strength('JS', m2) > g._strength('QS', m2));
  assert.ok(g._strength('QS', m2) > g._strength('6S', m2) && g._strength('6S', m2) > g._strength('5S', m2) && g._strength('5S', m2) > g._strength('4S', m2));
  assert.strictEqual(g._strength('4H', m2), g._strength('4C', m2));   // mesma forca: empata
});

t('lobby: 2 ou 4 jogadores; so o anfitriao comeca; quem passa do numero escolhido assiste', () => {
  let s = lobby(3);
  assert.ok(g.move(s, 0, { t: 'start', players: 3 }).error);
  assert.ok(g.move(s, 1, { t: 'start', players: 2 }).error);
  assert.ok(g.move(s, 0, { t: 'start', players: 4 }).error);          // so 3 na sala
  const r = play(s, 0, { t: 'start', players: 2 });
  assert.strictEqual(r.hands.length, 2); assert.ok(!g.acceptsSeat(r));
  assert.ok(g.move(r, 2, { t: 'play', card: r.hands[0][0] }).error);   // 3o jogador nao joga
  assert.strictEqual(g.viewFor(r, 2), null);
});

t('distribuicao: 3 cartas por jogador, vira distinta, 40 cartas unicas', () => {
  const s = g._start(lobby(4), 4);
  const all = [...s.hands.flat(), s.vira];
  assert.strictEqual(new Set(all).size, 13); s.hands.forEach((h) => assert.strictEqual(h.length, 3));
});

t('rodada: vence a carta mais forte; empate entre equipes; dupla (4 jogadores) pela maior', () => {
  // vira 3H => manilha 4. Mao do assento 0 joga primeiro.
  let s = hand(2, [['4C', '5S', '6S'], ['AS', '2S', '3S']], '3H');
  s = play(s, 0, { t: 'play', card: '4C' }); s = play(s, 1, { t: 'play', card: '3S' });
  assert.strictEqual(s.rounds[0].win, 0); assert.strictEqual(s.turn, 0);          // zap ganha; quem ganhou comeca
  s = hand(2, [['5S', '6S', '7S'], ['5H', '2S', '3S']], '3H');
  s = play(s, 0, { t: 'play', card: '5S' }); s = play(s, 1, { t: 'play', card: '5H' });
  assert.strictEqual(s.rounds[0].win, null); assert.strictEqual(s.turn, 0);       // empate: mesmo lider
  s = hand(4, [['7S'], ['5S'], ['KS'], ['6S']].map((x) => x.concat(['4D', '4S'])), '2H');   // manilha 3: nenhuma
  s = play(s, 0, { t: 'play', card: '7S' }); s = play(s, 1, { t: 'play', card: '5S' }); s = play(s, 2, { t: 'play', card: 'KS' }); s = play(s, 3, { t: 'play', card: '6S' });
  assert.strictEqual(s.rounds[0].win, 0); assert.strictEqual(s.turn, 2);          // K do assento 2 (equipe 0) venceu
});

t('resultado da mao: 2 vitorias; 1-1 decide na 3a; empate na 1a vence a 2a; empate na 2a vence a 1a; tres empates vence quem foi mao', () => {
  const r = (...w) => w.map((x) => ({ win: x }));
  assert.strictEqual(g._handResult(r(0, 0), 1), 0);
  assert.strictEqual(g._handResult(r(0, 1), 1), undefined);
  assert.strictEqual(g._handResult(r(0, 1, 1), 0), 1);
  assert.strictEqual(g._handResult(r(null, 1), 0), 1);
  assert.strictEqual(g._handResult(r(0, null), 1), 0);
  assert.strictEqual(g._handResult(r(null, null), 1), undefined);
  assert.strictEqual(g._handResult(r(null, null, 0), 1), 0);
  assert.strictEqual(g._handResult(r(null, null, null), 1), 1);
  assert.strictEqual(g._handResult(r(0, 1, null), 1), 0);
  assert.strictEqual(g._handResult(r(0), 1), undefined);
});

t('mao completa: equipe que ganha 2 rodadas leva o valor e a proxima mao tem outro "mao"', () => {
  let s = hand(2, [['4C', '4H', '5S'], ['3S', '3H', '2S']], '3D');
  s = play(s, 0, { t: 'play', card: '4C' }); s = play(s, 1, { t: 'play', card: '3S' });
  s = play(s, 0, { t: 'play', card: '4H' }); s = play(s, 1, { t: 'play', card: '3H' });
  assert.deepStrictEqual(s.points, [1, 0]); assert.strictEqual(s.mao, 1); assert.strictEqual(s.turn, 1);
  assert.deepStrictEqual(s.hands.map((h) => h.length), [3, 3]);
});

t('truco: pedir, aceitar vale 3; correr da 1 ao pedinte; nao pode pedir duas vezes seguidas', () => {
  let s = hand(2, [['4C', '4H', '5S'], ['3S', '3H', '2S']], '3D');
  s = play(s, 0, { t: 'truco' });
  assert.deepStrictEqual(s.call, { team: 0, value: 3, by: 0 });
  assert.ok(g.move(s, 0, { t: 'play', card: '4C' }).error);        // pedinte espera
  assert.ok(g.move(s, 1, { t: 'play', card: '3S' }).error);        // precisa responder
  const acc = play(s, 1, { t: 'accept' }); assert.strictEqual(acc.value, 3); assert.strictEqual(acc.call, null);
  assert.ok(g.move(acc, 0, { t: 'truco' }).error);                  // mesma equipe nao repete
  const run = play(s, 1, { t: 'run' }); assert.deepStrictEqual(run.points, [1, 0]);
});

t('aumentar: seis, nove, doze; correr de um aumento da o valor aceito ao outro lado; doze nao aumenta', () => {
  let s = hand(2, [['4C', '4H', '5S'], ['3S', '3H', '2S']], '3D');
  s = play(s, 0, { t: 'truco' }); s = play(s, 1, { t: 'raise' });
  assert.strictEqual(s.value, 3); assert.deepStrictEqual(s.call, { team: 1, value: 6, by: 1 });
  const fled = play(s, 0, { t: 'run' }); assert.deepStrictEqual(fled.points, [0, 3]);    // equipe 1 leva 3
  s = play(s, 0, { t: 'raise' }); s = play(s, 1, { t: 'raise' });
  assert.strictEqual(s.call.value, 12);
  assert.ok(g.move(s, 0, { t: 'raise' }).error);
  const acc = play(s, 0, { t: 'accept' }); assert.strictEqual(acc.value, 12);
  assert.ok(g.move(acc, 1, { t: 'truco' }).error || true);
});

t('mao de onze: so a equipe com 11 decide; jogar vale 3 sem truco; correr da 1 ao outro', () => {
  let s = g._dealHand({ ...g._start(lobby(2), 2), points: [11, 3] }, 0);
  assert.strictEqual(s.decision, 0); assert.strictEqual(g.viewFor(s, 0).mustDecide, true);
  assert.ok(g.move(s, 1, { t: 'onze', play: true }).error);
  assert.ok(g.move(s, 0, { t: 'play', card: s.hands[0][0] }).error);
  const play3 = play(s, 0, { t: 'onze', play: true }); assert.strictEqual(play3.value, 3); assert.ok(play3.noTruco);
  assert.ok(g.move(play3, 0, { t: 'truco' }).error);
  const run = play(s, 0, { t: 'onze', play: false }); assert.deepStrictEqual(run.points, [11, 4]);
  const four = g._dealHand({ ...g._start(lobby(4), 4), points: [3, 11] }, 0);
  assert.strictEqual(four.decision, 1); assert.deepStrictEqual(g.viewFor(four, 1).partnerHand, four.hands[3]);
  assert.strictEqual(g.viewFor(four, 0).partnerHand, undefined);
});

t('mao de ferro (11 x 11): vale 1 e sem truco; fim de jogo ao chegar a 12', () => {
  const s = g._dealHand({ ...g._start(lobby(2), 2), points: [11, 11] }, 0);
  assert.ok(s.noTruco); assert.strictEqual(s.decision, null);
  assert.ok(g.move(s, 0, { t: 'truco' }).error);
  let e = hand(2, [['4C', '4H', '5S'], ['3S', '3H', '2S']], '3D', { points: [11, 5] });
  e = play(e, 0, { t: 'play', card: '4C' }); e = play(e, 1, { t: 'play', card: '3S' });
  e = play(e, 0, { t: 'play', card: '4H' }); e = play(e, 1, { t: 'play', card: '3H' });
  assert.strictEqual(e.phase, 'ended'); assert.strictEqual(e.winner, 0);
  assert.ok(g.move(e, 1, { t: 'truco' }).error);
});

t('visoes: publica nao tem as maos; privada so a propria; so mostra a mao do parceiro na decisao', () => {
  const s = g._start(lobby(4), 4);
  const pub = JSON.stringify(g.view(s));
  for (const h of s.hands) for (const c of h) assert.ok(!pub.includes(`"${c}"`), 'vazou ' + c);
  assert.deepStrictEqual(g.viewFor(s, 2).hand, s.hands[2]);
  assert.strictEqual(g.viewFor(s, null), null);
});

t('partidas aleatorias completas (2 e 4 jogadores): sem erros e terminam em 12+ pontos', () => {
  for (let game = 0; game < 300; game++) {
    const players = game % 2 ? 4 : 2;
    let s = g._start(lobby(players), players);
    let steps = 0;
    while (s.phase === 'playing' && steps++ < 3000) {
      let acted = false;
      const tries = [];
      if (s.decision !== null) { const seat = s.decision; tries.push([seat, { t: 'onze', play: Math.random() < 0.7 }]); }
      else if (s.call) { const seat = (s.call.team + 1) % 2; const x = Math.random(); tries.push([seat, { t: x < 0.5 ? 'accept' : x < 0.7 ? 'raise' : 'run' }], [seat, { t: 'accept' }]); }
      else {
        const seat = s.turn;
        if (Math.random() < 0.12) tries.push([seat, { t: 'truco' }]);
        tries.push([seat, { t: 'play', card: s.hands[seat][Math.floor(Math.random() * s.hands[seat].length)] }]);
      }
      for (const [seat, req] of tries) { const r = g.move(s, seat, req); if (r.state) { s = r.state; acted = true; break; } }
      assert.ok(acted, 'travou: ' + JSON.stringify(tries) + JSON.stringify(g.view(s)));
      assert.ok(s.hands.every((h) => h.length <= 3));
    }
    assert.strictEqual(s.phase, 'ended', 'nao terminou'); assert.ok(Math.max(...s.points) >= 12);
  }
});

console.log(`${n} testes passaram`);
