'use strict';
// Paciencia (Klondike), jogo solo: 7 colunas, 4 fundacoes, monte e descarte.
// O embaralhamento e as cartas viradas para baixo ficam so no estado do servidor;
// a visao publica (view) revela apenas o que esta com a face para cima.
//
// Carta: string "<valor><naipe>", valor 1..13 (1 = As, 11 = J, 12 = Q, 13 = K), naipe S H D C.
// Estado: { stock, waste, foundations[4], tableau[7] de {c, up}, drawCount, moves, history }

const SUITS = ['S', 'H', 'D', 'C']; // espadas, copas, ouros, paus (uma fundacao por naipe)
const MAX_HISTORY = 30;

const rankOf = (card) => parseInt(card, 10);
const suitOf = (card) => card.slice(-1);
const isRed = (card) => suitOf(card) === 'H' || suitOf(card) === 'D';

function randomInt(n) {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) {
    const limit = Math.floor(0x100000000 / n) * n; // evita vies de modulo
    const buf = new Uint32Array(1);
    do c.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}

function newDeck() {
  const deck = [];
  for (const s of SUITS) for (let r = 1; r <= 13; r++) deck.push(`${r}${s}`);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function setup(deck = newDeck()) {
  const cards = deck.slice();
  const tableau = [];
  for (let i = 0; i < 7; i++) {
    const pile = [];
    for (let k = 0; k <= i; k++) pile.push({ c: cards.pop(), up: k === i });
    tableau.push(pile);
  }
  return {
    stock: cards,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    drawCount: 1,
    moves: 0,
    history: [],
  };
}

const firstUp = (pile) => pile.findIndex((x) => x.up);
const won = (state) => state.foundations.every((f) => f.length === 13);

// Jogadas permitidas: { from: {k:'waste'} | {k:'tab',i,n} | {k:'found',i}, to: {k:'tab',i} | {k:'found',i} }
function legalMoves(state) {
  const moves = [];
  const canLandOnTab = (cards, j) => {
    const pile = state.tableau[j];
    if (pile.length === 0) return rankOf(cards[0]) === 13;
    const top = pile[pile.length - 1];
    return top.up && isRed(top.c) !== isRed(cards[0]) && rankOf(top.c) === rankOf(cards[0]) + 1;
  };
  const canLandOnFound = (card) => {
    const f = state.foundations[SUITS.indexOf(suitOf(card))];
    return rankOf(card) === f.length + 1;
  };
  const add = (from, cards, skipTab) => {
    for (let j = 0; j < 7; j++) {
      if (j === skipTab) continue;
      if (canLandOnTab(cards, j)) moves.push({ from, to: { k: 'tab', i: j } });
    }
    if (cards.length === 1 && from.k !== 'found' && canLandOnFound(cards[0])) {
      moves.push({ from, to: { k: 'found', i: SUITS.indexOf(suitOf(cards[0])) } });
    }
  };

  if (state.waste.length) add({ k: 'waste' }, [state.waste[state.waste.length - 1]], -1);
  state.tableau.forEach((pile, i) => {
    const start = firstUp(pile);
    if (start < 0) return;
    for (let n = start; n < pile.length; n++) {
      const cards = pile.slice(n).map((x) => x.c);
      const kingAlreadyAtBase = n === 0 && rankOf(cards[0]) === 13; // mover Rei de uma coluna vazia nao muda nada
      const from = { k: 'tab', i, n };
      if (kingAlreadyAtBase) {
        if (cards.length === 1) {
          const f = canLandOnFound(cards[0]);
          if (f) moves.push({ from, to: { k: 'found', i: SUITS.indexOf(suitOf(cards[0])) } });
        }
        continue;
      }
      add(from, cards, i);
    }
  });
  state.foundations.forEach((f, i) => {
    if (!f.length) return;
    const card = f[f.length - 1];
    for (let j = 0; j < 7; j++) if (canLandOnTab([card], j)) moves.push({ from: { k: 'found', i }, to: { k: 'tab', i: j } });
  });
  return moves;
}

const snapshot = (s) => ({
  stock: s.stock.slice(),
  waste: s.waste.slice(),
  foundations: s.foundations.map((f) => f.slice()),
  tableau: s.tableau.map((p) => p.map((x) => ({ ...x }))),
  moves: s.moves,
});

function withHistory(state) {
  const next = JSON.parse(JSON.stringify(state));
  next.history = state.history.concat([snapshot(state)]).slice(-MAX_HISTORY);
  next.moves = state.moves + 1;
  return next;
}

// Compara origem/destino pelos campos (nao pelo texto): o banco (jsonb) reordena as chaves dos objetos.
const sameMove = (a, b) => !!a && !!b && typeof a === 'object' && typeof b === 'object' && a.k === b.k && a.i === b.i && a.n === b.n;

function move(state, seat, req) {
  if (seat !== 0) return { error: 'Este jogo é solo.' };
  if (won(state)) return { error: 'A partida terminou.' };
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'mode') {
    if (state.moves > 0) return { error: 'O modo só pode ser mudado antes da primeira jogada.' };
    if (req.draw !== 1 && req.draw !== 3) return { error: 'Modo inválido.' };
    return { state: { ...JSON.parse(JSON.stringify(state)), drawCount: req.draw } };
  }

  if (req.t === 'undo') {
    if (!state.history.length) return { error: 'Nada para desfazer.' };
    const prev = state.history[state.history.length - 1];
    return { state: { ...JSON.parse(JSON.stringify(prev)), drawCount: state.drawCount, history: state.history.slice(0, -1) } };
  }

  if (req.t === 'draw') {
    if (!state.stock.length && !state.waste.length) return { error: 'Não há cartas no monte.' };
    const next = withHistory(state);
    if (!next.stock.length) {
      next.stock = next.waste.reverse();
      next.waste = [];
    } else {
      for (let k = 0; k < next.drawCount && next.stock.length; k++) next.waste.push(next.stock.pop());
    }
    return { state: next };
  }

  if (req.t === 'move') {
    const legal = legalMoves(state).find((m) => sameMove(m.from, req.from) && sameMove(m.to, req.to));
    if (!legal) return { error: 'Jogada não permitida.' };
    const next = withHistory(state);
    let cards;
    const { from, to } = legal;
    if (from.k === 'waste') cards = [next.waste.pop()];
    else if (from.k === 'found') cards = [next.foundations[from.i].pop()];
    else {
      cards = next.tableau[from.i].splice(from.n).map((x) => x.c);
      const pile = next.tableau[from.i];
      if (pile.length && !pile[pile.length - 1].up) pile[pile.length - 1].up = true;
    }
    if (to.k === 'tab') next.tableau[to.i].push(...cards.map((c) => ({ c, up: true })));
    else next.foundations[to.i].push(cards[0]);
    return { state: next };
  }

  return { error: 'Jogada inválida.' };
}

function view(state) {
  const over = won(state);
  return {
    stockCount: state.stock.length,
    waste: state.waste,
    foundations: state.foundations,
    tableau: state.tableau.map((pile) => pile.map((x) => (x.up ? { c: x.c, up: true } : { up: false }))),
    drawCount: state.drawCount,
    moves: state.moves,
    canUndo: state.history.length > 0,
    canChangeMode: state.moves === 0,
    turn: null,
    winner: over ? 0 : null,
    draw: false,
    over,
    legal: over ? [] : legalMoves(state),
  };
}

module.exports = {
  id: 'paciencia',
  name: 'Paciência',
  description: 'Paciência (Klondike), jogo solo com baralho de 52 cartas.',
  minPlayers: 1,
  maxPlayers: 1,
  roles: ['Jogador'],
  setup,
  move,
  view,
  // expostos para teste
  _legalMoves: legalMoves,
  _setup: setup,
};
