// GERADO por scripts/build-edge.js a partir de games/catan/game.js. Nao edite.
'use strict';
// Catan (jogo base), 3 a 4 jogadores. Tabuleiro de 19 hexagonos, 54 vertices, 72 arestas, 9 portos.
//
// Regras implementadas:
//  - Preparacao em "cobra": cada jogador poe colonia + estrada (ordem 0..n-1, depois n-1..0). A segunda colonia
//    rende 1 recurso de cada hexagono vizinho.
//  - Turno: (carta de desenvolvimento opcional) rolar os dados, produzir, 7 = descarte (>7 cartas perdem metade,
//    arredondando para baixo), mover o ladrao e roubar 1 carta; depois comerciar, construir e encerrar.
//  - Construcao: estrada (argila+madeira), colonia (argila+madeira+la+graos), cidade (2 graos+3 minerio) sobre colonia,
//    carta de desenvolvimento (la+graos+minerio). Regra da distancia: nenhuma colonia a menos de 2 arestas de outra.
//    Fora da preparacao, colonia e estrada precisam se ligar a uma estrada propria.
//  - Limites de pecas: 5 colonias, 4 cidades, 15 estradas. Banco com 19 cartas de cada recurso (se faltar, ninguem
//    recebe aquele recurso, exceto quando so um jogador tem direito: ele recebe o que restar).
//  - Comercio: oferta aos outros jogadores (so no turno de quem oferece) e troca com o banco 4:1, 3:1 ou 2:1 (portos).
//  - Cartas de desenvolvimento (25): 14 cavaleiros, 5 pontos de vitoria, 2 construcao de estradas, 2 invencao, 2 monopolio.
//    Uma por turno (pontos de vitoria a parte); nao se joga a carta comprada no mesmo turno.
//  - Maior estrada (>= 5 trechos, 2 pontos) e maior exercito (>= 3 cavaleiros, 2 pontos).
//  - Vence quem chegar a 10 pontos no proprio turno.
//
// Simplificacoes: posicao dos portos em ordem fixa ao longo da costa (tipos sorteados); fichas numeradas sorteadas
// com a unica restricao de que 6 e 8 nao fiquem em hexagonos vizinhos.

const RES = ['brick', 'lumber', 'wool', 'grain', 'ore'];
const RES_NAME = { brick: 'argila', lumber: 'madeira', wool: 'lã', grain: 'grãos', ore: 'minério' };
const TERRAIN = ['lumber', 'lumber', 'lumber', 'lumber', 'wool', 'wool', 'wool', 'wool', 'grain', 'grain', 'grain', 'grain',
  'brick', 'brick', 'brick', 'ore', 'ore', 'ore', 'desert'];
const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const COST = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  dev: { wool: 1, grain: 1, ore: 1 },
};
const DEV_DECK = [...Array(14).fill('knight'), ...Array(5).fill('vp'), 'road', 'road', 'year', 'year', 'monopoly', 'monopoly'];
const DEV_NAME = { knight: 'Cavaleiro', vp: 'Ponto de vitória', road: 'Construção de estradas', year: 'Invenção', monopoly: 'Monopólio' };
const LIMIT = { road: 15, settlement: 5, city: 4 };
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 4;
const WIN = 10;
const HARBOR_AT = [0, 3, 6, 10, 13, 16, 20, 23, 26]; // indices na lista de arestas da costa (em ordem angular)

function randomInt(n) {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) {
    const limit = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    do c.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}
function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/* ---------- Geometria (inteira, deterministica) ----------
 * Hexagono de topo pontudo. Centro (cx, cy) = (2q + r, 3r); vertices a (0,-2) (1,-1) (1,1) (0,2) (-1,1) (-1,-1).
 * Unidade x = sqrt(3)/2 * lado, unidade y = lado / 2. */
const CORNERS = [[0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]];

function buildTopo() {
  const axial = [];
  for (let r = -2; r <= 2; r++) for (let q = -2; q <= 2; q++) if (Math.abs(q + r) <= 2) axial.push([q, r]);
  axial.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const vkey = new Map();
  const verts = [];
  const hexVerts = [];
  const hexes = axial.map(([q, r]) => ({ q, r, x: 2 * q + r, y: 3 * r }));
  const pts = [];
  for (const h of hexes) for (const [dx, dy] of CORNERS) pts.push([h.x + dx, h.y + dy]);
  const uniq = [...new Map(pts.map((p) => [p.join(','), p])).values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  uniq.forEach((p, i) => { vkey.set(p.join(','), i); verts.push(p); });
  for (const h of hexes) hexVerts.push(CORNERS.map(([dx, dy]) => vkey.get(`${h.x + dx},${h.y + dy}`)));
  const ekey = new Map();
  const edges = [];
  const edgeHexes = [];
  hexVerts.forEach((vs, hi) => {
    for (let k = 0; k < 6; k++) {
      const a = vs[k];
      const b = vs[(k + 1) % 6];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!ekey.has(key)) { ekey.set(key, edges.length); edges.push(a < b ? [a, b] : [b, a]); edgeHexes.push([]); }
      edgeHexes[ekey.get(key)].push(hi);
    }
  });
  const vertHexes = verts.map(() => []);
  hexVerts.forEach((vs, hi) => vs.forEach((v) => vertHexes[v].push(hi)));
  const vertEdges = verts.map(() => []);
  edges.forEach(([a, b], i) => { vertEdges[a].push(i); vertEdges[b].push(i); });
  const vertAdj = verts.map(() => []);
  edges.forEach(([a, b]) => { vertAdj[a].push(b); vertAdj[b].push(a); });
  const hexAdj = hexes.map((h, i) => hexes.map((o, j) => j)
    .filter((j) => j !== i && Math.max(Math.abs(hexes[j].q - h.q), Math.abs(hexes[j].r - h.r), Math.abs(hexes[j].q + hexes[j].r - h.q - h.r)) === 1));
  // costa: arestas de um unico hexagono, em ordem angular horaria a partir do topo
  const coast = edgeHexes.map((hs, i) => [hs, i]).filter(([hs]) => hs.length === 1).map(([, i]) => i);
  const ang = (e) => {
    const [a, b] = edges[e];
    const x = (verts[a][0] + verts[b][0]) / 2;
    const y = (verts[a][1] + verts[b][1]) / 2;
    return (Math.atan2(x * 0.866, -y * 0.5) + 2 * Math.PI) % (2 * Math.PI);
  };
  coast.sort((a, b) => ang(a) - ang(b));
  return { hexes, verts, edges, hexVerts, vertHexes, vertEdges, vertAdj, hexAdj, coast, edgeHexes };
}
const TOPO = buildTopo();
const NV = TOPO.verts.length;
const NE = TOPO.edges.length;

/* ---------- Estado ---------- */
const sum = (o) => RES.reduce((a, r) => a + (o[r] || 0), 0);
const emptyHand = () => ({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 });
const afford = (hand, cost) => Object.keys(cost).every((r) => (hand[r] || 0) >= cost[r]);
const pips = (n) => (n ? 6 - Math.abs(7 - n) : 0);

function lobbyState(players = 0) {
  return { phase: 'lobby', players, step: null, turn: 0, log: '' };
}
const setup = () => lobbyState(0);
const acceptsSeat = (s) => s.phase === 'lobby';
const seatJoined = (s, seat) => (s.phase === 'lobby' ? { ...s, players: Math.max(s.players, seat + 1) } : s);

function layoutBoard() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const terrain = shuffle(TERRAIN);
    const nums = shuffle(NUMBERS);
    let k = 0;
    const hexes = terrain.map((res) => ({ res, num: res === 'desert' ? 0 : nums[k++] }));
    const bad = hexes.some((h, i) => (h.num === 6 || h.num === 8) && TOPO.hexAdj[i].some((j) => hexes[j].num === 6 || hexes[j].num === 8));
    if (!bad) return hexes;
  }
  const terrain = shuffle(TERRAIN);
  let k = 0;
  const nums = shuffle(NUMBERS);
  return terrain.map((res) => ({ res, num: res === 'desert' ? 0 : nums[k++] }));
}

function layoutPorts() {
  const types = shuffle(['any', 'any', 'any', 'any', ...RES]);
  const ports = Array(NV).fill(null);
  const list = [];
  HARBOR_AT.forEach((idx, i) => {
    const e = TOPO.coast[idx];
    const [a, b] = TOPO.edges[e];
    ports[a] = types[i];
    ports[b] = types[i];
    list.push({ edge: e, type: types[i] });
  });
  return { ports, list };
}

function deal(prev) {
  const n = prev.players;
  const hexes = layoutBoard();
  const { ports, list } = layoutPorts();
  const order = [];
  for (let i = 0; i < n; i++) order.push(i);
  for (let i = n - 1; i >= 0; i--) order.push(i);
  return {
    phase: 'setup',
    players: n,
    hexes,
    harbors: list,
    ports,
    robber: hexes.findIndex((h) => h.res === 'desert'),
    verts: Array(NV).fill(null),
    roads: Array(NE).fill(-1),
    hands: Array.from({ length: n }, emptyHand),
    bank: { brick: 19, lumber: 19, wool: 19, grain: 19, ore: 19 },
    devDeck: shuffle(DEV_DECK),
    dev: Array.from({ length: n }, () => []),
    fresh: Array.from({ length: n }, () => []),
    knights: new Array(n).fill(0),
    longest: null,
    army: null,
    roadLen: new Array(n).fill(0),
    setupOrder: order,
    setupIdx: 0,
    setupVert: null,
    turn: order[0],
    first: prev.first === undefined ? 0 : prev.first,
    step: 'setupSettle',
    dice: null,
    devPlayed: false,
    discard: {},
    trade: null,
    freeRoads: 0,
    afterRobber: null,
    victims: null,
    lastGain: [],
    winners: [],
    totals: null,
    log: 'Preparação: cada jogador põe uma colônia e uma estrada.',
  };
}

function restart(state) {
  if (state.players < MIN_PLAYERS) return state;
  return deal({ players: state.players, first: state.phase === 'lobby' ? 0 : (state.first + 1) % state.players });
}

/* ---------- Consultas ---------- */
const count = (s, seat, type) => s.verts.filter((v) => v && v.seat === seat && (type === 'city' ? v.city : type === 'settlement' ? !v.city : true)).length;
const roadCount = (s, seat) => s.roads.filter((x) => x === seat).length;

function vertOk(s, v) {
  if (s.verts[v]) return false;
  return TOPO.vertAdj[v].every((w) => !s.verts[w]);
}
function roadConnects(s, seat, v) {
  return TOPO.vertEdges[v].some((e) => s.roads[e] === seat);
}
function settleSpots(s, seat, free) {
  const out = [];
  for (let v = 0; v < NV; v++) {
    if (!vertOk(s, v)) continue;
    if (!free && !roadConnects(s, seat, v)) continue;
    out.push(v);
  }
  return out;
}
function roadSpots(s, seat, fromVert) {
  const out = [];
  for (let e = 0; e < NE; e++) {
    if (s.roads[e] !== -1) continue;
    const [a, b] = TOPO.edges[e];
    if (fromVert !== undefined && fromVert !== null) {
      if (a === fromVert || b === fromVert) out.push(e);
      continue;
    }
    const linked = [a, b].some((v) => {
      const own = s.verts[v];
      if (own && own.seat === seat) return true;
      if (own && own.seat !== seat) return false; // vertice bloqueado por oponente
      return TOPO.vertEdges[v].some((x) => x !== e && s.roads[x] === seat);
    });
    if (linked) out.push(e);
  }
  return out;
}
function citySpots(s, seat) {
  const out = [];
  for (let v = 0; v < NV; v++) if (s.verts[v] && s.verts[v].seat === seat && !s.verts[v].city) out.push(v);
  return out;
}
function victimsAt(s, hex, seat) {
  const set = new Set();
  for (const v of TOPO.hexVerts[hex]) if (s.verts[v] && s.verts[v].seat !== seat && sum(s.hands[s.verts[v].seat]) > 0) set.add(s.verts[v].seat);
  return [...set].sort((a, b) => a - b);
}
function portRatio(s, seat, res) {
  let best = 4;
  for (let v = 0; v < NV; v++) {
    if (!s.verts[v] || s.verts[v].seat !== seat) continue;
    const p = s.ports[v];
    if (p === 'any') best = Math.min(best, 3);
    else if (p === res) best = Math.min(best, 2);
  }
  return best;
}

// Maior trecho continuo de estradas do jogador (arestas nao se repetem; vertices ocupados por oponentes bloqueiam).
function longestRoad(s, seat) {
  let best = 0;
  const used = new Set();
  const walk = (v, len) => {
    if (len > best) best = len;
    if (s.verts[v] && s.verts[v].seat !== seat && len > 0) return; // nao passa por colonia/cidade adversaria
    for (const e of TOPO.vertEdges[v]) {
      if (s.roads[e] !== seat || used.has(e)) continue;
      const [a, b] = TOPO.edges[e];
      used.add(e);
      walk(a === v ? b : a, len + 1);
      used.delete(e);
    }
  };
  for (let v = 0; v < NV; v++) if (TOPO.vertEdges[v].some((e) => s.roads[e] === seat)) walk(v, 0);
  return best;
}

function updateLongest(s) {
  for (let i = 0; i < s.players; i++) s.roadLen[i] = longestRoad(s, i);
  const max = Math.max(...s.roadLen);
  if (max < 5) { s.longest = null; return; }
  if (s.longest !== null && s.roadLen[s.longest] === max) return;
  const top = s.roadLen.map((l, i) => i).filter((i) => s.roadLen[i] === max);
  s.longest = top.length === 1 ? top[0] : null;
}
function updateArmy(s, seat) {
  if (s.knights[seat] >= 3 && (s.army === null || s.knights[seat] > s.knights[s.army])) s.army = seat;
}

function publicPoints(s, seat) {
  return count(s, seat, 'settlement') + 2 * count(s, seat, 'city') + (s.longest === seat ? 2 : 0) + (s.army === seat ? 2 : 0);
}
const totalPoints = (s, seat) => publicPoints(s, seat) + s.dev[seat].filter((c) => c === 'vp').length;

function checkWin(s, nameOf) {
  const seat = s.turn;
  if (totalPoints(s, seat) >= WIN) {
    s.phase = 'ended';
    s.step = null;
    s.winners = [seat];
    s.totals = s.dev.map((_, i) => totalPoints(s, i));
    s.trade = null;
    s.log = `${nameOf ? nameOf(seat) : `Jogador ${seat + 1}`} chegou a ${totalPoints(s, seat)} pontos e venceu!`;
    return true;
  }
  return false;
}

/* ---------- Producao ---------- */
function give(s, seat, res, n) {
  const take = Math.min(n, s.bank[res]);
  s.bank[res] -= take;
  s.hands[seat][res] += take;
  return take;
}
function produce(s, roll) {
  const want = Array.from({ length: s.players }, emptyHand);
  s.hexes.forEach((h, i) => {
    if (h.num !== roll || i === s.robber) return;
    for (const v of TOPO.hexVerts[i]) if (s.verts[v]) want[s.verts[v].seat][h.res] += s.verts[v].city ? 2 : 1;
  });
  const got = [];
  for (const r of RES) {
    const total = want.reduce((a, w) => a + w[r], 0);
    if (!total) continue;
    const takers = want.filter((w) => w[r] > 0).length;
    if (total > s.bank[r] && takers > 1) continue; // banco insuficiente e mais de um jogador: ninguem recebe
    want.forEach((w, seat) => { if (w[r]) got.push([seat, r, give(s, seat, r, w[r])]); });
  }
  return got;
}

/* ---------- Jogadas ---------- */
const clone = (x) => JSON.parse(JSON.stringify(x));
function pay(s, seat, cost) {
  for (const r of Object.keys(cost)) { s.hands[seat][r] -= cost[r]; s.bank[r] += cost[r]; }
}
function cleanRes(o) {
  if (!o || typeof o !== 'object') return null;
  const out = emptyHand();
  for (const r of Object.keys(o)) {
    if (!RES.includes(r)) return null;
    const v = o[r];
    if (!Number.isInteger(v) || v < 0 || v > 40) return null;
    out[r] = v;
  }
  return out;
}

function afterBuild(s, nameOf) {
  updateLongest(s);
  checkWin(s, nameOf);
}

function startMain(s) {
  s.step = 'main';
}

function nextSetup(s) {
  s.setupIdx++;
  s.setupVert = null;
  if (s.setupIdx >= s.setupOrder.length) {
    s.phase = 'playing';
    s.turn = s.first;
    s.step = 'roll';
    s.log = 'Preparação concluída. Começa o jogo.';
    return;
  }
  s.turn = s.setupOrder[s.setupIdx];
  s.step = 'setupSettle';
}

function endTurn(s) {
  s.fresh[s.turn] = [];
  s.turn = (s.turn + 1) % s.players;
  s.step = 'roll';
  s.dice = null;
  s.devPlayed = false;
  s.trade = null;
}

function finishRobber(s, seat, hex, victim) {
  let msg = '';
  if (victim !== null && victim !== undefined) {
    const pool = [];
    for (const r of RES) for (let i = 0; i < s.hands[victim][r]; i++) pool.push(r);
    if (pool.length) {
      const r = pool[randomInt(pool.length)];
      s.hands[victim][r]--;
      s.hands[seat][r]++;
      msg = ` e roubou 1 carta de Jogador ${victim + 1}`;
    }
  }
  s.log = `Ladrão movido${msg}.`;
  s.step = s.afterRobber === 'preRoll' ? 'roll' : 'main';
  s.afterRobber = null;
  s.victims = null;
}

function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    if (state.players < MIN_PLAYERS) return { error: 'São necessários pelo menos 3 jogadores.' };
    if (state.players > MAX_PLAYERS) return { error: 'No máximo 4 jogadores.' };
    return { state: deal(state) };
  }
  if (state.phase === 'lobby') return { error: 'A partida ainda não começou.' };
  if (state.phase === 'ended') return { error: 'A partida terminou. Use "Nova partida" para jogar outra.' };
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players) return { error: 'Você não está jogando.' };

  const s = clone(state);
  const name = `Jogador ${seat + 1}`;
  const nameOf = (i) => `Jogador ${i + 1}`;

  /* descarte: todos os jogadores com mais de 7 cartas, em qualquer ordem */
  if (req.t === 'discard') {
    if (s.step !== 'discard' || !s.discard[seat]) return { error: 'Você não precisa descartar.' };
    const cards = cleanRes(req.cards);
    if (!cards) return { error: 'Cartas inválidas.' };
    if (sum(cards) !== s.discard[seat]) return { error: `Descarte exatamente ${s.discard[seat]} cartas.` };
    if (!RES.every((r) => cards[r] <= s.hands[seat][r])) return { error: 'Você não tem essas cartas.' };
    for (const r of RES) { s.hands[seat][r] -= cards[r]; s.bank[r] += cards[r]; }
    delete s.discard[seat];
    if (!Object.keys(s.discard).length) { s.step = 'robber'; s.log = `${nameOf(s.turn)} move o ladrão.`; }
    else s.log = `${name} descartou.`;
    return { state: s };
  }

  /* troca: as respostas dos outros jogadores */
  if (req.t === 'trade_accept' || req.t === 'trade_reject') {
    if (!s.trade || seat === s.turn || s.step !== 'main') return { error: 'Não há oferta para você.' };
    if (req.t === 'trade_accept') {
      if (!afford(s.hands[seat], s.trade.get)) return { error: 'Você não tem as cartas pedidas.' };
      if (!s.trade.accepted.includes(seat)) s.trade.accepted.push(seat);
      s.trade.rejected = s.trade.rejected.filter((x) => x !== seat);
    } else {
      s.trade.accepted = s.trade.accepted.filter((x) => x !== seat);
      if (!s.trade.rejected.includes(seat)) s.trade.rejected.push(seat);
    }
    return { state: s };
  }

  if (seat !== s.turn) return { error: 'Não é a sua vez.' };

  /* preparacao */
  if (s.phase === 'setup') {
    if (req.t === 'settle') {
      if (s.step !== 'setupSettle') return { error: 'Agora é a estrada.' };
      if (!Number.isInteger(req.v) || req.v < 0 || req.v >= NV) return { error: 'Local inválido.' };
      if (!vertOk(s, req.v)) return { error: 'Local ocupado ou perto demais de outra colônia.' };
      s.verts[req.v] = { seat, city: false };
      s.setupVert = req.v;
      s.step = 'setupRoad';
      if (s.setupIdx >= s.players) {
        for (const h of TOPO.vertHexes[req.v]) if (s.hexes[h].res !== 'desert') give(s, seat, s.hexes[h].res, 1);
      }
      return { state: s };
    }
    if (req.t === 'road') {
      if (s.step !== 'setupRoad') return { error: 'Ponha primeiro a colônia.' };
      if (!Number.isInteger(req.e) || req.e < 0 || req.e >= NE) return { error: 'Local inválido.' };
      if (s.roads[req.e] !== -1) return { error: 'Já há uma estrada ali.' };
      if (!TOPO.edges[req.e].includes(s.setupVert)) return { error: 'A estrada deve sair da colônia que você acabou de pôr.' };
      s.roads[req.e] = seat;
      nextSetup(s);
      updateLongest(s);
      return { state: s };
    }
    return { error: 'Jogada inválida na preparação.' };
  }

  /* jogo */
  const playDevGuard = (type) => {
    if (s.step !== 'main' && s.step !== 'roll') return 'Agora não é possível jogar carta.';
    if (type !== 'knight' && s.step === 'roll') return 'Antes de rolar, só é possível jogar o Cavaleiro.';
    if (s.devPlayed) return 'Só uma carta de desenvolvimento por turno.';
    const have = s.dev[seat].filter((c) => c === type).length - s.fresh[seat].filter((c) => c === type).length;
    if (have <= 0) return 'Você não tem essa carta disponível (cartas compradas neste turno só valem no próximo).';
    return null;
  };
  const useDev = (type) => {
    s.dev[seat].splice(s.dev[seat].indexOf(type), 1);
    s.devPlayed = true;
  };

  switch (req.t) {
    case 'roll': {
      if (s.step !== 'roll') return { error: 'Os dados já foram rolados.' };
      const d = [randomInt(6) + 1, randomInt(6) + 1];
      const roll = d[0] + d[1];
      s.dice = d;
      if (roll === 7) {
        s.discard = {};
        s.hands.forEach((h, i) => { const n = sum(h); if (n > 7) s.discard[i] = Math.floor(n / 2); });
        s.afterRobber = 'main';
        s.log = `${name} tirou 7.`;
        s.step = Object.keys(s.discard).length ? 'discard' : 'robber';
      } else {
        const got = produce(s, roll);
        s.log = `${name} tirou ${roll}.` + (got.length ? '' : ' Ninguém produziu.');
        s.step = 'main';
        s.lastGain = got.map(([sx, r, n]) => ({ seat: sx, res: r, n }));
      }
      if (roll === 7) s.lastGain = [];
      return { state: s };
    }
    case 'robber': {
      if (s.step !== 'robber') return { error: 'Não é hora de mover o ladrão.' };
      if (!Number.isInteger(req.hex) || req.hex < 0 || req.hex >= s.hexes.length) return { error: 'Hexágono inválido.' };
      if (req.hex === s.robber) return { error: 'O ladrão precisa mudar de lugar.' };
      s.robber = req.hex;
      const victims = victimsAt(s, req.hex, seat);
      if (!victims.length) { finishRobber(s, seat, req.hex, null); return { state: s }; }
      if (victims.length === 1) { finishRobber(s, seat, req.hex, victims[0]); return { state: s }; }
      s.step = 'steal';
      s.victims = victims;
      s.log = `${name} moveu o ladrão. Escolha de quem roubar.`;
      return { state: s };
    }
    case 'steal': {
      if (s.step !== 'steal') return { error: 'Não é hora de roubar.' };
      if (!s.victims.includes(req.victim)) return { error: 'Jogador inválido.' };
      const v = req.victim;
      s.victims = null;
      finishRobber(s, seat, s.robber, v);
      return { state: s };
    }
    case 'road':
    case 'settle':
    case 'city': {
      if (s.step === 'freeRoad' && req.t === 'road') {
        if (!roadSpots(s, seat).includes(req.e)) return { error: 'Local inválido para a estrada.' };
        s.roads[req.e] = seat;
        s.freeRoads--;
        if (s.freeRoads <= 0 || roadCount(s, seat) >= LIMIT.road || !roadSpots(s, seat).length) { s.freeRoads = 0; s.step = 'main'; }
        afterBuild(s, nameOf);
        return { state: s };
      }
      if (s.step !== 'main') return { error: 'Role os dados antes de construir.' };
      if (req.t === 'road') {
        if (roadCount(s, seat) >= LIMIT.road) return { error: 'Você não tem mais estradas.' };
        if (!afford(s.hands[seat], COST.road)) return { error: 'Recursos insuficientes.' };
        if (!Number.isInteger(req.e) || !roadSpots(s, seat).includes(req.e)) return { error: 'Local inválido para a estrada.' };
        pay(s, seat, COST.road);
        s.roads[req.e] = seat;
        s.log = `${name} construiu uma estrada.`;
      } else if (req.t === 'settle') {
        if (count(s, seat, 'settlement') >= LIMIT.settlement) return { error: 'Você não tem mais colônias.' };
        if (!afford(s.hands[seat], COST.settlement)) return { error: 'Recursos insuficientes.' };
        if (!Number.isInteger(req.v) || !settleSpots(s, seat, false).includes(req.v)) return { error: 'Local inválido para a colônia.' };
        pay(s, seat, COST.settlement);
        s.verts[req.v] = { seat, city: false };
        s.log = `${name} construiu uma colônia.`;
      } else {
        if (count(s, seat, 'city') >= LIMIT.city) return { error: 'Você não tem mais cidades.' };
        if (!afford(s.hands[seat], COST.city)) return { error: 'Recursos insuficientes.' };
        if (!Number.isInteger(req.v) || !citySpots(s, seat).includes(req.v)) return { error: 'Local inválido para a cidade.' };
        pay(s, seat, COST.city);
        s.verts[req.v].city = true;
        s.log = `${name} construiu uma cidade.`;
      }
      s.trade = null;
      afterBuild(s, nameOf);
      return { state: s };
    }
    case 'buy_dev': {
      if (s.step !== 'main') return { error: 'Role os dados antes de comprar.' };
      if (!s.devDeck.length) return { error: 'Acabaram as cartas de desenvolvimento.' };
      if (!afford(s.hands[seat], COST.dev)) return { error: 'Recursos insuficientes.' };
      pay(s, seat, COST.dev);
      const card = s.devDeck.pop();
      s.dev[seat].push(card);
      s.fresh[seat].push(card);
      s.log = `${name} comprou uma carta de desenvolvimento.`;
      s.trade = null;
      checkWin(s, nameOf);
      return { state: s };
    }
    case 'play_knight': {
      const err = playDevGuard('knight');
      if (err) return { error: err };
      useDev('knight');
      s.knights[seat]++;
      updateArmy(s, seat);
      s.afterRobber = s.step === 'roll' ? 'preRoll' : 'main';
      s.discard = {};
      s.step = 'robber';
      s.trade = null;
      s.log = `${name} jogou um Cavaleiro.`;
      checkWin(s, nameOf);
      return { state: s };
    }
    case 'play_road': {
      const err = playDevGuard('road');
      if (err) return { error: err };
      const free = Math.min(2, LIMIT.road - roadCount(s, seat));
      if (!free || !roadSpots(s, seat).length) return { error: 'Não há onde construir estradas.' };
      useDev('road');
      s.freeRoads = free;
      s.step = 'freeRoad';
      s.trade = null;
      s.log = `${name} jogou Construção de estradas.`;
      return { state: s };
    }
    case 'play_year': {
      const err = playDevGuard('year');
      if (err) return { error: err };
      if (!RES.includes(req.a) || !RES.includes(req.b)) return { error: 'Escolha dois recursos.' };
      const need = emptyHand();
      need[req.a]++; need[req.b]++;
      if (!RES.every((r) => s.bank[r] >= need[r])) return { error: 'O banco não tem esses recursos.' };
      useDev('year');
      s.hands[seat][req.a]++; s.hands[seat][req.b]++;
      s.bank[req.a]--; s.bank[req.b]--;
      s.log = `${name} jogou Invenção: ${RES_NAME[req.a]} e ${RES_NAME[req.b]}.`;
      return { state: s };
    }
    case 'play_monopoly': {
      const err = playDevGuard('monopoly');
      if (err) return { error: err };
      if (!RES.includes(req.res)) return { error: 'Escolha um recurso.' };
      useDev('monopoly');
      let n = 0;
      for (let i = 0; i < s.players; i++) if (i !== seat) { n += s.hands[i][req.res]; s.hands[i][req.res] = 0; }
      s.hands[seat][req.res] += n;
      s.log = `${name} jogou Monopólio de ${RES_NAME[req.res]} e recebeu ${n}.`;
      return { state: s };
    }
    case 'reveal_vp': {
      return { error: 'Pontos de vitória são revelados automaticamente ao chegar a 10.' };
    }
    case 'trade_offer': {
      if (s.step !== 'main') return { error: 'Role os dados antes de negociar.' };
      const g = cleanRes(req.give);
      const w = cleanRes(req.get);
      if (!g || !w || !sum(g) || !sum(w)) return { error: 'Oferta inválida.' };
      if (RES.some((r) => g[r] && w[r])) return { error: 'Não ofereça e peça o mesmo recurso.' };
      if (!afford(s.hands[seat], g)) return { error: 'Você não tem as cartas oferecidas.' };
      s.trade = { give: g, get: w, accepted: [], rejected: [] };
      s.log = `${name} fez uma oferta.`;
      return { state: s };
    }
    case 'trade_cancel': {
      if (!s.trade) return { error: 'Não há oferta.' };
      s.trade = null;
      s.log = `${name} cancelou a oferta.`;
      return { state: s };
    }
    case 'trade_confirm': {
      if (!s.trade || s.step !== 'main') return { error: 'Não há oferta.' };
      const p = req.with;
      if (!Number.isInteger(p) || !s.trade.accepted.includes(p)) return { error: 'Esse jogador não aceitou.' };
      const { give: g, get: w } = s.trade;
      if (!afford(s.hands[seat], g) || !afford(s.hands[p], w)) return { error: 'Alguém não tem mais as cartas da troca.' };
      for (const r of RES) {
        s.hands[seat][r] += w[r] - g[r];
        s.hands[p][r] += g[r] - w[r];
      }
      s.trade = null;
      s.log = `${name} trocou com ${nameOf(p)}.`;
      return { state: s };
    }
    case 'bank_trade': {
      if (s.step !== 'main') return { error: 'Role os dados antes de negociar.' };
      if (!RES.includes(req.give) || !RES.includes(req.get) || req.give === req.get) return { error: 'Troca inválida.' };
      const ratio = portRatio(s, seat, req.give);
      if (s.hands[seat][req.give] < ratio) return { error: `Troca ${ratio}:1 exige ${ratio} cartas.` };
      if (s.bank[req.get] < 1) return { error: 'O banco não tem esse recurso.' };
      s.hands[seat][req.give] -= ratio;
      s.bank[req.give] += ratio;
      s.hands[seat][req.get]++;
      s.bank[req.get]--;
      s.trade = null;
      s.log = `${name} trocou ${ratio} ${RES_NAME[req.give]} por 1 ${RES_NAME[req.get]} com o banco.`;
      return { state: s };
    }
    case 'end': {
      if (s.step !== 'main') return { error: 'Role os dados e termine suas ações antes.' };
      endTurn(s);
      s.log = `Vez de ${nameOf(s.turn)}.`;
      return { state: s };
    }
    default:
      return { error: 'Jogada inválida.' };
  }
}

/* ---------- Visoes ---------- */
function view(state) {
  if (state.phase === 'lobby') return { phase: 'lobby', players: state.players, log: '', draw: false, over: false };
  const n = state.players;
  const ended = state.phase === 'ended';
  const waiting = waitingOn(state);
  return {
    phase: state.phase,
    players: n,
    turn: ended ? null : state.turn,
    step: state.step,
    topo: { verts: TOPO.verts, edges: TOPO.edges, hexVerts: TOPO.hexVerts, hexes: TOPO.hexes.map((h) => ({ x: h.x, y: h.y })) },
    hexes: state.hexes,
    harbors: state.harbors,
    robber: state.robber,
    verts: state.verts,
    roads: state.roads,
    dice: state.dice,
    bank: state.bank,
    devLeft: state.devDeck.length,
    discard: state.step === 'discard' ? state.discard : null,
    victims: state.step === 'steal' ? state.victims : null,
    freeRoads: state.freeRoads,
    trade: state.trade,
    lastGain: state.lastGain || [],
    longest: state.longest,
    army: state.army,
    stats: state.hands.map((h, i) => ({
      cards: sum(h),
      dev: state.dev[i].length,
      knights: state.knights[i],
      roadLen: state.roadLen[i],
      points: ended ? state.totals[i] : publicPoints(state, i),
      settlements: count(state, i, 'settlement'),
      cities: count(state, i, 'city'),
      roads: roadCount(state, i),
    })),
    winners: ended ? state.winners : [],
    log: state.log,
    waiting,
    draw: false,
    over: ended,
  };
}

function spotsFor(s, seat) {
  const spots = { roads: [], settlements: [], cities: [], hexes: [] };
  if (seat !== s.turn) return spots;
  const h = s.hands[seat];
  if (s.phase === 'setup') {
    if (s.step === 'setupSettle') spots.settlements = settleSpots(s, seat, true);
    else spots.roads = roadSpots(s, seat, s.setupVert);
    return spots;
  }
  if (s.step === 'freeRoad') spots.roads = roadSpots(s, seat);
  else if (s.step === 'robber') spots.hexes = s.hexes.map((_, i) => i).filter((i) => i !== s.robber);
  else if (s.step === 'main') {
    if (afford(h, COST.road) && roadCount(s, seat) < LIMIT.road) spots.roads = roadSpots(s, seat);
    if (afford(h, COST.settlement) && count(s, seat, 'settlement') < LIMIT.settlement) spots.settlements = settleSpots(s, seat, false);
    if (afford(h, COST.city) && count(s, seat, 'city') < LIMIT.city) spots.cities = citySpots(s, seat);
  }
  return spots;
}

function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby' || seat >= state.players) return null;
  const hand = state.hands[seat];
  const avail = (type) => state.dev[seat].filter((c) => c === type).length - state.fresh[seat].filter((c) => c === type).length;
  const canDev = (type) => !state.devPlayed && seat === state.turn && avail(type) > 0 &&
    (state.step === 'main' || (state.step === 'roll' && type === 'knight'));
  return {
    hand,
    dev: state.dev[seat],
    fresh: state.fresh[seat],
    spots: state.phase === 'ended' ? { roads: [], settlements: [], cities: [], hexes: [] } : spotsFor(state, seat),
    ratios: Object.fromEntries(RES.map((r) => [r, portRatio(state, seat, r)])),
    canPlay: { knight: canDev('knight'), road: canDev('road'), year: canDev('year'), monopoly: canDev('monopoly') },
    mustDiscard: state.step === 'discard' ? state.discard[seat] || 0 : 0,
    points: totalPoints(state, seat),
  };
}

/* ---------- Piloto automatico ---------- */
function waitingOn(state) {
  if (state.phase !== 'setup' && state.phase !== 'playing') return [];
  if (state.step === 'discard') return Object.keys(state.discard).map(Number);
  return [state.turn];
}

function vertValue(s, v) {
  let val = 0;
  const kinds = new Set();
  for (const h of TOPO.vertHexes[v]) {
    val += pips(s.hexes[h].num);
    if (s.hexes[h].res !== 'desert') kinds.add(s.hexes[h].res);
  }
  return val + kinds.size * 2;
}

function autoMove(state, seat) {
  if (state.step === 'discard') {
    const need = state.discard[seat];
    if (!need) return null;
    const hand = { ...state.hands[seat] };
    const cards = emptyHand();
    for (let i = 0; i < need; i++) {
      const r = RES.slice().sort((a, b) => hand[b] - hand[a])[0];
      hand[r]--; cards[r]++;
    }
    return { t: 'discard', cards };
  }
  if (seat !== state.turn) return null;
  const spots = spotsFor(state, seat);
  switch (state.step) {
    case 'setupSettle': {
      const best = spots.settlements.slice().sort((a, b) => vertValue(state, b) - vertValue(state, a))[0];
      return best === undefined ? null : { t: 'settle', v: best };
    }
    case 'setupRoad':
      return spots.roads.length ? { t: 'road', e: spots.roads[0] } : null;
    case 'roll':
      return { t: 'roll' };
    case 'robber': {
      const mine = (i) => TOPO.hexVerts[i].some((v) => state.verts[v] && state.verts[v].seat === seat);
      const score = (i) => {
        if (mine(i)) return -100;
        const others = TOPO.hexVerts[i].filter((v) => state.verts[v]).length;
        return others * 10 + pips(state.hexes[i].num);
      };
      const hex = spots.hexes.slice().sort((a, b) => score(b) - score(a))[0];
      return { t: 'robber', hex };
    }
    case 'steal':
      return { t: 'steal', victim: state.victims[0] };
    case 'freeRoad':
      return spots.roads.length ? { t: 'road', e: spots.roads[0] } : null;
    case 'main': {
      if (state.trade) return { t: 'trade_cancel' };
      const mine = viewFor(state, seat);
      if (mine.canPlay.knight && state.knights[seat] < 6) return { t: 'play_knight' };
      const best = (list) => list.slice().sort((a, b) => vertValue(state, b) - vertValue(state, a))[0];
      if (spots.cities.length) return { t: 'city', v: best(spots.cities) };
      if (spots.settlements.length) return { t: 'settle', v: best(spots.settlements) };
      const hand = state.hands[seat];
      // objetivo atual: o que falta para a proxima construcao util
      const canSettleLater = count(state, seat, 'settlement') < LIMIT.settlement && settleSpots(state, seat, false).length > 0;
      let goal = null;
      if (citySpots(state, seat).length && count(state, seat, 'city') < LIMIT.city) goal = COST.city;
      else if (canSettleLater) goal = COST.settlement;
      else if (roadCount(state, seat) < LIMIT.road && roadSpots(state, seat).length) goal = COST.road;
      else if (state.devDeck.length) goal = COST.dev;
      if (spots.roads.length && goal === COST.road) {
        // prefere a estrada cuja ponta livre abre um local de colonia
        const open = spots.roads.filter((e) => TOPO.edges[e].some((v) => vertOk(state, v) && !state.verts[v]));
        return { t: 'road', e: (open.length ? open : spots.roads)[0] };
      }
      if (goal === COST.dev && afford(hand, COST.dev)) return { t: 'buy_dev' };
      if (goal) {
        const missing = RES.filter((r) => (hand[r] || 0) < (goal[r] || 0));
        const spare = RES.filter((r) => (hand[r] || 0) - (goal[r] || 0) >= portRatio(state, seat, r) && state.bank[missing[0]] > 0);
        if (missing.length && spare.length) return { t: 'bank_trade', give: spare[0], get: missing[0] };
      }
      if (afford(hand, COST.dev) && state.devDeck.length && sum(hand) > 7) return { t: 'buy_dev' };
      return { t: 'end' };
    }
    default:
      return null;
  }
}

export default {
  id: 'catan',
  name: 'Catan',
  description: 'Catan: colonize a ilha, comercie recursos e chegue a 10 pontos. De 3 a 4 jogadores.',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  roles: Array.from({ length: MAX_PLAYERS }, (_, i) => `Jogador ${i + 1}`),
  setup,
  acceptsSeat,
  seatJoined,
  restart,
  move,
  view,
  viewFor,
  waitingOn,
  autoMove,
  // expostos para teste
  _deal: deal,
  _TOPO: TOPO,
  _longestRoad: longestRoad,
  _updateLongest: updateLongest,
  _portRatio: portRatio,
  _settleSpots: settleSpots,
  _roadSpots: roadSpots,
  _COST: COST,
};
