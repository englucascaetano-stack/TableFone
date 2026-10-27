// GERADO por scripts/build-edge.js a partir de games/codenames/game.js. Nao edite.
'use strict';
// Código Secreto (Codenames), 4 a 8 jogadores, em duas equipes: Vermelha (assentos pares) e Azul (assentos ímpares).
// O assento 0 é o espião da Vermelha e o assento 1 é o espião da Azul; os demais são agentes de campo.
// Tabuleiro 5x5 de palavras. A equipe que começa tem 9 agentes a encontrar, a outra 8; há 7 inocentes e 1 assassino.
//
// Turno: o espião dá uma pista (uma palavra e um número); os agentes da equipe tocam nas palavras que acham ser da sua cor.
//  - Palavra da própria equipe: acerta e pode continuar (até número + 1 palpites; número 0 = sem limite).
//  - Inocente: a vez passa. Agente da outra equipe: ponto para ela e a vez passa. Assassino: a equipe perde na hora.
//  - Vence quem encontrar todos os seus agentes primeiro.
// Simplificações: a pista não pode ser uma palavra do tabuleiro ainda não revelada (ignora acentos e maiúsculas);
// os agentes precisam arriscar ao menos uma palavra por turno antes de encerrar.

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;
const TEAM_NAME = ['Vermelha', 'Azul'];

const WORDS = [
  'Abacate', 'Abelha', 'Aeroporto', 'Agulha', 'Alarme', 'Alface', 'Alicate', 'Almofada', 'Altar', 'Amêndoa',
  'Anel', 'Anjo', 'Antena', 'Aranha', 'Arco', 'Areia', 'Armadura', 'Arroz', 'Asa', 'Astronauta',
  'Atlas', 'Avião', 'Azeite', 'Bailarina', 'Balança', 'Balão', 'Banana', 'Banco', 'Bandeira', 'Barata',
  'Barco', 'Barraca', 'Basquete', 'Bateria', 'Berço', 'Biblioteca', 'Bicicleta', 'Bigode', 'Biscoito', 'Bola',
  'Bolo', 'Bomba', 'Bombeiro', 'Borboleta', 'Botão', 'Braço', 'Bruxa', 'Bússola', 'Cabana', 'Cabelo',
  'Cacto', 'Cadeado', 'Cadeira', 'Café', 'Caixão', 'Calçada', 'Camelo', 'Caminhão', 'Campainha', 'Canal',
  'Canhão', 'Canoa', 'Capacete', 'Capitão', 'Carneiro', 'Carro', 'Carta', 'Casaco', 'Castelo', 'Cavalo',
  'Caverna', 'Cebola', 'Cegonha', 'Cenoura', 'Centro', 'Cerca', 'Cereja', 'Chaminé', 'Chave', 'Chocolate',
  'Chuva', 'Cidade', 'Cinema', 'Circo', 'Cobra', 'Coelho', 'Cogumelo', 'Coluna', 'Cometa', 'Coroa',
  'Corrente', 'Costa', 'Cozinha', 'Cristal', 'Cruz', 'Cubo', 'Dado', 'Deserto', 'Diamante', 'Dinossauro',
  'Doutor', 'Dragão', 'Eclipse', 'Elefante', 'Elevador', 'Enfermeira', 'Engrenagem', 'Escada', 'Escola', 'Escorpião',
  'Escudo', 'Espada', 'Espelho', 'Espinho', 'Esponja', 'Esquilo', 'Estação', 'Estádio', 'Estátua', 'Estrela',
  'Fábrica', 'Fada', 'Faca', 'Faraó', 'Farol', 'Fazenda', 'Feijão', 'Festa', 'Ficha', 'Fígado',
  'Flauta', 'Floresta', 'Foguete', 'Fogueira', 'Folha', 'Fonte', 'Forca', 'Formiga', 'Fortaleza', 'Fósforo',
  'Fotografia', 'Fralda', 'Gaita', 'Gaiola', 'Galinha', 'Gancho', 'Garagem', 'Garfo', 'Gato', 'Gelo',
  'Gigante', 'Girafa', 'Globo', 'Goleiro', 'Gorila', 'Granada', 'Guarda', 'Guitarra', 'Hélice', 'Herói',
  'Hospital', 'Hotel', 'Igreja', 'Ilha', 'Imã', 'Incêndio', 'Inverno', 'Jacaré', 'Janela', 'Jardim',
  'Jarra', 'Jaula', 'Joelho', 'Jornal', 'Juiz', 'Kiwi', 'Laboratório', 'Lagarto', 'Lago', 'Lâmpada',
  'Lança', 'Laranja', 'Lava', 'Leão', 'Leite', 'Lenha', 'Leque', 'Liquidificador', 'Livro', 'Lixo',
  'Lobo', 'Loja', 'Lua', 'Luva', 'Maçã', 'Macaco', 'Madeira', 'Mágico', 'Mala', 'Mamute',
  'Mandioca', 'Manga', 'Mapa', 'Máquina', 'Mar', 'Marfim', 'Martelo', 'Máscara', 'Mel', 'Mesa',
  'Metal', 'Microscópio', 'Milho', 'Minhoca', 'Moeda', 'Montanha', 'Morcego', 'Muralha', 'Museu', 'Nave',
  'Navio', 'Neve', 'Ninja', 'Noite', 'Nuvem', 'Oásis', 'Óculos', 'Olho', 'Ônibus', 'Onda',
  'Orquestra', 'Ostra', 'Ouro', 'Ovelha', 'Padaria', 'Palhaço', 'Palmeira', 'Panela', 'Panda', 'Papagaio',
  'Papel', 'Paraquedas', 'Parede', 'Passaporte', 'Pássaro', 'Pato', 'Pedra', 'Pena', 'Pente', 'Pérola',
  'Piano', 'Pijama', 'Pilha', 'Pimenta', 'Pinguim', 'Pintor', 'Pirata', 'Pirâmide', 'Piscina', 'Pista',
  'Pizza', 'Planeta', 'Polícia', 'Ponte', 'Porta', 'Porto', 'Prato', 'Praia', 'Prefeito', 'Presente',
  'Princesa', 'Prisão', 'Queijo', 'Quadro', 'Rainha', 'Raio', 'Raiz', 'Rato', 'Rede', 'Régua',
  'Relógio', 'Remo', 'Rio', 'Robô', 'Rocha', 'Roda', 'Roupa', 'Sabão', 'Sala', 'Salsicha',
  'Sapato', 'Sapo', 'Satélite', 'Selva', 'Semáforo', 'Serpente', 'Sino', 'Sol', 'Sombra', 'Submarino',
  'Sereia', 'Tambor', 'Tartaruga', 'Taverna', 'Teatro', 'Telefone', 'Telescópio', 'Tempestade', 'Tesouro', 'Tesoura',
  'Tigre', 'Tinta', 'Tomate', 'Torre', 'Trem', 'Trovão', 'Tubarão', 'Túnel', 'Unicórnio', 'Uva',
  'Vampiro', 'Vassoura', 'Veado', 'Vela', 'Veneno', 'Ventilador', 'Verão', 'Vidro', 'Vulcão', 'Xadrez',
  'Zebra', 'Zumbi',
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

// Sem acentos, minúsculas: para comparar pistas com as palavras do tabuleiro.
const norm = (w) => String(w).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const teamOf = (seat) => seat % 2;
const spyOf = (team) => team; // assento 0 = espião da Vermelha, 1 = espião da Azul
const isSpy = (seat) => seat === 0 || seat === 1;

function lobbyState(players = 0) {
  return { phase: 'lobby', players, words: [], key: [], revealed: [], startTeam: 0, turn: 0, clue: null, left: 0, guessed: 0, winner: null, cause: null, log: '' };
}

const setup = () => lobbyState(0);
const acceptsSeat = (s) => s.phase === 'lobby';
const seatJoined = (s, seat) => (s.phase === 'lobby' ? { ...s, players: Math.max(s.players, seat + 1) } : s);

// Nova rodada. Chaves: 'R' vermelho, 'B' azul, 'N' inocente, 'A' assassino.
function deal(prev, startTeam) {
  const words = shuffle(WORDS.slice()).slice(0, 25);
  const mine = startTeam === 0 ? 'R' : 'B';
  const other = startTeam === 0 ? 'B' : 'R';
  const key = shuffle([...Array(9).fill(mine), ...Array(8).fill(other), ...Array(7).fill('N'), 'A']);
  return {
    ...prev,
    phase: 'clue',
    words,
    key,
    revealed: new Array(25).fill(false),
    startTeam,
    turn: startTeam,
    clue: null,
    left: 0,
    guessed: 0,
    winner: null,
    cause: null,
    log: `Nova rodada. A equipe ${TEAM_NAME[startTeam]} começa e tem 9 agentes a encontrar.`,
  };
}

function restart(state) {
  if (state.players < MIN_PLAYERS) return state;
  return deal(state, state.phase === 'lobby' ? 0 : 1 - state.startTeam);
}

const remaining = (s, team) => s.key.filter((k, i) => k === (team === 0 ? 'R' : 'B') && !s.revealed[i]).length;

function endTurn(s, why) {
  s.turn = 1 - s.turn;
  s.phase = 'clue';
  s.clue = null;
  s.left = 0;
  s.guessed = 0;
  s.log = `${why} Vez da equipe ${TEAM_NAME[s.turn]}.`;
  return s;
}

function move(state, seat, req) {
  if (!req || typeof req !== 'object') return { error: 'Jogada inválida.' };

  if (req.t === 'start') {
    if (state.phase !== 'lobby') return { error: 'A partida já começou.' };
    if (seat !== 0) return { error: 'Só o anfitrião pode começar.' };
    if (state.players < MIN_PLAYERS) return { error: `São necessários pelo menos ${MIN_PLAYERS} jogadores (2 por equipe).` };
    return { state: deal(state, 0) };
  }
  if (state.phase !== 'clue' && state.phase !== 'guess') return { error: 'A rodada terminou. Use "Nova partida" para jogar outra.' };
  if (seat >= state.players) return { error: 'Você não está jogando esta partida.' };

  const s = JSON.parse(JSON.stringify(state));
  const team = teamOf(seat);
  const auto = Array.isArray(state.auto) && state.auto.includes(seat);

  // Piloto automático (jogador dispensado): passa a vez sem dar pista nem palpite.
  if (req.t === 'skip') {
    if (!auto || team !== s.turn) return { error: 'Jogada inválida.' };
    if (s.phase === 'clue' && !isSpy(seat)) return { error: 'Aguardando o espião.' };
    if (s.phase === 'guess' && isSpy(seat)) return { error: 'Aguardando os agentes.' };
    return { state: endTurn(s, `${TEAM_NAME[team]}: jogador ausente passou a vez.`) };
  }

  if (req.t === 'clue') {
    if (s.phase !== 'clue') return { error: 'A pista já foi dada.' };
    if (team !== s.turn) return { error: 'Não é a vez da sua equipe.' };
    if (seat !== spyOf(team)) return { error: 'Só o espião da equipe dá a pista.' };
    const word = typeof req.word === 'string' ? req.word.trim() : '';
    const number = req.number;
    if (!word || word.length > 24 || /\s/.test(word)) return { error: 'A pista deve ser uma única palavra.' };
    if (!Number.isInteger(number) || number < 0 || number > 9) return { error: 'O número deve ser de 0 a 9.' };
    const n = norm(word);
    if (s.words.some((w, i) => !s.revealed[i] && norm(w) === n)) return { error: 'A pista não pode ser uma palavra do tabuleiro.' };
    s.phase = 'guess';
    s.clue = { word, number };
    s.left = number === 0 ? 99 : number + 1;
    s.guessed = 0;
    s.log = `${TEAM_NAME[team]}: pista "${word}", ${number}.`;
    return { state: s };
  }

  if (s.phase !== 'guess') return { error: 'Aguarde a pista do espião.' };
  if (team !== s.turn) return { error: 'Não é a vez da sua equipe.' };
  if (isSpy(seat)) return { error: 'O espião não pode dar palpites.' };

  if (req.t === 'pass') {
    if (s.guessed < 1) return { error: 'Arrisque ao menos uma palavra antes de encerrar.' };
    return { state: endTurn(s, `A equipe ${TEAM_NAME[team]} encerrou os palpites.`) };
  }

  if (req.t === 'guess') {
    const i = req.i;
    if (!Number.isInteger(i) || i < 0 || i >= 25) return { error: 'Palavra inválida.' };
    if (s.revealed[i]) return { error: 'Essa palavra já foi revelada.' };
    s.revealed[i] = true;
    s.guessed += 1;
    const k = s.key[i];
    const word = s.words[i];
    if (k === 'A') {
      s.phase = 'ended';
      s.winner = 1 - team;
      s.cause = 'assassin';
      s.log = `"${word}" era o assassino! A equipe ${TEAM_NAME[team]} perdeu.`;
      return { state: s };
    }
    const owner = k === 'R' ? 0 : k === 'B' ? 1 : null;
    // vitoria de quem completou os agentes (mesmo que tenha sido revelado pelo adversario)
    for (const t of [0, 1]) {
      if (remaining(s, t) === 0) {
        s.phase = 'ended';
        s.winner = t;
        s.cause = 'agents';
        s.log = `"${word}" revelado. A equipe ${TEAM_NAME[t]} encontrou todos os agentes!`;
        return { state: s };
      }
    }
    if (owner === team) {
      s.left -= 1;
      if (s.left <= 0) return { state: endTurn(s, `"${word}" era da equipe. Sem mais palpites.`) };
      s.log = `"${word}" era da equipe ${TEAM_NAME[team]}.`;
      return { state: s };
    }
    if (owner === null) return { state: endTurn(s, `"${word}" era inocente.`) };
    return { state: endTurn(s, `"${word}" era da equipe ${TEAM_NAME[owner]}.`) };
  }

  return { error: 'Jogada inválida.' };
}

function view(state) {
  const ended = state.phase === 'ended';
  return {
    phase: state.phase,
    players: state.players,
    words: state.words,
    // cor so aparece nas palavras reveladas (e todas, no fim da rodada)
    colors: state.key.map((k, i) => (state.revealed[i] || ended ? k : null)),
    revealed: state.revealed,
    left: [remaining(state, 0), remaining(state, 1)],
    startTeam: state.startTeam,
    turn: null, // a vez e de uma equipe (campo team), nao de um assento
    team: state.phase === 'clue' || state.phase === 'guess' ? state.turn : null,
    stage: state.phase,
    clue: state.clue,
    guesses: state.phase === 'guess' ? (state.clue && state.clue.number === 0 ? null : state.left) : null,
    guessed: state.guessed,
    winner: state.winner,
    cause: state.cause,
    log: state.log,
    draw: false,
    over: ended,
  };
}

function viewFor(state, seat) {
  if (seat === null || seat === undefined || state.phase === 'lobby' || seat >= state.players) return null;
  const team = teamOf(seat);
  const active = (state.phase === 'clue' || state.phase === 'guess') && team === state.turn;
  const spy = isSpy(seat);
  return {
    team,
    spy,
    key: spy ? state.key : null,
    canClue: active && state.phase === 'clue' && spy,
    canGuess: active && state.phase === 'guess' && !spy,
    canPass: active && state.phase === 'guess' && !spy && state.guessed > 0,
  };
}

// Piloto automático: por quem o jogo espera (espião na pista, agentes nos palpites) e como passar a vez.
function waitingOn(state, auto) {
  if (state.phase !== 'clue' && state.phase !== 'guess') return [];
  const t = state.turn;
  if (state.phase === 'clue') return [spyOf(t)];
  const agents = Array.from({ length: state.players }, (_, i) => i).filter((i) => teamOf(i) === t && !isSpy(i));
  if (!auto) return agents;
  const present = agents.filter((i) => !auto.includes(i));
  return present.length ? present : agents.slice(0, 1);
}

function autoMove() {
  return { t: 'skip' };
}

export default {
  id: 'codenames',
  name: 'Código Secreto',
  description: 'Código Secreto (Codenames): duas equipes, espiões dão pistas de uma palavra. De 4 a 8 jogadores.',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  roles: ['Espião Vermelho', 'Espião Azul', 'Agente Vermelho', 'Agente Azul', 'Agente Vermelho', 'Agente Azul', 'Agente Vermelho', 'Agente Azul'],
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
  _words: WORDS,
  _deal: deal,
  _norm: norm,
};
