'use strict';
// Servidor da plataforma: serve a interface web e mantem o estado oficial das
// partidas. Os clientes enviam apenas a intencao da jogada; o servidor valida.
// Sem dependencias externas: HTTP + Server-Sent Events (SSE).

const http = require('http');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const path = require('path');
const { library, list } = require('./games');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const ACCESS_KEY = process.env.ACCESS_KEY || ''; // senha do grupo; vazia = acesso livre (modo local)
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'rooms.json');

const rooms = new Map();

function loadRooms() {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const r of saved) {
      if (!library[r.game]) continue;
      rooms.set(r.code, { ...r, clients: new Set() });
    }
    console.log(`${rooms.size} sala(s) restaurada(s) de ${DATA_FILE}`);
  } catch {
    /* sem arquivo salvo: comeca vazio */
  }
}

let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const data = [...rooms.values()].map(({ code, game, state, version, players, updated }) => ({
      code, game, state, version, players, updated,
    }));
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(`${DATA_FILE}.tmp`, JSON.stringify(data));
      fs.renameSync(`${DATA_FILE}.tmp`, DATA_FILE);
    } catch (err) {
      console.error('Não foi possível salvar as partidas:', err.message);
    }
  }, 1000);
}

function keyOk(req, url) {
  if (!ACCESS_KEY) return true;
  const given = String(req.headers['x-access-key'] || url.searchParams.get('key') || '');
  const a = Buffer.from(given);
  const b = Buffer.from(ACCESS_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function newCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

function cleanName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return n || 'Jogador';
}

const validPid = (pid) => typeof pid === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(pid);

function seatedPlayers(room) {
  return room.players.filter((p) => p.seat !== null);
}

function isOnline(room, pid) {
  for (const client of room.clients) if (client.pid === pid) return true;
  return false;
}

function payloadFor(room, pid) {
  const game = library[room.game];
  const me = room.players.find((p) => p.id === pid);
  return {
    code: room.code,
    version: room.version,
    game: { id: game.id, name: game.name, roles: game.roles, maxPlayers: game.maxPlayers },
    players: seatedPlayers(room)
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({ name: p.name, seat: p.seat, online: isOnline(room, p.id) })),
    spectators: room.players.filter((p) => p.seat === null).map((p) => ({ name: p.name })),
    you: { seat: me ? me.seat : null, name: me ? me.name : null },
    view: game.view(room.state),
    mine: typeof game.viewFor === 'function' ? game.viewFor(room.state, me ? me.seat : null) : undefined,
  };
}

function broadcast(room) {
  room.updated = Date.now();
  saveSoon();
  for (const client of room.clients) {
    client.res.write(`data: ${JSON.stringify(payloadFor(room, client.pid))}\n\n`);
  }
}

function joinRoom(room, pid, name) {
  const game = library[room.game];
  let player = room.players.find((p) => p.id === pid);
  if (player) {
    player.name = name;
  } else {
    const taken = new Set(seatedPlayers(room).map((p) => p.seat));
    let seat = null;
    const open = typeof game.acceptsSeat === 'function' ? game.acceptsSeat(room.state) : true;
    for (let i = 0; open && i < game.maxPlayers; i++) {
      if (!taken.has(i)) {
        seat = i;
        break;
      }
    }
    player = { id: pid, name, seat };
    room.players.push(player);
    if (seat !== null && typeof game.seatJoined === 'function') room.state = game.seatJoined(room.state, seat);
  }
  return player;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10000) {
        reject(new Error('Requisição grande demais.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  // Rotas sem senha: sinal de vida (evita que a hospedagem durma) e configuracao.
  if (req.method === 'GET' && parts[1] === 'ping') return sendJson(res, 200, { ok: true });
  if (req.method === 'GET' && parts[1] === 'config') return sendJson(res, 200, { needsKey: Boolean(ACCESS_KEY) });
  if (!keyOk(req, url)) return sendJson(res, 401, { error: 'Senha do grupo incorreta.' });

  if (req.method === 'GET' && parts[1] === 'games' && parts.length === 2) {
    return sendJson(res, 200, list());
  }

  if (req.method === 'POST' && parts[1] === 'rooms' && parts.length === 2) {
    const body = await readJson(req);
    if (!library[body.game]) return sendJson(res, 400, { error: 'Jogo desconhecido.' });
    if (!validPid(body.pid)) return sendJson(res, 400, { error: 'Identificador inválido.' });
    const game = library[body.game];
    const room = {
      code: newCode(),
      game: game.id,
      state: game.setup(),
      version: 1,
      players: [],
      clients: new Set(),
      updated: Date.now(),
    };
    rooms.set(room.code, room);
    joinRoom(room, body.pid, cleanName(body.name));
    saveSoon();
    return sendJson(res, 200, { code: room.code });
  }

  if (parts[1] === 'rooms' && parts.length === 4) {
    const room = rooms.get(String(parts[2]).toUpperCase());
    if (!room) return sendJson(res, 404, { error: 'Sala não encontrada.' });
    const action = parts[3];

    if (req.method === 'GET' && action === 'events') {
      const pid = url.searchParams.get('pid');
      if (!room.players.some((p) => p.id === pid)) return sendJson(res, 403, { error: 'Entre na sala primeiro.' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 2000\n\n');
      const client = { pid, res };
      room.clients.add(client);
      res.write(`data: ${JSON.stringify(payloadFor(room, pid))}\n\n`);
      broadcast(room); // avisa os demais que este jogador esta online
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => {
        clearInterval(ping);
        room.clients.delete(client);
        broadcast(room);
      });
      return undefined;
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      if (!validPid(body.pid)) return sendJson(res, 400, { error: 'Identificador inválido.' });

      if (action === 'join') {
        const player = joinRoom(room, body.pid, cleanName(body.name));
        broadcast(room);
        return sendJson(res, 200, { seat: player.seat });
      }

      const player = room.players.find((p) => p.id === body.pid);
      if (!player) return sendJson(res, 403, { error: 'Entre na sala primeiro.' });
      if (player.seat === null) return sendJson(res, 403, { error: 'Espectadores não podem jogar.' });
      const game = library[room.game];

      if (action === 'move') {
        const result = game.move(room.state, player.seat, body.move);
        if (result.error) return sendJson(res, 400, { error: result.error });
        room.state = result.state;
        room.version++;
        broadcast(room);
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'restart') {
        room.state = typeof game.restart === 'function' ? game.restart(room.state) : game.setup();
        room.version++;
        broadcast(room);
        return sendJson(res, 200, { ok: true });
      }
    }
  }

  return sendJson(res, 404, { error: 'Rota não encontrada.' });
}

function serveStatic(req, res, url) {
  // O servidor local nao usa o Supabase: anula a configuracao de nuvem do config.js.
  if (url.pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' });
    return res.end('window.MESA_CONFIG = {};\n');
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
  return undefined;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (err) {
    if (!res.headersSent) sendJson(res, 400, { error: err.message });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.clients.size === 0 && now - room.updated > ROOM_TTL_MS) rooms.delete(code);
  }
}, 10 * 60 * 1000).unref();

function lanAddresses() {
  try {
    const out = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
    return out;
  } catch {
    return [];
  }
}

loadRooms();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor ativo na porta ${PORT}${ACCESS_KEY ? ' (com senha do grupo)' : ' (sem senha)'}`);
  console.log(`Neste aparelho: http://localhost:${PORT}`);
  const ips = lanAddresses();
  if (ips.length === 0) {
    console.log('Não foi possível detectar o IP da rede. Veja o IP nas configurações do Wi-Fi/hotspot.');
  }
  for (const ip of ips) console.log(`Outros aparelhos:   http://${ip}:${PORT}`);
});

module.exports = { server };
