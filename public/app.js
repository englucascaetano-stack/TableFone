'use strict';
// Shell da plataforma: nome, lobby, biblioteca de jogos e sala.
// Cada jogo registra sua interface em window.GameUI[id] (arquivos em /games/<id>.js).

window.GameUI = window.GameUI || {};

const $ = (sel) => document.querySelector(sel);

const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* sem armazenamento */ }
  },
};

function makePid() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let pid = store.get('pid');
if (!pid) {
  pid = makePid();
  store.set('pid', pid);
}

let current = null; // { code, source, uiId, room }

function accessKey() {
  return store.get('key') || '';
}

const transport = window.createTransport({ pid, getKey: accessKey });

function userName() {
  const name = $('#name').value.trim();
  store.set('name', name);
  return name || 'Jogador';
}

function loadGameUI(id) {
  if (window.GameUI[id]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const v = (window.MESA_CONFIG || {}).assetVersion;
    script.src = `games/${id}.js${v ? `?v=${v}` : ''}`;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Não foi possível carregar a interface do jogo.'));
    document.head.appendChild(script);
  });
}

/* ---------- Lobby ---------- */

async function renderLibrary() {
  const box = $('#library');
  try {
    if (!accessKey() && (await transport.needsKey())) {
      box.textContent = 'Informe a senha do grupo para ver os jogos.';
      return;
    }
    const games = await transport.games();
    box.innerHTML = '';
    for (const game of games) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'game-card';
      const title = document.createElement('strong');
      title.textContent = game.name;
      const desc = document.createElement('span');
      const plural = (n) => `${n} jogador${n > 1 ? 'es' : ''}`;
      const players = game.minPlayers === game.maxPlayers ? plural(game.maxPlayers) : `${game.minPlayers} a ${plural(game.maxPlayers)}`;
      desc.textContent = `${game.description} ${players}.`;
      btn.append(title, desc);
      btn.addEventListener('click', () => createRoom(game.id));
      box.appendChild(btn);
    }
  } catch (err) {
    box.textContent = err.message || 'Não foi possível carregar a biblioteca. Verifique a conexão com o servidor.';
  }
}

async function createRoom(gameId) {
  $('#home-error').textContent = '';
  try {
    const { code } = await transport.create(gameId, userName());
    location.hash = code;
  } catch (err) {
    $('#home-error').textContent = err.message;
  }
}

/* ---------- Sala ---------- */

function showHome() {
  closeRoom();
  $('#room').hidden = true;
  $('#home').hidden = false;
}

function closeRoom() {
  if (current && current.conn) current.conn.close();
  current = null;
}

async function enterRoom(code) {
  closeRoom();
  $('#home-error').textContent = '';
  const state = { code, conn: null, uiId: null, room: null };
  current = state;

  const onRoom = async (room) => {
    if (current !== state) return;
    if (state.uiId !== room.game.id) {
      try {
        await loadGameUI(room.game.id);
      } catch (err) {
        $('#room-error').textContent = err.message;
        return;
      }
      state.uiId = room.game.id;
      $('#game-area').innerHTML = '';
    }
    if (current !== state) return;
    state.room = room;
    renderRoom(room);
  };

  try {
    const conn = await transport.open(code, userName(), { onRoom });
    if (current !== state) {
      conn.close();
      return;
    }
    state.conn = conn;
  } catch (err) {
    if (current === state) current = null;
    location.hash = '';
    $('#home-error').textContent = err.message;
    return;
  }
  $('#home').hidden = true;
  $('#room').hidden = false;
  $('#room-code').textContent = code;
  $('#room-error').textContent = '';
}

function playerBar(el, player, room, ownSeat) {
  el.innerHTML = '';
  if (!player) return;
  const dot = document.createElement('span');
  dot.className = `dot${player.online ? ' on' : ''}`;
  const chip = document.createElement('span');
  chip.className = `chip ${player.seat === 0 ? 'w' : 'b'}`;
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = `${player.name}${player.seat === ownSeat ? ' (você)' : ''} · ${room.game.roles[player.seat]}`;
  el.append(dot, chip, name);
  if (!room.view.over && room.view.turn === player.seat) {
    const turn = document.createElement('span');
    turn.className = 'turn';
    turn.textContent = 'Vez de jogar';
    el.appendChild(turn);
  }
}

function renderRoom(room) {
  $('#room-game').textContent = room.game.name;
  const mySeat = room.you.seat;
  const bySeat = (seat) => room.players.find((p) => p.seat === seat);

  // Jogador aparece embaixo; espectadores veem a perspectiva do assento 0.
  const bottomSeat = mySeat === null ? 0 : mySeat;
  playerBar($('#me'), bySeat(bottomSeat), room, mySeat);
  playerBar($('#opponent'), bySeat(1 - bottomSeat), room, mySeat);

  const ui = window.GameUI[room.game.id];
  const status = ui.render($('#game-area'), room, (move) => sendMove(move));

  const missing = room.players.length < room.game.maxPlayers;
  $('#status').textContent = missing ? `Aguardando jogadores. Código da sala: ${room.code}` : status || '';
  $('#restart').hidden = mySeat === null;
  const others = room.spectators.map((s) => s.name).join(', ');
  if (mySeat === null) $('#watchers').textContent = 'Você está assistindo.';
  else $('#watchers').textContent = others ? `Assistindo: ${others}` : '';
}

async function sendMove(move) {
  if (!current) return;
  $('#room-error').textContent = '';
  try {
    await transport.move(current.code, move);
  } catch (err) {
    $('#room-error').textContent = err.message;
  }
}

/* ---------- Eventos ---------- */

$('#join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = $('#code').value.trim().toUpperCase();
  if (code.length !== 4) {
    $('#home-error').textContent = 'O código tem 4 letras.';
    return;
  }
  location.hash = code;
});

$('#leave').addEventListener('click', () => {
  location.hash = '';
});

$('#restart').addEventListener('click', async () => {
  if (!current) return;
  if (!confirm('Começar uma nova partida?')) return;
  try {
    await transport.restart(current.code);
  } catch (err) {
    $('#room-error').textContent = err.message;
  }
});

$('#share').addEventListener('click', async () => {
  if (!current) return;
  const url = `${location.origin}${location.pathname}#${current.code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Mesa de Jogos', text: `Sala ${current.code}`, url });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      $('#room-error').textContent = '';
      $('#status').textContent = 'Link copiado.';
    } else {
      prompt('Copie o link:', url);
    }
  } catch { /* compartilhamento cancelado */ }
});

function route() {
  const code = location.hash.replace('#', '').trim().toUpperCase();
  if (/^[A-Z]{4}$/.test(code)) enterRoom(code);
  else showHome();
}

window.addEventListener('hashchange', route);

$('#name').value = store.get('name') || '';

$('#key').addEventListener('change', () => {
  store.set('key', $('#key').value);
  $('#home-error').textContent = '';
  renderLibrary();
});

async function start() {
  if (await transport.needsKey()) {
    $('#key-field').hidden = false;
    $('#key').value = accessKey();
  }
  renderLibrary();
  route();
}

start();
