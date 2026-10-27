'use strict';
const assert = require('assert');
const g = require('../games/war/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const lobby = (k) => { let s = g.setup(); for (let i = 0; i < k; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r)); return r.state; };
const fail = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.error, 'deveria falhar: ' + JSON.stringify(req)); return r.error; };
const M = g._map;
const id = (name) => M.territories.findIndex((x) => x.name === name);
const countOf = (s, seat) => s.owner.filter((o) => o === seat).length;
// termina a preparacao com reforcos no primeiro territorio de cada um
const prepared = (k = 3) => {
  let s = play(lobby(k), 0, { t: 'start' });
  while (s.phase === 'setup') s = play(s, s.turn, { t: 'place', plan: [[s.owner.indexOf(s.turn), s.pool]] });
  s.objectives = s.objectives.map(() => ({ k: 'terr', n: 99 })); // objetivo inalcancavel: os testes controlam o fim
  return s;
};
const setRolls = (...vals) => { let i = 0; g._rng.roll = () => vals[i++ % vals.length]; };
const realRoll = g._rng.roll;
const resetRolls = () => { g._rng.roll = realRoll; };

t('mapa: 42 territorios, 6 continentes (9/4/7/6/12/4), vizinhanca simetrica e conexa', () => {
  assert.strictEqual(M.territories.length, 42);
  const sizes = M.continents.map((_, c) => M.territories.filter((x) => x.cont === c).length);
  assert.deepStrictEqual(sizes, [9, 4, 7, 6, 12, 4]);
  M.adj.forEach((list, a) => { assert.ok(list.length >= 2); assert.strictEqual(new Set(list).size, list.length); list.forEach((b) => assert.ok(M.adj[b].includes(a))); });
  const seen = new Set([0]); const q = [0];
  while (q.length) for (const b of M.adj[q.shift()]) if (!seen.has(b)) { seen.add(b); q.push(b); }
  assert.strictEqual(seen.size, 42);
  assert.strictEqual(new Set(M.territories.map((x) => x.name)).size, 42);
});

t('inicio: minimo 3 jogadores, so o anfitriao; distribuicao equilibrada; 14 objetivos sem a propria cor', () => {
  assert.ok(g.move(lobby(2), 0, { t: 'start' }).error);
  assert.ok(g.move(lobby(3), 1, { t: 'start' }).error);
  for (const k of [3, 4, 5, 6]) {
    const s = play(lobby(k), 0, { t: 'start' });
    const counts = Array.from({ length: k }, (_, i) => countOf(s, i));
    assert.strictEqual(counts.reduce((a, b) => a + b), 42);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    assert.ok(s.armies.every((a) => a === 1));
    s.objectives.forEach((o, seat) => assert.ok(!(o.k === 'kill' && o.t === seat)));
    assert.strictEqual(s.phase, 'setup'); assert.ok(!g.acceptsSeat(s));
  }
});

t('visao publica nao mostra objetivos nem cartas; privada so as proprias', () => {
  const s = prepared(4);
  const pub = JSON.stringify(g.view(s));
  assert.ok(!pub.includes('Conquistar') && !pub.includes('Destruir'));
  assert.ok(typeof g.viewFor(s, 1).objective === 'string'); assert.strictEqual(g.viewFor(s, null), null);
  assert.ok(g.view(s).reveal === null);
});

t('preparacao: 5 exercitos e depois 3 por jogador, na ordem; erros de distribuicao', () => {
  let s = play(lobby(3), 0, { t: 'start' });
  const a = s.owner.indexOf(0), b = s.owner.indexOf(1);
  fail(s, 1, { t: 'place', plan: [[b, 5]] });
  fail(s, 0, { t: 'place', plan: [[a, 4]] });
  fail(s, 0, { t: 'place', plan: [[b, 5]] });
  fail(s, 0, { t: 'attack', from: a, to: b });
  s = play(s, 0, { t: 'place', plan: [[a, 2], [a, 3]] });
  assert.strictEqual(s.armies[a], 6); assert.strictEqual(s.turn, 1);
  s = play(s, 1, { t: 'place', plan: [[b, 5]] }); s = play(s, 2, { t: 'place', plan: [[s.owner.indexOf(2), 5]] });
  assert.strictEqual(s.lap, 2); assert.strictEqual(s.turn, 0); assert.strictEqual(s.pool, 3);
  for (let i = 0; i < 3; i++) s = play(s, s.turn, { t: 'place', plan: [[s.owner.indexOf(s.turn), 3]] });
  assert.strictEqual(s.phase, 'playing'); assert.strictEqual(s.turn, 0); assert.strictEqual(s.stage, 'place');
  assert.strictEqual(s.pool, g._reinforcement(s, 0));
  assert.strictEqual(s.armies.reduce((x, y) => x + y), 42 + 24);
});

t('reforcos: metade dos territorios (minimo 3) mais bonus de continente', () => {
  const s = prepared(3);
  const base = { ...s, owner: new Array(42).fill(1), players: 3, alive: [true, true, true] };
  base.owner[0] = 0; base.owner[1] = 0; base.owner[2] = 0;
  assert.strictEqual(g._reinforcement(base, 0), 3);
  const na = M.territories.map((x, i) => (x.cont === 0 ? i : -1)).filter((i) => i >= 0);
  na.forEach((i) => { base.owner[i] = 0; });
  assert.strictEqual(g._reinforcement(base, 0), Math.max(3, Math.floor(9 / 2)) + 5);
  const oc = M.territories.map((x, i) => (x.cont === 5 ? i : -1)).filter((i) => i >= 0);
  oc.forEach((i) => { base.owner[i] = 0; });
  assert.strictEqual(g._reinforcement(base, 0), Math.floor(13 / 2) + 5 + 2);
});

t('ataque: regras de dados (empate favorece a defesa), sempre fica 1 exercito, vizinhanca obrigatoria', () => {
  let s = prepared(3);
  const a = id('Brasil'), d = id('Argentina'), far = id('Japão');
  s.owner[a] = 0; s.owner[d] = 1; s.owner[far] = 1; s.armies[a] = 5; s.armies[d] = 3;
  s = play(s, 0, { t: 'place', plan: [[a, s.pool]] }); assert.strictEqual(s.stage, 'attack');
  fail(s, 0, { t: 'attack', from: a, to: far }); fail(s, 0, { t: 'attack', from: far, to: d }); fail(s, 1, { t: 'attack', from: a, to: d });
  const armiesA = s.armies[a];
  setRolls(6, 5, 1, 6, 5, 1); // atacante 6,5,1 contra defensor 6,5,1: empate favorece a defesa
  const r = play(s, 0, { t: 'attack', from: a, to: d });
  assert.deepStrictEqual(r.lastAttack.att, [6, 5, 1]); assert.deepStrictEqual(r.lastAttack.def, [6, 5, 1]);
  assert.strictEqual(r.lastAttack.lossA, 3); assert.strictEqual(r.armies[a], armiesA - 3); assert.strictEqual(r.armies[d], 3);
  resetRolls();
  // 1 dado quando pedido
  setRolls(6, 1, 1, 1);
  const r1 = play(s, 0, { t: 'attack', from: a, to: d, dice: 1 });
  assert.strictEqual(r1.lastAttack.att.length, 1); assert.strictEqual(r1.armies[d], 2);
  resetRolls();
  // so 1 exercito: nao ataca
  const lone = JSON.parse(JSON.stringify(s)); lone.armies[a] = 1;
  fail(lone, 0, { t: 'attack', from: a, to: d });
});

t('conquista: move os dados usados, compra carta no fim do turno, elimina jogador e fica com as cartas', () => {
  let s = prepared(3);
  const a = id('Brasil'), d = id('Argentina');
  s.owner = s.owner.map((o) => (o === 1 ? 2 : o)); // jogador 1 so tera Argentina
  s.owner[a] = 0; s.owner[d] = 1; s.armies[a] = 6; s.armies[d] = 1; s.hands[1] = [3, 4]; s.hands[0] = [];
  s.stage = 'attack'; s.pool = 0;
  setRolls(6, 6, 6, 1);
  const r = play(s, 0, { t: 'attack', from: a, to: d });
  assert.strictEqual(r.owner[d], 0); assert.strictEqual(r.armies[d], 3); assert.strictEqual(r.armies[a], 3);
  assert.ok(r.lastAttack.conquered); assert.strictEqual(r.alive[1], false); assert.strictEqual(r.killedBy[1], 0);
  assert.deepStrictEqual(r.hands[0], [3, 4]); assert.deepStrictEqual(r.hands[1], []);
  resetRolls();
  const e = play(r, 0, { t: 'end' });
  assert.strictEqual(e.hands[0].length, 3); assert.strictEqual(e.turn, 2); assert.strictEqual(e.stage, 'place');
  // sem conquista, nao compra carta
  const s2 = prepared(3); const e2 = play({ ...s2, stage: 'attack', pool: 0 }, 0, { t: 'end' });
  assert.strictEqual(e2.hands[0].length, 0);
});

t('ataque ate o fim para quando conquista ou resta 1 exercito', () => {
  let s = prepared(3);
  const a = id('Brasil'), d = id('Argentina');
  s.owner[a] = 0; s.owner[d] = 1; s.armies[a] = 30; s.armies[d] = 2; s.stage = 'attack'; s.pool = 0;
  setRolls(6, 6, 6, 1, 1, 1);
  const r = play(s, 0, { t: 'attack', from: a, to: d, until: true });
  assert.ok(r.lastAttack.conquered); assert.strictEqual(r.owner[d], 0);
  resetRolls();
  setRolls(1, 1, 1, 6, 6, 6);
  let s2 = JSON.parse(JSON.stringify(s)); s2.armies[a] = 4; s2.armies[d] = 100;
  const r2 = play(s2, 0, { t: 'attack', from: a, to: d, until: true });
  assert.strictEqual(r2.armies[a], 1); assert.strictEqual(r2.owner[d], 1);
  resetRolls();
});

t('trocas: combinacoes validas, valores 4,6,8,10,12,15,20,25, troca obrigatoria com 5 cartas', () => {
  const hand = [0, 3, 6, 1, 2, 42]; // 0,3,6 = circulos; 1 quadrado; 2 triangulo; 42 coringa
  assert.ok(g._validTrade(hand, [0, 1, 2])); assert.ok(g._validTrade(hand, [3, 4, 5])); assert.ok(g._validTrade(hand, [0, 1, 5]));
  assert.ok(!g._validTrade(hand, [0, 3, 3])); assert.ok(!g._validTrade([0, 3, 1], [0, 1, 2]));
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7].map(g._tradeValue), [4, 6, 8, 10, 12, 15, 20, 25]);
  let s = prepared(3);
  s.hands[0] = [0, 3, 6, 1, 2]; // 5 cartas
  fail(s, 0, { t: 'place', plan: [[s.owner.indexOf(0), s.pool]] });
  assert.ok(g.viewFor(s, 0).mustTrade);
  const pool = s.pool;
  s = play(s, 0, { t: 'trade', cards: [0, 1, 2] });
  assert.strictEqual(s.pool, pool + 4); assert.strictEqual(s.hands[0].length, 2); assert.strictEqual(s.tradeCount, 1);
  fail(s, 0, { t: 'trade', cards: [0, 1, 1] });
  s = play(s, 0, { t: 'place', plan: [[s.owner.indexOf(0), s.pool]] }); assert.strictEqual(s.stage, 'attack');
  assert.strictEqual(g.move(s, 0, { t: 'trade', cards: [0, 1, 2] }).error !== undefined, true);
});

t('remanejar: so entre vizinhos seus, deixa 1, e encerra o turno', () => {
  let s = prepared(3);
  const a = id('Brasil'), b = id('Peru'), c = id('Argentina');
  s.owner[a] = 0; s.owner[b] = 0; s.owner[c] = 1; s.armies[a] = 5; s.armies[b] = 1; s.stage = 'attack'; s.pool = 0;
  fail(s, 0, { t: 'move', from: a, to: c, n: 1 }); fail(s, 0, { t: 'move', from: a, to: b, n: 5 }); fail(s, 0, { t: 'move', from: a, to: b, n: 0 });
  const r = play(s, 0, { t: 'move', from: a, to: b, n: 4 });
  assert.strictEqual(r.armies[a], 1); assert.strictEqual(r.armies[b], 5); assert.strictEqual(r.turn, 1);
});

t('objetivos: continentes, 24 territorios, 18 com 2 exercitos, destruir cor (e alternativas)', () => {
  const base = prepared(3);
  const withObj = (o, owner) => ({ ...base, objectives: [o, { k: 'terr', n: 24 }, { k: 'terr', n: 24 }], owner });
  const all = (f) => M.territories.map((x, i) => (f(x, i) ? 0 : 1));
  assert.ok(g._objectiveDone(withObj({ k: 'cont', c: [4, 1], extra: 0 }, all((x) => x.cont === 4 || x.cont === 1)), 0));
  assert.ok(!g._objectiveDone(withObj({ k: 'cont', c: [4, 1], extra: 0 }, all((x) => x.cont === 4)), 0));
  assert.ok(g._objectiveDone(withObj({ k: 'cont', c: [2, 1], extra: 1 }, all((x) => [2, 1, 5].includes(x.cont))), 0));
  assert.ok(!g._objectiveDone(withObj({ k: 'cont', c: [2, 1], extra: 1 }, all((x) => [2, 1].includes(x.cont))), 0));
  assert.ok(g._objectiveDone(withObj({ k: 'terr', n: 24 }, all((x, i) => i < 24)), 0));
  assert.ok(!g._objectiveDone(withObj({ k: 'terr', n: 24 }, all((x, i) => i < 23)), 0));
  const t2 = withObj({ k: 'terr2', n: 18 }, all((x, i) => i < 18)); t2.armies = new Array(42).fill(2);
  assert.ok(g._objectiveDone(t2, 0)); t2.armies[0] = 1; assert.ok(!g._objectiveDone(t2, 0));
  // destruir cor
  const k = withObj({ k: 'kill', t: 1 }, all((x, i) => i < 10));
  assert.ok(!g._objectiveDone(k, 0));
  k.alive = [true, false, true]; k.killedBy = [null, 0, null]; assert.ok(g._objectiveDone(k, 0));
  k.killedBy = [null, 2, null]; assert.ok(!g._objectiveDone(k, 0)); // eliminado por outro: vira 24 territorios
  k.owner = all((x, i) => i < 24); assert.ok(g._objectiveDone(k, 0));
  const absent = withObj({ k: 'kill', t: 5 }, all((x, i) => i < 24)); assert.ok(g._objectiveDone(absent, 0));
});

t('vitoria: ao cumprir o objetivo a partida termina e revela os objetivos', () => {
  let s = prepared(3);
  s.objectives[0] = { k: 'terr', n: 20 };
  s.owner = s.owner.map((o, i) => (i < 20 ? 0 : o === 0 ? 2 : o));
  const a = id('Brasil'), d = id('Argentina');
  s.owner[a] = 0; s.owner[d] = 1; s.armies[a] = 5; s.armies[d] = 1; s.stage = 'attack'; s.pool = 0;
  assert.strictEqual(countOf(s, 0), 19 + (s.owner.slice(20).includes(0) ? 1 : 0) * 0);
  setRolls(6, 6, 6, 1);
  const r = play(s, 0, { t: 'attack', from: a, to: d });
  resetRolls();
  assert.ok(g._objectiveDone(r, 0)); assert.strictEqual(r.phase, 'ended'); assert.strictEqual(r.winner, 0);
  assert.strictEqual(g.view(r).reveal.length, 3); assert.ok(g.view(r).over);
  fail(r, 0, { t: 'end' });
});

t('piloto automatico: reforca, troca quando obrigatorio, encerra o turno; esperando so o jogador da vez', () => {
  let s = play(lobby(3), 0, { t: 'start' });
  assert.deepStrictEqual(g.waitingOn(s), [0]);
  while (s.phase === 'setup') s = play(s, s.turn, g.autoMove(s, s.turn));
  assert.strictEqual(s.phase, 'playing');
  s.hands[0] = [0, 3, 6, 1, 2];
  s = play(s, 0, g.autoMove(s, 0)); assert.strictEqual(s.hands[0].length, 2);
  s = play(s, 0, g.autoMove(s, 0)); assert.strictEqual(s.stage, 'attack');
  s = play(s, 0, g.autoMove(s, 0)); assert.strictEqual(s.turn, 1); assert.strictEqual(s.stage, 'place');
});

t('simulacao: partidas aleatorias (3 a 6 jogadores) terminam sem erro e mantem os totais', () => {
  for (let game = 0; game < 40; game++) {
    const k = 3 + (game % 4);
    let s = play(lobby(k), 0, { t: 'start' });
    let steps = 0;
    const R = () => Math.random();
    while (s.phase !== 'ended' && steps++ < 6000) {
      const seat = s.turn;
      if (s.stage === 'place') {
        if (s.phase === 'playing' && s.hands[seat].length >= 3 && (s.hands[seat].length >= 5 || R() < 0.5)) {
          const tr = g.autoMove({ ...s, hands: s.hands.map((h, i) => (i === seat && h.length < 5 ? [...h, ...h.slice(0, 0)] : h)) }, seat);
          if (s.hands[seat].length >= 5 && tr && tr.t === 'trade') { s = play(s, seat, tr); continue; }
        }
        const mine = s.owner.map((o, i) => (o === seat ? i : -1)).filter((i) => i >= 0);
        const plan = []; let left = s.pool;
        while (left > 0) { const q = Math.min(left, 1 + Math.floor(R() * 3)); plan.push([mine[Math.floor(R() * mine.length)], q]); left -= q; }
        s = play(s, seat, { t: 'place', plan });
      } else {
        // ataques aleatorios
        for (let a = 0; a < 6 && s.phase === 'playing'; a++) {
          const opts = [];
          s.owner.forEach((o, i) => { if (o === seat && s.armies[i] >= 2) g._map.adj[i].forEach((j) => { if (s.owner[j] !== seat) opts.push([i, j]); }); });
          if (!opts.length) break;
          const [from, to] = opts[Math.floor(R() * opts.length)];
          s = play(s, seat, { t: 'attack', from, to, until: R() < 0.5 });
        }
        if (s.phase === 'playing') s = play(s, seat, { t: 'end' });
      }
      if (s.phase !== 'lobby') {
        const total = s.armies.reduce((x, y) => x + y, 0);
        assert.ok(total > 0); assert.ok(s.armies.every((a) => a >= 1));
        assert.ok(s.owner.every((o) => s.alive[o]), 'territorio de jogador eliminado');
        assert.ok(s.hands.every((h) => h.length < 40));
        const cards = s.hands.flat().length + s.deck.length + s.discard.length;
        assert.strictEqual(cards, 44);
      }
    }
    assert.ok(s.phase === 'ended' || steps >= 6000);
  }
});

t('cliente: mapa (nomes, continentes, vizinhos) igual ao das regras e com posicao para cada territorio', () => {
  global.window = { GameKit: {}, GameUI: {} };
  require('../public/games/war.js');
  const c = global.window.GameUI.war.map;
  assert.deepStrictEqual(c.names, M.territories.map((x) => x.name));
  assert.deepStrictEqual(c.cont, M.territories.map((x) => x.cont));
  assert.deepStrictEqual(c.adj.map((l) => l.slice().sort((a, b) => a - b)), M.adj.map((l) => l.slice().sort((a, b) => a - b)));
  assert.strictEqual(c.xy.length, 42);
  assert.strictEqual(new Set(c.xy.map((p) => p.join(','))).size, 42);
  c.xy.forEach(([x, y]) => assert.ok(x > 20 && x < 980 && y > 20 && y < 560));
});

console.log(`${n} testes de War passaram.`);
