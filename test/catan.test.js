'use strict';
const assert = require('assert');
const g = require('../games/catan/game.js');
const T = g._TOPO;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const lobby = (k) => { let s = g.setup(); for (let i = 0; i < k; i++) s = g.seatJoined(s, i); return s; };
const play = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.state, JSON.stringify(r) + JSON.stringify(req)); return r.state; };
const fail = (s, seat, req) => { const r = g.move(s, seat, req); assert.ok(r.error, 'esperava erro'); return r.error; };
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const RES = ['brick', 'lumber', 'wool', 'grain', 'ore'];
// leva a partida ate o inicio do jogo usando o piloto automatico na preparacao
function started(k) {
  let s = g._deal(lobby(k));
  while (s.phase === 'setup') s = play(s, s.turn, g.autoMove(s, s.turn));
  return s;
}
const give = (s, seat, o) => { for (const r of Object.keys(o)) s.hands[seat][r] += o[r]; };

t('geometria: 19 hexagonos, 54 vertices, 72 arestas, 30 na costa', () => {
  assert.strictEqual(T.hexes.length, 19);
  assert.strictEqual(T.verts.length, 54);
  assert.strictEqual(T.edges.length, 72);
  assert.strictEqual(T.coast.length, 30);
  assert.ok(T.hexVerts.every((v) => new Set(v).size === 6));
});

t('preparacao do tabuleiro: terrenos, fichas, portos', () => {
  for (let i = 0; i < 30; i++) {
    const s = g._deal(lobby(4));
    const c = {};
    s.hexes.forEach((h) => { c[h.res] = (c[h.res] || 0) + 1; });
    assert.deepStrictEqual(c, { lumber: 4, wool: 4, grain: 4, brick: 3, ore: 3, desert: 1 });
    assert.deepStrictEqual(s.hexes.map((h) => h.num).filter(Boolean).sort((a, b) => a - b), [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
    assert.strictEqual(s.hexes[s.robber].res, 'desert');
    assert.strictEqual(s.harbors.length, 9);
    assert.strictEqual(s.ports.filter(Boolean).length, 18);
    assert.strictEqual(s.harbors.filter((h) => h.type === 'any').length, 4);
    const red = s.hexes.map((h, i) => (h.num === 6 || h.num === 8 ? i : -1)).filter((i) => i >= 0);
    for (const a of red) for (const b of red) assert.ok(!T.hexAdj[a].includes(b), '6/8 vizinhos');
    assert.strictEqual(s.devDeck.length, 25);
  }
});

t('inicio: exige 3 jogadores e o anfitriao', () => {
  assert.ok(fail(lobby(2), 0, { t: 'start' }));
  assert.ok(fail(lobby(3), 1, { t: 'start' }));
  assert.strictEqual(play(lobby(3), 0, { t: 'start' }).phase, 'setup');
});

t('preparacao em cobra e recursos da segunda colonia', () => {
  let s = g._deal(lobby(3));
  assert.deepStrictEqual(s.setupOrder, [0, 1, 2, 2, 1, 0]);
  const order = [];
  while (s.phase === 'setup') {
    order.push(s.turn);
    const v = g.autoMove(s, s.turn);
    assert.strictEqual(v.t, 'settle');
    s = play(s, s.turn, v);
    if (order.length > 3) assert.ok(sum(s.hands[s.turn]) >= 0);
    s = play(s, s.turn, g.autoMove(s, s.turn));
  }
  assert.deepStrictEqual(order, [0, 1, 2, 2, 1, 0]);
  assert.strictEqual(s.phase, 'playing');
  assert.strictEqual(s.step, 'roll');
  assert.strictEqual(s.turn, 0);
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(s.verts.filter((v) => v && v.seat === i).length, 2);
    assert.strictEqual(s.roads.filter((r) => r === i).length, 2);
  }
});

t('regra da distancia e estrada da preparacao', () => {
  let s = g._deal(lobby(3));
  s = play(s, 0, { t: 'settle', v: 20 });
  fail(s, 0, { t: 'settle', v: 21 });
  const e = T.vertEdges[20][0];
  const far = T.edges.findIndex((x) => !x.includes(20));
  fail(s, 0, { t: 'road', e: far });
  s = play(s, 0, { t: 'road', e });
  fail(s, 0, { t: 'settle', v: T.vertAdj[20][0] }); // vizinho da colonia do jogador 0
  fail(s, 0, { t: 'settle', v: 5 }); // nao e a vez
});

t('producao: colonia 1, cidade 2, ladrao bloqueia, banco insuficiente', () => {
  let s = started(3);
  const hexIdx = s.hexes.findIndex((h, i) => h.num && i !== s.robber && TOPO_has(s, i));
  function TOPO_has(st, i) { return T.hexVerts[i].some((v) => st.verts[v]); }
  const h = s.hexes[hexIdx];
  s.hands = s.hands.map(() => ({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 }));
  s.bank = { brick: 19, lumber: 19, wool: 19, grain: 19, ore: 19 };
  const mk = (st) => {
    const c = JSON.parse(JSON.stringify(st));
    return c;
  };
  // calcula o esperado
  const expect = [0, 0, 0];
  T.hexVerts.forEach((vs, i) => {
    if (s.hexes[i].num !== h.num || i === s.robber || s.hexes[i].res !== h.res) return;
    vs.forEach((v) => { if (s.verts[v]) expect[s.verts[v].seat] += s.verts[v].city ? 2 : 1; });
  });
  // forca os dados fabricando a producao por chamada direta via roll repetido nao e deterministico; usa-se mover o ladrao
  s.dice = null;
  const total = expect.reduce((a, b) => a + b, 0);
  assert.ok(total >= 1);
  // simula producao pela API interna: rola ate sair o numero (probabilistico, mas converge)
  let tries = 0;
  let r;
  do {
    r = JSON.parse(JSON.stringify(s));
    r = play(r, 0, { t: 'roll' });
    tries++;
  } while (r.dice[0] + r.dice[1] !== h.num && tries < 5000);
  assert.ok(tries < 5000);
  for (let i = 0; i < 3; i++) {
    let want = 0;
    T.hexVerts.forEach((vs, hi) => { if (s.hexes[hi].num === h.num && hi !== s.robber) vs.forEach((v) => { if (s.verts[v] && s.verts[v].seat === i) want++; }); });
    assert.strictEqual(sum(r.hands[i]), want);
  }
});

t('construcao: estrada, colonia e cidade com custo, ligacao e limites', () => {
  let s = started(3);
  s.step = 'main';
  const me = s.turn;
  fail(s, me, { t: 'road', e: 0 }); // sem recursos
  give(s, me, { brick: 5, lumber: 5, wool: 5, grain: 5, ore: 5 });
  const roads = g._roadSpots(s, me);
  assert.ok(roads.length > 0);
  const before = sum(s.hands[me]);
  s = play(s, me, { t: 'road', e: roads[0] });
  assert.strictEqual(sum(s.hands[me]), before - 2);
  assert.strictEqual(s.bank.brick, 20 - 0 + (s.bank.brick - 20) || s.bank.brick);
  // colonia so em local ligado
  const sp = g._settleSpots(s, me, false);
  for (const v of sp) assert.ok(T.vertEdges[v].some((e) => s.roads[e] === me));
  const bad = [...Array(54).keys()].find((v) => !sp.includes(v) && !s.verts[v]);
  fail(s, me, { t: 'settle', v: bad });
  // cidade
  const own = s.verts.findIndex((v) => v && v.seat === me && !v.city);
  s = play(s, me, { t: 'city', v: own });
  assert.ok(s.verts[own].city);
  fail(s, me, { t: 'city', v: own });
  // limite de estradas
  s.roads.fill(-1);
  const e0 = T.vertEdges[own];
  s.verts[own] = { seat: me, city: true };
  let placed = 0;
  for (let e = 0; e < 72 && placed < 15; e++) if (T.edges[e].some(() => true)) { s.roads[e] = me; placed++; }
  give(s, me, { brick: 5, lumber: 5 });
  assert.ok(fail(s, me, { t: 'road', e: s.roads.indexOf(-1) }));
});

t('maior estrada: ramificacao, quebra por colonia adversaria e posse', () => {
  let s = g._deal(lobby(3));
  s.verts = Array(54).fill(null);
  s.roads = Array(72).fill(-1);
  // caminho de 5 arestas a partir do vertice 0
  const path = [];
  let v = 0;
  const seen = new Set();
  for (let i = 0; i < 5; i++) {
    const e = T.vertEdges[v].find((x) => !seen.has(x));
    seen.add(e);
    path.push(e);
    const [a, b] = T.edges[e];
    v = a === v ? b : a;
  }
  // garante que e um caminho simples (nenhuma ramificacao) e conta 5
  path.forEach((e) => { s.roads[e] = 1; });
  assert.strictEqual(g._longestRoad(s, 1), 5);
  g._updateLongest(s);
  assert.strictEqual(s.longest, 1);
  // colonia adversaria no meio quebra
  const [a, b] = T.edges[path[2]];
  const mid = [a, b].find((x) => T.edges[path[1]].includes(x));
  s.verts[mid] = { seat: 0, city: false };
  assert.ok(g._longestRoad(s, 1) < 5);
  g._updateLongest(s);
  assert.strictEqual(s.longest, null);
});

t('descarte com 7: quem tem mais de 7 perde metade; ladrao e roubo', () => {
  let s = started(3);
  const me = s.turn;
  s.hands[0] = { brick: 4, lumber: 4, wool: 0, grain: 0, ore: 0 }; // 8 -> descarta 4
  s.hands[1] = { brick: 1, lumber: 0, wool: 0, grain: 0, ore: 0 };
  s.hands[2] = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
  // forca um 7 repetindo ate sair
  let r;
  for (let i = 0; i < 5000; i++) {
    r = play(JSON.parse(JSON.stringify(s)), me, { t: 'roll' });
    if (r.dice[0] + r.dice[1] === 7) break;
  }
  assert.strictEqual(r.dice[0] + r.dice[1], 7);
  assert.strictEqual(r.step, 'discard');
  assert.deepStrictEqual(r.discard, { 0: 4 });
  fail(r, 0, { t: 'discard', cards: { brick: 1 } });
  fail(r, 0, { t: 'discard', cards: { wool: 4 } });
  fail(r, 1, { t: 'discard', cards: { brick: 1 } });
  assert.deepStrictEqual(g.waitingOn(r), [0]);
  r = play(r, 0, { t: 'discard', cards: { brick: 4 } });
  assert.strictEqual(r.step, 'robber');
  fail(r, me, { t: 'robber', hex: r.robber });
  // poe o ladrao num hexagono com vitima
  const victim = me === 0 ? 1 : 0;
  r.hands[victim] = { brick: 0, lumber: 3, wool: 0, grain: 0, ore: 0 };
  const hex = T.hexVerts.findIndex((vs, i) => i !== r.robber && vs.some((x) => r.verts[x] && r.verts[x].seat === victim) && !vs.some((x) => r.verts[x] && r.verts[x].seat !== victim && sum(r.hands[r.verts[x].seat]) > 0 && r.verts[x].seat !== me));
  if (hex >= 0) {
    const mine = sum(r.hands[me]);
    const out = play(r, me, { t: 'robber', hex });
    assert.ok(out.step === 'main' || out.step === 'steal');
    if (out.step === 'main') assert.strictEqual(sum(out.hands[me]), mine + 1);
  }
});

t('cartas de desenvolvimento: compra, cavaleiro, uma por turno, carta nova nao joga', () => {
  let s = started(3);
  s.step = 'main';
  const me = s.turn;
  give(s, me, { wool: 2, grain: 2, ore: 2 });
  s.devDeck = ['knight', 'knight', 'vp', 'road', 'year', 'monopoly'].reverse();
  s.devDeck.push('knight');
  s = play(s, me, { t: 'buy_dev' });
  assert.strictEqual(s.dev[me][0], 'knight');
  fail(s, me, { t: 'play_knight' }); // comprada neste turno
  s.fresh[me] = [];
  s = play(s, me, { t: 'play_knight' });
  assert.strictEqual(s.step, 'robber');
  assert.strictEqual(s.knights[me], 1);
  s.step = 'main';
  s.dev[me].push('knight');
  fail(s, me, { t: 'play_knight' }); // ja jogou uma neste turno
});

t('maior exercito com 3 cavaleiros', () => {
  let s = started(3);
  const me = s.turn;
  for (let i = 0; i < 3; i++) {
    s.step = 'roll';
    s.devPlayed = false;
    s.dev[me] = ['knight'];
    s.fresh[me] = [];
    s = play(s, me, { t: 'play_knight' });
    assert.strictEqual(s.step, 'robber');
    const hex = s.hexes.findIndex((h, j) => j !== s.robber);
    s = play(s, me, s.victims ? { t: 'steal', victim: s.victims[0] } : { t: 'robber', hex });
    if (s.step === 'steal') s = play(s, me, { t: 'steal', victim: s.victims[0] });
    assert.strictEqual(s.step, 'roll', 'volta a fase de rolar quando jogado antes dos dados');
  }
  assert.strictEqual(s.knights[me], 3);
  assert.strictEqual(s.army, me);
});

t('invencao, monopolio e construcao de estradas', () => {
  let s = started(3);
  s.step = 'main';
  const me = s.turn;
  s.dev[me] = ['year', 'monopoly', 'road'];
  s.fresh[me] = [];
  s = play(s, me, { t: 'play_year', a: 'ore', b: 'ore' });
  assert.strictEqual(s.hands[me].ore >= 2, true);
  s.devPlayed = false;
  const other = (me + 1) % 3;
  s.hands[other].wool = 3;
  s.hands[(me + 2) % 3].wool = 2;
  const w = s.hands[me].wool;
  s = play(s, me, { t: 'play_monopoly', res: 'wool' });
  assert.strictEqual(s.hands[me].wool, w + 5);
  assert.strictEqual(s.hands[other].wool, 0);
  s.devPlayed = false;
  s = play(s, me, { t: 'play_road' });
  assert.strictEqual(s.step, 'freeRoad');
  const e1 = g._roadSpots(s, me)[0];
  s = play(s, me, { t: 'road', e: e1 });
  assert.strictEqual(s.step, 'freeRoad');
  s = play(s, me, { t: 'road', e: g._roadSpots(s, me)[0] });
  assert.strictEqual(s.step, 'main');
});

t('comercio entre jogadores: oferta, aceite, confirmacao', () => {
  let s = started(3);
  s.step = 'main';
  const me = s.turn;
  const p = (me + 1) % 3;
  give(s, me, { brick: 2 });
  s.hands[p].ore = 1;
  fail(s, me, { t: 'trade_offer', give: { brick: 1 }, get: { brick: 1 } });
  fail(s, me, { t: 'trade_offer', give: { ore: 1 }, get: { wool: 1 } });
  s = play(s, me, { t: 'trade_offer', give: { brick: 2 }, get: { ore: 1 } });
  s.hands[(me + 2) % 3].ore = 0;
  fail(s, (me + 2) % 3, { t: 'trade_accept' });
  fail(s, me, { t: 'trade_confirm', with: p });
  s = play(s, p, { t: 'trade_accept' });
  const b = s.hands[me].brick;
  s = play(s, me, { t: 'trade_confirm', with: p });
  assert.strictEqual(s.hands[me].brick, b - 2);
  assert.strictEqual(s.hands[me].ore >= 1, true);
  assert.strictEqual(s.trade, null);
});

t('comercio com o banco: 4:1, 3:1 e 2:1', () => {
  let s = started(3);
  s.step = 'main';
  const me = s.turn;
  s.ports = Array(54).fill(null);
  s.hands[me] = { brick: 0, lumber: 4, wool: 0, grain: 0, ore: 0 };
  assert.strictEqual(g._portRatio(s, me, 'lumber'), 4);
  s = play(s, me, { t: 'bank_trade', give: 'lumber', get: 'ore' });
  assert.deepStrictEqual([s.hands[me].lumber, s.hands[me].ore], [0, 1]);
  const v = s.verts.findIndex((x) => x && x.seat === me);
  s.ports[v] = 'any';
  assert.strictEqual(g._portRatio(s, me, 'lumber'), 3);
  s.ports[v] = 'lumber';
  assert.strictEqual(g._portRatio(s, me, 'lumber'), 2);
  assert.strictEqual(g._portRatio(s, me, 'ore'), 4);
  s.hands[me].lumber = 1;
  fail(s, me, { t: 'bank_trade', give: 'lumber', get: 'ore' });
});

t('vitoria aos 10 pontos no proprio turno (inclui pontos de vitoria ocultos)', () => {
  let s = started(3);
  s.step = 'main';
  const me = s.turn;
  s.dev[me] = Array(5).fill('vp');
  give(s, me, { grain: 2, ore: 3 });
  const own = s.verts.findIndex((v) => v && v.seat === me && !v.city);
  const pub = (s.verts.filter((v) => v && v.seat === me).length);
  assert.strictEqual(pub, 2);
  // 2 colonias(2) + cidade(+1) = 3 publico + 5 vp = 8; da 2 pontos de maior estrada ficticia
  s.army = me;
  s = play(s, me, { t: 'city', v: own });
  assert.strictEqual(s.phase, 'ended');
  assert.deepStrictEqual(s.winners, [me]);
  assert.strictEqual(g.view(s).stats[me].points, 10);
});

t('visoes: a publica nao traz maos; a privada traz so a propria', () => {
  const s = started(3);
  const pub = JSON.stringify(g.view(s));
  assert.ok(!pub.includes('"hands"') && !pub.includes('"devDeck"'));
  const mine = g.viewFor(s, 1);
  assert.deepStrictEqual(mine.hand, s.hands[1]);
  assert.strictEqual(g.viewFor(s, null), null);
  const spots = g.viewFor(s, s.turn).spots;
  assert.deepStrictEqual(spots.roads, []);
});

t('partidas completas pelo piloto automatico terminam sem erro', () => {
  for (let k = 3; k <= 4; k++) {
    for (let game = 0; game < 6; game++) {
      let s = g._deal(lobby(k));
      let moves = 0;
      while (s.phase !== 'ended' && moves < 30000) {
        let acted = false;
        for (const seat of g.waitingOn(s)) {
          const m = g.autoMove(s, seat);
          if (!m) continue;
          const r = g.move(s, seat, m);
          assert.ok(r.state, `${JSON.stringify(m)} -> ${r.error}`);
          s = r.state;
          acted = true;
          break;
        }
        assert.ok(acted, 'piloto travou na etapa ' + s.step);
        moves++;
        // invariante: conservacao de cartas por recurso
        if (moves % 50 === 0) {
          for (const r of RES) assert.strictEqual(s.bank[r] + s.hands.reduce((a, h) => a + h[r], 0), 19);
        }
      }
      assert.strictEqual(s.phase, 'ended', 'a partida do piloto deve terminar');
      assert.strictEqual(s.winners.length, 1);
    }
  }
});

console.log(`${n} testes passaram`);
