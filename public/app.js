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

// O tablet usa outro identificador (e outra conexao): o mesmo navegador pode ser jogador e tablet nos testes.
let tpid = store.get('tpid');
if (!tpid) {
  tpid = makePid();
  store.set('tpid', tpid);
}
let tableTransport = null;
const tableTx = () => tableTransport || (tableTransport = window.createTransport({ pid: tpid, getKey: accessKey }));

function userName() {
  const name = $('#name').value.trim();
  store.set('name', name);
  return name || 'Jogador';
}

function loadScript(src, what) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const v = (window.MESA_CONFIG || {}).assetVersion;
    script.src = `${src}${v ? `?v=${v}` : ''}`;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Não foi possível carregar ${what}.`));
    document.head.appendChild(script);
  });
}

function loadGameUI(id) {
  if (window.GameUI[id]) return Promise.resolve();
  return loadScript(`games/${id}.js`, 'a interface do jogo');
}

// Telas do modo tablet (so baixadas quando o tablet e usado).
function loadTableUI() {
  if (window.TableUI) return Promise.resolve();
  return loadScript('tablet.js', 'a tela do tablet');
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
      btn.className = `game-card g-${game.id}`;
      const icon = document.createElement('span');
      icon.className = 'gc-icon';
      icon.innerHTML = (window.GameIcons && window.GameIcons[game.id]) || '';
      const body = document.createElement('span');
      body.className = 'gc-body';
      const title = document.createElement('strong');
      title.textContent = game.name;
      const plural = (n) => `${n} jogador${n > 1 ? 'es' : ''}`;
      const players = document.createElement('small');
      players.className = 'gc-players';
      players.textContent = game.minPlayers === game.maxPlayers ? plural(game.maxPlayers) : `${game.minPlayers} a ${plural(game.maxPlayers)}`;
      const desc = document.createElement('span');
      desc.className = 'gc-desc';
      // o cartao ja mostra nome e quantidade de jogadores: tira o prefixo "Nome:" e o final "De X a Y jogadores."
      desc.textContent = game.description.replace(/^[^:.]{1,24}:\s*/, '').replace(/\s*De \d+( a \d+)? jogadores?\.?$/, '').replace(/\s*\d+ a \d+ jogadores\.?$/, '');
      body.append(title, players, desc);
      const go = document.createElement('span');
      go.className = 'gc-go';
      go.textContent = 'Criar sala';
      btn.append(icon, body, go);
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
  $('#table').hidden = true;
  $('#home').hidden = false;
  document.body.classList.remove('is-tablet');
}

function closeRoom() {
  if (current && current.conn) current.conn.close();
  current = null;
  releaseWake();
  clearTimeout(noticeTimer);
  $('#notice').hidden = true;
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
    // Com o tablet conectado, quem joga ve so a propria mao; sem ele, tudo segue como sempre.
    room.tableMode = room.you.seat !== null && Boolean(room.tablet && room.tablet.online);
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
  $('#table').hidden = true;
  document.body.classList.remove('is-tablet');
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

  // Jogos de 1 ou 2 lugares usam as barras de jogador; os demais desenham a lista de jogadores sozinhos.
  const bars = room.game.maxPlayers <= 2;
  $('#me').hidden = !bars;
  $('#opponent').hidden = !bars;
  // Jogador aparece embaixo; espectadores veem a perspectiva do assento 0.
  const bottomSeat = mySeat === null ? 0 : mySeat;
  if (bars) {
    playerBar($('#me'), bySeat(bottomSeat), room, mySeat);
    playerBar($('#opponent'), bySeat(1 - bottomSeat), room, mySeat);
  }

  const ui = window.GameUI[room.game.id];
  const status = ui.render($('#game-area'), room, (move) => sendMove(move));

  const waiting = room.game.maxPlayers === 2 && room.players.length < 2;
  $('#status').textContent = waiting ? `Aguardando jogadores. Código da sala: ${room.code}` : status || '';
  {
    // faixa de turno: destaque em dourado quando a acao e sua
    const v = room.view || {};
    const mine = mySeat !== null && !v.over && (v.turn === mySeat || (Array.isArray(v.waiting) && v.waiting.includes(mySeat)));
    $('#status').classList.toggle('mine', Boolean(mine));
  }
  $('#restart').hidden = mySeat === null || (room.view && room.view.phase === 'lobby');
  const others = room.spectators.map((s) => s.name).join(', ');
  if (mySeat === null) $('#watchers').textContent = 'Você está assistindo.';
  else $('#watchers').textContent = others ? `Assistindo: ${others}` : '';
  renderWaiting(room);
  renderTabletPanel(room);
  // aviso de mudanca no modo tablet (o celular passa a mostrar so a mao, ou volta a mostrar a mesa)
  const online = Boolean(room.tablet && room.tablet.online);
  if (current && current.tabletOnline !== undefined && current.tabletOnline !== online && mySeat !== null) {
    const cards = HAND_GAMES.has(room.game.id);
    showNotice(online
      ? (cards ? 'Tablet conectado. A mesa está no tablet: jogue pela sua mão.' : 'Tablet conectado. Continue fazendo as jogadas no celular.')
      : (cards ? 'Tablet desconectado. A mesa voltou para o seu celular.' : 'Tablet desconectado.'));
  }
  if (current) current.tabletOnline = online;
}

// Jogos em que, com o tablet ligado, o celular passa a mostrar so a mao; nos demais o tabuleiro continua no celular.
const HAND_GAMES = new Set(['uno', 'truco', 'caxeta', 'buraco', 'bang', 'coup']);
let noticeTimer = null;
function showNotice(text) {
  const n = $('#notice');
  n.textContent = text;
  n.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { n.hidden = true; }, 6000);
}

/* ---------- Modo tablet (celular): ativar, ver PIN, desativar ---------- */
let tabletOpen = false;

const TABLET_RE = /^[A-HJ-NP-Z2-9]{6}$/;
function tabletLink(tcode) {
  return `${location.origin}${location.pathname}#${tcode}`;
}

async function renderTabletPanel(room) {
  const btn = $('#tablet-btn');
  const box = $('#tablet-panel');
  const seated = room.you.seat !== null;
  btn.hidden = !seated;
  const t = room.tablet;
  btn.textContent = t ? (t.online ? 'Tablet: conectado' : 'Tablet: aguardando') : 'Tablet';
  if (!seated || !tabletOpen) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = '';
  const add = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    box.appendChild(e);
    return e;
  };
  const act = (label, ghost, fn) => {
    const b = add('button', ghost ? 'ghost' : '', label);
    b.type = 'button';
    b.addEventListener('click', async () => {
      $('#room-error').textContent = '';
      try { await fn(); } catch (err) { $('#room-error').textContent = err.message; }
      if (current && current.room) renderTabletPanel(current.room);
    });
  };
  if (!t) {
    add('p', 'muted', 'Conecte um tablet para espelhar a mesa. Com ele ligado, os celulares mostram só a mão de cada jogador. Sem o tablet, tudo funciona como sempre.');
    act('Ativar modo tablet', false, async () => { const r = await transport.tablet(room.code, 'get'); current.tabletCode = r.tcode; });
    return;
  }
  if (!current.tabletCode) {
    try { current.tabletCode = (await transport.tablet(room.code, 'get')).tcode; } catch { /* mostra sem codigo */ }
  }
  const tcode = current.tabletCode;
  add('p', 'muted', 'No tablet, abra o site, toque em "Usar este aparelho como tela da mesa" e digite o código do tablet (não é o código da sala):');
  add('div', 'tb-label', 'Código do tablet');
  add('div', 'tb-pin', tcode || '------');
  add('p', 'muted', t.online ? 'Tablet conectado. Seu celular mostra só a sua mão.' : 'Aguardando o tablet conectar. Enquanto isso, o celular segue mostrando a mesa inteira.');
  if (tcode) {
    act('Copiar link do tablet', true, async () => {
      const url = tabletLink(tcode);
      if (navigator.clipboard) { await navigator.clipboard.writeText(url); showNotice('Link do tablet copiado.'); } else prompt('Copie o link:', url);
    });
  }
  act('Gerar novo código', true, async () => {
    if (!confirm('Gerar novo código? O tablet atual será desconectado.')) return;
    current.tabletCode = (await transport.tablet(room.code, 'renew')).tcode;
  });
  act('Desativar modo tablet', true, async () => {
    await transport.tablet(room.code, 'off');
    current.tabletCode = null;
  });
}

$('#tablet-btn').addEventListener('click', () => {
  tabletOpen = !tabletOpen;
  if (current && current.room) renderTabletPanel(current.room);
});

/* ---------- Modo tablet (aparelho da mesa): espelha a partida, sem jogar ---------- */
let wakeLock = null;
async function keepAwake() {
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* sem suporte */ }
}
function releaseWake() {
  try { if (wakeLock) wakeLock.release(); } catch { /* ignora */ }
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current && current.isTable) keepAwake();
});

async function enterTable(tcode) {
  closeRoom();
  $('#home-error').textContent = '';
  const state = { code: null, conn: null, uiId: null, room: null, isTable: true };
  current = state;

  const onRoom = async (room) => {
    if (current !== state) return;
    if (!room.you.tablet) {
      location.hash = '';
      $('#home-error').textContent = 'O modo tablet desta sala foi desativado ou o código foi renovado.';
      return;
    }
    if (state.uiId !== room.game.id) {
      try {
        await Promise.all([loadGameUI(room.game.id), loadTableUI()]);
      } catch (err) {
        $('#table-error').textContent = err.message;
        return;
      }
      state.uiId = room.game.id;
      $('#table-area').innerHTML = '';
    }
    if (current !== state) return;
    state.room = room;
    renderTable(room);
  };

  try {
    const conn = await tableTx().openTable(tcode, { onRoom });
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
  $('#room').hidden = true;
  $('#table').hidden = false;
  document.body.classList.add('is-tablet');
  $('#table-code').textContent = tcode;
  $('#table-error').textContent = '';
  keepAwake();
}

function renderTable(room) {
  $('#table-game').textContent = room.game.name;
  const area = $('#table-area');
  const T = window.TableUI && window.TableUI[room.game.id];
  area.classList.toggle('plain', !T);
  const watcher = { ...room, you: { seat: null, name: null }, mine: undefined, tableMode: false };
  let status;
  try {
    // Jogos sem tela propria de tablet usam a tela normal em modo "assistindo", ampliada.
    status = T ? T(area, room) : window.GameUI[room.game.id].render(area, watcher, () => {});
  } catch (err) {
    $('#table-error').textContent = 'Erro ao desenhar a mesa.';
    console.error(err);
  }
  $('#table-status').textContent = String(status || '').replace(/Você está assistindo\.?\s*/, '');
}

$('#table-leave').addEventListener('click', () => { location.hash = ''; });
$('#table-full').addEventListener('click', () => {
  const root = document.documentElement;
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (root.requestFullscreen) root.requestFullscreen();
    else $('#table-error').textContent = 'Este navegador não permite tela cheia. Use "Adicionar à tela inicial".';
  } catch { /* ignora */ }
});

/* ---------- Jogador ausente: dispensar / voltar ---------- */
const WAIT_BEFORE_DISMISS_MS = 45000; // o botao so aparece depois de esperar um pouco (ou se a pessoa esta desconectada)

function renderWaiting(room) {
  const box = $('#waiting');
  if (!current || !room) return;
  if (current.lastVersion !== room.version) {
    current.lastVersion = room.version;
    current.changedAt = Date.now();
  }
  const v = room.view;
  const mySeat = room.you.seat;
  box.innerHTML = '';
  const waiting = Array.isArray(v.waiting) ? v.waiting : [];
  const auto = Array.isArray(v.auto) ? v.auto : [];
  if (v.over || mySeat === null || (!waiting.length && !auto.length)) {
    box.hidden = true;
    return;
  }
  const player = (seat) => room.players.find((p) => p.seat === seat) || { name: `Jogador ${seat + 1}`, online: false };
  const add = (text, button) => {
    const row = document.createElement('div');
    row.className = 'wrow';
    const t = document.createElement('span');
    t.textContent = text;
    row.appendChild(t);
    if (button) row.appendChild(button);
    box.appendChild(row);
  };
  const makeButton = (label, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ghost';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };

  if (auto.includes(mySeat)) {
    add('Você foi colocado no piloto automático porque o jogo estava esperando por você.', makeButton('Voltar ao jogo', async () => {
      try { await transport.resume(current.code); } catch (err) { $('#room-error').textContent = err.message; }
    }));
  }
  const others = auto.filter((x) => x !== mySeat).map((x) => player(x).name);
  if (others.length) add(`No piloto automático: ${others.join(', ')}.`);

  const longWait = Date.now() - (current.changedAt || Date.now()) >= WAIT_BEFORE_DISMISS_MS;
  for (const seat of waiting) {
    if (seat === mySeat || auto.includes(seat)) continue;
    const p = player(seat);
    const absent = !p.online;
    const label = `Aguardando ${p.name}${absent ? ' (desconectado)' : ''}`;
    if (absent || longWait) {
      add(label, makeButton('Dispensar', async () => {
        const ok = confirm(`Dispensar ${p.name}?\n\nO jogo passa a jogar por essa pessoa no piloto automático (jogadas seguras, sem arriscar) até ela voltar.`);
        if (!ok) return;
        try { await transport.dismiss(current.code, seat); } catch (err) { $('#room-error').textContent = err.message; }
      }));
    } else {
      add(label);
    }
  }
  box.hidden = box.childNodes.length === 0;
}

// Reavalia o painel de tempos em tempos (o botao aparece depois de alguns segundos de espera).
setInterval(() => { if (current && current.room) renderWaiting(current.room); }, 5000);

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

$('#table-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const tcode = $('#tcode').value.trim().toUpperCase();
  if (!TABLET_RE.test(tcode)) {
    $('#home-error').textContent = 'O código do tablet tem 6 caracteres (letras e números).';
    return;
  }
  location.hash = tcode;
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

/* ---------- Regras resumidas ---------- */
$('#rules-btn').addEventListener('click', () => {
  const room = current && current.room;
  const rules = room && window.GameRules && window.GameRules[room.game.id];
  const dlg = $('#rules-dialog');
  $('#rules-title').textContent = room ? `Regras: ${room.game.name}` : 'Regras';
  $('#rules-goal').textContent = rules ? rules.goal : 'Regras resumidas ainda não disponíveis para este jogo.';
  const list = $('#rules-list');
  list.innerHTML = '';
  for (const item of rules ? rules.items : []) {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  }
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
});
$('#rules-close').addEventListener('click', () => $('#rules-dialog').close());
$('#rules-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

$('#share').addEventListener('click', async () => {
  if (!current) return;
  const url = `${location.origin}${location.pathname}#${current.code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Mesa de Jogos', text: `Sala ${current.code}`, url });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      $('#room-error').textContent = '';
      showNotice('Link da sala copiado.');
    } else {
      prompt('Copie o link:', url);
    }
  } catch { /* compartilhamento cancelado */ }
});

function route() {
  const hash = location.hash.replace('#', '').trim().toUpperCase();
  if (TABLET_RE.test(hash)) enterTable(hash);
  else if (/^[A-Z]{4}$/.test(hash)) enterRoom(hash);
  else showHome();
}

window.addEventListener('hashchange', route);

$('#name').value = store.get('name') || '';

$('#key').addEventListener('change', () => {
  store.set('key', $('#key').value.trim());
  $('#home-error').textContent = '';
  renderLibrary();
  checkMaster();
});

/* ---------- Painel do mestre: emitir e revogar codigos de acesso ---------- */
async function checkMaster() {
  const box = $('#admin');
  try {
    const r = accessKey() && typeof transport.admin === 'function' ? await transport.admin('admin_whoami', {}) : { master: false };
    box.hidden = !r.master;
    if (r.master && $('#admin-details').open) loadAdmin();
  } catch {
    box.hidden = true;
  }
}

function statusOf(c) {
  if (c.revoked_at) return 'revogado';
  if (c.expires_at && new Date(c.expires_at) <= new Date()) return 'vencido';
  return 'ativo';
}

async function loadAdmin() {
  $('#admin-error').textContent = '';
  try {
    const { codes } = await transport.admin('admin_list', {});
    const ul = $('#admin-list');
    ul.innerHTML = '';
    for (const c of codes) {
      const li = document.createElement('li');
      const st = statusOf(c);
      const txt = document.createElement('span');
      const fmt = (d) => new Date(d).toLocaleDateString('pt-BR');
      txt.textContent = `${c.label} · ${st}${c.expires_at && st === 'ativo' ? ` · até ${fmt(c.expires_at)}` : ''}${c.last_used_at ? ` · usado em ${fmt(c.last_used_at)}` : ' · nunca usado'}`;
      li.appendChild(txt);
      if (st === 'ativo') {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'danger';
        b.textContent = 'Revogar';
        b.addEventListener('click', async () => {
          if (!confirm(`Revogar o código de ${c.label}? Essa pessoa perde o acesso.`)) return;
          try { await transport.admin('admin_revoke', { id: c.id }); loadAdmin(); } catch (err) { $('#admin-error').textContent = err.message; }
        });
        li.appendChild(b);
      }
      ul.appendChild(li);
    }
    if (!codes.length) ul.textContent = 'Nenhum código emitido ainda.';
  } catch (err) {
    $('#admin-error').textContent = err.message;
  }
}

$('#admin-details').addEventListener('toggle', () => { if ($('#admin-details').open) loadAdmin(); });
$('#admin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#admin-error').textContent = '';
  try {
    const days = $('#admin-days').value.trim();
    const r = await transport.admin('admin_create', { label: $('#admin-label').value, days: days === '' ? null : Number(days) });
    const box = $('#admin-new');
    box.hidden = false;
    box.innerHTML = '';
    const info = document.createElement('div');
    info.textContent = `Código de ${r.label}${r.expires_at ? ` (vale até ${new Date(r.expires_at).toLocaleDateString('pt-BR')})` : ''}. Anote ou envie agora: ele não será mostrado de novo.`;
    const code = document.createElement('strong');
    code.className = 'admin-code';
    code.textContent = r.code;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'ghost';
    copy.textContent = 'Copiar código';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(r.code); copy.textContent = 'Copiado'; } catch { prompt('Copie o código:', r.code); }
    });
    box.append(info, code, copy);
    $('#admin-label').value = '';
    $('#admin-days').value = '';
    loadAdmin();
  } catch (err) {
    $('#admin-error').textContent = err.message;
  }
});

async function start() {
  if (await transport.needsKey()) {
    $('#key-field').hidden = false;
    $('#key').value = accessKey();
  }
  renderLibrary();
  checkMaster();
  route();
}

start();

// Permite instalar na tela inicial (abre em tela cheia). Falhas aqui nao afetam o jogo.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ---------- Menu compacto da sala (celulares estreitos) ---------- */
$('#menu-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const m = $('#room-menu');
  m.hidden = !m.hidden;
  $('#menu-btn').setAttribute('aria-expanded', String(!m.hidden));
});
$('#menu-share').addEventListener('click', () => { $('#room-menu').hidden = true; $('#share').click(); });
$('#menu-rules').addEventListener('click', () => { $('#room-menu').hidden = true; $('#rules-btn').click(); });
document.addEventListener('click', () => { const m = $('#room-menu'); if (!m.hidden) { m.hidden = true; $('#menu-btn').setAttribute('aria-expanded', 'false'); } });
