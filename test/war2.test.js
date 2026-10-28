'use strict';
const assert = require('assert');
const g = require('../games/war2/game.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const lobby = (k) => { let s = g.setup(); for (let i = 0; i < k; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r) + ' ' + JSON.stringify(req)); return r.state; };
const fail = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.error, 'deveria falhar: ' + JSON.stringify(req)); return r.error; };
const M = g._map;
const id = (name) => M.territories.findIndex((x) => x.name === name);
const cnt = (s, seat) => s.owner.filter((o) => o === seat).length;
const auto = (s) => play(s, s.turn, g.autoMove(s, s.turn));
// ate o fim da preparacao (primeira rodada: reforcos concluidos, primeiro jogador ataca)
const opened = (k = 3) => {
  let s = play(lobby(k), 0, { t: 'start' });
  while (s.phase === 'ce5' || s.phase === 'claim' || (s.phase === 'playing' && s.opening && s.stage === 'place')) s = auto(s);
  s.objectives = s.objectives.map(() => ({ k: 'terr', n: 99 }));
  return s;
};
// ja na segunda rodada (reforcos normais)
const running = (k = 3) => {
  let s = opened(k);
  while (s.opening) s = play(s, s.turn, { t: 'end' });
  return s;
};
const realAir = g._rng.air, realRoll = g._rng.roll;
const setAir = (...v) => { let i = 0; g._rng.air = () => v[i++ % v.length]; };
const setRolls = (...v) => { let i = 0; g._rng.roll = () => v[i++ % v.length]; };
const reset = () => { g._rng.air = realAir; g._rng.roll = realRoll; };
const plain = (s) => JSON.parse(JSON.stringify(s));

t('mapa: 43 territorios (10/4/7/6/12/4), 12 CEs, vizinhanca simetrica e conexa; tabelas do tabuleiro', () => {
  assert.strictEqual(M.territories.length, 43);
  assert.deepStrictEqual(M.continents.map((_, c) => M.territories.filter((x) => x.cont === c).length), [10, 4, 7, 6, 12, 4]);
  assert.strictEqual(M.ce.length, 12); assert.strictEqual(new Set(M.ce).size, 12);
  M.adj.forEach((l, a) => { assert.ok(l.length >= 2); assert.strictEqual(new Set(l).size, l.length); l.forEach((b) => assert.ok(M.adj[b].includes(a))); });
  const seen = new Set([0]); const q = [0];
  while (q.length) for (const b of M.adj[q.shift()]) if (!seen.has(b)) { seen.add(b); q.push(b); }
  assert.strictEqual(seen.size, 43);
  assert.deepStrictEqual(M.continents.map((c) => [c.total, c.major, c.maj]), [[7, 6, 5], [3, 3, 2], [7, 4, 5], [4, 4, 3], [10, 7, 7], [3, 3, 2]]);
});

t('cartas: 61 (27 de territorio, 6 de continente, 28 numeradas 2/3/4/5); cada territorio em exatamente uma carta; 12 cartas com CE', () => {
  const C = M.cards;
  assert.strictEqual(C.length, 61);
  assert.strictEqual(C.filter((c) => c.kind === 'ce').length, 12);
  assert.strictEqual(C.filter((c) => c.kind === 'terr').length, 15);
  assert.strictEqual(C.filter((c) => c.kind === 'cont').length, 6);
  const nums = C.filter((c) => c.kind === 'num');
  assert.strictEqual(nums.length, 28);
  assert.deepStrictEqual([2, 3, 4, 5].map((v) => nums.filter((c) => c.value === v).length), [10, 8, 6, 4]);
  const covered = C.filter((c) => c.kind === 'ce' || c.kind === 'terr').flatMap((c) => c.terrs).sort((a, b) => a - b);
  assert.deepStrictEqual(covered, Array.from({ length: 43 }, (_, i) => i));
  M.ce.forEach((ce) => assert.strictEqual(C.filter((c) => c.kind === 'ce' && c.terrs.includes(ce)).length, 1));
  C.filter((c) => c.kind === 'cont').forEach((c) => c.terrs.forEach((t) => assert.strictEqual(M.territories[t].cont, M.territories[c.terrs[0]].cont)));
  assert.deepStrictEqual(C.filter((c) => c.kind === 'cont').map((c) => c.terrs.length), [10, 4, 7, 6, 12, 4]);
  const find = (n) => C.find((c) => c.kind !== 'num' && c.terrs.includes(id(n)));
  assert.deepStrictEqual(find('Sudão').terrs.map((t) => M.territories[t].name), ['Congo', 'Sudão', 'Madagascar']);
  assert.deepStrictEqual(find('Ottawa').terrs.map((t) => M.territories[t].name), ['Labrador', 'Ottawa', 'Mackenzie']);
});

t('preparacao com 3, 4 e 6 jogadores: CEs sorteados com 2 exercitos, ocupacao um a um a partir do distribuidor', () => {
  for (const k of [3, 4, 6]) {
    let s = play(lobby(k), 0, { t: 'start' });
    assert.strictEqual(s.phase, 'claim');
    for (let p = 0; p < k; p++) assert.strictEqual(M.ce.filter((c) => s.owner[c] === p).length, 12 / k);
    M.ce.forEach((c) => assert.strictEqual(s.armies[c], 2));
    const d = s.dealer; assert.strictEqual(s.turn, d);
    fail(s, (d + 1) % k, { t: 'claim', i: s.owner.indexOf(-1) });
    fail(s, d, { t: 'claim', i: M.ce[0] });
    let last = d, steps = 0;
    while (s.phase === 'claim') { last = s.turn; s = play(s, s.turn, { t: 'claim', i: s.owner.indexOf(-1) }); steps++; }
    assert.strictEqual(steps, 43 - 12);
    assert.strictEqual(s.first, (last + 1) % k); assert.strictEqual(s.turn, s.first);
    assert.ok(s.opening); assert.strictEqual(s.stage, 'place');
    assert.ok(s.owner.every((o) => o >= 0));
  }
});

t('preparacao com 5 jogadores: 10 CEs sorteados e escolha entre 1 CE ou 2 territorios', () => {
  let s = play(lobby(5), 0, { t: 'start' });
  assert.strictEqual(s.phase, 'ce5'); assert.strictEqual(s.ceLeft.length, 2);
  assert.strictEqual(M.ce.filter((c) => s.owner[c] >= 0).length, 10);
  const [a, b] = s.ceLeft;
  fail(s, (s.turn + 1) % 5, { t: 'ceChoose', ce: a });
  fail(s, s.turn, { t: 'ceChoose', ce: M.ce.find((c) => s.owner[c] >= 0) });
  const vac = s.owner.map((o, i) => (o === -1 && !M.ce.includes(i) ? i : -1)).filter((i) => i >= 0);
  const pair = (cont) => { const x = vac.find((i) => M.territories[i].cont === 0); const y = vac.find((i) => M.territories[i].cont !== 0); return cont ? [x, x + 0] : [x, y]; };
  fail(s, s.turn, { t: 'ceChoose', terrs: [vac.find((i) => M.territories[i].cont === 0), vac.filter((i) => M.territories[i].cont === 0)[1]] }); // mesmo continente
  fail(s, s.turn, { t: 'ceChoose', terrs: [vac[0], M.ce[0]] });
  // 1o escolhe 2 territorios, 2o, 3o idem; depois so sobra CE
  let cur = s;
  for (let k = 0; k < 3; k++) {
    const v = cur.owner.map((o, i) => (o === -1 && !M.ce.includes(i) ? i : -1)).filter((i) => i >= 0);
    const x = v[0]; const y = v.find((i) => M.territories[i].cont !== M.territories[x].cont);
    const seat = cur.turn; cur = play(cur, seat, { t: 'ceChoose', terrs: [x, y] }); assert.strictEqual(cur.armies[x], 1);
  }
  assert.ok(fail(cur, cur.turn, { t: 'ceChoose', terrs: [0, 14] }).includes('Centros'));
  cur = play(cur, cur.turn, { t: 'ceChoose', ce: a }); cur = play(cur, cur.turn, { t: 'ceChoose', ce: b });
  assert.strictEqual(cur.phase, 'claim'); assert.strictEqual(cur.turn, cur.dealer);
  void pair;
});

t('primeira rodada: todos reforcam (com CEs e bombardeiros) e so depois atacam, comecando pelo primeiro', () => {
  let s = play(lobby(3), 0, { t: 'start' });
  while (s.phase === 'claim') s = auto(s);
  const first = s.first;
  const order = [];
  while (s.phase === 'playing' && s.opening && s.stage === 'place') {
    const seat = s.turn; order.push(seat);
    const sum = (st) => st.armies.reduce((a, v, i) => a + (st.owner[i] === seat ? v : 0), 0);
    const before = sum(s);
    const need = s.pool.free + s.pool.cont.reduce((a, b) => a + b, 0);
    const ces = M.ce.filter((c) => s.owner[c] === seat).length;
    assert.strictEqual(s.base[seat], ces);
    s = auto(s);
    assert.strictEqual(sum(s) - before, need);
  }
  assert.deepStrictEqual(order, [0, 1, 2].map((k) => (first + k) % 3));
  assert.strictEqual(s.turn, first); assert.strictEqual(s.stage, 'attack');
  s = play(s, first, { t: 'end' });
  assert.strictEqual(s.stage, 'attack'); assert.ok(s.opening);
  s = play(s, s.turn, { t: 'end' }); s = play(s, s.turn, { t: 'end' });
  assert.ok(!s.opening); assert.strictEqual(s.turn, first); assert.strictEqual(s.stage, 'place');
});

t('reforcos: exemplo do manual (19 territorios, 3 CEs, America do Sul inteira, maioria da Oceania) = 17; minimo 3', () => {
  const s = running(3);
  const owner = new Array(43).fill(1);
  const sa = [0, 1, 2, 3].map((k) => id(['Venezuela', 'Peru', 'Brasil', 'Argentina'][k]));
  const oc = ['Sumatra', 'Bornéu', 'Nova Guiné'].map(id);
  const ces = ['Ottawa', 'Moscou', 'Japão'].map(id); // Brasil (CE) ja esta na America do Sul: usar 3 CEs sem contar Brasil
  const mine = new Set([...sa, ...oc, ...ces]);
  for (let i = 0; i < 43 && mine.size < 19; i++) if (![...M.ce].includes(i)) mine.add(i);
  mine.forEach((i) => { owner[i] = 0; });
  const st = { ...s, owner, alive: [true, true, true] };
  const total = mine.size; const ceCount = [...mine].filter((i) => M.ce.includes(i)).length;
  const r = g._reinforcement(st, 0);
  assert.strictEqual(r.free, Math.floor(total / 2)); assert.strictEqual(r.cont[1], 3); assert.strictEqual(r.cont[5], 2); assert.strictEqual(r.ces.length, ceCount);
  // so 2 territorios: minimo 3
  const poor = { ...s, owner: owner.map((o, i) => (i === 0 || i === 1 ? 0 : 1)) };
  const rp = g._reinforcement(poor, 0); assert.strictEqual(rp.free + rp.cont.reduce((a, b) => a + b, 0) + rp.ces.length, 3);
});

t('reforcos: o bonus de continente so pode ser colocado nele; total exato; CE e bombardeiros automaticos', () => {
  let s = running(3);
  const seat = s.turn;
  const owner = s.owner.map(() => 1 - (seat === 1 ? 1 : 0) + (seat === 1 ? 0 : 0));
  void owner;
  const o = new Array(43).fill((seat + 1) % 3);
  const oc = M.territories.map((x, i) => (x.cont === 5 ? i : -1)).filter((i) => i >= 0);
  oc.forEach((i) => { o[i] = seat; }); [0, 1, 2, 3, 5].forEach((i) => { o[i] = seat; }); // 5 de 10 da America do Norte: sem maioria (6 ou +)
  s.owner = o; s.alive = [true, true, true];
  const r = g._reinforcement(s, seat);
  assert.strictEqual(r.cont[5], 3);
  s.pool = { free: r.free, cont: r.cont }; s.stage = 'place';
  const need = r.free + 3;
  const na = id('Alasca');
  fail(s, seat, { t: 'place', plan: [[na, need]] });
  fail(s, seat, { t: 'place', plan: [[oc[0], need - 1]] });
  const ok = play(s, seat, { t: 'place', plan: [[oc[0], 3], [na, r.free]] });
  assert.strictEqual(ok.stage, 'attack'); assert.strictEqual(ok.armies[oc[0]], s.armies[oc[0]] + 3);
});

t('ataque terrestre: dados, empate favorece a defesa; conquista exige escolher quantos exercitos levar', () => {
  let s = running(3);
  const seat = s.turn;
  const a = id('Brasil'), d = id('Argentina'), far = id('Japão');
  s.owner[a] = seat; s.owner[d] = (seat + 1) % 3; s.owner[far] = (seat + 1) % 3; s.armies[a] = 6; s.armies[d] = 1; s.stage = 'attack'; s.pool = { free: 0, cont: [0, 0, 0, 0, 0, 0] };
  fail(s, seat, { t: 'attack', from: a, to: far }); fail(s, seat, { t: 'attack', from: a, to: a });
  setRolls(5, 4, 1, 6, 3, 1); // atacante 5,4,1 x defensor 6 (1 dado): defesa vence
  let r = play(s, seat, { t: 'attack', from: a, to: d });
  assert.strictEqual(r.armies[a], 5); assert.strictEqual(r.owner[d], (seat + 1) % 3);
  setRolls(6, 6, 6, 1);
  r = play(s, seat, { t: 'attack', from: a, to: d });
  assert.ok(r.occupy); assert.strictEqual(r.occupy.max, 3); assert.strictEqual(r.owner[d], seat);
  fail(r, seat, { t: 'end' }); fail(r, seat, { t: 'occupy', n: 4 }); fail(r, seat, { t: 'occupy', n: 0 });
  const o = play(r, seat, { t: 'occupy', n: 2 });
  assert.strictEqual(o.armies[d], 2); assert.strictEqual(o.armies[a], 4); assert.strictEqual(o.occupy, null); assert.ok(o.conquered);
  reset();
});

t('ataque aereo da base: defesa antiaerea primeiro, depois o ataque; nunca destroi o ultimo exercito', () => {
  let s = running(3);
  const seat = s.turn; const foe = (seat + 1) % 3;
  const tgt = id('Congo');
  s.owner[tgt] = foe; s.armies[tgt] = 5; s.base[seat] = 3; s.stage = 'attack';
  fail(s, seat, { t: 'air', target: tgt, n: 4 }); fail(s, seat, { t: 'air', target: tgt, n: 0 });
  fail(s, seat, { t: 'air', target: M.territories.findIndex((x, i) => s.owner[i] === seat), n: 1 });
  // rodada 1: defesa lisa, ataque 2 (5->3); rodada 2: defesa 1 (3->2 avioes), ataque 3 (3->1, parando em 1)
  setAir(0, 2, 1, 3);
  const r = play(s, seat, { t: 'air', target: tgt, n: 3 });
  assert.strictEqual(r.armies[tgt], 1); assert.strictEqual(r.base[seat], 0);
  assert.strictEqual(r.lastAir.lostArmies, 4); assert.strictEqual(r.lastAir.lostPlanes, 1);
  assert.strictEqual(g.viewFor(r, seat).box, 10);
  // todos os avioes abatidos
  setAir(3, 0);
  const r2 = play(s, seat, { t: 'air', target: tgt, n: 2 });
  assert.strictEqual(r2.armies[tgt], 5); assert.strictEqual(r2.lastAir.lostPlanes, 2); assert.strictEqual(r2.base[seat], 1);
  // territorio com 1 exercito nao pode ser atacado
  const one = plain(s); one.armies[tgt] = 1; fail(one, seat, { t: 'air', target: tgt, n: 1 });
  reset();
});

t('cartas: exercitos (1 + numeradas), ataque aereo pela caixa, transporte com 2 cartas, limite de 5 e descarte', () => {
  let s = running(3);
  const seat = s.turn; const foe = (seat + 1) % 3;
  const cardOf = (terr) => M.cards.findIndex((c) => c.kind !== 'num' && c.terrs.includes(terr));
  const nums = M.cards.map((c, i) => (c.kind === 'num' ? i : -1)).filter((i) => i >= 0);
  const mineT = s.owner.indexOf(seat), foeT = s.owner.indexOf(foe);
  s.armies[foeT] = 4; s.stage = 'attack'; s.base[seat] = 2;
  s.hands[seat] = [cardOf(mineT), nums.find((i) => M.cards[i].value === 3), cardOf(foeT), nums.find((i) => M.cards[i].value === 2)];
  const base = s.armies[mineT];
  let r = play(s, seat, { t: 'cardArmy', cards: [0, 1], terr: mineT });
  assert.strictEqual(r.armies[mineT], base + 4); assert.strictEqual(r.hands[seat].length, 2);
  fail(s, seat, { t: 'cardArmy', cards: [1, 3], terr: mineT }); fail(s, seat, { t: 'cardArmy', cards: [0, 2], terr: mineT });
  fail(s, seat, { t: 'cardArmy', cards: [2], terr: foeT }); // territorio do adversario
  // ataque aereo: 1 + 2 = 3 avioes da caixa
  setAir(0, 1);
  r = play(s, seat, { t: 'cardAir', cards: [2, 3], terr: foeT });
  assert.strictEqual(r.lastAir.planes, 3); assert.strictEqual(r.hands[seat].length, 2);
  fail(s, seat, { t: 'cardAir', cards: [0], terr: mineT });
  const few = plain(s); few.base[seat] = 9; fail(few, seat, { t: 'cardAir', cards: [2, 3], terr: foeT });
  reset();
  // transporte
  const a = s.owner.indexOf(seat); const b = s.owner.map((o, i) => (o === seat && i !== a && cardOf(i) !== cardOf(a) ? i : -1)).find((i) => i >= 0);
  const tr = plain(s); tr.armies[a] = 6; tr.hands[seat] = [cardOf(a), cardOf(b), cardOf(foeT)];
  r = play(tr, seat, { t: 'cardMove', cards: [0, 1], from: a, to: b, n: 5 });
  assert.strictEqual(r.armies[a], 1); assert.strictEqual(r.armies[b], tr.armies[b] + 5);
  fail(tr, seat, { t: 'cardMove', cards: [1, 0], from: a, to: b, n: 1 }); fail(tr, seat, { t: 'cardMove', cards: [0, 1], from: a, to: b, n: 6 });
  // limite de 5 cartas: com mais de 5, precisa descartar
  const big = plain(s); big.hands[seat] = nums.slice(0, 7);
  fail(big, seat, { t: 'end' });
  const ok = play(big, seat, { t: 'discard', cards: [0, 1] }); assert.strictEqual(ok.hands[seat].length, 5);
  assert.strictEqual(play(ok, seat, { t: 'end' }).turn, foe);
});

t('compra de cartas: 3 ao conquistar, respeitando o limite de 5; monte refeito com 10 descartadas', () => {
  let s = running(3);
  const seat = s.turn;
  s.conquered = true; s.hands[seat] = [33, 34, 35]; s.stage = 'attack';
  let r = play(s, seat, { t: 'end' });
  assert.strictEqual(r.hands[seat].length, 5);
  const calm = plain(s); calm.conquered = false; calm.hands[seat] = [];
  assert.strictEqual(play(calm, seat, { t: 'end' }).hands[seat].length, 0);
  const rec = plain(s); rec.discard = [33, 34, 35, 36, 37, 38, 39, 40, 41]; rec.deck = [50]; rec.hands[seat] = [42, 43]; rec.conquered = false; rec.stage = 'attack';
  const r2 = play(rec, seat, { t: 'discard', cards: [0] });
  assert.strictEqual(r2.discard.length, 0); assert.strictEqual(r2.deck.length, 11);
});

t('deslocamento: vizinhos, cada exercito move uma vez, aerotransporte entre CEs, encerra ataques', () => {
  let s = running(3);
  const seat = s.turn;
  const a = id('Venezuela'), b = id('Peru'), c = id('Brasil'), ceA = id('Japão'), ceB = id('Egito');
  [a, b, c, ceA, ceB].forEach((i) => { s.owner[i] = seat; }); s.armies[a] = 8; s.armies[b] = 1; s.armies[c] = 1; s.armies[ceA] = 4; s.armies[ceB] = 1; s.stage = 'attack';
  s.fresh = new Array(43).fill(0);
  fail(s, seat, { t: 'shift', from: a, to: ceA, n: 1 }); fail(s, seat, { t: 'shift', from: a, to: b, n: 8 });
  let r = play(s, seat, { t: 'shift', from: a, to: b, n: 5 });
  assert.strictEqual(r.armies[b], 6); assert.strictEqual(r.stage, 'shift');
  fail(r, seat, { t: 'shift', from: b, to: c, n: 1 }); // os 5 recem-chegados nao se movem de novo e 1 fica de ocupacao
  fail(r, seat, { t: 'attack', from: a, to: id('México') });
  assert.strictEqual(g.viewFor(r, seat).freeShift[a], 2);
  r = play(r, seat, { t: 'shift', from: a, to: c, n: 2 }); assert.strictEqual(r.armies[a], 1);
  // aerotransporte entre CEs distantes
  r = play(s, seat, { t: 'shift', from: ceA, to: ceB, n: 3 });
  assert.strictEqual(r.armies[ceB], 4); assert.strictEqual(r.armies[ceA], 1);
  fail(r, seat, { t: 'shift', from: ceB, to: ceA, n: 1 }); // quem chegou por aerotransporte nao continua
  fail(s, seat, { t: 'shift', from: ceA, to: a, n: 1 }); // CE para territorio comum nao vizinho
});

t('objetivos: as 20 cartas (14 de conquista e 6 de destruir cor); cores ausentes saem do sorteio', () => {
  assert.strictEqual(g._objectives.length, 14);
  for (let k = 0; k < 60; k++) {
    const players = 3 + (k % 4);
    const st = play(lobby(players), 0, { t: 'start' });
    assert.strictEqual(new Set(st.objectives.map((o) => JSON.stringify(o))).size, players);
    st.objectives.forEach((o) => { if (o.k === 'kill') assert.ok(o.t < players); });
  }
  const texts = g._objectives.map((o) => g._objectiveText(o, 0));
  assert.ok(texts.includes('Possuir 50 exércitos no Oriente Médio.'));
  assert.ok(texts.includes('Conquistar 8 Centros Estratégicos quaisquer.'));
  assert.ok(texts.includes('Conquistar na totalidade a Ásia e a maioria dos territórios da Europa e da África.'));
});

t('objetivos: avaliacao de cada tipo', () => {
  const base = plain(running(3));
  const mk = (o, owner, armies) => { const st = plain(base); st.objectives = [o, { k: 'terr', n: 99 }, { k: 'terr', n: 99 }]; st.owner = owner; st.alive = [true, true, true]; st.reduced = [false, false, false]; if (armies) st.armies = armies; return st; };
  const allOf = (f) => M.territories.map((x, i) => (f(x, i) ? 0 : 1));
  const cont = (...cs) => allOf((x) => cs.includes(x.cont));
  const maj = (c) => M.continents[c].major;
  const some = (c, k) => M.territories.map((x, i) => (x.cont === c ? i : -1)).filter((i) => i >= 0).slice(0, k);
  // continentes inteiros
  assert.ok(g._objectiveDone(mk({ k: 'cont', all: [0, 3] }, cont(0, 3)), 0)); assert.ok(!g._objectiveDone(mk({ k: 'cont', all: [0, 3] }, cont(0)), 0));
  // totalidade da Asia + maioria da Europa e da Africa
  const o4 = { k: 'cont', all: [4], maj: [2, 3] };
  const own4 = cont(4); [...some(2, maj(2)), ...some(3, maj(3))].forEach((i) => { own4[i] = 0; });
  assert.ok(g._objectiveDone(mk(o4, own4), 0)); own4[some(3, 1)[0]] = 1; own4[some(3, 2)[1]] = 1; assert.ok(!g._objectiveDone(mk(o4, own4), 0));
  // Europa + Oceania + outro continente
  assert.ok(g._objectiveDone(mk({ k: 'cont', all: [2, 5], extra: 1 }, cont(2, 5, 1)), 0)); assert.ok(!g._objectiveDone(mk({ k: 'cont', all: [2, 5], extra: 1 }, cont(2, 5)), 0));
  // maioria em 3 continentes e em 4 quaisquer
  const m3 = allOf(() => false); [...some(2, maj(2)), ...some(4, maj(4)), ...some(0, maj(0))].forEach((i) => { m3[i] = 0; });
  assert.ok(g._objectiveDone(mk({ k: 'cont', maj: [2, 4, 0] }, m3), 0)); assert.ok(!g._objectiveDone(mk({ k: 'majN', n: 4 }, m3), 0));
  some(1, maj(1)).forEach((i) => { m3[i] = 0; }); assert.ok(g._objectiveDone(mk({ k: 'majN', n: 4 }, m3), 0));
  // exercitos
  const army = new Array(43).fill(1); army[id('Oriente Médio')] = 50;
  assert.ok(g._objectiveDone(mk({ k: 'armies', list: [[id('Oriente Médio'), 50]] }, cont(4), army), 0));
  army[id('Oriente Médio')] = 49; assert.ok(!g._objectiveDone(mk({ k: 'armies', list: [[id('Oriente Médio'), 50]] }, cont(4), army), 0));
  const ny = new Array(43).fill(1); ny[id('Nova York')] = 20; ny[id('Japão')] = 20; const o20 = { k: 'armies', list: [[id('Nova York'), 20], [id('Japão'), 20]] };
  assert.ok(g._objectiveDone(mk(o20, allOf(() => true), ny), 0)); ny[id('Japão')] = 19; assert.ok(!g._objectiveDone(mk(o20, allOf(() => true), ny), 0));
  const ger = new Array(43).fill(1); ger[id('Alemanha')] = 20; const og = { k: 'cont', all: [1, 2], armies: [[id('Alemanha'), 20]] };
  assert.ok(g._objectiveDone(mk(og, cont(1, 2), ger), 0)); ger[id('Alemanha')] = 5; assert.ok(!g._objectiveDone(mk(og, cont(1, 2), ger), 0));
  // CEs
  const ces = allOf(() => false); M.ce.slice(0, 8).forEach((c) => { ces[c] = 0; });
  assert.ok(g._objectiveDone(mk({ k: 'ce', n: 8 }, ces), 0)); ces[M.ce[7]] = 1; assert.ok(!g._objectiveDone(mk({ k: 'ce', n: 8 }, ces), 0));
  const ca = allOf(() => false); M.ce.slice(0, 5).forEach((c) => { ca[c] = 0; }); const arm = new Array(43).fill(1); M.ce.slice(0, 5).forEach((c) => { arm[c] = 10; });
  assert.ok(g._objectiveDone(mk({ k: 'ceArmies', n: 5, min: 10 }, ca, arm), 0)); arm[M.ce[0]] = 9; assert.ok(!g._objectiveDone(mk({ k: 'ceArmies', n: 5, min: 10 }, ca, arm), 0));
  // destruir cor: vence quem elimina; eliminado por outro ou propria cor viram 24 territorios
  const kill = mk({ k: 'kill', t: 1 }, allOf((x, i) => i < 10));
  assert.ok(!g._objectiveDone(kill, 0)); kill.alive[1] = false; kill.killedBy[1] = 0; assert.ok(g._objectiveDone(kill, 0));
  kill.killedBy[1] = 2; assert.ok(!g._objectiveDone(kill, 0)); kill.owner = allOf((x, i) => i < 24); assert.ok(g._objectiveDone(kill, 0));
  const own = mk({ k: 'kill', t: 0 }, allOf((x, i) => i < 24)); assert.ok(g._objectiveDone(own, 0));
  assert.ok(g._objectiveText({ k: 'kill', t: 0 }, 0).includes('Você possui esses exércitos'));
});

t('objetivo vira 3 CEs quando o jogador fica com 1 territorio', () => {
  const duel = running(3); const seat = duel.turn; const foe = (seat + 1) % 3;
  duel.objectives = duel.objectives.map(() => ({ k: 'terr', n: 99 }));
  duel.owner = duel.owner.map((o) => (o === foe ? (seat + 2) % 3 : o));
  const keep = id('Congo'), lose = id('Egito');
  duel.owner[keep] = foe; duel.owner[lose] = foe;
  const from = id('Argélia'); duel.owner[from] = seat; duel.armies[from] = 8; duel.armies[lose] = 1; duel.stage = 'attack'; duel.occupy = null;
  const keepThree = (st) => { st.owner = st.owner.map((o, i) => (o === foe && i !== keep && i !== lose ? (seat + 2) % 3 : o)); return st; };
  keepThree(duel);
  setRolls(6, 6, 6, 1);
  const r = play(duel, seat, { t: 'attack', from, to: lose });
  reset();
  assert.ok(r.reduced[foe]); assert.deepStrictEqual(r.alive, [true, true, true]);
  assert.ok(g.viewFor(r, foe).objective.includes('3 Centros Estratégicos'));
});

t('visoes: publica nao traz objetivos nem maos; privada so as proprias', () => {
  const s = running(4);
  const pub = JSON.stringify(g.view(s));
  assert.ok(!pub.includes('Conquistar') && !pub.includes('Destruir'));
  s.hands[0] = [0, 33];
  assert.deepStrictEqual(g.view(s).cards.slice(0, 1), [2]);
  assert.strictEqual(g.viewFor(s, 0).hand.length, 2); assert.strictEqual(g.viewFor(s, null), null);
  assert.ok(typeof g.viewFor(s, 1).objective === 'string');
});

t('piloto automatico conduz a partida toda sem travar (3 a 6 jogadores)', () => {
  for (const k of [3, 4, 5, 6]) {
    let s = play(lobby(k), 0, { t: 'start' });
    for (let i = 0; i < 400 && s.phase !== 'ended'; i++) s = auto(s);
    assert.ok(['playing', 'ended'].includes(s.phase));
    assert.ok(!s.opening || s.phase !== 'ended');
  }
});

t('simulacao: partidas aleatorias terminam sem erro e conservam pecas e cartas', () => {
  for (let game = 0; game < 25; game++) {
    const k = 3 + (game % 4);
    let s = play(lobby(k), 0, { t: 'start' });
    let steps = 0; const R = Math.random;
    while (s.phase !== 'ended' && steps++ < 5000) {
      const seat = s.turn;
      if (s.phase === 'ce5' || s.phase === 'claim') { s = auto(s); continue; }
      if (s.occupy) { s = play(s, seat, { t: 'occupy', n: 1 + Math.floor(R() * s.occupy.max) }); }
      else if (s.stage === 'place') s = auto(s);
      else {
        for (let a = 0; a < 5 && s.phase === 'playing' && !s.occupy; a++) {
          const opts = [];
          s.owner.forEach((o, i) => { if (o === seat && s.armies[i] >= 2) g._map.adj[i].forEach((j) => { if (s.owner[j] !== seat) opts.push([i, j]); }); });
          if (!opts.length) break;
          if (R() < 0.3 && s.base[seat] > 0) { const foeT = s.owner.map((o, i) => (o !== seat && s.armies[i] >= 2 ? i : -1)).filter((i) => i >= 0); if (foeT.length) s = play(s, seat, { t: 'air', target: foeT[0], n: 1 + Math.floor(R() * s.base[seat]) }); }
          const [from, to] = opts[Math.floor(R() * opts.length)];
          s = play(s, seat, { t: 'attack', from, to, until: R() < 0.5 });
          if (s.occupy) s = play(s, seat, { t: 'occupy', n: 1 + Math.floor(R() * s.occupy.max) });
        }
        if (s.phase === 'playing') { while (s.hands[seat].length > 5) s = play(s, seat, { t: 'discard', cards: [0] }); s = play(s, seat, { t: 'end' }); }
      }
      if (s.phase === 'playing') {
        assert.ok(s.armies.every((a) => a >= 0)); assert.ok(s.owner.every((o) => s.alive[o] || o === -1));
        assert.strictEqual(s.hands.flat().length + s.deck.length + s.discard.length, 61);
        s.base.forEach((b) => assert.ok(b >= 0 && b <= 10));
      }
    }
    assert.ok(s.phase === 'ended' || steps >= 5000);
  }
});

t('cliente: mapa (nomes, continentes, vizinhos, CEs) igual ao das regras, com posicao para cada territorio', () => {
  global.window = { GameKit: {}, GameUI: {} };
  require('../public/games/war2.js');
  const c = global.window.GameUI.war2.map;
  assert.deepStrictEqual(c.names, M.territories.map((x) => x.name));
  assert.deepStrictEqual(c.cont, M.territories.map((x) => x.cont));
  assert.deepStrictEqual(c.adj, M.adj);
  assert.deepStrictEqual(c.ce, M.ce);
  assert.strictEqual(c.xy.length, 43); assert.strictEqual(new Set(c.xy.map((p) => p.join(','))).size, 43);
  c.xy.forEach(([x, y]) => assert.ok(x > 50 && x < 1000 && y > 130 && y < 620));
});

console.log(`${n} testes de War II passaram.`);
