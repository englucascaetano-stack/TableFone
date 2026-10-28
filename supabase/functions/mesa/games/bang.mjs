// GERADO por scripts/build-edge.js a partir de games/bang/game.js. Nao edite.
'use strict';
// BANG! (versao de cartas), 4 a 7 jogadores. Papeis secretos: Xerife, Delegado(s), Fora-da-lei e Renegado.
// Baralho de 80 cartas e 16 personagens, com as regras do jogo base.
//
// Turno: 1) compra 2 cartas; 2) joga cartas (so 1 BANG! por turno, salvo Volcanic ou Willy the Kid); 3) descarta ate ter
// tantas cartas quanto pontos de vida. Antes de comprar, resolve a Dinamite e a Cadeia que estiverem na mesa.
// Distancia: menor caminho entre vivos; Mustang (+1 para quem o olha) e Mira (-1 para quem a tem); minimo 1.
// Alcance do BANG!: 1 (Colt) ou o da arma na mesa. Cerveja nao cura quando restam so 2 jogadores.
// Morte: quem matar um Fora-da-lei compra 3 cartas; o Xerife que matar um Delegado descarta todas as suas cartas.
// Vitoria: Xerife e Delegados eliminam os Fora-da-lei e o Renegado; os Fora-da-lei vencem se o Xerife morrer;
// o Renegado vence se, quando o Xerife morrer, for o unico jogador vivo.
//
// Naipes e valores das cartas: distribuicao propria (afetam so Barril, Dinamite, Cadeia e Lucky Duke).
// Lucky Duke revela 2 cartas nos sorteios e o jogador escolhe qual vale.

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 7;
const MAX_LOG = 10;

const NAME = {
  bang: 'BANG!', missed: 'Errou!', beer: 'Cerveja', saloon: 'Saloon', stagecoach: 'Diligência', wells: 'Wells Fargo',
  store: 'Armazém', gatling: 'Gatling', indians: 'Índios!', duel: 'Duelo', panic: 'Pânico!', balou: 'Cat Balou',
  barrel: 'Barril', dynamite: 'Dinamite', jail: 'Cadeia', mustang: 'Mustang', scope: 'Mira',
  schofield: 'Schofield', remington: 'Remington', carabine: 'Carabina', winchester: 'Winchester', volcanic: 'Volcanic',
};
const RANGE = { volcanic: 1, schofield: 2, remington: 3, carabine: 4, winchester: 5 };
const WEAPONS = Object.keys(RANGE);
const BLUE = ['barrel', 'dynamite', 'jail', 'mustang', 'scope', ...WEAPONS];

const rr = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const DECK = [];
const add = (type, suit, ranks) => { for (const r of ranks) DECK.push({ type, suit, rank: r }); };
add('bang', 'S', [14]); add('bang', 'D', rr(2, 14)); add('bang', 'C', rr(2, 9)); add('bang', 'H', [12, 13, 14]);
add('missed', 'S', rr(2, 8)); add('missed', 'C', rr(10, 14));
add('beer', 'H', rr(6, 11)); add('saloon', 'H', [5]); add('stagecoach', 'S', [9, 9]); add('wells', 'H', [3]);
add('store', 'C', [9]); add('store', 'S', [12]); add('gatling', 'H', [10]); add('indians', 'D', [13, 14]);
add('duel', 'D', [12]); add('duel', 'S', [11]); add('duel', 'C', [8]);
add('panic', 'H', [14, 11, 12]); add('panic', 'D', [8]); add('balou', 'H', [13]); add('balou', 'D', [9, 10, 11]);
add('barrel', 'S', [12, 13]); add('dynamite', 'H', [2]); add('jail', 'S', [11, 10]); add('jail', 'H', [4]);
add('mustang', 'H', [8, 9]); add('scope', 'S', [14]); add('schofield', 'C', [11, 12]); add('schofield', 'S', [13]);
add('remington', 'C', [13]); add('carabine', 'C', [14]); add('winchester', 'S', [8]); add('volcanic', 'S', [10]); add('volcanic', 'C', [10]);
const CARD_COUNT = DECK.length; // 80

const CHARS = [
  { id: 'bart', name: 'Bart Cassidy', hp: 4, text: 'Compra 1 carta cada vez que perde 1 vida.' },
  { id: 'blackjack', name: 'Black Jack', hp: 4, text: 'Ao comprar, mostra a 2ª carta; se for de copas ou ouros, compra mais 1.' },
  { id: 'janet', name: 'Calamity Janet', hp: 4, text: 'Usa BANG! como Errou! e Errou! como BANG!.' },
  { id: 'gringo', name: 'El Gringo', hp: 3, text: 'Quando um jogador lhe tira vida, pega 1 carta da mão dele.' },
  { id: 'jesse', name: 'Jesse Jones', hp: 4, text: 'Pode comprar a 1ª carta da mão de outro jogador.' },
  { id: 'jourdonnais', name: 'Jourdonnais', hp: 4, text: 'Tem um Barril permanente.' },
  { id: 'kit', name: 'Kit Carlson', hp: 4, text: 'Vê 3 cartas do baralho, fica com 2 e devolve 1 ao topo.' },
  { id: 'lucky', name: 'Lucky Duke', hp: 4, text: 'Nos sorteios, revela 2 cartas e escolhe qual vale.' },
  { id: 'paul', name: 'Paul Regret', hp: 3, text: 'Mustang permanente: os outros o veem a +1 de distância.' },
  { id: 'pedro', name: 'Pedro Ramirez', hp: 4, text: 'Pode comprar a 1ª carta do topo do descarte.' },
  { id: 'rose', name: 'Rose Doolan', hp: 4, text: 'Mira permanente: vê os outros a -1 de distância.' },
  { id: 'sid', name: 'Sid Ketchum', hp: 4, text: 'Descarta 2 cartas para recuperar 1 vida.' },
  { id: 'slab', name: 'Slab the Killer', hp: 4, text: 'Os BANG! dele exigem 2 Errou!.' },
  { id: 'suzy', name: 'Suzy Lafayette', hp: 4, text: 'Sempre que ficar sem cartas na mão, compra 1.' },
  { id: 'vulture', name: 'Vulture Sam', hp: 4, text: 'Fica com as cartas de todo jogador eliminado.' },
  { id: 'willy', name: 'Willy the Kid', hp: 4, text: 'Pode jogar quantos BANG! quiser por turno.' },
];
const ROLES = { 4: ['sheriff', 'renegade', 'outlaw', 'outlaw'], 5: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'deputy'], 6: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'outlaw', 'deputy'], 7: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'outlaw', 'deputy', 'deputy'] };
const ROLE_NAME = { sheriff: 'Xerife', deputy: 'Delegado', outlaw: 'Fora-da-lei', renegade: 'Renegado' };

const rng = {
  int(n) {
    const c = globalThis.crypto;
    if (c && c.getRandomValues) {
      const limit = Math.floor(0x100000000 / n) * n;
      const buf = new Uint32Array(1);
      do c.getRandomValues(buf); while (buf[0] >= limit);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  },
};
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const typeOf = (id) => DECK[id].type;
const info = (id) => ({ id, type: DECK[id].type, suit: DECK[id].suit, rank: DECK[id].rank });
const isWeapon = (t) => WEAPONS.includes(t);

function lobbyState(players = 0) {
  return { phase: 'lobby', players };
}
const setup = () => lobbyState(0);
const acceptsSeat = (s) => s.phase === 'lobby';
const seatJoined = (s, seat) => (s.phase === 'lobby' ? { ...s, players: Math.max(s.players, seat + 1) } : s);

/* ---------- auxiliares ---------- */
const aliveSeats = (s) => s.alive.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
function nextAliveFrom(s, from) {
  let n = from;
  do n = (n + 1) % s.players; while (!s.alive[n]);
  return n;
}
function log(s, text) {
  s.log = s.log.concat([text]).slice(-MAX_LOG);
}
const cardName = (id) => `${NAME[typeOf(id)]} (${DECK[id].rank === 14 ? 'A' : DECK[id].rank === 13 ? 'K' : DECK[id].rank === 12 ? 'Q' : DECK[id].rank === 11 ? 'J' : DECK[id].rank}${{ S: '♠', H: '♥', D: '♦', C: '♣' }[DECK[id].suit]})`;

function drawCard(s) {
  if (!s.deck.length && s.discard.length) {
    s.deck = shuffle(s.discard);
    s.discard = [];
  }
  return s.deck.length ? s.deck.pop() : null;
}
function giveCards(s, seat, n) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    const c = drawCard(s);
    if (c === null) break;
    s.hands[seat].push(c);
    got++;
  }
  return got;
}
const tableHas = (s, seat, type) => s.table[seat].find((id) => typeOf(id) === type);
const hasMustang = (s, seat) => s.chars[seat] === 'paul' || tableHas(s, seat, 'mustang') !== undefined;
const hasScope = (s, seat) => s.chars[seat] === 'rose' || tableHas(s, seat, 'scope') !== undefined;
function weaponRange(s, seat) {
  const w = s.table[seat].find((id) => isWeapon(typeOf(id)));
  return w === undefined ? 1 : RANGE[typeOf(w)];
}
function dist(s, a, b) {
  const list = aliveSeats(s);
  const ia = list.indexOf(a);
  const ib = list.indexOf(b);
  const n = list.length;
  const cw = (ib - ia + n) % n;
  let d = Math.min(cw, n - cw);
  if (hasMustang(s, b)) d += 1;
  if (hasScope(s, a)) d -= 1;
  return Math.max(1, d);
}
const unlimitedBang = (s, seat) => s.chars[seat] === 'willy' || tableHas(s, seat, 'volcanic') !== undefined;
const isBangCard = (s, seat, id) => typeOf(id) === 'bang' || (s.chars[seat] === 'janet' && typeOf(id) === 'missed');
const isMissedCard = (s, seat, id) => typeOf(id) === 'missed' || (s.chars[seat] === 'janet' && typeOf(id) === 'bang');

function removeFromHand(s, seat, id) {
  const i = s.hands[seat].indexOf(id);
  if (i < 0) return false;
  s.hands[seat].splice(i, 1);
  return true;
}
function discardFromHand(s, seat, id) {
  if (!removeFromHand(s, seat, id)) return false;
  s.discard.push(id);
  return true;
}

// "Comprar!": revela carta(s) do baralho. Lucky Duke revela 2 e ESCOLHE qual vale (passo 'lucky').
const isHeart = (c) => c.suit === 'H';
const safeFromDynamite = (c) => !(c.suit === 'S' && c.rank >= 2 && c.rank <= 9);
const GOOD = { barrel: isHeart, jail: isHeart, dyn: safeFromDynamite };
const FLIP_WHY = { barrel: 'o Barril', jail: 'a Cadeia', dyn: 'a Dinamite' };

function flip(s, seat, kind, ctx) {
  const n = s.chars[seat] === 'lucky' ? 2 : 1;
  const cards = [];
  for (let i = 0; i < n; i++) {
    const c = drawCard(s);
    if (c !== null) cards.push(c);
  }
  if (cards.length === 2) {
    s.step = { k: 'lucky', seat, cards, kind, ctx };
    return null;
  }
  return finishFlip(s, seat, kind, cards, ctx);
}

function finishFlip(s, seat, kind, cards, ctx, chosen) {
  const good = GOOD[kind];
  const ok = chosen !== undefined ? good(DECK[chosen]) : cards.some((c) => good(DECK[c]));
  s.discard.push(...cards);
  log(s, `@${seat} comprou para ${FLIP_WHY[kind]}: ${cards.map(cardName).join(' e ')} (${ok ? 'deu certo' : 'não deu'}).`);
  s.step = null;
  return afterFlip(s, seat, kind, ok, ctx);
}

function afterFlip(s, seat, kind, ok, ctx) {
  if (kind === 'barrel') {
    let need = ctx.need;
    if (ok) need -= 1;
    const left = ctx.left - 1;
    if (need <= 0) {
      log(s, `@${ctx.target} se salvou com o Barril.`);
      return nextInQueue(s, { kind: ctx.kind, src: ctx.src, rest: ctx.rest });
    }
    return attackBarrels(s, ctx.src, ctx.target, need, ctx.kind, ctx.rest, left);
  }
  if (kind === 'dyn') {
    const dyn = ctx.dyn;
    s.table[seat].splice(s.table[seat].indexOf(dyn), 1);
    if (ok) {
      const next = nextAliveFrom(s, seat);
      s.table[next].push(dyn);
      log(s, `A Dinamite passou para @${next}.`);
      return doJail(s);
    }
    s.discard.push(dyn);
    log(s, `A Dinamite explodiu em @${seat}!`);
    return lose(s, seat, 3, null, { k: 'jail' });
  }
  // jail
  if (!ok) {
    log(s, `@${seat} continua preso e perde a vez.`);
    return nextTurn(s);
  }
  log(s, `@${seat} saiu da Cadeia.`);
  s.stage = 'draw';
  return null;
}
function suzyFix(s) {
  for (let i = 0; i < s.players; i++) {
    if (s.alive[i] && s.chars[i] === 'suzy' && s.hands[i].length === 0) giveCards(s, i, 1);
  }
}

/* ---------- fim de jogo e eliminacoes ---------- */
function checkWin(s) {
  const sheriff = s.roles.indexOf('sheriff');
  const left = aliveSeats(s);
  if (!s.alive[sheriff]) {
    s.winner = left.length === 1 && s.roles[left[0]] === 'renegade' ? 'renegade' : 'outlaws';
  } else if (!left.some((i) => s.roles[i] === 'outlaw' || s.roles[i] === 'renegade')) {
    s.winner = 'sheriff';
  }
  if (s.winner) {
    s.phase = 'ended';
    s.step = null;
    log(s, `Fim de jogo: ${s.winner === 'sheriff' ? 'o Xerife e os Delegados' : s.winner === 'outlaws' ? 'os Fora-da-lei' : 'o Renegado'} venceram!`);
  }
}

function eliminate(s, v, killer) {
  s.alive[v] = false;
  s.hp[v] = 0;
  log(s, `@${v} foi eliminado (${ROLE_NAME[s.roles[v]]}).`);
  const cards = [...s.hands[v], ...s.table[v]];
  s.hands[v] = [];
  s.table[v] = [];
  const vulture = s.chars.findIndex((c, i) => c === 'vulture' && s.alive[i]);
  if (vulture >= 0) s.hands[vulture].push(...cards);
  else s.discard.push(...cards);
  if (killer !== null && killer !== undefined && killer !== v && s.alive[killer]) {
    if (s.roles[v] === 'outlaw') {
      giveCards(s, killer, 3);
      log(s, `@${killer} comprou 3 cartas por eliminar um Fora-da-lei.`);
    } else if (s.roles[v] === 'deputy' && s.roles[killer] === 'sheriff') {
      s.discard.push(...s.hands[killer], ...s.table[killer]);
      s.hands[killer] = [];
      s.table[killer] = [];
      log(s, `@${killer} eliminou um Delegado e descartou todas as cartas.`);
    }
  }
  checkWin(s);
}

/* ---------- dano e salvamento ---------- */
function canRescue(s, v) {
  const need = 1 - s.hp[v];
  const beers = s.hands[v].filter((id) => typeOf(id) === 'beer').length;
  const beerHeal = aliveSeats(s).length > 2 ? beers : 0;
  const sidHeal = s.chars[v] === 'sid' ? Math.floor((s.hands[v].length - beerHeal) / 2) : 0;
  return beerHeal + sidHeal >= need;
}

function survive(s, v, n, src) {
  if (s.chars[v] === 'bart') {
    giveCards(s, v, n);
    log(s, `@${v} comprou ${n} carta${n > 1 ? 's' : ''} (Bart Cassidy).`);
  }
  if (s.chars[v] === 'gringo' && src !== null && src !== undefined && src !== v && s.alive[src]) {
    for (let i = 0; i < n && s.hands[src].length; i++) {
      const k = rng.int(s.hands[src].length);
      s.hands[v].push(s.hands[src].splice(k, 1)[0]);
    }
    log(s, `@${v} pegou carta(s) de @${src} (El Gringo).`);
  }
}

function lose(s, v, n, src, after) {
  s.hp[v] -= n;
  log(s, `@${v} perdeu ${n} vida${n > 1 ? 's' : ''}.`);
  if (s.hp[v] <= 0) {
    if (canRescue(s, v)) {
      s.step = { k: 'dying', seat: v, src: src === undefined ? null : src, lost: n, after };
      return;
    }
    eliminate(s, v, src);
    return resume(s, after);
  }
  survive(s, v, n, src);
  return resume(s, after);
}

function afterRescue(s, step) {
  const v = step.seat;
  if (s.hp[v] >= 1) {
    survive(s, v, step.lost, step.src);
    return resume(s, step.after);
  }
  if (!canRescue(s, v)) {
    eliminate(s, v, step.src);
    return resume(s, step.after);
  }
  return null;
}

function resume(s, after) {
  s.step = null;
  if (s.phase !== 'playing') return null;
  if (after && after.k === 'queue') return nextInQueue(s, after);
  if (after && after.k === 'jail') return doJail(s);
  return null;
}

/* ---------- ataques ---------- */
function nextInQueue(s, q) {
  const rest = (q.rest || []).slice();
  while (rest.length) {
    const t = rest.shift();
    if (s.alive[t]) return attack(s, q.src, t, 1, q.kind, rest);
  }
  s.step = null;
  return null;
}

function attack(s, src, target, need, kind, rest) {
  if (!s.alive[target]) return nextInQueue(s, { kind, src, rest });
  if (kind === 'indians') {
    s.step = { k: 'indians', src, target, need, kind, rest };
    return null;
  }
  const barrels = (tableHas(s, target, 'barrel') !== undefined ? 1 : 0) + (s.chars[target] === 'jourdonnais' ? 1 : 0);
  return attackBarrels(s, src, target, need, kind, rest, barrels);
}

// Tenta os Barris que restam (`left`) antes de abrir a janela de resposta do alvo.
function attackBarrels(s, src, target, need, kind, rest, left) {
  if (left > 0 && need > 0) return flip(s, target, 'barrel', { src, target, need, kind, rest, left });
  s.step = { k: 'bang', src, target, need, kind, rest };
  return null;
}

/* ---------- inicio do turno ---------- */
function beginTurn(s) {
  s.banged = false;
  s.stage = 'start';
  s.step = null;
  log(s, `Vez de @${s.turn}.`);
  doDynamite(s);
}

function nextTurn(s) {
  s.turn = nextAliveFrom(s, s.turn);
  beginTurn(s);
}

function doDynamite(s) {
  const t = s.turn;
  const dyn = tableHas(s, t, 'dynamite');
  if (dyn === undefined) return doJail(s);
  return flip(s, t, 'dyn', { dyn });
}

function doJail(s) {
  const t = s.turn;
  if (s.phase !== 'playing') return null;
  if (!s.alive[t]) return nextTurn(s);
  const jail = tableHas(s, t, 'jail');
  if (jail !== undefined) {
    s.table[t].splice(s.table[t].indexOf(jail), 1);
    s.discard.push(jail);
    return flip(s, t, 'jail', {});
  }
  s.stage = 'draw';
  return null;
}

/* ---------- criacao ---------- */
function deal(prev) {
  const players = prev.players;
  const roles = shuffle(ROLES[players].slice());
  const chars = shuffle(CHARS.map((c) => c.id)).slice(0, players);
  const max = chars.map((id, i) => CHARS.find((c) => c.id === id).hp + (roles[i] === 'sheriff' ? 1 : 0));
  const s = {
    phase: 'playing',
    players,
    roles,
    chars,
    hp: max.slice(),
    max,
    alive: new Array(players).fill(true),
    hands: Array.from({ length: players }, () => []),
    table: Array.from({ length: players }, () => []),
    deck: shuffle(Array.from({ length: CARD_COUNT }, (_, i) => i)),
    discard: [],
    turn: roles.indexOf('sheriff'),
    stage: 'start',
    banged: false,
    step: null,
    winner: null,
    log: [],
  };
  for (let i = 0; i < players; i++) giveCards(s, i, max[i] - (roles[i] === 'sheriff' ? 1 : 0));
  log(s, 'A partida começou. O Xerife joga primeiro.');
  beginTurn(s);
  return s;
}

const restart = (state) => (state.players >= MIN_PLAYERS ? deal(state) : state);

/* ---------- opcoes de jogada ---------- */
function targetsFor(s, seat, id) {
  const type = typeOf(id);
  const others = aliveSeats(s).filter((i) => i !== seat);
  const asBang = type === 'bang' || (s.chars[seat] === 'janet' && type === 'missed');
  if (asBang) {
    if (s.banged && !unlimitedBang(s, seat)) return [];
    const range = weaponRange(s, seat);
    return others.filter((i) => dist(s, seat, i) <= range);
  }
  if (type === 'panic') return others.filter((i) => dist(s, seat, i) <= 1 && (s.hands[i].length || s.table[i].length));
  if (type === 'balou') return others.filter((i) => s.hands[i].length || s.table[i].length);
  if (type === 'duel') return others;
  if (type === 'jail') return others.filter((i) => s.roles[i] !== 'sheriff' && tableHas(s, i, 'jail') === undefined);
  return null;
}

function options(s, seat, id) {
  const type = typeOf(id);
  const t = targetsFor(s, seat, id);
  if (t !== null) return { ok: t.length > 0, targets: t, pick: type === 'panic' || type === 'balou' };
  if (type === 'beer') return { ok: s.hp[seat] < s.max[seat] && aliveSeats(s).length > 2 };
  if (type === 'saloon') return { ok: s.hp.some((h, i) => s.alive[i] && h < s.max[i]) };
  if (type === 'missed') return { ok: false };
  if (BLUE.includes(type)) return { ok: tableHas(s, seat, type) === undefined || isWeapon(type) };
  return { ok: true };
}

/* ---------- jogadas ---------- */
function finish(s) {
  if (s.phase === 'playing') {
    suzyFix(s);
    if (!s.step && !s.alive[s.turn]) nextTurn(s);
  }
  return { state: s };
}

function playCard(s, seat, req) {
  const id = req.card;
  if (!Number.isInteger(id) || !s.hands[seat].includes(id)) return { error: 'Você não tem essa carta.' };
  const type = typeOf(id);
  const opt = options(s, seat, id);
  let play = type;
  if (s.chars[seat] === 'janet' && type === 'missed') play = 'bang';
  if (!opt.ok && !(play === 'bang' && opt.targets && opt.targets.length)) {
    if (type === 'missed' && play !== 'bang') return { error: 'O Errou! só é usado em resposta a um BANG!.' };
    if (type === 'beer') return { error: aliveSeats(s).length <= 2 ? 'Com 2 jogadores a Cerveja não tem efeito.' : 'Sua vida já está no máximo.' };
    return { error: 'Essa carta não pode ser jogada agora.' };
  }
  const targets = targetsFor(s, seat, id);
  if (targets !== null && (!Number.isInteger(req.target) || !targets.includes(req.target))) return { error: 'Escolha um alvo válido (alcance e distância contam).' };

  if (play === 'bang') {
    discardFromHand(s, seat, id);
    s.banged = true;
    log(s, `@${seat} atirou em @${req.target} (BANG!).`);
    attack(s, seat, req.target, s.chars[seat] === 'slab' ? 2 : 1, 'bang', []);
    return finish(s);
  }
  if (type === 'panic' || type === 'balou') {
    const v = req.target;
    let pickId;
    if (req.pick === 'hand') {
      if (!s.hands[v].length) return { error: 'Esse jogador não tem cartas na mão.' };
      pickId = s.hands[v][rng.int(s.hands[v].length)];
      s.hands[v].splice(s.hands[v].indexOf(pickId), 1);
    } else {
      if (!Number.isInteger(req.pick) || !s.table[v].includes(req.pick)) return { error: 'Escolha a carta da mesa ou da mão.' };
      pickId = req.pick;
      s.table[v].splice(s.table[v].indexOf(pickId), 1);
    }
    discardFromHand(s, seat, id);
    if (type === 'panic') {
      s.hands[seat].push(pickId);
      log(s, `@${seat} usou Pânico! e pegou ${req.pick === 'hand' ? 'uma carta da mão' : cardName(pickId)} de @${v}.`);
    } else {
      s.discard.push(pickId);
      log(s, `@${seat} usou Cat Balou: @${v} descartou ${req.pick === 'hand' ? 'uma carta da mão' : cardName(pickId)}.`);
    }
    return finish(s);
  }
  discardFromHand(s, seat, id);
  switch (type) {
    case 'beer':
      s.hp[seat] += 1;
      log(s, `@${seat} tomou uma Cerveja.`);
      break;
    case 'saloon':
      aliveSeats(s).forEach((i) => { if (s.hp[i] < s.max[i]) s.hp[i] += 1; });
      log(s, `@${seat} abriu o Saloon: todos recuperam 1 vida.`);
      break;
    case 'stagecoach':
      giveCards(s, seat, 2);
      log(s, `@${seat} comprou 2 cartas (Diligência).`);
      break;
    case 'wells':
      giveCards(s, seat, 3);
      log(s, `@${seat} comprou 3 cartas (Wells Fargo).`);
      break;
    case 'store': {
      const queue = [];
      for (let i = 0, p = seat; i < aliveSeats(s).length; i++, p = nextAliveFrom(s, p)) queue.push(p);
      const cards = [];
      for (let i = 0; i < queue.length; i++) {
        const c = drawCard(s);
        if (c !== null) cards.push(c);
      }
      log(s, `@${seat} abriu o Armazém.`);
      s.step = { k: 'store', cards, queue };
      break;
    }
    case 'gatling': {
      const rest = [];
      for (let p = nextAliveFrom(s, seat); p !== seat; p = nextAliveFrom(s, p)) rest.push(p);
      log(s, `@${seat} disparou a Gatling.`);
      nextInQueue(s, { kind: 'gatling', src: seat, rest });
      break;
    }
    case 'indians': {
      const rest = [];
      for (let p = nextAliveFrom(s, seat); p !== seat; p = nextAliveFrom(s, p)) rest.push(p);
      log(s, `@${seat} chamou os Índios!.`);
      nextInQueue(s, { kind: 'indians', src: seat, rest });
      break;
    }
    case 'duel':
      log(s, `@${seat} desafiou @${req.target} para um Duelo.`);
      s.step = { k: 'duel', a: seat, b: req.target, turn: req.target };
      break;
    case 'jail':
      s.table[req.target].push(id);
      s.discard.pop();
      log(s, `@${seat} prendeu @${req.target} na Cadeia.`);
      break;
    default:
      if (BLUE.includes(type)) {
        s.discard.pop();
        if (isWeapon(type)) {
          const old = s.table[seat].find((c) => isWeapon(typeOf(c)));
          if (old !== undefined) {
            s.table[seat].splice(s.table[seat].indexOf(old), 1);
            s.discard.push(old);
          }
        }
        s.table[seat].push(id);
        log(s, `@${seat} colocou ${NAME[type]} na mesa.`);
      }
  }
  return finish(s);
}

function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    if (state.players < MIN_PLAYERS) return { error: `São necessários pelo menos ${MIN_PLAYERS} jogadores.` };
    return { state: deal(state) };
  }
  if (state.phase !== 'playing') return { error: 'A partida terminou. Use "Nova partida" para jogar outra.' };
  if (seat >= state.players || !state.alive[seat]) return { error: 'Você foi eliminado.' };

  const s = JSON.parse(JSON.stringify(state));
  const step = s.step;

  /* respostas */
  if (step) {
    if (step.k === 'bang') {
      if (seat !== step.target) return { error: 'Aguardando a resposta de outro jogador.' };
      if (req.t === 'missed') {
        if (!Number.isInteger(req.card) || !s.hands[seat].includes(req.card) || !isMissedCard(s, seat, req.card)) return { error: 'Use um Errou!.' };
        discardFromHand(s, seat, req.card);
        step.need -= 1;
        log(s, `@${seat} usou Errou!.`);
        if (step.need <= 0) nextInQueue(s, step);
        return finish(s);
      }
      if (req.t === 'pass') {
        lose(s, seat, 1, step.src, { k: 'queue', kind: step.kind, src: step.src, rest: step.rest });
        return finish(s);
      }
      return { error: 'Responda com Errou! ou aceite o tiro.' };
    }
    if (step.k === 'indians') {
      if (seat !== step.target) return { error: 'Aguardando a resposta de outro jogador.' };
      if (req.t === 'bang') {
        if (!Number.isInteger(req.card) || !s.hands[seat].includes(req.card) || !isBangCard(s, seat, req.card)) return { error: 'Use um BANG!.' };
        discardFromHand(s, seat, req.card);
        log(s, `@${seat} descartou um BANG! contra os Índios.`);
        nextInQueue(s, step);
        return finish(s);
      }
      if (req.t === 'pass') {
        lose(s, seat, 1, step.src, { k: 'queue', kind: 'indians', src: step.src, rest: step.rest });
        return finish(s);
      }
      return { error: 'Descarte um BANG! ou perca 1 vida.' };
    }
    if (step.k === 'duel') {
      if (seat !== step.turn) return { error: 'Aguardando o outro jogador do Duelo.' };
      if (req.t === 'bang') {
        if (!Number.isInteger(req.card) || !s.hands[seat].includes(req.card) || !isBangCard(s, seat, req.card)) return { error: 'Use um BANG!.' };
        discardFromHand(s, seat, req.card);
        step.turn = seat === step.a ? step.b : step.a;
        log(s, `@${seat} respondeu ao Duelo com um BANG!.`);
        return finish(s);
      }
      if (req.t === 'pass') {
        const other = seat === step.a ? step.b : step.a;
        log(s, `@${seat} perdeu o Duelo.`);
        lose(s, seat, 1, other, { k: 'play' });
        return finish(s);
      }
      return { error: 'Responda com BANG! ou perca o Duelo.' };
    }
    if (step.k === 'store') {
      if (seat !== step.queue[0]) return { error: 'Aguardando outro jogador escolher.' };
      if (req.t !== 'pick' || !step.cards.includes(req.card)) return { error: 'Escolha uma das cartas reveladas.' };
      step.cards.splice(step.cards.indexOf(req.card), 1);
      s.hands[seat].push(req.card);
      step.queue.shift();
      log(s, `@${seat} pegou ${cardName(req.card)} do Armazém.`);
      if (!step.queue.length) {
        s.discard.push(...step.cards);
        s.step = null;
      }
      return finish(s);
    }
    if (step.k === 'kit') {
      if (seat !== step.seat) return { error: 'Aguardando Kit Carlson.' };
      if (req.t !== 'kitPut' || !step.cards.includes(req.card)) return { error: 'Escolha a carta que volta ao topo do baralho.' };
      for (const c of step.cards) if (c !== req.card) s.hands[seat].push(c);
      s.deck.push(req.card);
      s.step = null;
      s.stage = 'play';
      log(s, `@${seat} ficou com 2 cartas e devolveu 1 ao baralho.`);
      return finish(s);
    }
    if (step.k === 'lucky') {
      if (seat !== step.seat) return { error: 'Aguardando Lucky Duke escolher.' };
      if (req.t !== 'luckyPick' || !step.cards.includes(req.card)) return { error: 'Escolha uma das duas cartas reveladas.' };
      finishFlip(s, seat, step.kind, step.cards, step.ctx, req.card);
      return finish(s);
    }
    if (step.k === 'dying') {
      if (seat !== step.seat) return { error: 'Aguardando o jogador ferido.' };
      if (req.t === 'giveup') {
        eliminate(s, seat, step.src);
        resume(s, step.after);
        return finish(s);
      }
      if (req.t === 'beer') {
        if (aliveSeats(s).length <= 2) return { error: 'Com 2 jogadores a Cerveja não tem efeito.' };
        if (!Number.isInteger(req.card) || !s.hands[seat].includes(req.card) || typeOf(req.card) !== 'beer') return { error: 'Use uma Cerveja.' };
        discardFromHand(s, seat, req.card);
        s.hp[seat] += 1;
        log(s, `@${seat} tomou uma Cerveja para sobreviver.`);
        afterRescue(s, step);
        return finish(s);
      }
      if (req.t === 'sid' && s.chars[seat] === 'sid') {
        const c = req.cards;
        if (!Array.isArray(c) || c.length !== 2 || c[0] === c[1] || !c.every((x) => s.hands[seat].includes(x))) return { error: 'Escolha 2 cartas da mão.' };
        c.forEach((x) => discardFromHand(s, seat, x));
        s.hp[seat] += 1;
        log(s, `@${seat} descartou 2 cartas para recuperar 1 vida (Sid Ketchum).`);
        afterRescue(s, step);
        return finish(s);
      }
      return { error: 'Use uma Cerveja ou desista.' };
    }
  }

  if (seat !== s.turn) return { error: 'Não é a sua vez.' };

  /* compra */
  if (s.stage === 'draw') {
    if (req.t !== 'draw') return { error: 'Compre as cartas do turno.' };
    const ch = s.chars[seat];
    const src = req.src === undefined ? 'deck' : req.src;
    if (ch === 'kit') {
      const cards = [];
      for (let i = 0; i < 3; i++) {
        const c = drawCard(s);
        if (c !== null) cards.push(c);
      }
      if (cards.length < 3) {
        s.hands[seat].push(...cards);
        s.stage = 'play';
        return finish(s);
      }
      s.step = { k: 'kit', seat, cards };
      return finish(s);
    }
    let first = null;
    if (ch === 'jesse' && Number.isInteger(src)) {
      if (src === seat || !s.alive[src] || !s.hands[src].length) return { error: 'Escolha outro jogador que tenha cartas na mão.' };
      const k = rng.int(s.hands[src].length);
      first = s.hands[src].splice(k, 1)[0];
      log(s, `@${seat} comprou uma carta da mão de @${src}.`);
    } else if (ch === 'pedro' && src === 'discard') {
      if (!s.discard.length) return { error: 'O descarte está vazio.' };
      first = s.discard.pop();
      log(s, `@${seat} comprou ${cardName(first)} do descarte.`);
    } else if (src !== 'deck') {
      return { error: 'Origem de compra inválida.' };
    }
    if (first !== null) s.hands[seat].push(first);
    else giveCards(s, seat, 1);
    if (ch === 'blackjack') {
      const c = drawCard(s);
      if (c !== null) {
        s.hands[seat].push(c);
        log(s, `@${seat} mostrou a 2ª carta: ${cardName(c)}.`);
        if (DECK[c].suit === 'H' || DECK[c].suit === 'D') giveCards(s, seat, 1);
      }
    } else giveCards(s, seat, 1);
    s.stage = 'play';
    return finish(s);
  }
  if (s.stage !== 'play') return { error: 'Aguarde.' };

  if (req.t === 'play') return playCard(s, seat, req);

  if (req.t === 'sid') {
    if (s.chars[seat] !== 'sid') return { error: 'Só o Sid Ketchum faz isso.' };
    const c = req.cards;
    if (s.hp[seat] >= s.max[seat]) return { error: 'Sua vida já está no máximo.' };
    if (!Array.isArray(c) || c.length !== 2 || c[0] === c[1] || !c.every((x) => s.hands[seat].includes(x))) return { error: 'Escolha 2 cartas da mão.' };
    c.forEach((x) => discardFromHand(s, seat, x));
    s.hp[seat] += 1;
    log(s, `@${seat} descartou 2 cartas para recuperar 1 vida (Sid Ketchum).`);
    return finish(s);
  }

  if (req.t === 'discard') {
    if (s.hands[seat].length <= s.hp[seat]) return { error: 'Você só descarta o que passar do limite de cartas.' };
    if (!discardFromHand(s, seat, req.card)) return { error: 'Você não tem essa carta.' };
    return finish(s);
  }

  if (req.t === 'end') {
    if (s.hands[seat].length > s.hp[seat]) return { error: `Descarte até ficar com ${s.hp[seat]} carta${s.hp[seat] === 1 ? '' : 's'}.` };
    nextTurn(s);
    return finish(s);
  }

  return { error: 'Jogada inválida.' };
}

/* ---------- visoes ---------- */
function publicStep(s) {
  const st = s.step;
  if (!st) return null;
  if (st.k === 'bang' || st.k === 'indians') return { k: st.k, src: st.src, target: st.target, need: st.need, kind: st.kind, waiting: [st.target] };
  if (st.k === 'duel') return { k: 'duel', a: st.a, b: st.b, waiting: [st.turn] };
  if (st.k === 'store') return { k: 'store', cards: st.cards.map(info), waiting: [st.queue[0]] };
  if (st.k === 'kit') return { k: 'kit', seat: st.seat, waiting: [st.seat] };
  if (st.k === 'lucky') return { k: 'lucky', seat: st.seat, kind: st.kind, cards: st.cards.map(info), waiting: [st.seat] };
  return { k: 'dying', seat: st.seat, src: st.src, waiting: [st.seat] };
}

function view(state) {
  if (state.phase === 'lobby') return { phase: 'lobby', players: state.players, turn: null, draw: false, over: false };
  const ended = state.phase === 'ended';
  return {
    phase: state.phase,
    players: state.players,
    turn: state.phase === 'playing' ? state.turn : null,
    stage: state.stage,
    banged: state.banged,
    seats: state.chars.map((ch, i) => ({
      char: ch,
      hp: state.hp[i],
      max: state.max[i],
      hand: state.hands[i].length,
      table: state.table[i].map(info),
      alive: state.alive[i],
      role: ended || !state.alive[i] || state.roles[i] === 'sheriff' ? state.roles[i] : null,
      range: weaponRange(state, i),
    })),
    step: publicStep(state),
    deck: state.deck.length,
    top: state.discard.length ? info(state.discard[state.discard.length - 1]) : null,
    winner: state.winner,
    log: state.log,
    draw: false,
    over: ended,
  };
}

function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby' || seat >= state.players) return null;
  const s = state;
  const out = { role: s.roles[seat], char: s.chars[seat], alive: s.alive[seat], hand: s.hands[seat].map(info), dist: [], mode: 'wait' };
  if (s.phase !== 'playing' || !s.alive[seat]) return out;
  out.dist = s.alive.map((a, i) => (a && i !== seat ? dist(s, seat, i) : 0));
  const st = s.step;
  if (st) {
    if (st.k === 'bang' && st.target === seat) {
      out.mode = 'respond';
      out.respond = { k: 'bang', need: st.need, src: st.src, cards: s.hands[seat].filter((id) => isMissedCard(s, seat, id)) };
    } else if (st.k === 'indians' && st.target === seat) {
      out.mode = 'respond';
      out.respond = { k: 'indians', src: st.src, cards: s.hands[seat].filter((id) => isBangCard(s, seat, id)) };
    } else if (st.k === 'duel' && st.turn === seat) {
      out.mode = 'respond';
      out.respond = { k: 'duel', other: seat === st.a ? st.b : st.a, cards: s.hands[seat].filter((id) => isBangCard(s, seat, id)) };
    } else if (st.k === 'store' && st.queue[0] === seat) out.mode = 'store';
    else if (st.k === 'kit' && st.seat === seat) {
      out.mode = 'kit';
      out.kit = st.cards.map(info);
    } else if (st.k === 'lucky' && st.seat === seat) {
      out.mode = 'lucky';
      out.lucky = { kind: st.kind, cards: st.cards.map(info) };
    } else if (st.k === 'dying' && st.seat === seat) {
      out.mode = 'dying';
      out.dying = { need: 1 - s.hp[seat], beers: s.hands[seat].filter((id) => typeOf(id) === 'beer' && aliveSeats(s).length > 2), sid: s.chars[seat] === 'sid' };
    }
    return out;
  }
  if (s.turn !== seat) return out;
  if (s.stage === 'draw') {
    out.mode = 'draw';
    out.draw = { discard: s.chars[seat] === 'pedro' && s.discard.length > 0, hands: s.chars[seat] === 'jesse' ? aliveSeats(s).filter((i) => i !== seat && s.hands[i].length) : [] };
    return out;
  }
  out.mode = 'play';
  out.hand = s.hands[seat].map((id) => ({ ...info(id), ...options(s, seat, id) }));
  out.over = s.hands[seat].length > s.hp[seat] ? s.hands[seat].length - s.hp[seat] : 0;
  out.sid = s.chars[seat] === 'sid' && s.hp[seat] < s.max[seat] && s.hands[seat].length >= 2;
  return out;
}

// Piloto automatico: compra, responde com Errou!/BANG! se tiver, aceita o dano, escolhe a primeira carta no Armazem
// e encerra o turno sem jogar cartas (descarta o excesso).
function waitingOn(state) {
  if (state.phase !== 'playing') return [];
  const st = state.step;
  if (st) {
    if (st.k === 'bang' || st.k === 'indians') return [st.target];
    if (st.k === 'duel') return [st.turn];
    if (st.k === 'store') return [st.queue[0]];
    return [st.seat];
  }
  return [state.turn];
}

function autoMove(state, seat) {
  const st = state.step;
  const hand = state.hands[seat];
  if (st) {
    if (st.k === 'bang') {
      const c = hand.find((id) => isMissedCard(state, seat, id));
      return c !== undefined ? { t: 'missed', card: c } : { t: 'pass' };
    }
    if (st.k === 'indians' || st.k === 'duel') {
      const c = hand.find((id) => isBangCard(state, seat, id));
      return c !== undefined ? { t: 'bang', card: c } : { t: 'pass' };
    }
    if (st.k === 'store') return { t: 'pick', card: st.cards[0] };
    if (st.k === 'kit') return { t: 'kitPut', card: st.cards[st.cards.length - 1] };
    if (st.k === 'lucky') {
      const good = GOOD[st.kind];
      const c = st.cards.find((id) => good(DECK[id]));
      return { t: 'luckyPick', card: c !== undefined ? c : st.cards[0] };
    }
    if (st.k === 'dying') {
      const beer = aliveSeats(state).length > 2 ? hand.find((id) => typeOf(id) === 'beer') : undefined;
      if (beer !== undefined) return { t: 'beer', card: beer };
      if (state.chars[seat] === 'sid' && hand.length >= 2) return { t: 'sid', cards: [hand[0], hand[1]] };
      return { t: 'giveup' };
    }
  }
  if (state.stage === 'draw') return { t: 'draw', src: 'deck' };
  if (hand.length > state.hp[seat]) return { t: 'discard', card: hand[0] };
  return { t: 'end' };
}

export default {
  id: 'bang',
  name: 'BANG!',
  description: 'BANG! (cartas): faroeste com papéis secretos: Xerife, Delegados, Fora-da-lei e Renegado. De 4 a 7 jogadores.',
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
  _DECK: DECK,
  _CHARS: CHARS,
  _NAME: NAME,
  _deal: deal,
  _dist: dist,
  _rng: rng,
};
