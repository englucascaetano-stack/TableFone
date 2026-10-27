// GERADO por scripts/build-edge.js a partir de games/coup/game.js. Nao edite.
'use strict';
// Coup, 2 a 6 jogadores. 15 cartas de personagem (3 de cada): Duque, Assassino, Capitao, Embaixador, Condessa.
// Cada jogador tem 2 cartas viradas para baixo (sua "influencia") e 2 moedas. Vence o ultimo com influencia.
//
// Acoes (uma por turno; com 10+ moedas e obrigatorio dar o Golpe):
//   Renda (+1)                      sem bloqueio nem desafio
//   Ajuda externa (+2)              qualquer jogador pode bloquear como Duque
//   Golpe (paga 7)                  alvo perde 1 influencia; sem bloqueio nem desafio
//   Taxar (Duque, +3)               pode ser desafiado
//   Assassinar (Assassino, paga 3)  alvo perde 1 influencia; pode ser desafiado; alvo bloqueia como Condessa
//   Extorquir (Capitao)             rouba ate 2 moedas do alvo; alvo bloqueia como Capitao ou Embaixador
//   Trocar (Embaixador)             compra 2 cartas e devolve ate ficar com a mesma quantidade
// Desafio: quem desafia acerta se o jogador NAO tinha o personagem (este perde 1 influencia); se tinha, o
// desafiante perde 1 influencia e o jogador troca a carta mostrada por outra do baralho. Bloqueios tambem
// podem ser desafiados. Assassinato desafiado com sucesso devolve as 3 moedas; bloqueado, elas se perdem.
// Com 2 jogadores, quem comeca tem so 1 moeda.

const CHARS = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'];
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const MAX_EVENTS = 8;

const ACTIONS = {
  income: { cost: 0, claim: null },
  foreignAid: { cost: 0, claim: null, blockedBy: ['duke'], blockers: 'any' },
  coup: { cost: 7, claim: null, target: true },
  tax: { cost: 0, claim: 'duke' },
  assassinate: { cost: 3, claim: 'assassin', target: true, blockedBy: ['contessa'], blockers: 'target' },
  steal: { cost: 0, claim: 'captain', target: true, blockedBy: ['captain', 'ambassador'], blockers: 'target' },
  exchange: { cost: 0, claim: 'ambassador' },
};

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
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const newDeck = () => shuffle(CHARS.flatMap((c) => [c, c, c]));

function lobbyState(players = 0) {
  return { phase: 'lobby', players, hands: [], revealed: [], coins: [], deck: [], turn: 0, step: null, act: null, winner: null, events: [] };
}

const setup = () => lobbyState(0);
const acceptsSeat = (s) => s.phase === 'lobby';
const seatJoined = (s, seat) => (s.phase === 'lobby' ? { ...s, players: Math.max(s.players, seat + 1) } : s);

function deal(players) {
  const deck = newDeck();
  const hands = [];
  for (let i = 0; i < players; i++) hands.push([deck.pop(), deck.pop()]);
  const coins = new Array(players).fill(2);
  if (players === 2) coins[0] = 1;
  return { phase: 'playing', players, hands, revealed: hands.map(() => []), coins, deck, turn: 0, step: { k: 'action' }, act: null, winner: null, events: ['A partida começou. @0 joga primeiro.'] };
}

const restart = (state) => (state.players >= MIN_PLAYERS ? deal(state.players) : state);

/* ---------- auxiliares ---------- */
const alive = (s) => s.hands.map((h, i) => (h.length > 0 ? i : -1)).filter((i) => i >= 0);
const isAlive = (s, seat) => seat !== null && seat !== undefined && s.hands[seat] && s.hands[seat].length > 0;
const others = (s, seat) => alive(s).filter((i) => i !== seat);
function log(s, text) {
  s.events = s.events.concat([text]).slice(-MAX_EVENTS);
}
const ACTION_NAME = { income: 'Renda', foreignAid: 'Ajuda externa', coup: 'Golpe', tax: 'Taxar', assassinate: 'Assassinar', steal: 'Extorquir', exchange: 'Trocar' };
const CHAR_NAME = { duke: 'Duque', assassin: 'Assassino', captain: 'Capitão', ambassador: 'Embaixador', contessa: 'Condessa' };

function checkEnd(s) {
  const a = alive(s);
  if (a.length === 1 && s.phase === 'playing') {
    s.phase = 'ended';
    s.winner = a[0];
    s.step = null;
    log(s, `@${a[0]} venceu o jogo!`);
  }
  return s.phase === 'ended';
}

function loseCard(s, seat, idx) {
  const card = s.hands[seat].splice(idx, 1)[0];
  s.revealed[seat].push(card);
  log(s, `@${seat} perdeu uma influência (${CHAR_NAME[card]}).`);
  if (s.hands[seat].length === 0) {
    s.coins[seat] = 0;
    log(s, `@${seat} foi eliminado.`);
  }
}

function startLose(s, seat, then) {
  if (!isAlive(s, seat)) return continueThen(s, then);
  if (s.hands[seat].length === 1) {
    loseCard(s, seat, 0);
    return continueThen(s, then);
  }
  s.step = { k: 'lose', seat, then };
  return s;
}

function endTurn(s) {
  s.act = null;
  if (checkEnd(s)) return s;
  let next = s.turn;
  do next = (next + 1) % s.players; while (!isAlive(s, next));
  s.turn = next;
  s.step = { k: 'action' };
  return s;
}

function continueThen(s, then) {
  if (checkEnd(s)) return s;
  switch (then.t) {
    case 'endTurn':
      return endTurn(s);
    case 'afterChallenge':
      return afterChallenge(s);
    case 'actionFails':
      if (s.act && s.act.type === 'assassinate' && isAlive(s, s.act.actor)) s.coins[s.act.actor] += ACTIONS.assassinate.cost; // desafio bem sucedido devolve as moedas (a quem continua no jogo)
      return endTurn(s);
    case 'blockStands':
      return endTurn(s);
    case 'resolve':
      return resolveAction(s);
    default:
      return endTurn(s);
  }
}

function afterChallenge(s) {
  const def = ACTIONS[s.act.type];
  if (def.blockedBy) {
    const waiting = def.blockers === 'any' ? others(s, s.act.actor) : isAlive(s, s.act.target) ? [s.act.target] : [];
    if (waiting.length) {
      s.step = { k: 'block', waiting };
      return s;
    }
  }
  return resolveAction(s);
}

function resolveAction(s) {
  const { type, actor, target } = s.act;
  switch (type) {
    case 'income':
      s.coins[actor] += 1;
      break;
    case 'foreignAid':
      s.coins[actor] += 2;
      break;
    case 'tax':
      s.coins[actor] += 3;
      log(s, `@${actor} recebeu 3 moedas (Taxar).`);
      break;
    case 'steal': {
      const n = isAlive(s, target) ? Math.min(2, s.coins[target]) : 0;
      s.coins[target] -= n;
      s.coins[actor] += n;
      log(s, `@${actor} extorquiu ${n} moeda${n === 1 ? '' : 's'} de @${target}.`);
      break;
    }
    case 'exchange': {
      const drawn = [];
      for (let i = 0; i < 2 && s.deck.length; i++) drawn.push(s.deck.pop());
      s.step = { k: 'exchange', seat: actor, drawn };
      return s;
    }
    case 'assassinate':
    case 'coup':
      if (isAlive(s, target)) return startLose(s, target, { t: 'endTurn' });
      break;
    default:
      break;
  }
  return endTurn(s);
}

// O jogador mostra a carta se a tiver (ela volta ao baralho e ele compra outra); retorna true se tinha.
function reveal(s, seat, claim) {
  const idx = s.hands[seat].indexOf(claim);
  if (idx < 0) return false;
  s.deck.push(s.hands[seat].splice(idx, 1)[0]);
  shuffle(s.deck);
  s.hands[seat].splice(idx, 0, s.deck.pop());
  return true;
}

/* ---------- jogadas ---------- */
function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    if (state.players < MIN_PLAYERS) return { error: 'São necessários pelo menos 2 jogadores.' };
    return { state: deal(state.players) };
  }
  if (state.phase !== 'playing') return { error: 'A partida terminou.' };
  if (seat >= state.players || !isAlive(state, seat)) return { error: 'Você não está mais na partida.' };

  const s = JSON.parse(JSON.stringify(state));
  const step = s.step;

  if (step.k === 'action') {
    if (seat !== s.turn) return { error: 'Não é a sua vez.' };
    if (req.t !== 'action') return { error: 'Escolha uma ação.' };
    const def = ACTIONS[req.action];
    if (!def) return { error: 'Ação desconhecida.' };
    if (s.coins[seat] >= 10 && req.action !== 'coup') return { error: 'Com 10 ou mais moedas você precisa dar o Golpe.' };
    if (s.coins[seat] < def.cost) return { error: `${ACTION_NAME[req.action]} custa ${def.cost} moedas.` };
    let target = null;
    if (def.target) {
      target = req.target;
      if (!Number.isInteger(target) || target === seat || !isAlive(s, target)) return { error: 'Escolha um alvo válido.' };
    }
    s.coins[seat] -= def.cost;
    s.act = { type: req.action, actor: seat, target, paid: def.cost };
    log(s, target !== null ? `@${seat} declarou ${ACTION_NAME[req.action]} em @${target}${def.claim ? ` (${CHAR_NAME[def.claim]})` : ''}.` : `@${seat} declarou ${ACTION_NAME[req.action]}${def.claim ? ` (${CHAR_NAME[def.claim]})` : ''}.`);
    if (def.claim) {
      s.step = { k: 'challenge', waiting: others(s, seat) };
      return { state: s };
    }
    return { state: afterChallenge(s) };
  }

  if (step.k === 'lose') {
    if (seat !== step.seat) return { error: 'Aguardando outro jogador escolher a carta a perder.' };
    if (req.t !== 'lose' || !Number.isInteger(req.index) || req.index < 0 || req.index >= s.hands[seat].length) return { error: 'Escolha uma das suas cartas.' };
    const then = step.then;
    loseCard(s, seat, req.index);
    s.step = null;
    return { state: continueThen(s, then) };
  }

  if (step.k === 'exchange') {
    if (seat !== step.seat) return { error: 'Aguardando a troca do Embaixador.' };
    const pool = s.hands[seat].concat(step.drawn);
    const keep = s.hands[seat].length;
    const idx = req.keep;
    if (req.t !== 'exchange' || !Array.isArray(idx) || idx.length !== keep || new Set(idx).size !== keep || idx.some((i) => !Number.isInteger(i) || i < 0 || i >= pool.length)) {
      return { error: `Escolha exatamente ${keep} carta${keep > 1 ? 's' : ''} para ficar.` };
    }
    const kept = idx.map((i) => pool[i]);
    const back = pool.filter((_, i) => !idx.includes(i));
    s.hands[seat] = kept;
    s.deck.push(...back);
    shuffle(s.deck);
    log(s, `@${seat} trocou cartas com o baralho.`);
    return { state: endTurn(s) };
  }

  // janelas de resposta: challenge (acao), block, challengeBlock
  if (!step.waiting.includes(seat)) return { error: 'Você não precisa responder agora.' };

  if (req.t === 'pass') {
    step.waiting = step.waiting.filter((x) => x !== seat);
    if (step.waiting.length === 0) {
      if (step.k === 'challenge') return { state: afterChallenge(s) };
      if (step.k === 'block') return { state: resolveAction(s) };
      log(s, `O bloqueio de @${step.blocker} valeu.`);
      return { state: endTurn(s) };
    }
    return { state: s };
  }

  if (req.t === 'challenge') {
    if (step.k === 'challenge') {
      const { actor } = s.act;
      const claim = ACTIONS[s.act.type].claim;
      log(s, `@${seat} desafiou @${actor}!`);
      if (reveal(s, actor, claim)) {
        log(s, `@${actor} mostrou ${CHAR_NAME[claim]}. @${seat} errou o desafio.`);
        s.step = null;
        return { state: startLose(s, seat, { t: 'afterChallenge' }) };
      }
      log(s, `@${actor} não tinha ${CHAR_NAME[claim]}!`);
      s.step = null;
      return { state: startLose(s, actor, { t: 'actionFails' }) };
    }
    if (step.k === 'challengeBlock') {
      const blocker = step.blocker;
      log(s, `@${seat} desafiou o bloqueio de @${blocker}!`);
      if (reveal(s, blocker, step.claim)) {
        log(s, `@${blocker} mostrou ${CHAR_NAME[step.claim]}. @${seat} errou o desafio.`);
        s.step = null;
        return { state: startLose(s, seat, { t: 'blockStands' }) };
      }
      log(s, `@${blocker} não tinha ${CHAR_NAME[step.claim]}!`);
      s.step = null;
      return { state: startLose(s, blocker, { t: 'resolve' }) };
    }
    return { error: 'Não há o que desafiar agora.' };
  }

  if (req.t === 'block') {
    if (step.k !== 'block') return { error: 'Não é possível bloquear agora.' };
    const def = ACTIONS[s.act.type];
    if (!def.blockedBy || !def.blockedBy.includes(req.claim)) return { error: 'Esse personagem não bloqueia esta ação.' };
    s.step = { k: 'challengeBlock', blocker: seat, claim: req.claim, waiting: others(s, seat) };
    log(s, `@${seat} bloqueou como ${CHAR_NAME[req.claim]}!`);
    return { state: s };
  }

  return { error: 'Jogada inválida.' };
}

/* ---------- visoes ---------- */
function view(state) {
  const a = state.act;
  const st = state.step;
  return {
    phase: state.phase,
    players: state.players,
    coins: state.coins,
    influence: state.hands.map((h) => h.length),
    revealed: state.revealed,
    deckCount: state.deck.length,
    turn: state.phase === 'playing' ? state.turn : null,
    step: st
      ? {
          k: st.k,
          action: a ? a.type : null,
          actor: a ? a.actor : null,
          target: a ? a.target : null,
          claim: st.k === 'challenge' && a ? ACTIONS[a.type].claim : st.claim || null,
          waiting: st.waiting || [],
          blocker: st.blocker === undefined ? null : st.blocker,
          seat: st.seat === undefined ? null : st.seat,
        }
      : null,
    events: state.events,
    winner: state.winner,
    draw: false,
    over: state.phase === 'ended',
  };
}

function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby' || seat >= state.players) return null;
  const st = state.step;
  const out = { hand: state.hands[seat], alive: isAlive(state, seat) };
  if (state.phase !== 'playing' || !out.alive || !st) return out;
  if (st.k === 'action' && state.turn === seat) {
    const coins = state.coins[seat];
    out.canAct = true;
    out.mustCoup = coins >= 10;
    out.actions = Object.keys(ACTIONS).map((type) => {
      const def = ACTIONS[type];
      return { type, cost: def.cost, needsTarget: !!def.target, claim: def.claim, ok: coins >= def.cost && (coins < 10 || type === 'coup') };
    });
    out.targets = others(state, seat);
  }
  if (st.waiting && st.waiting.includes(seat)) {
    out.respond = { k: st.k, canChallenge: st.k !== 'block' };
    if (st.k === 'block') out.respond.blocks = ACTIONS[state.act.type].blockedBy;
  }
  if (st.k === 'lose' && st.seat === seat) out.mustLose = true;
  if (st.k === 'exchange' && st.seat === seat) out.exchange = { pool: state.hands[seat].concat(st.drawn), keep: state.hands[seat].length };
  return out;
}

// Piloto automatico: Renda (ou Golpe obrigatorio), passa nas respostas, perde a primeira carta, mantem as primeiras na troca.
function waitingOn(state) {
  if (state.phase !== 'playing' || !state.step) return [];
  const st = state.step;
  if (st.k === 'action') return [state.turn];
  if (st.k === 'lose' || st.k === 'exchange') return [st.seat];
  return st.waiting.slice();
}

function autoMove(state, seat) {
  const st = state.step;
  if (!st) return null;
  if (st.k === 'action') {
    if (state.coins[seat] >= 10) {
      const target = others(state, seat)[0];
      return target === undefined ? null : { t: 'action', action: 'coup', target };
    }
    return { t: 'action', action: 'income' };
  }
  if (st.k === 'lose') return { t: 'lose', index: 0 };
  if (st.k === 'exchange') return { t: 'exchange', keep: Array.from({ length: state.hands[seat].length }, (_, i) => i) };
  return { t: 'pass' };
}

export default {
  id: 'coup',
  name: 'Coup',
  description: 'Blefe e intriga: 2 a 6 jogadores, cartas de personagem escondidas, desafios e bloqueios.',
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
  _deal: deal,
  _actions: ACTIONS,
};
