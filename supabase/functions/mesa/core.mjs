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
// O roster e publico (Realtime): nunca leva o pid nem o codigo do tablet. O tablet aparece so como { tablet: true }.
const toRoster = (members) => members.map(({ pk, name, seat, tablet }) => (tablet ? { pk, name, seat, tablet: true } : { pk, name, seat }));
const publicRoom = (r) => ({ code: r.code, game: r.game, view: r.view, roster: r.roster, version: r.version });
// Visao privada de quem joga (a mao de cartas, jogadas permitidas...). Espectadores recebem seat = null.
const mineOf = (game, state, seat) => (typeof game.viewFor === 'function' ? game.viewFor(state, seat) : undefined);

/* ---------- Piloto automatico (jogador dispensado) ----------
   O estado guarda `auto` (assentos dispensados). Sempre que o jogo espera por um deles, o servidor faz uma
   jogada segura em nome dele (game.autoMove) e segue, na mesma gravacao. O jogador volta ao controle quando
   joga de novo, entra na sala outra vez ou toca em "Voltar". */
const MAX_AUTO_STEPS = 300;
const waitingOf = (game, state, auto) =>
  typeof game.waitingOn === 'function' && state.phase !== 'lobby' ? game.waitingOn(state, auto) || [] : [];
// Visao publica = visao do jogo + quem esta no piloto automatico + por quem o jogo espera.
const publicView = (game, state) => ({ ...game.view(state), auto: state.auto || [], waiting: waitingOf(game, state, null) });

function settle(game, state) {
  let s = state;
  const auto = state.auto || [];
  if (!auto.length || typeof game.autoMove !== 'function') return s;
  for (let i = 0; i < MAX_AUTO_STEPS; i++) {
    const seats = waitingOf(game, s, auto).filter((x) => auto.includes(x));
    if (!seats.length) break;
    const req = game.autoMove(s, seats[0]);
    if (!req) break;
    const r = game.move(s, seats[0], req);
    if (!r.state) break;
    s = { ...r.state, auto };
  }
  return s;
}

function newCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

// Codigo proprio do tablet (6 caracteres, diferente do codigo da sala de 4 letras). Identifica a "mesa" da sala.
const TABLET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TABLET_RE = /^[A-HJ-NP-Z2-9]{6}$/;
function newTabletCode() {
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => TABLET_ALPHABET[n % TABLET_ALPHABET.length]).join('');
}

function sameText(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
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
// Jogos com fase de lobby so aceitam novos jogadores antes de comecar (game.acceptsSeat).
function joinMember(members, game, pid, name, state) {
  const existing = members.find((m) => m.pid === pid);
  if (existing) {
    if (existing.name === name) return { members, member: existing, changed: false, isNew: false };
    const next = members.map((m) => (m.pid === pid ? { ...m, name } : m));
    return { members: next, member: next.find((m) => m.pid === pid), changed: true, isNew: false };
  }
  const taken = new Set(members.filter((m) => m.seat !== null).map((m) => m.seat));
  let seat = null;
  const open = typeof game.acceptsSeat === 'function' ? game.acceptsSeat(state) : true;
  for (let i = 0; open && i < game.maxPlayers; i++) {
    if (!taken.has(i)) {
      seat = i;
      break;
    }
  }
  const member = { pid, pk: randomId(), name, seat };
  return { members: [...members, member], member, changed: true, isNew: true };
}

// Avisa o jogo que alguem sentou (jogos com varios lugares contam os jogadores).
const seated = (game, state, member) =>
  member.seat !== null && typeof game.seatJoined === 'function' ? game.seatJoined(state, member.seat) : state;

// Le a sala, aplica `change` e grava com controle de versao; repete se houver conflito.
async function mutate(db, code, change) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const room = await db.getRoom(code);
    if (!room) throw new HttpError(404, 'Sala não encontrada.');
    const game = gameOf(room.game);
    const out = change(room, game);
    if (!out.write) return out.result(room, room.state);
    const next = {
      code,
      expected: room.version,
      view: publicView(game, out.write.state),
      roster: toRoster(out.write.members),
      state: out.write.state,
      members: out.write.members,
    };
    if (await db.applyRoom(next)) {
      return out.result({ ...room, view: next.view, roster: next.roster, version: room.version + 1 }, next.state);
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
    hasPrivate: typeof g.viewFor === 'function',
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
      let state = game.setup();
      const first = joinMember([], game, body.pid, cleanName(body.name), state);
      const members = first.members;
      state = seated(game, state, first.member);
      for (let i = 0; i < 20; i++) {
        const newRoomCode = newCode();
        const ok = await db.insertRoom({
          code: newRoomCode,
          game: game.id,
          view: publicView(game, state),
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
        const joined = joinMember(room.members, game, body.pid, name, room.state);
        let state = joined.isNew ? seated(game, room.state, joined.member) : room.state;
        const wasAuto = !joined.isNew && joined.member.seat !== null && (state.auto || []).includes(joined.member.seat);
        if (wasAuto) state = { ...state, auto: state.auto.filter((x) => x !== joined.member.seat) }; // voltou: reassume o controle
        const result = (r, st) => ({
          seat: joined.member.seat,
          pk: joined.member.pk,
          room: publicRoom(r),
          mine: mineOf(game, st, joined.member.seat),
        });
        return joined.changed || wasAuto ? { write: { state, members: joined.members }, result } : { result };
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
        // quem estava no piloto automatico reassume ao jogar
        const auto = (room.state.auto || []).filter((x) => x !== me.seat);
        if (body.action === 'restart') {
          state = typeof game.restart === 'function' ? game.restart(room.state) : game.setup();
        } else {
          const res = game.move({ ...room.state, auto }, me.seat, body.move);
          if (res.error) throw new HttpError(400, res.error);
          state = res.state;
        }
        state = settle(game, { ...state, auto });
        return { write: { state, members: room.members }, result: (r, st) => ({ ok: true, room: publicRoom(r), mine: mineOf(game, st, me.seat) }) };
      });
    }

    case 'dismiss':
    case 'resume': {
      requirePid(body.pid);
      checkCode();
      return mutate(db, code, (room, game) => {
        const me = room.members.find((m) => m.pid === body.pid);
        if (!me) throw new HttpError(403, 'Entre na sala primeiro.');
        if (me.seat === null) throw new HttpError(403, 'Espectadores não podem fazer isso.');
        const auto = room.state.auto || [];
        const ok = (state) => ({ write: { state, members: room.members }, result: (r, st) => ({ ok: true, room: publicRoom(r), mine: mineOf(game, st, me.seat) }) });
        if (body.action === 'resume') {
          if (!auto.includes(me.seat)) return { result: (r, st) => ({ ok: true, room: publicRoom(r), mine: mineOf(game, st, me.seat) }) };
          return ok({ ...room.state, auto: auto.filter((x) => x !== me.seat) });
        }
        const target = body.target;
        if (typeof game.autoMove !== 'function') throw new HttpError(400, 'Este jogo não tem piloto automático.');
        if (typeof room.state.players === 'number' && me.seat >= room.state.players) throw new HttpError(403, 'Você não está nesta partida.');
        if (!Number.isInteger(target) || target === me.seat) throw new HttpError(400, 'Escolha outro jogador.');
        if (auto.includes(target)) throw new HttpError(400, 'Esse jogador já foi dispensado.');
        if (!waitingOf(game, room.state, null).includes(target)) throw new HttpError(400, 'O jogo não está esperando por esse jogador agora.');
        return ok(settle(game, { ...room.state, auto: [...auto, target] }));
      });
    }

    /* ---------- Modo tablet ----------
       Um aparelho extra (o tablet) entra com um codigo PROPRIO, diferente do da sala, e passa a espelhar a mesa
       (visao publica). Ele aparece na sala como "mesa": nao ocupa vaga e nao joga. So quem esta sentado ativa,
       consulta, renova ou desativa o codigo. O banco guarda codigo -> sala (db.putTabletCode / roomByTabletCode). */
    case 'tablet': {
      requirePid(body.pid);
      checkCode();
      const op = body.op === 'off' || body.op === 'renew' ? body.op : 'get';
      const room0 = await db.getRoom(code);
      if (!room0) throw new HttpError(404, 'Sala não encontrada.');
      const me0 = room0.members.find((m) => m.pid === body.pid);
      if (!me0) throw new HttpError(403, 'Entre na sala primeiro.');
      if (me0.seat === null) throw new HttpError(403, 'Só quem está jogando controla o tablet.');
      const cur0 = room0.members.find((m) => m.tablet);
      let fresh = null;
      if (op === 'renew' || (op === 'get' && !cur0)) {
        for (let i = 0; i < 20 && !fresh; i++) {
          const c = newTabletCode();
          if (await db.putTabletCode(c, code)) fresh = c;
        }
        if (!fresh) throw new HttpError(500, 'Não foi possível criar o código do tablet.');
      }
      const out = await mutate(db, code, (room) => {
        const cur = room.members.find((m) => m.tablet);
        const done = (tc) => (r) => ({ ok: true, tcode: tc, room: publicRoom(r) });
        if (op === 'off') {
          if (!cur) return { result: done(null) };
          return { write: { state: room.state, members: room.members.filter((m) => !m.tablet) }, result: done(null) };
        }
        if (cur && !fresh) return { result: done(cur.tcode) };
        const entry = { pid: null, pk: randomId(), name: 'Mesa', seat: null, tablet: true, tcode: fresh };
        const members = cur ? room.members.map((m) => (m.tablet ? entry : m)) : [...room.members, entry];
        return { write: { state: room.state, members }, result: done(fresh) };
      });
      // codigo antigo (renovado ou desativado) deixa de valer
      if (cur0 && (op === 'off' || fresh)) await db.dropTabletCode(cur0.tcode);
      return out;
    }

    case 'tablet_join': {
      requirePid(body.pid);
      const tcode = String(body.tcode || '').toUpperCase().trim();
      if (!TABLET_RE.test(tcode)) throw new HttpError(404, 'Código do tablet incorreto ou desativado.');
      const roomCode = await db.roomByTabletCode(tcode);
      if (!roomCode) throw new HttpError(404, 'Código do tablet incorreto ou desativado.');
      return mutate(db, roomCode, (room) => {
        const t = room.members.find((m) => m.tablet);
        if (!t || !sameText(t.tcode, tcode)) throw new HttpError(404, 'Código do tablet incorreto ou desativado.');
        if (room.members.some((m) => m.pid === body.pid && !m.tablet)) {
          throw new HttpError(400, 'Este navegador já está na sala como jogador. Abra o tablet em outro aparelho.');
        }
        const result = (r) => ({ code: roomCode, pk: t.pk, room: publicRoom(r) });
        if (t.pid === body.pid) return { result };
        const members = room.members.map((m) => (m.tablet ? { ...m, pid: body.pid } : m));
        return { write: { state: room.state, members }, result };
      });
    }

    case 'mine': {
      // Visao privada atual (mao de cartas etc.) de quem pergunta; usada pelos outros jogadores a cada mudanca.
      requirePid(body.pid);
      checkCode();
      const room = await db.getRoom(code);
      if (!room) throw new HttpError(404, 'Sala não encontrada.');
      const me = room.members.find((m) => m.pid === body.pid);
      if (!me) throw new HttpError(403, 'Entre na sala primeiro.');
      return { version: room.version, mine: mineOf(gameOf(room.game), room.state, me.seat) };
    }

    default:
      throw new HttpError(400, 'Ação desconhecida.');
  }
}
