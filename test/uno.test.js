'use strict';
const assert = require('assert');
const g = require('../games/uno/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const mk = (players) => { let s = g.setup(); for (let i = 0; i < players; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req, soft) => { const r = g.move(s, seat, req); if (soft && !r.state) return s; assert.ok(r.state, JSON.stringify(r)); return r.state; };
const base = (extra) => ({ phase: 'playing', players: 3, hands: [[], [], []], draw: ['R-1', 'R-2', 'R-3', 'R-4', 'R-5', 'R-6', 'R-7', 'R-8'], discard: ['R-5'], turn: 0, dir: 1, color: 'R', drawn: null, winner: null, log: '', scores: [0, 0, 0], roundPoints: 0, gameWinner: null, manual: false, uno: null, pending: null, first: 0, ...extra });

t('lobby: vagas so antes de comecar; contagem de jogadores; so o anfitriao comeca', () => {
  let s = mk(1);
  assert.ok(g.move(s, 0, { t: 'start' }).error);          // 1 jogador so
  s = mk(3); assert.strictEqual(s.players, 3); assert.ok(g.acceptsSeat(s));
  assert.ok(g.move(s, 1, { t: 'start' }).error);
  s = play(s, 0, { t: 'start' });
  assert.ok(!g.acceptsSeat(s)); assert.strictEqual(s.phase, 'playing');
});

t('distribuicao: 109 cartas (108 + Trocar as Maos) conservadas, 7 por jogador', () => {
  for (const players of [2, 3, 8]) {
    const s = g._deal(players);
    const all = [...s.draw, ...s.discard, ...s.hands.flat()];
    assert.strictEqual(all.length, 109);
    assert.strictEqual(all.filter((c) => c === 'W-H').length, 1);
    s.hands.forEach((h, i) => assert.ok(h.length === 7 || (i === 0 && h.length === 9), `mao ${i}: ${h.length}`)); // carta inicial +2 faz o jogador 0 comprar 2
  }
});

t('visao publica nao tem maos; visao privada so a propria mao', () => {
  let s = g._deal(3);
  while (s.hands.some((h) => h.length !== 7)) s = g._deal(3);      // evita a carta inicial +2 (jogador 0 compra 2)
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

t('coringa: exige cor; +4 legal, aceito, faz o proximo comprar 4 e perder a vez', () => {
  let s = base({ hands: [['W-C', 'G-1'], ['R-2', 'R-3'], ['R-4', 'R-6']] });
  assert.ok(g.move(s, 0, { t: 'play', card: 'W-C' }).error);
  let r = play(s, 0, { t: 'play', card: 'W-C', color: 'G' }); assert.strictEqual(r.color, 'G');
  s = base({ hands: [['W-+4', 'G-1'], ['R-2', 'R-3'], ['R-4', 'R-6']] });
  r = play(s, 0, { t: 'play', card: 'W-+4', color: 'B' });
  assert.strictEqual(r.color, 'B'); assert.ok(r.pending); assert.strictEqual(r.turn, 1);
  assert.strictEqual(r.hands[1].length, 2);                         // ainda nao comprou: pode desafiar
  assert.ok(g.move(r, 2, { t: 'accept' }).error);                    // so quem recebeu responde
  assert.ok(g.move(r, 1, { t: 'draw' }).error);
  assert.deepStrictEqual(g.viewFor(r, 1).playable, []);
  assert.strictEqual(g.viewFor(r, 1).mustRespond, true);
  r = play(r, 1, { t: 'accept' });
  assert.strictEqual(r.hands[1].length, 6); assert.strictEqual(r.turn, 2); assert.strictEqual(r.pending, null);
});

t('desafio do +4: certo (tinha a cor) = quem jogou compra 4; errado = desafiante compra 6 e perde a vez', () => {
  // quem jogou TINHA carta vermelha (cor em jogo): blefe
  let s = base({ hands: [['W-+4', 'R-1', 'G-1'], ['B-2', 'B-3'], ['B-4', 'B-6']] });
  let r = play(s, 0, { t: 'play', card: 'W-+4', color: 'G' });
  r = play(r, 1, { t: 'challenge' });
  assert.strictEqual(r.hands[0].length, 2 + 4);
  assert.strictEqual(r.hands[1].length, 2);                          // desafiante nao compra
  assert.strictEqual(r.turn, 1); assert.strictEqual(r.pending, null); assert.strictEqual(r.color, 'G');
  // jogada legal (sem vermelha; so numero igual nao impede): desafio errado
  s = base({ hands: [['W-+4', 'G-5', 'G-1'], ['B-2', 'B-3'], ['B-4', 'B-6']] });
  r = play(s, 0, { t: 'play', card: 'W-+4', color: 'G' });
  r = play(r, 1, { t: 'challenge' });
  assert.strictEqual(r.hands[1].length, 2 + 6);
  assert.strictEqual(r.hands[0].length, 2);
  assert.strictEqual(r.turn, 2);
  // o +4 como ultima carta: sem desafio, a rodada acaba (o proximo compra 4 antes da contagem)
  s = base({ hands: [['W-+4'], ['B-2', 'B-3'], ['B-4', 'B-6']] });
  r = play(s, 0, { t: 'play', card: 'W-+4', color: 'G' });
  assert.strictEqual(r.phase, 'roundEnd'); assert.strictEqual(r.pending, null);
  assert.strictEqual(r.roundPoints, 2 + 3 + 4 + 6 + 4 * 0 + (r.hands[1].concat(r.hands[2]).reduce((a, c) => a + g._points(c), 0) - (2 + 3 + 4 + 6)));
});

t('Coringa Trocar as Maos: cor + jogador, troca as cartas, nao pode ser a ultima carta', () => {
  let s = base({ hands: [['W-H', 'G-1', 'G-2'], ['B-2'], ['B-4', 'B-6']] });
  assert.ok(g.move(s, 0, { t: 'play', card: 'W-H', color: 'G' }).error);                 // sem alvo
  assert.ok(g.move(s, 0, { t: 'play', card: 'W-H', color: 'G', target: 0 }).error);     // nao em si mesmo
  assert.ok(g.move(s, 0, { t: 'play', card: 'W-H', target: 1 }).error);                 // sem cor
  let r = play(s, 0, { t: 'play', card: 'W-H', color: 'G', target: 1 });
  assert.deepStrictEqual(r.hands[0], ['B-2']); assert.deepStrictEqual(r.hands[1], ['G-1', 'G-2']);
  assert.strictEqual(r.color, 'G'); assert.strictEqual(r.turn, 1);
  s = base({ hands: [['W-H'], ['B-2'], ['B-4', 'B-6']] });
  assert.ok(g.move(s, 0, { t: 'play', card: 'W-H', color: 'G', target: 1 }).error);     // ultima carta
  assert.deepStrictEqual(g.viewFor(s, 0).playable, []);
});

t('pontuacao: quem zera soma as cartas dos demais; 500 pontos vence; Nova partida continua o placar', () => {
  assert.strictEqual(g._points('R-7'), 7); assert.strictEqual(g._points('G-S'), 20); assert.strictEqual(g._points('B-V'), 20);
  assert.strictEqual(g._points('Y-+2'), 20); assert.strictEqual(g._points('W-C'), 50); assert.strictEqual(g._points('W-+4'), 50); assert.strictEqual(g._points('W-H'), 50);
  let s = base({ hands: [['R-9'], ['R-2', 'W-C', 'G-+2'], ['B-4', 'Y-7']], scores: [100, 0, 0] });
  let r = play(s, 0, { t: 'play', card: 'R-9' });
  assert.strictEqual(r.phase, 'roundEnd'); assert.strictEqual(r.winner, 0);
  assert.strictEqual(r.roundPoints, (2 + 50 + 20) + (4 + 7));
  assert.strictEqual(r.scores[0], 100 + 83); assert.strictEqual(r.gameWinner, null);
  assert.strictEqual(g.view(r).over, true);
  const next = g.restart(r);                                       // proxima rodada: placar acumulado, outro jogador comeca
  assert.strictEqual(next.phase, 'playing'); assert.deepStrictEqual(next.scores, [183, 0, 0]); assert.strictEqual(next.first, 1);
  s = base({ hands: [['R-9'], ['W-C', 'W-+4'], ['B-4']], scores: [450, 0, 0] });
  r = play(s, 0, { t: 'play', card: 'R-9' });
  assert.strictEqual(r.scores[0], 450 + 104); assert.strictEqual(r.gameWinner, 0);
  const fresh = g.restart(r);                                       // jogo decidido: zera
  assert.deepStrictEqual(fresh.scores, [0, 0, 0]); assert.strictEqual(fresh.gameWinner, null);
  assert.ok(g.move(r, 1, { t: 'draw' }).error);
});

t('UNO manual: gritar evita a penalidade; esquecer permite "pegar" ate o proximo jogar', () => {
  const mkManual = () => base({ manual: true, hands: [['R-9', 'R-1'], ['R-2', 'R-3', 'R-8'], ['R-4', 'R-6']] });
  let s = play(mkManual(), 0, { t: 'play', card: 'R-9' });
  assert.deepStrictEqual(g.view(s).uno, { seat: 0, shouted: false });
  assert.ok(!s.log.includes('UNO!'));
  assert.strictEqual(g.viewFor(s, 0).canUno, true);
  assert.strictEqual(g.viewFor(s, 2).canCatch, true);
  assert.strictEqual(g.viewFor(s, 0).canCatch, false);
  assert.ok(g.move(s, 1, { t: 'uno' }).error);                       // nao e dele
  assert.ok(g.move(s, 0, { t: 'catch' }).error);                     // nao pega a si mesmo
  // esquecido: outro jogador pega, antes mesmo da vez do proximo
  let c = play(s, 2, { t: 'catch' });
  assert.strictEqual(c.hands[0].length, 1 + 2); assert.strictEqual(c.uno, null); assert.strictEqual(c.turn, 1);
  assert.ok(g.move(c, 2, { t: 'catch' }).error);                     // so uma vez
  // gritou: nao da para pegar
  let u = play(s, 0, { t: 'uno' });
  assert.strictEqual(u.uno.shouted, true); assert.ok(g.move(u, 2, { t: 'catch' }).error);
  // o proximo joga: a janela fecha e nao da mais para pegar
  const closed = play(s, 1, { t: 'play', card: 'R-2' });
  assert.strictEqual(closed.uno, null); assert.ok(g.move(closed, 2, { t: 'catch' }).error);
  // modo automatico nao tem janela
  s = play(base({ hands: [['R-9', 'R-1'], ['R-2'], ['R-4']] }), 0, { t: 'play', card: 'R-9' });
  assert.strictEqual(s.uno, null); assert.ok(s.log.includes('UNO!'));
  // iniciar pelo lobby escolhe o modo
  let l = mk(3);
  assert.strictEqual(play(l, 0, { t: 'start', manual: true }).manual, true);
  assert.strictEqual(play(l, 0, { t: 'start' }).manual, false);
});

t('piloto automatico: aceita o +4, nunca blefa nem troca de maos', () => {
  let s = base({ hands: [['W-+4', 'R-1', 'G-1'], ['B-2', 'B-3'], ['B-4', 'B-6']] });
  s = play(s, 0, { t: 'play', card: 'W-+4', color: 'G' });
  assert.deepStrictEqual(g.waitingOn(s), [1]);
  assert.deepStrictEqual(g.autoMove(s, 1), { t: 'accept' });
  const am = g.autoMove(base({ hands: [['W-+4', 'W-H', 'R-3'], ['B-2'], ['B-4']] }), 0);
  assert.deepStrictEqual(am, { t: 'play', card: 'R-3' });          // prefere carta comum; nunca troca de maos
  const only = g.autoMove(base({ hands: [['W-H', 'G-3'], ['B-2'], ['B-4']] }), 0);
  assert.strictEqual(only.t, 'draw');                              // so o Trocar as Maos serve: compra em vez de jogar
  const legal = base({ hands: [['W-+4', 'W-H'], ['B-2'], ['B-4']], color: 'B', discard: ['B-5'] });
  assert.strictEqual(g.autoMove(legal, 0).card, 'W-+4');            // sem carta azul: o +4 e legal
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
  r = play(r, 1, { t: 'play', card: 'R-2' }); assert.strictEqual(r.phase, 'roundEnd'); assert.strictEqual(r.winner, 1);
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
    let s = g._deal(players, { manual: game % 2 === 0 });
    let steps = 0;
    while (s.phase === 'playing' && steps++ < 4000) {
      const seat = s.turn; const mine = g.viewFor(s, seat);
      let req;
      if (mine.mustRespond) req = { t: Math.random() < 0.4 ? 'challenge' : 'accept' };
      else if (mine.playable.length && Math.random() < 0.9) {
        const card = mine.playable[Math.floor(Math.random() * mine.playable.length)];
        req = { t: 'play', card, color: ['R', 'Y', 'G', 'B'][Math.floor(Math.random() * 4)], target: (seat + 1 + Math.floor(Math.random() * (players - 1))) % players };
      } else if (mine.canDraw) req = { t: 'draw' };
      else if (mine.canPass) req = { t: 'pass' };
      else req = { t: 'play', card: mine.playable[0], color: 'R' };
      const r = g.move(s, seat, req);
      assert.ok(r.state, `${JSON.stringify(req)} -> ${JSON.stringify(r)}`);
      s = r.state;
      const total = s.draw.length + s.discard.length + s.hands.reduce((a, h) => a + h.length, 0);
      assert.strictEqual(total, 109);
      if (s.uno && !s.uno.shouted && Math.random() < 0.5) s = play(s, Math.random() < 0.5 ? s.uno.seat : (s.uno.seat + 1) % players, Math.random() < 0.5 ? { t: 'uno' } : { t: 'catch' }, true);
    }
    assert.ok(s.phase === 'roundEnd' || steps >= 4000);
  }
});

console.log(`${n} testes passaram`);
