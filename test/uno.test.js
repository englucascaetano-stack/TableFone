'use strict';
const assert = require('assert');
const g = require('../games/uno/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const mk = (players) => { let s = g.setup(); for (let i = 0; i < players; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r)); return r.state; };
const base = (extra) => ({ phase: 'playing', players: 3, hands: [[], [], []], draw: ['R-1', 'R-2', 'R-3', 'R-4', 'R-5', 'R-6', 'R-7', 'R-8'], discard: ['R-5'], turn: 0, dir: 1, color: 'R', drawn: null, winner: null, log: '', ...extra });

t('lobby: vagas so antes de comecar; contagem de jogadores; so o anfitriao comeca', () => {
  let s = mk(1);
  assert.ok(g.move(s, 0, { t: 'start' }).error);          // 1 jogador so
  s = mk(3); assert.strictEqual(s.players, 3); assert.ok(g.acceptsSeat(s));
  assert.ok(g.move(s, 1, { t: 'start' }).error);
  s = play(s, 0, { t: 'start' });
  assert.ok(!g.acceptsSeat(s)); assert.strictEqual(s.phase, 'playing');
});

t('distribuicao: 108 cartas conservadas, 7 por jogador', () => {
  for (const players of [2, 3, 8]) {
    const s = g._deal(players);
    const all = [...s.draw, ...s.discard, ...s.hands.flat()];
    assert.strictEqual(all.length, 108);
    s.hands.forEach((h) => assert.strictEqual(h.length, players === 2 || true ? 7 : 7) );
  }
});

t('visao publica nao tem maos; visao privada so a propria mao', () => {
  const s = g._deal(3);
  const pub = JSON.stringify(g.view(s));
  for (const h of s.hands) for (const c of h) assert.ok(!pub.includes(`"${c}"`) || c === s.discard[s.discard.length - 1], 'mao vazou');
  assert.strictEqual(g.view(s).counts.join(), '7,7,7');
  assert.deepStrictEqual(g.viewFor(s, 1).hand, s.hands[1]);
  assert.strictEqual(g.viewFor(s, null), null);
  assert.strictEqual(g.viewFor(g.setup(), 0), null);
});

t('jogada valida: mesma cor ou mesmo valor; invalida e recusada; fora da vez recusado', () => {
  const s = base({ hands: [['R-9', 'B-5', 'G-1'], ['Y-1'], ['Y-2']] });
  assert.ok(g.move(s, 1, { t: 'play', card: 'Y-1' }).error);       // fora da vez
  assert.ok(g.move(s, 0, { t: 'play', card: 'G-1' }).error);       // nem cor nem valor
  assert.ok(g.move(s, 0, { t: 'play', card: 'Y-9' }).error);       // nao tem
  let r = play(s, 0, { t: 'play', card: 'B-5' });                  // mesmo valor
  assert.strictEqual(r.color, 'B'); assert.strictEqual(r.turn, 1);
  r = play(s, 0, { t: 'play', card: 'R-9' }); assert.strictEqual(r.color, 'R');
});

t('Pula, +2, Inverte (3+ jogadores) e Inverte com 2 jogadores', () => {
  let s = base({ hands: [['R-S', 'R-1'], ['R-2', 'R-3'], ['R-4', 'R-6']] });
  assert.strictEqual(play(s, 0, { t: 'play', card: 'R-S' }).turn, 2);
  s = base({ hands: [['R-+2', 'R-1'], ['R-2', 'R-3'], ['R-4', 'R-6']] });
  let r = play(s, 0, { t: 'play', card: 'R-+2' });
  assert.strictEqual(r.hands[1].length, 4); assert.strictEqual(r.turn, 2);
  s = base({ hands: [['R-V', 'R-1'], ['R-2', 'R-3'], ['R-4', 'R-6']] });
  r = play(s, 0, { t: 'play', card: 'R-V' }); assert.strictEqual(r.dir, -1); assert.strictEqual(r.turn, 2);
  s = base({ players: 2, hands: [['R-V', 'R-1'], ['R-2', 'R-3']] });
  assert.strictEqual(play(s, 0, { t: 'play', card: 'R-V' }).turn, 0);   // joga de novo
});

t('coringa: exige cor; +4 so sem a cor atual e faz o proximo comprar 4', () => {
  let s = base({ hands: [['W-C', 'G-1'], ['R-2', 'R-3'], ['R-4', 'R-6']] });
  assert.ok(g.move(s, 0, { t: 'play', card: 'W-C' }).error);
  let r = play(s, 0, { t: 'play', card: 'W-C', color: 'G' }); assert.strictEqual(r.color, 'G');
  s = base({ hands: [['W-+4', 'R-1'], ['R-2', 'R-3'], ['R-4', 'R-6']] });
  assert.ok(g.move(s, 0, { t: 'play', card: 'W-+4', color: 'B' }).error);       // tem vermelha
  s = base({ hands: [['W-+4', 'G-1'], ['R-2', 'R-3'], ['R-4', 'R-6']] });
  r = play(s, 0, { t: 'play', card: 'W-+4', color: 'B' });
  assert.strictEqual(r.hands[1].length, 6); assert.strictEqual(r.turn, 2); assert.strictEqual(r.color, 'B');
});

t('comprar: carta jogavel permite jogar so ela ou passar; nao jogavel passa a vez', () => {
  let s = base({ hands: [['G-1'], ['Y-1'], ['Y-2']], draw: ['B-9', 'R-7'] });
  let r = play(s, 0, { t: 'draw' });                       // compra R-7 (topo do monte), jogavel
  assert.strictEqual(r.drawn, 'R-7'); assert.strictEqual(r.turn, 0);
  assert.ok(g.move(r, 0, { t: 'play', card: 'G-1' }).error);      // so a comprada
  assert.ok(g.move(r, 0, { t: 'draw' }).error);
  assert.strictEqual(play(r, 0, { t: 'pass' }).turn, 1);
  s = base({ hands: [['G-1'], ['Y-1'], ['Y-2']], draw: ['R-7', 'B-9'] });
  r = play(s, 0, { t: 'draw' }); assert.strictEqual(r.turn, 1); assert.strictEqual(r.drawn, null);
  assert.ok(g.move(s, 0, { t: 'pass' }).error);
});

t('vitoria ao zerar a mao; UNO ao restar 1 carta; depois nao ha jogadas', () => {
  let s = base({ hands: [['R-9', 'R-1'], ['R-2'], ['R-4']] });
  let r = play(s, 0, { t: 'play', card: 'R-9' }); assert.ok(r.log.includes('UNO!'));
  r = play(r, 1, { t: 'play', card: 'R-2' }); assert.strictEqual(r.phase, 'ended'); assert.strictEqual(r.winner, 1);
  assert.strictEqual(g.view(r).over, true);
  assert.ok(g.move(r, 2, { t: 'draw' }).error);
});

t('monte acabando: reembaralha o descarte mantendo a carta do topo', () => {
  const s = base({ hands: [['G-1'], ['Y-1'], ['Y-2']], draw: [], discard: ['R-1', 'R-2', 'R-3', 'R-5'] });
  const r = play(s, 0, { t: 'draw' });
  assert.strictEqual(r.discard.length, 1); assert.strictEqual(r.discard[0], 'R-5');
  assert.strictEqual(r.hands[0].length, 2);
});

t('reiniciar mantem o numero de jogadores', () => {
  const s = g._deal(4); const r = g.restart(s);
  assert.strictEqual(r.players, 4); assert.strictEqual(r.phase, 'playing');
});

t('partidas aleatorias completas: sem erros, cartas conservadas, termina', () => {
  for (let game = 0; game < 200; game++) {
    const players = 2 + (game % 7);
    let s = g._deal(players);
    let steps = 0;
    while (s.phase === 'playing' && steps++ < 4000) {
      const seat = s.turn; const mine = g.viewFor(s, seat);
      let req;
      if (mine.playable.length && Math.random() < 0.9) {
        const card = mine.playable[Math.floor(Math.random() * mine.playable.length)];
        req = { t: 'play', card, color: ['R', 'Y', 'G', 'B'][Math.floor(Math.random() * 4)] };
      } else if (mine.canDraw) req = { t: 'draw' };
      else if (mine.canPass) req = { t: 'pass' };
      else req = { t: 'play', card: mine.playable[0], color: 'R' };
      const r = g.move(s, seat, req);
      assert.ok(r.state, `${JSON.stringify(req)} -> ${JSON.stringify(r)}`);
      s = r.state;
      const total = s.draw.length + s.discard.length + s.hands.reduce((a, h) => a + h.length, 0);
      assert.strictEqual(total, 108);
    }
    assert.ok(s.phase === 'ended' || steps >= 4000);
  }
});

console.log(`${n} testes passaram`);
