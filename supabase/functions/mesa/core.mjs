// Logica da Mesa de Jogos, independente do banco: recebe um adaptador `db`.
// A Edge Function (index.ts) liga este modulo ao Supabase; os testes usam um banco em memoria.
import { library } from './games/index.mjs';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O
const PID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_RETRIES = 5;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Jogador';
const toRoster = (members) => members.map(({ pk, name, seat }) => ({ pk, name, seat }));
const publicRoom = (r) => ({ code: r.code, game: r.game, view: r.view, roster: r.roster, version: r.version });

function newCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

function randomId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

function requirePid(pid) {
  if (typeof pid !== 'string' || !PID_RE.test(pid)) throw new HttpError(400, 'Identificador inválido.');
}

function gameOf(id) {
  const game = library[id];
  if (!game) throw new HttpError(400, 'Jogo desconhecido.');
  return game;
}

// Adiciona o jogador (ou atualiza o nome). Os primeiros ocupam as vagas; os demais assistem.
function joinMember(members, game, pid, name) {
  const existing = members.find((m) => m.pid === pid);
  if (existing) {
    if (existing.name === name) return { members, member: existing, changed: false };
    const next = members.map((m) => (m.pid === pid ? { ...m, name } : m));
    return { members: next, member: next.find((m) => m.pid === pid), changed: true };
  }
  const taken = new Set(members.filter((m) => m.seat !== null).map((m) => m.seat));
  let seat = null;
  for (let i = 0; i < game.maxPlayers; i++) {
    if (!taken.has(i)) {
      seat = i;
      break;
    }
  }
  const member = { pid, pk: randomId(), name, seat };
  return { members: [...members, member], member, changed: true };
}

// Le a sala, aplica `change` e grava com controle de versao; repete se houver conflito.
async function mutate(db, code, change) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const room = await db.getRoom(code);
    if (!room) throw new HttpError(404, 'Sala não encontrada.');
    const game = gameOf(room.game);
    const out = change(room, game);
    if (!out.write) return out.result(room);
    const next = {
      code,
      expected: room.version,
      view: game.view(out.write.state),
      roster: toRoster(out.write.members),
      state: out.write.state,
      members: out.write.members,
    };
    if (await db.applyRoom(next)) {
      return out.result({ ...room, view: next.view, roster: next.roster, version: room.version + 1 });
    }
  }
  throw new HttpError(409, 'A sala está muito movimentada. Tente de novo.');
}

export function listGames() {
  return Object.values(library).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    roles: g.roles,
  }));
}

export async function handle(db, body) {
  const code = String(body.code || '').toUpperCase();
  const checkCode = () => {
    if (!/^[A-Z]{4}$/.test(code)) throw new HttpError(404, 'Sala não encontrada.');
  };

  switch (body.action) {
    case 'games':
      return listGames();

    case 'create': {
      requirePid(body.pid);
      const game = gameOf(body.game);
      const state = game.setup();
      const { members } = joinMember([], game, body.pid, cleanName(body.name));
      for (let i = 0; i < 20; i++) {
        const newRoomCode = newCode();
        const ok = await db.insertRoom({
          code: newRoomCode,
          game: game.id,
          view: game.view(state),
          roster: toRoster(members),
          state,
          members,
        });
        if (ok) {
          db.purgeOld(30).catch(() => {});
          return { code: newRoomCode };
        }
      }
      throw new HttpError(500, 'Não foi possível criar a sala.');
    }

    case 'join': {
      requirePid(body.pid);
      checkCode();
      const name = cleanName(body.name);
      return mutate(db, code, (room, game) => {
        const joined = joinMember(room.members, game, body.pid, name);
        const result = (r) => ({ seat: joined.member.seat, pk: joined.member.pk, room: publicRoom(r) });
        return joined.changed ? { write: { state: room.state, members: joined.members }, result } : { result };
      });
    }

    case 'move':
    case 'restart': {
      requirePid(body.pid);
      checkCode();
      return mutate(db, code, (room, game) => {
        const me = room.members.find((m) => m.pid === body.pid);
        if (!me) throw new HttpError(403, 'Entre na sala primeiro.');
        if (me.seat === null) throw new HttpError(403, 'Espectadores não podem jogar.');
        let state;
        if (body.action === 'restart') {
          state = game.setup();
        } else {
          const res = game.move(room.state, me.seat, body.move);
          if (res.error) throw new HttpError(400, res.error);
          state = res.state;
        }
        return { write: { state, members: room.members }, result: (r) => ({ ok: true, room: publicRoom(r) }) };
      });
    }

    default:
      throw new HttpError(400, 'Ação desconhecida.');
  }
}
