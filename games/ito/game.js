'use strict';
// Ito, cooperativo, 2 a 10 jogadores. Cada jogador recebe em segredo uma carta de 1 a 100 (sem repeticao na rodada).
// Uma carta de tema define uma escala (ex.: "tamanho de um animal"): os jogadores dao uma pista para cada carta sua,
// sem dizer numeros, que mostre o quao alto ou baixo e o numero nessa escala. Depois, todos juntos ordenam as cartas
// da menor para a maior sem ve-las. Na revelacao, se os numeros estiverem em ordem crescente a equipe vence a rodada.
//
// Progressao: comeca com 1 carta por jogador. A cada rodada vencida, mais um jogador passa a receber 2 cartas, ate que
// todos tenham 2; vencer a rodada nessa etapa final vence o jogo.
// Premissa desta versao (a regra de derrota nao foi confirmada no manual): a equipe tem 3 vidas; cada rodada perdida custa 1
// vida e a etapa e repetida com novas cartas; sem vidas, a partida acaba.

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const LIVES = 3;
const MAX_CLUE = 40;

// [pergunta/escala, extremo baixo (1), extremo alto (100)]
const THEMES = [
  ['Tamanho de um animal', 'minúsculo', 'gigantesco'],
  ['Quão perigoso é um animal', 'inofensivo', 'letal'],
  ['Preço de um objeto', 'baratíssimo', 'caríssimo'],
  ['Velocidade de algo', 'lentíssimo', 'rapidíssimo'],
  ['Quão gostosa é uma comida', 'horrível', 'maravilhosa'],
  ['Quão assustador é algo', 'nada assustador', 'aterrorizante'],
  ['Temperatura de um lugar', 'congelante', 'escaldante'],
  ['Peso de um objeto', 'levíssimo', 'pesadíssimo'],
  ['Idade de algo ou alguém', 'recém-nascido', 'antiquíssimo'],
  ['Quão difícil é uma tarefa', 'moleza', 'impossível'],
  ['Quão famoso é um personagem (real ou de ficção)', 'desconhecido', 'mundialmente famoso'],
  ['Quão barulhento é algo', 'silencioso', 'ensurdecedor'],
  ['Quão forte é um personagem de ficção', 'fraquíssimo', 'poderosíssimo'],
  ['Quão saudável é uma comida', 'nada saudável', 'super saudável'],
  ['Quão engraçado é algo', 'sem graça', 'hilário'],
  ['Quão cara é uma profissão (salário)', 'ganha muito pouco', 'ganha muitíssimo'],
  ['Quão longe fica um lugar da sua casa', 'ao lado', 'outro planeta'],
  ['Quão duro é um material', 'macio', 'duríssimo'],
  ['Quão útil é um objeto numa ilha deserta', 'inútil', 'indispensável'],
  ['Quão grande é uma cidade ou país', 'minúsculo', 'enorme'],
  ['Quão bonito é um lugar para visitar', 'feio', 'deslumbrante'],
  ['Quão molhado é algo', 'seco', 'encharcado'],
  ['Quão doce é uma comida', 'amarga', 'doce demais'],
  ['Quão apimentada é uma comida', 'sem tempero', 'pega fogo'],
  ['Quão cansativo é um esporte', 'relaxante', 'exaustivo'],
  ['Quão perigoso é um esporte', 'seguro', 'arriscadíssimo'],
  ['Quão popular é um esporte no Brasil', 'ninguém joga', 'todo mundo joga'],
  ['Quão chato é um filme ou série', 'empolgante', 'insuportável'],
  ['Quão assustador é um filme', 'infantil', 'pesadelo'],
  ['Quão importante é uma invenção', 'dispensável', 'mudou o mundo'],
  ['Quão difícil é um idioma para você', 'fácil', 'impossível'],
  ['Quão grande é um objeto que cabe numa casa', 'cabe no bolso', 'não passa pela porta'],
  ['Quão rápido é um meio de transporte', 'a pé', 'foguete'],
  ['Quão confortável é um lugar para dormir', 'desconfortável', 'divino'],
  ['Quão vergonhoso é um acontecimento', 'normal', 'quero sumir'],
  ['Quão corajoso é um ato', 'sem coragem', 'heroico'],
  ['Quão rico é um personagem', 'sem um centavo', 'bilionário'],
  ['Quão fedido é algo', 'cheiroso', 'insuportável de cheirar'],
  ['Quão brilhante é algo', 'escuro', 'ofuscante'],
  ['Quão frágil é um objeto', 'indestrutível', 'quebra se olhar'],
  ['Quão colorido é algo', 'sem cor', 'arco-íris'],
  ['Quão trabalhosa é uma receita', 'rapidinha', 'dá um dia inteiro'],
  ['Quão tranquilo é um lugar', 'caótico', 'paz total'],
  ['Quão perigosa é uma profissão', 'segura', 'arriscadíssima'],
  ['Quão inteligente é um animal', 'bobão', 'gênio'],
  ['Quão alto é um lugar ou construção', 'rente ao chão', 'nas nuvens'],
  ['Quão perigoso é um superpoder para quem o tem', 'sem risco', 'se destrói'],
  ['Quão nostálgico é algo da sua infância', 'esquecido', 'dá saudade danada'],
  ['Quão barato é um passeio', 'de graça', 'custa uma fortuna'],
  ['Quão amigável é um personagem', 'vilão', 'melhor amigo'],
  ['Quão necessário é um item de supermercado', 'supérfluo', 'essencial'],
  ['Quão fácil é de achar um objeto em casa', 'sempre à vista', 'sumido para sempre'],
  ['Quão ocupado é um lugar', 'deserto', 'lotado'],
  ['Quão molenga ou duro é um alimento', 'mole', 'duro'],
  ['Quão ruim é uma notícia', 'ótima', 'desastrosa'],
  ['Quão grave é uma mentira', 'inocente', 'imperdoável'],
  ['Quão estranho é um hábito', 'comum', 'bizarro'],
  ['Quão pesada é uma tarefa doméstica', 'leve', 'detesto'],
  ['Quão radical é uma atração de parque', 'carrossel', 'montanha-russa extrema'],
  ['Quão chique é um lugar', 'simplório', 'luxuoso'],
];

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
const clone = (x) => JSON.parse(JSON.stringify(x));

function lobbyState(players = 0) {
  return { phase: 'lobby', players, stage: 0, lives: LIVES, round: 0, theme: null, usedThemes: [], step: null, cards: [], order: [], ready: [], result: null, final: null, log: '' };
}
const setup = () => lobbyState(0);
const acceptsSeat = (s) => s.phase === 'lobby';
const seatJoined = (s, seat) => (s.phase === 'lobby' ? { ...s, players: Math.max(s.players, seat + 1) } : s);

// Na etapa k (0..players), os k primeiros assentos recebem 2 cartas e os demais, 1.
const cardsFor = (stage, seat) => (seat < stage ? 2 : 1);

function startRound(s) {
  s.round += 1;
  let pool = THEMES.map((_, i) => i).filter((i) => !s.usedThemes.includes(i));
  if (!pool.length) { s.usedThemes = []; pool = THEMES.map((_, i) => i); }
  s.theme = pool[randomInt(pool.length)];
  s.usedThemes.push(s.theme);
  const numbers = shuffle(Array.from({ length: 100 }, (_, i) => i + 1));
  s.cards = [];
  for (let seat = 0; seat < s.players; seat++) {
    for (let k = 0; k < cardsFor(s.stage, seat); k++) s.cards.push({ id: s.cards.length, owner: seat, n: numbers.pop(), clue: null });
  }
  s.order = shuffle(s.cards.map((c) => c.id));
  s.ready = [];
  s.result = null;
  s.step = 'clue';
  s.log = `Rodada ${s.round}: cada jogador dá uma pista para cada carta sua.`;
}

function deal(prev) {
  const s = { ...lobbyState(prev.players), phase: 'playing' };
  startRound(s);
  return s;
}
const restart = (state) => (state.players < MIN_PLAYERS ? state : deal(state));

function reveal(s) {
  const nums = s.order.map((id) => s.cards[id].n);
  const sorted = nums.slice().sort((a, b) => a - b);
  const wrong = s.order.filter((id, i) => s.cards[id].n !== sorted[i]);
  const ok = wrong.length === 0;
  s.step = 'reveal';
  s.result = { ok, wrong };
  if (ok) {
    s.stage += 1;
    if (s.stage > s.players) s.final = 'won';
    s.log = s.final === 'won' ? 'Ordem perfeita! Todos já jogaram com duas cartas: vitória da equipe!' : 'Ordem perfeita! A equipe sobe de etapa.';
  } else {
    s.lives -= 1;
    if (s.lives <= 0) s.final = 'lost';
    s.log = s.final === 'lost' ? 'A ordem estava errada e as vidas acabaram: derrota.' : `A ordem estava errada. A equipe perde uma vida (restam ${s.lives}).`;
  }
}

function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    if (state.players < MIN_PLAYERS) return { error: 'São necessários pelo menos 2 jogadores.' };
    return { state: deal(state) };
  }
  if (state.phase !== 'playing') return { error: 'A partida terminou. Use "Nova partida" para jogar outra.' };
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.players) return { error: 'Você não está jogando.' };
  const s = clone(state);

  if (req.t === 'clue') {
    if (s.step !== 'clue') return { error: 'Não é hora de dar pistas.' };
    const card = s.cards[req.card];
    if (!card || card.owner !== seat) return { error: 'Essa carta não é sua.' };
    const text = typeof req.text === 'string' ? req.text.trim().replace(/\s+/g, ' ') : '';
    if (!text) return { error: 'Escreva a pista.' };
    if (text.length > MAX_CLUE) return { error: `Pista longa demais (máximo de ${MAX_CLUE} letras).` };
    if (/\d/.test(text)) return { error: 'A pista não pode conter números.' };
    card.clue = text;
    if (s.cards.every((c) => c.clue)) {
      s.step = 'arrange';
      s.log = 'Pistas dadas. Ordenem as cartas da menor para a maior e confirmem.';
    }
    return { state: s };
  }

  if (req.t === 'move') {
    if (s.step !== 'arrange') return { error: 'Não é hora de ordenar.' };
    const from = s.order.indexOf(req.id);
    if (from < 0) return { error: 'Carta inválida.' };
    if (!Number.isInteger(req.to) || req.to < 0 || req.to >= s.order.length) return { error: 'Posição inválida.' };
    if (from === req.to) return { state: s };
    s.order.splice(from, 1);
    s.order.splice(req.to, 0, req.id);
    s.ready = [];
    return { state: s };
  }

  if (req.t === 'ready') {
    if (s.step !== 'arrange') return { error: 'Não é hora de confirmar.' };
    const ok = req.ok !== false;
    s.ready = s.ready.filter((x) => x !== seat);
    if (ok) s.ready.push(seat);
    if (s.ready.length >= s.players) reveal(s);
    return { state: s };
  }

  if (req.t === 'next') {
    if (s.step !== 'reveal') return { error: 'A rodada ainda não terminou.' };
    if (s.final) { s.phase = 'ended'; s.step = null; return { state: s }; }
    startRound(s);
    return { state: s };
  }

  return { error: 'Jogada inválida.' };
}

function view(state) {
  if (state.phase === 'lobby') return { phase: 'lobby', players: state.players, log: '', draw: false, over: false };
  const ended = state.phase === 'ended';
  const showClues = state.step !== 'clue';
  const showNums = state.step === 'reveal' || ended;
  const th = state.theme === null ? null : THEMES[state.theme];
  return {
    phase: state.phase,
    players: state.players,
    stage: state.stage,
    lives: state.lives,
    maxLives: LIVES,
    round: state.round,
    theme: th ? { text: th[0], low: th[1], high: th[2] } : null,
    step: state.step,
    cards: state.cards.map((c) => ({ id: c.id, owner: c.owner, hasClue: Boolean(c.clue), clue: showClues ? c.clue : null, n: showNums ? c.n : null })),
    order: state.order,
    ready: state.ready,
    result: state.step === 'reveal' ? state.result : null,
    final: state.final,
    turn: null,
    log: state.log,
    draw: false,
    over: ended,
    won: ended && state.final === 'won',
  };
}

// Cada jogador ve os numeros e as pistas das proprias cartas.
function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby' || seat >= state.players) return null;
  return { mine: state.cards.filter((c) => c.owner === seat).map((c) => ({ id: c.id, n: c.n, clue: c.clue })) };
}

function waitingOn(state) {
  if (state.phase !== 'playing') return [];
  if (state.step === 'clue') return [...new Set(state.cards.filter((c) => !c.clue).map((c) => c.owner))];
  if (state.step === 'arrange') return Array.from({ length: state.players }, (_, i) => i).filter((i) => !state.ready.includes(i));
  return [0];
}

// Piloto automatico: pista generica, confirma a ordem como esta, segue adiante.
function autoMove(state, seat) {
  if (state.step === 'clue') {
    const c = state.cards.find((x) => x.owner === seat && !x.clue);
    return c ? { t: 'clue', card: c.id, text: 'sem pista' } : null;
  }
  if (state.step === 'arrange') return { t: 'ready', ok: true };
  if (state.step === 'reveal') return { t: 'next' };
  return null;
}

module.exports = {
  id: 'ito',
  name: 'Ito',
  description: 'Ito: jogo cooperativo. Deem pistas sobre um tema e ordenem as cartas secretas de 1 a 100 sem mostrá-las. De 2 a 10 jogadores.',
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
  _THEMES: THEMES,
  _LIVES: LIVES,
};
