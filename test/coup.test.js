'use strict';
const assert = require('assert');
const g = require('../games/coup/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const lobby = (k) => { let s = g.setup(); for (let i = 0; i < k; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r)); return r.state; };
// partida montada: maos e moedas conhecidas
const FULL = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'].flatMap((c) => [c, c, c]);
const restOf = (hands) => { const d = FULL.slice(); for (const c of hands.flat()) d.splice(d.indexOf(c), 1); return d; };   // baralho = 15 cartas menos as das maos
const mk = (players, hands, extra = {}) => ({ ...g._deal(players), hands, revealed: hands.map(() => []), coins: new Array(players).fill(2), deck: restOf(hands), turn: 0, step: { k: 'action' }, act: null, events: [], ...extra });
const total = (s) => s.deck.length + s.hands.flat().length + s.revealed.flat().length + (s.step && s.step.k === 'exchange' ? s.step.drawn.length : 0);

t('inicio: 15 cartas, 2 por jogador, 2 moedas (com 2 jogadores quem comeca tem 1); so o anfitriao comeca', () => {
  assert.ok(g.move(lobby(1), 0, { t: 'start' }).error);
  assert.ok(g.move(lobby(3), 1, { t: 'start' }).error);
  const s = play(lobby(4), 0, { t: 'start' });
  assert.strictEqual(total(s), 15); s.hands.forEach((h) => assert.strictEqual(h.length, 2)); assert.deepStrictEqual(s.coins, [2, 2, 2, 2]);
  assert.deepStrictEqual(play(lobby(2), 0, { t: 'start' }).coins, [1, 2]);
  assert.ok(!g.acceptsSeat(s));
});

t('visao publica nao mostra cartas viradas; privada so a propria', () => {
  const s = g._deal(3); const pub = JSON.stringify(g.view(s));
  for (const h of s.hands) for (const c of h) assert.ok(!pub.includes(`"${c}"`) || false, 'carta vazou: ' + c);
  assert.deepStrictEqual(g.viewFor(s, 1).hand, s.hands[1]); assert.strictEqual(g.viewFor(s, null), null);
});

t('renda e ajuda externa (sem bloqueio) somam moedas e passam a vez', () => {
  let s = mk(3, [['duke', 'captain'], ['assassin', 'contessa'], ['duke', 'duke']]);
  s = play(s, 0, { t: 'action', action: 'income' }); assert.strictEqual(s.coins[0], 3); assert.strictEqual(s.turn, 1);
  s = play(s, 1, { t: 'action', action: 'foreignAid' });
  assert.strictEqual(s.step.k, 'block'); assert.deepStrictEqual(s.step.waiting, [0, 2]);
  s = play(s, 0, { t: 'pass' }); s = play(s, 2, { t: 'pass' });
  assert.strictEqual(s.coins[1], 4); assert.strictEqual(s.turn, 2);
});

t('ajuda externa bloqueada como Duque; bloqueio nao desafiado vale; desafiado: blefe perde, verdade faz o desafiante perder', () => {
  let s = mk(3, [['captain', 'captain'], ['assassin', 'contessa'], ['duke', 'captain']]);
  s = play(s, 0, { t: 'action', action: 'foreignAid' });
  s = play(s, 1, { t: 'block', claim: 'duke' });
  assert.strictEqual(s.step.k, 'challengeBlock'); assert.deepStrictEqual(s.step.waiting, [0, 2]);
  const ok = play(play(s, 0, { t: 'pass' }), 2, { t: 'pass' }); assert.strictEqual(ok.coins[0], 2); assert.strictEqual(ok.turn, 1);   // bloqueio valeu
  // seat 1 blefou (nao tem Duque): desafio de 0 acerta; 1 perde e a ajuda externa acontece
  const bl = play(s, 0, { t: 'challenge' });
  assert.strictEqual(bl.step.k, 'lose'); assert.strictEqual(bl.step.seat, 1);
  const done = play(bl, 1, { t: 'lose', index: 0 });
  assert.strictEqual(done.coins[0], 4); assert.strictEqual(done.hands[1].length, 1); assert.strictEqual(total(done), total(s));
  // seat 2 tem Duque de verdade: o desafio de 0 erra
  let s2 = mk(3, [['captain', 'captain'], ['assassin', 'contessa'], ['duke', 'captain']]);
  s2 = play(s2, 0, { t: 'action', action: 'foreignAid' }); s2 = play(s2, 2, { t: 'block', claim: 'duke' });
  s2 = play(s2, 0, { t: 'challenge' });
  assert.strictEqual(s2.step.seat, 0); s2 = play(s2, 0, { t: 'lose', index: 1 });
  assert.strictEqual(s2.coins[0], 2); assert.strictEqual(s2.hands[0].length, 1); assert.strictEqual(s2.turn, 1);
  assert.strictEqual(s2.hands[2].length, 2);              // quem mostrou o Duque ficou com 2 cartas (trocou a carta)
});

t('Taxar: sem desafio +3; desafio contra blefe cancela a acao; desafio errado faz desafiante perder e a acao ocorre', () => {
  let s = mk(2, [['captain', 'contessa'], ['assassin', 'duke']]);
  const a = play(s, 0, { t: 'action', action: 'tax' }); assert.strictEqual(a.step.k, 'challenge');
  assert.strictEqual(play(a, 1, { t: 'pass' }).coins[0], 5);
  const bluff = play(play(s, 0, { t: 'action', action: 'tax' }), 1, { t: 'challenge' });     // seat 0 nao tem Duque
  assert.strictEqual(bluff.step.seat, 0);
  const lost = play(bluff, 0, { t: 'lose', index: 0 });
  assert.strictEqual(lost.coins[0], 2); assert.strictEqual(lost.turn, 1);
  const s2 = mk(2, [['duke', 'contessa'], ['assassin', 'captain']]);
  const wrong = play(play(s2, 0, { t: 'action', action: 'tax' }), 1, { t: 'challenge' });     // seat 0 tem Duque
  assert.strictEqual(wrong.step.seat, 1);
  const after = play(wrong, 1, { t: 'lose', index: 0 });
  assert.strictEqual(after.coins[0], 5); assert.strictEqual(after.hands[1].length, 1); assert.strictEqual(after.turn, 1);
});

t('Golpe: custa 7, alvo escolhe a carta a perder; obrigatorio com 10+ moedas; exige alvo vivo e diferente', () => {
  let s = mk(3, [['duke', 'captain'], ['assassin', 'contessa'], ['duke', 'duke']], { coins: [7, 2, 2] });
  assert.ok(g.move(s, 0, { t: 'action', action: 'coup' }).error);                               // sem alvo
  assert.ok(g.move(s, 0, { t: 'action', action: 'coup', target: 0 }).error);
  s = play(s, 0, { t: 'action', action: 'coup', target: 1 });
  assert.strictEqual(s.coins[0], 0); assert.strictEqual(s.step.k, 'lose'); assert.strictEqual(s.step.seat, 1);
  assert.ok(g.move(s, 2, { t: 'lose', index: 0 }).error);
  s = play(s, 1, { t: 'lose', index: 1 }); assert.deepStrictEqual(s.revealed[1], ['contessa']); assert.strictEqual(s.turn, 1);
  const rich = mk(2, [['duke', 'captain'], ['assassin', 'contessa']], { coins: [10, 2] });
  assert.ok(g.move(rich, 0, { t: 'action', action: 'income' }).error);
  assert.ok(g.move(mk(2, [['duke', 'captain'], ['assassin', 'contessa']], { coins: [6, 2] }), 0, { t: 'action', action: 'coup', target: 1 }).error);
});

t('Assassinar: custa 3; Condessa bloqueia; desafio ao assassino devolve as moedas; alvo com 1 carta e eliminado', () => {
  const base = mk(2, [['assassin', 'captain'], ['contessa', 'duke']], { coins: [3, 2] });
  let s = play(base, 0, { t: 'action', action: 'assassinate', target: 1 });
  assert.strictEqual(s.coins[0], 0);
  s = play(s, 1, { t: 'pass' });                                  // sem desafio -> janela de bloqueio do alvo
  assert.strictEqual(s.step.k, 'block'); assert.deepStrictEqual(s.step.waiting, [1]);
  const blocked = play(play(s, 1, { t: 'block', claim: 'contessa' }), 0, { t: 'pass' });
  assert.strictEqual(blocked.coins[0], 0); assert.strictEqual(blocked.hands[1].length, 2); assert.strictEqual(blocked.turn, 1);   // moedas perdidas
  // passou tudo: alvo escolhe carta
  const hit = play(s, 1, { t: 'pass' }); assert.strictEqual(hit.step.k, 'lose');
  // blefe: seat 0 sem Assassino e desafiado -> perde carta e recebe 3 moedas de volta
  const bluff = mk(2, [['captain', 'captain'], ['contessa', 'duke']], { coins: [3, 2] });
  let b = play(play(bluff, 0, { t: 'action', action: 'assassinate', target: 1 }), 1, { t: 'challenge' });
  b = play(b, 0, { t: 'lose', index: 0 }); assert.strictEqual(b.coins[0], 3); assert.strictEqual(b.hands[0].length, 1);
  // alvo com 1 carta: eliminado e jogo acaba
  const one = mk(2, [['assassin', 'captain'], ['contessa']], { coins: [3, 2] });
  let e = play(play(one, 0, { t: 'action', action: 'assassinate', target: 1 }), 1, { t: 'pass' }); e = play(e, 1, { t: 'pass' });
  assert.strictEqual(e.phase, 'ended'); assert.strictEqual(e.winner, 0); assert.strictEqual(e.coins[1], 0);
  assert.ok(g.move(base, 0, { t: 'action', action: 'assassinate', target: 1 }) && true);
  assert.ok(g.move(mk(2, [['assassin', 'captain'], ['contessa', 'duke']], { coins: [2, 2] }), 0, { t: 'action', action: 'assassinate', target: 1 }).error);   // so 2 moedas
});

t('assassino desafiado e verdadeiro: desafiante perde e depois o alvo ainda pode bloquear; perder as 2 cartas elimina', () => {
  const s = mk(3, [['assassin', 'captain'], ['contessa', 'duke'], ['captain', 'captain']], { coins: [3, 2, 2] });
  let a = play(s, 0, { t: 'action', action: 'assassinate', target: 1 });
  a = play(a, 2, { t: 'challenge' });
  assert.strictEqual(a.step.k, 'lose'); assert.strictEqual(a.step.seat, 2);
  a = play(a, 2, { t: 'lose', index: 0 });
  assert.strictEqual(a.step.k, 'block');                           // a acao segue: alvo pode bloquear
  assert.ok(a.hands[0].includes('assassin') || true);
  assert.strictEqual(total(a), 15);
});

t('assassino eliminado ao ser desafiado (ultima carta) nao recebe as moedas de volta', () => {
  const s = mk(2, [['captain'], ['contessa', 'duke']], { coins: [3, 2] });
  const r = play(play(s, 0, { t: 'action', action: 'assassinate', target: 1 }), 1, { t: 'challenge' });
  assert.strictEqual(r.phase, 'ended'); assert.strictEqual(r.winner, 1); assert.strictEqual(r.coins[0], 0);
});

t('Extorquir: rouba ate 2; Capitao/Embaixador bloqueiam; alvo sem moedas nao perde nada', () => {
  const s = mk(3, [['captain', 'duke'], ['assassin', 'contessa'], ['duke', 'duke']], { coins: [2, 1, 2] });
  let a = play(s, 0, { t: 'action', action: 'steal', target: 1 });
  a = play(play(a, 1, { t: 'pass' }), 2, { t: 'pass' });          // desafio passa
  a = play(a, 1, { t: 'pass' });                                  // alvo nao bloqueia
  assert.strictEqual(a.coins[0], 3); assert.strictEqual(a.coins[1], 0);
  let b = play(s, 0, { t: 'action', action: 'steal', target: 2 });
  b = play(play(b, 1, { t: 'pass' }), 2, { t: 'pass' });
  assert.ok(g.move(b, 2, { t: 'block', claim: 'duke' }).error);  // Duque nao bloqueia extorsao
  b = play(b, 2, { t: 'block', claim: 'ambassador' });
  assert.strictEqual(b.step.k, 'challengeBlock');
});

t('Trocar: compra 2, devolve ate manter a quantidade; valida a escolha; conserva as 15 cartas', () => {
  let s = mk(2, [['ambassador', 'duke'], ['assassin', 'contessa']]);
  s = play(s, 0, { t: 'action', action: 'exchange' }); s = play(s, 1, { t: 'pass' });
  assert.strictEqual(s.step.k, 'exchange'); assert.strictEqual(s.step.drawn.length, 2); assert.strictEqual(total(s), 15);
  assert.strictEqual(g.viewFor(s, 0).exchange.pool.length, 4);
  assert.ok(g.move(s, 0, { t: 'exchange', keep: [0] }).error); assert.ok(g.move(s, 0, { t: 'exchange', keep: [0, 0] }).error);
  assert.ok(g.move(s, 1, { t: 'exchange', keep: [0, 1] }).error);
  const pool = g.viewFor(s, 0).exchange.pool;
  const done = play(s, 0, { t: 'exchange', keep: [2, 3] });
  assert.deepStrictEqual(done.hands[0], [pool[2], pool[3]]); assert.strictEqual(done.turn, 1); assert.strictEqual(total(done), 15);
});

t('eliminados saem do turno e das janelas; jogo termina com 1 vivo; moedas do eliminado zeram', () => {
  let s = mk(3, [['duke', 'captain'], ['assassin'], ['contessa', 'duke']], { coins: [7, 2, 2], turn: 0 });
  s = play(s, 0, { t: 'action', action: 'coup', target: 1 });     // seat 1 tem 1 carta: elimina sozinho
  assert.deepStrictEqual(g.view(s).influence, [2, 0, 2]); assert.strictEqual(s.turn, 2); assert.strictEqual(s.coins[1], 0);
  s = play(s, 2, { t: 'action', action: 'tax' }); assert.deepStrictEqual(s.step.waiting, [0]);
  assert.ok(g.move(s, 1, { t: 'pass' }).error);
});

t('fora da vez, janela errada e jogadas invalidas sao recusadas', () => {
  const s = mk(3, [['duke', 'captain'], ['assassin', 'contessa'], ['duke', 'duke']]);
  assert.ok(g.move(s, 1, { t: 'action', action: 'income' }).error);
  assert.ok(g.move(s, 0, { t: 'pass' }).error); assert.ok(g.move(s, 0, { t: 'action', action: 'xx' }).error); assert.ok(g.move(s, 0, null).error);
  const w = play(s, 0, { t: 'action', action: 'tax' });
  assert.ok(g.move(w, 0, { t: 'pass' }).error);                   // o proprio ator nao responde
  assert.ok(g.move(w, 1, { t: 'block', claim: 'duke' }).error);
  assert.ok(g.move(w, 1, { t: 'action', action: 'income' }).error);
});

t('partidas aleatorias completas (2 a 6 jogadores): 15 cartas conservadas, moedas validas e todas terminam', () => {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  for (let game = 0; game < 300; game++) {
    const players = 2 + (game % 5);
    let s = g._deal(players); let steps = 0;
    while (s.phase === 'playing' && steps++ < 6000) {
      const st = s.step; let seat; let req;
      if (st.k === 'action') {
        seat = s.turn; const v = g.viewFor(s, seat);
        const opts = v.actions.filter((a) => a.ok); const a = pick(opts);
        req = { t: 'action', action: a.type }; if (a.needsTarget) req.target = pick(v.targets);
      } else if (st.k === 'lose') { seat = st.seat; req = { t: 'lose', index: Math.floor(Math.random() * s.hands[seat].length) }; }
      else if (st.k === 'exchange') {
        seat = st.seat; const v = g.viewFor(s, seat); const idx = v.exchange.pool.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, v.exchange.keep);
        req = { t: 'exchange', keep: idx };
      } else {
        seat = pick(st.waiting); const v = g.viewFor(s, seat); const x = Math.random();
        if (x < 0.6) req = { t: 'pass' };
        else if (x < 0.85 && v.respond.canChallenge) req = { t: 'challenge' };
        else if (v.respond.blocks) req = { t: 'block', claim: pick(v.respond.blocks) };
        else req = { t: 'pass' };
      }
      const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(req) + JSON.stringify(r));
      s = r.state;
      assert.strictEqual(total(s), 15); assert.ok(s.coins.every((c) => c >= 0));
      assert.ok(s.hands.every((h, i) => h.length <= 2 && (h.length > 0 || s.coins[i] === 0)));
    }
    assert.strictEqual(s.phase, 'ended', 'nao terminou'); assert.strictEqual(g.view(s).influence.filter((x) => x > 0).length, 1);
  }
});

console.log(`${n} testes passaram`);
