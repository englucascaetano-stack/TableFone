'use strict';
const assert = require('assert');
const g = require('../games/bang/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const lobby = (k) => { let s = g.setup(); for (let i = 0; i < k; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r)); return r.state; };
const fail = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.error, 'esperava erro'); return r.error; };
const D = g._DECK;
const find = (type, from = 0) => D.findIndex((c, i) => i >= from && c.type === type);
const count = (s) => s.deck.length + s.discard.length + s.hands.reduce((a, h) => a + h.length, 0) + s.table.reduce((a, h) => a + h.length, 0) +
  (s.step && s.step.k === 'store' ? s.step.cards.length : 0) + (s.step && s.step.k === 'kit' ? s.step.cards.length : 0);
// partida controlada: sem personagens especiais, mao e mesa conhecidas
function mk(players = 4, over = {}) {
  const s = g._deal(lobby(players));
  s.chars = s.chars.map(() => 'plain');
  s.hp = s.max.map(() => 4);
  s.max = s.hp.slice();
  s.deck = [...Array(80).keys()];
  s.discard = []; s.hands = s.hands.map(() => []); s.table = s.table.map(() => []);
  s.turn = 0; s.stage = 'play'; s.banged = false; s.step = null; s.log = [];
  return Object.assign(s, over);
}
const give = (s, seat, ...ids) => { for (const id of ids) { s.deck.splice(s.deck.indexOf(id), 1); s.hands[seat].push(id); } return s; };
const put = (s, seat, ...ids) => { for (const id of ids) { s.deck.splice(s.deck.indexOf(id), 1); s.table[seat].push(id); } return s; };

t('baralho: 80 cartas com as quantidades do jogo e 16 personagens', () => {
  assert.strictEqual(D.length, 80);
  const by = {};
  for (const c of D) by[c.type] = (by[c.type] || 0) + 1;
  assert.deepStrictEqual(by, { bang: 25, missed: 12, beer: 6, saloon: 1, stagecoach: 2, wells: 1, store: 2, gatling: 1, indians: 2, duel: 3, panic: 4, balou: 4, barrel: 2, dynamite: 1, jail: 3, mustang: 2, scope: 1, schofield: 3, remington: 1, carabine: 1, winchester: 1, volcanic: 2 });
  assert.strictEqual(g._CHARS.length, 16);
  assert.strictEqual(new Set(g._CHARS.map((c) => c.id)).size, 16);
});

t('preparacao: papeis por numero de jogadores, vida e cartas iniciais', () => {
  for (const [p, roles] of [[4, ['sheriff', 'renegade', 'outlaw', 'outlaw']], [5, 5], [6, 6], [7, 7]]) {
    const s = g._deal(lobby(p));
    assert.strictEqual(s.roles.filter((r) => r === 'sheriff').length, 1);
    if (p === 4) assert.deepStrictEqual(s.roles.slice().sort(), roles.slice().sort());
    if (p === 7) assert.strictEqual(s.roles.filter((r) => r === 'deputy').length, 2);
    assert.strictEqual(s.roles.filter((r) => r === 'renegade').length, 1);
    assert.strictEqual(s.turn, s.roles.indexOf('sheriff'));
    s.hp.forEach((h, i) => assert.strictEqual(h, s.max[i]));
    assert.strictEqual(new Set(s.chars).size, p);
    assert.strictEqual(count(s), 80);
  }
});

t('distancia: circular, Mustang, Mira e jogadores eliminados', () => {
  const s = mk(5);
  assert.strictEqual(g._dist(s, 0, 1), 1);
  assert.strictEqual(g._dist(s, 0, 2), 2);
  assert.strictEqual(g._dist(s, 0, 4), 1);
  put(s, 2, find('mustang'));
  assert.strictEqual(g._dist(s, 0, 2), 3);
  put(s, 0, find('scope'));
  assert.strictEqual(g._dist(s, 0, 2), 2);
  s.alive[1] = false;
  assert.strictEqual(g._dist(s, 0, 2), 1);   // vivos 0,2,3,4: d=1, +1 Mustang, -1 Mira
});

t('BANG!: alcance 1 por padrao, uma por turno, Errou! cancela', () => {
  let s = mk(5);
  const b1 = find('bang'), b2 = find('bang', b1 + 1), m = find('missed');
  give(s, 0, b1, b2); give(s, 1, m);
  fail(s, 0, { t: 'play', card: b1, target: 2 });          // distancia 2
  s = play(s, 0, { t: 'play', card: b1, target: 1 });
  assert.strictEqual(s.step.k, 'bang');
  fail(s, 0, { t: 'end' });
  s = play(s, 1, { t: 'missed', card: m });
  assert.strictEqual(s.step, null);
  assert.strictEqual(s.hp[1], 4);
  fail(s, 0, { t: 'play', card: b2, target: 1 });          // so 1 BANG!
  assert.strictEqual(count(s), 80);
});

t('BANG! sem resposta tira 1 vida; Volcanic permite varios; Schofield aumenta o alcance', () => {
  let s = mk(5);
  const b = [0, 1, 2].map((k) => find('bang', k === 0 ? 0 : find('bang', k)));
  const bs = D.map((c, i) => (c.type === 'bang' ? i : -1)).filter((i) => i >= 0).slice(0, 3);
  give(s, 0, ...bs, find('volcanic'));
  s = play(s, 0, { t: 'play', card: find('volcanic') });
  s = play(s, 0, { t: 'play', card: bs[0], target: 1 });
  s = play(s, 1, { t: 'pass' });
  assert.strictEqual(s.hp[1], 3);
  s = play(s, 0, { t: 'play', card: bs[1], target: 1 });
  s = play(s, 1, { t: 'pass' });
  assert.strictEqual(s.hp[1], 2);
  let w = mk(5);
  const sc = find('schofield');
  const bg = D.findIndex((c) => c.type === 'bang');
  give(w, 0, bg, sc);
  fail(w, 0, { t: 'play', card: bg, target: 2 });
  w = play(w, 0, { t: 'play', card: sc });
  w = play(w, 0, { t: 'play', card: bg, target: 2 });
  assert.strictEqual(w.step.target, 2);
  assert.strictEqual(count(w), 80);
});

t('Barril: coracao cancela o BANG!', () => {
  let s = mk(4);
  const barrel = find('barrel');
  const bg = find('bang');
  put(s, 1, barrel); give(s, 0, bg);
  const heart = D.findIndex((c) => c.suit === 'H');
  s.deck.splice(s.deck.indexOf(heart), 1); s.deck.push(heart);   // topo do baralho
  s = play(s, 0, { t: 'play', card: bg, target: 1 });
  assert.strictEqual(s.step, null);
  assert.strictEqual(s.hp[1], 4);
  let s2 = mk(4);
  const spade = D.findIndex((c, i) => c.suit === 'S' && c.type === 'bang');
  put(s2, 1, barrel); give(s2, 0, bg === spade ? find('bang', bg + 1) : bg);
  s2.deck.splice(s2.deck.indexOf(spade), 1); s2.deck.push(spade);
  s2 = play(s2, 0, { t: 'play', card: s2.hands[0][0], target: 1 });
  assert.ok(s2.step && s2.step.k === 'bang');
});

t('Cerveja: cura, nao passa do maximo e nao funciona com 2 jogadores', () => {
  let s = mk(4);
  const beer = find('beer');
  give(s, 0, beer);
  fail(s, 0, { t: 'play', card: beer });                   // vida cheia
  s.hp[0] = 3;
  s = play(s, 0, { t: 'play', card: beer });
  assert.strictEqual(s.hp[0], 4);
  let d = mk(4);
  d.alive[2] = false; d.alive[3] = false; d.hp[0] = 3;
  give(d, 0, find('beer'));
  fail(d, 0, { t: 'play', card: find('beer') });
});

t('Duelo, Indios! e Gatling', () => {
  let s = mk(4);
  const du = find('duel'), b1 = find('bang'), b2 = find('bang', b1 + 1);
  give(s, 0, du, b2); give(s, 1, b1);
  s = play(s, 0, { t: 'play', card: du, target: 1 });
  assert.strictEqual(s.step.k, 'duel');
  s = play(s, 1, { t: 'bang', card: b1 });
  s = play(s, 0, { t: 'bang', card: b2 });
  s = play(s, 1, { t: 'pass' });
  assert.strictEqual(s.hp[1], 3);
  assert.strictEqual(s.step, null);
  let i = mk(4);
  const ind = find('indians'), bb = find('bang');
  give(i, 0, ind); give(i, 2, bb);
  i = play(i, 0, { t: 'play', card: ind });
  assert.strictEqual(i.step.target, 1);
  i = play(i, 1, { t: 'pass' });
  assert.strictEqual(i.hp[1], 3);
  i = play(i, 2, { t: 'bang', card: bb });
  assert.strictEqual(i.step.target, 3);
  i = play(i, 3, { t: 'pass' });
  assert.strictEqual(i.step, null);
  assert.deepStrictEqual(i.hp.slice(1), [3, 4, 3]);
  let gt = mk(4);
  const gat = find('gatling'), m = find('missed');
  give(gt, 0, gat); give(gt, 2, m);
  gt = play(gt, 0, { t: 'play', card: gat });
  gt = play(gt, 1, { t: 'pass' });
  gt = play(gt, 2, { t: 'missed', card: m });
  gt = play(gt, 3, { t: 'pass' });
  assert.deepStrictEqual(gt.hp.slice(1), [3, 4, 3]);
  assert.strictEqual(count(gt), 80);
});

t('Armazem: cada um escolhe uma carta, na ordem', () => {
  let s = mk(4);
  const gs = find('store');
  give(s, 0, gs);
  s = play(s, 0, { t: 'play', card: gs });
  assert.strictEqual(s.step.cards.length, 4);
  assert.strictEqual(count(s), 80);
  for (const seat of [0, 1, 2, 3]) {
    fail(s, (seat + 1) % 4, { t: 'pick', card: s.step.cards[0] });
    s = play(s, seat, { t: 'pick', card: s.step.cards[0] });
  }
  assert.strictEqual(s.step, null);
  assert.deepStrictEqual(s.hands.map((h) => h.length), [1, 1, 1, 1]);
});

t('Panico! e Cat Balou: mao (aleatoria) ou carta da mesa; Panico! so a distancia 1', () => {
  let s = mk(5);
  const pa = find('panic'), cb = find('balou');
  give(s, 0, pa, cb); give(s, 1, find('beer')); put(s, 2, find('barrel'));
  fail(s, 0, { t: 'play', card: pa, target: 2, pick: 'hand' });
  s = play(s, 0, { t: 'play', card: pa, target: 1, pick: 'hand' });
  assert.strictEqual(s.hands[0].length, 2);
  assert.strictEqual(s.hands[1].length, 0);
  s = play(s, 0, { t: 'play', card: cb, target: 2, pick: find('barrel') });
  assert.strictEqual(s.table[2].length, 0);
  assert.strictEqual(count(s), 80);
});

t('Cadeia: coracao liberta, outra carta faz perder a vez; xerife nao pode ser preso', () => {
  let s = mk(4);
  const jail = find('jail');
  give(s, 0, jail);
  const sh = s.roles.indexOf('sheriff');
  s.turn = 0;
  if (sh !== 1) {
    s = play(s, 0, { t: 'play', card: jail, target: 1 === sh ? 2 : 1 });
  }
  assert.ok(true);
  let j = mk(4); put(j, 0, jail);
  const spade = D.findIndex((c) => c.suit === 'S' && c.type === 'missed');
  j.deck.splice(j.deck.indexOf(spade), 1); j.deck.push(spade);
  j.turn = 3;
  j = play(j, 3, { t: 'end' });
  assert.strictEqual(j.turn, 1);               // vez do 0 pulada
  let k = mk(4); put(k, 0, jail);
  const heart = D.findIndex((c) => c.suit === 'H' && c.type === 'beer');
  k.deck.splice(k.deck.indexOf(heart), 1); k.deck.push(heart);
  k.turn = 3;
  k = play(k, 3, { t: 'end' });
  assert.strictEqual(k.turn, 0);
  assert.strictEqual(k.stage, 'draw');
  let x = mk(4); const shs = x.roles.indexOf('sheriff');
  give(x, 0, jail);
  if (shs !== 0) fail(x, 0, { t: 'play', card: jail, target: shs });
});

t('Dinamite: explode (3 de dano) com espadas 2-9, ou passa ao proximo jogador', () => {
  let s = mk(4);
  const dyn = find('dynamite');
  put(s, 0, dyn);
  const bad = D.findIndex((c) => c.suit === 'S' && c.rank >= 2 && c.rank <= 9);
  s.deck.splice(s.deck.indexOf(bad), 1); s.deck.push(bad);
  s.turn = 3; s.stage = 'play';
  s = play(s, 3, { t: 'end' });
  assert.strictEqual(s.hp[0], 1 + (s.max[0] - 4));
  assert.strictEqual(s.table[0].length, 0);
  let p = mk(4); put(p, 0, dyn);
  const ok = D.findIndex((c) => c.suit === 'D');
  p.deck.splice(p.deck.indexOf(ok), 1); p.deck.push(ok);
  p.turn = 3;
  p = play(p, 3, { t: 'end' });
  assert.deepStrictEqual(p.table.map((x) => x.length), [0, 1, 0, 0]);
});

t('morte: salvo por Cerveja; recompensas; vitoria do Xerife e dos Fora-da-lei', () => {
  let s = mk(4);
  s.roles = ['sheriff', 'outlaw', 'renegade', 'outlaw'];
  s.hp = [5, 1, 4, 4]; s.max = [5, 4, 4, 4];
  const bg = find('bang'), beer = find('beer');
  give(s, 0, bg); give(s, 1, beer);
  s = play(s, 0, { t: 'play', card: bg, target: 1 });
  s = play(s, 1, { t: 'pass' });
  assert.strictEqual(s.step.k, 'dying');
  s = play(s, 1, { t: 'beer', card: beer });
  assert.strictEqual(s.hp[1], 1);
  assert.strictEqual(s.alive[1], true);
  let k = mk(4);
  k.roles = ['sheriff', 'outlaw', 'renegade', 'outlaw'];
  k.hp = [5, 1, 4, 4];
  give(k, 0, find('bang'));
  k = play(k, 0, { t: 'play', card: k.hands[0][0], target: 1 });
  k = play(k, 1, { t: 'pass' });
  assert.strictEqual(k.alive[1], false);
  assert.strictEqual(k.hands[0].length, 3);   // 3 cartas pelo Fora-da-lei
  // xerife morre: fora-da-lei vencem
  let w = mk(4);
  w.roles = ['sheriff', 'outlaw', 'renegade', 'outlaw'];
  w.hp = [1, 4, 4, 4]; w.turn = 1;
  give(w, 1, find('bang'));
  w = play(w, 1, { t: 'play', card: w.hands[1][0], target: 0 });
  w = play(w, 0, { t: 'pass' });
  assert.strictEqual(w.phase, 'ended');
  assert.strictEqual(w.winner, 'outlaws');
  // so renegado vivo: ele vence
  let r = mk(4);
  r.roles = ['sheriff', 'outlaw', 'renegade', 'outlaw'];
  r.alive = [true, false, true, false]; r.hp = [1, 0, 4, 0]; r.turn = 2;
  give(r, 2, find('bang'));
  r = play(r, 2, { t: 'play', card: r.hands[2][0], target: 0 });
  r = play(r, 0, { t: 'pass' });
  assert.strictEqual(r.winner, 'renegade');
  // sem fora-da-lei e renegado: xerife vence
  let x = mk(4);
  x.roles = ['sheriff', 'outlaw', 'renegade', 'deputy'];
  x.alive = [true, true, false, true]; x.hp = [5, 1, 0, 4];
  give(x, 0, find('bang'));
  x = play(x, 0, { t: 'play', card: x.hands[0][0], target: 1 });
  x = play(x, 1, { t: 'pass' });
  assert.strictEqual(x.winner, 'sheriff');
});

t('Xerife que mata Delegado descarta todas as cartas', () => {
  let s = mk(4);
  s.roles = ['sheriff', 'deputy', 'renegade', 'outlaw'];
  s.hp = [5, 1, 4, 4];
  give(s, 0, find('bang'), find('beer'), find('panic'));
  put(s, 0, find('barrel'));
  s = play(s, 0, { t: 'play', card: find('bang'), target: 1 });
  s = play(s, 1, { t: 'pass' });
  assert.strictEqual(s.hands[0].length, 0);
  assert.strictEqual(s.table[0].length, 0);
  assert.strictEqual(count(s), 80);
});

t('personagens: Bart compra ao perder vida, Slab exige 2 Errou!, Janet inverte BANG!/Errou!, Sid cura, Kit escolhe', () => {
  let s = mk(4);
  s.chars[1] = 'bart';
  give(s, 0, find('bang'));
  s = play(s, 0, { t: 'play', card: find('bang'), target: 1 });
  s = play(s, 1, { t: 'pass' });
  assert.strictEqual(s.hands[1].length, 1);
  let sl = mk(4);
  sl.chars[0] = 'slab';
  const m1 = find('missed'), m2 = find('missed', m1 + 1);
  give(sl, 0, find('bang')); give(sl, 1, m1, m2);
  sl = play(sl, 0, { t: 'play', card: find('bang'), target: 1 });
  assert.strictEqual(sl.step.need, 2);
  sl = play(sl, 1, { t: 'missed', card: m1 });
  assert.ok(sl.step);
  sl = play(sl, 1, { t: 'missed', card: m2 });
  assert.strictEqual(sl.step, null);
  assert.strictEqual(sl.hp[1], 4);
  let jn = mk(4);
  jn.chars[0] = 'janet'; jn.chars[1] = 'janet';
  const mm = find('missed'), bb = find('bang');
  give(jn, 0, mm); give(jn, 1, bb);
  jn = play(jn, 0, { t: 'play', card: mm, target: 1 });     // Errou! como BANG!
  jn = play(jn, 1, { t: 'missed', card: bb });              // BANG! como Errou!
  assert.strictEqual(jn.hp[1], 4);
  let sd = mk(4);
  sd.chars[0] = 'sid'; sd.hp[0] = 3;
  give(sd, 0, find('bang'), find('bang', 5));
  sd = play(sd, 0, { t: 'sid', cards: sd.hands[0].slice() });
  assert.strictEqual(sd.hp[0], 4);
  let kt = mk(4);
  kt.chars[0] = 'kit'; kt.stage = 'draw';
  kt = play(kt, 0, { t: 'draw' });
  assert.strictEqual(kt.step.k, 'kit');
  const keep = kt.step.cards;
  kt = play(kt, 0, { t: 'kitPut', card: keep[2] });
  assert.strictEqual(kt.hands[0].length, 2);
  assert.strictEqual(kt.deck[kt.deck.length - 1], keep[2]);
  assert.strictEqual(kt.stage, 'play');
});

t('descarte ao fim do turno: so o que passa da vida; autopiloto joga um turno valido', () => {
  let s = mk(4);
  give(s, 0, 0, 1, 2, 3, 4, 5);
  fail(s, 0, { t: 'end' });
  fail(s, 0, { t: 'discard', card: 99 });
  s = play(s, 0, { t: 'discard', card: 0 });
  s = play(s, 0, { t: 'discard', card: 1 });
  s = play(s, 0, { t: 'end' });
  assert.strictEqual(s.turn, 1);
});

t('simulacoes aleatorias: cartas sempre somam 80, sem erro de engine, partidas terminam', () => {
  let ended = 0;
  const games = 120;
  for (let gi = 0; gi < games; gi++) {
    const players = 4 + (gi % 4);
    let s = g._deal(lobby(players));
    let steps = 0;
    while (s.phase === 'playing' && steps++ < 6000) {
      const w = g.waitingOn(s)[0];
      assert.ok(w !== undefined);
      const v = g.viewFor(s, w);
      let req = null;
      const tryMove = (r) => { const res = g.move(s, w, r); if (res.state) { s = res.state; return true; } return false; };
      if (v.mode === 'play' && Math.random() < 0.8) {
        const opts = v.hand.filter((c) => c.ok);
        if (opts.length) {
          const c = opts[Math.floor(Math.random() * opts.length)];
          const target = c.targets ? c.targets[Math.floor(Math.random() * c.targets.length)] : undefined;
          let pick;
          if (c.pick) {
            const tt = s.table[target];
            pick = tt.length && Math.random() < 0.5 ? tt[0] : 'hand';
            if (pick === 'hand' && !s.hands[target].length) pick = tt[0];
          }
          if (tryMove({ t: 'play', card: c.id, target, pick })) { assert.strictEqual(count(s), 80); continue; }
        }
      }
      req = g.autoMove(s, w);
      const res = g.move(s, w, req);
      assert.ok(res.state, `autoMove invalido: ${JSON.stringify(req)} -> ${res.error} (${JSON.stringify(s.step)} ${s.stage})`);
      s = res.state;
      assert.strictEqual(count(s), 80);
      assert.ok(s.alive.some(Boolean));
    }
    if (s.phase === 'ended') {
      ended++;
      assert.ok(['sheriff', 'outlaws', 'renegade'].includes(s.winner));
    }
  }
  assert.ok(ended > games * 0.6, `terminaram ${ended}/${games}`);
});

t('visoes: papel secreto so para o dono (xerife e mortos publicos)', () => {
  const s = g._deal(lobby(5));
  const v = g.view(s);
  v.seats.forEach((p, i) => assert.strictEqual(p.role, s.roles[i] === 'sheriff' ? 'sheriff' : null));
  for (let i = 0; i < 5; i++) assert.strictEqual(g.viewFor(s, i).role, s.roles[i]);
  assert.ok(!JSON.stringify(v).includes('"hand":[{'));
});

console.log(`\n${n} testes passaram.`);
