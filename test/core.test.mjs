import assert from 'node:assert';
import { handle, HttpError } from '../supabase/functions/mesa/core.mjs';

// Banco em memoria com as mesmas garantias do Supabase (versao otimista).
function memDb({ failApplyTimes = 0 } = {}) {
  const rows = new Map();
  let fails = failApplyTimes;
  return {
    rows,
    async getRoom(code) { const r = rows.get(code); return r ? structuredClone(r) : null; },
    async insertRoom(r) { if (rows.has(r.code)) return false; rows.set(r.code, { ...structuredClone(r), version: 1 }); return true; },
    async applyRoom(r) {
      const cur = rows.get(r.code);
      if (fails > 0) { fails--; return false; }
      if (!cur || cur.version !== r.expected) return false;
      rows.set(r.code, { ...cur, ...structuredClone({ view: r.view, roster: r.roster, state: r.state, members: r.members }), version: cur.version + 1 });
      return true;
    },
    async purgeOld() {},
  };
}

const A = 'aaaaaaaa-aaaa', B = 'bbbbbbbb-bbbb', C = 'cccccccc-cccc';
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };
const fails = async (p, status) => { try { await p; } catch (e) { assert.ok(e instanceof HttpError); assert.strictEqual(e.status, status); return e; } assert.fail('deveria falhar'); };

await t('lista a biblioteca', async () => {
  const g = await handle(memDb(), { action: 'games' });
  assert.strictEqual(g[0].id, 'damas');
});

await t('cria sala, entram 2 jogadores e 1 espectador', async () => {
  const db = memDb();
  const { code } = await handle(db, { action: 'create', game: 'damas', pid: A, name: 'Lucas' });
  assert.match(code, /^[A-Z]{4}$/);
  const jb = await handle(db, { action: 'join', code, pid: B, name: 'Ana' });
  const jc = await handle(db, { action: 'join', code, pid: C, name: 'Pedro' });
  assert.strictEqual(jb.seat, 1);
  assert.strictEqual(jc.seat, null);
  assert.strictEqual(jc.room.roster.length, 3);
  const stored = db.rows.get(code);
  assert.ok(!JSON.stringify(stored.roster).includes(A), 'roster publico nao pode ter o pid');
  assert.ok(!JSON.stringify(stored.view).includes(A));
});

await t('reentrar nao altera a sala (sem nova versao)', async () => {
  const db = memDb();
  const { code } = await handle(db, { action: 'create', game: 'damas', pid: A, name: 'Lucas' });
  const v0 = db.rows.get(code).version;
  const j = await handle(db, { action: 'join', code, pid: A, name: 'Lucas' });
  assert.strictEqual(j.seat, 0);
  assert.strictEqual(db.rows.get(code).version, v0);
});

await t('jogada valida avanca turno e versao; ilegal e fora da vez sao recusadas', async () => {
  const db = memDb();
  const { code } = await handle(db, { action: 'create', game: 'damas', pid: A, name: 'Lucas' });
  await handle(db, { action: 'join', code, pid: B, name: 'Ana' });
  await fails(handle(db, { action: 'move', code, pid: B, move: { from: [2, 1], path: [[3, 0]] } }), 400); // fora da vez
  await fails(handle(db, { action: 'move', code, pid: A, move: { from: [5, 0], path: [[3, 2]] } }), 400); // ilegal
  const v = db.rows.get(code).version;
  await handle(db, { action: 'move', code, pid: A, move: { from: [5, 0], path: [[4, 1]] } });
  const row = db.rows.get(code);
  assert.strictEqual(row.version, v + 1);
  assert.strictEqual(row.view.turn, 1);
  assert.strictEqual(row.view.board[4][1], 'w');
});

await t('espectador e desconhecido nao jogam', async () => {
  const db = memDb();
  const { code } = await handle(db, { action: 'create', game: 'damas', pid: A, name: 'L' });
  await handle(db, { action: 'join', code, pid: B, name: 'Ana' });
  await handle(db, { action: 'join', code, pid: C, name: 'Pedro' });
  await fails(handle(db, { action: 'move', code, pid: C, move: {} }), 403);
  await fails(handle(db, { action: 'move', code, pid: 'dddddddd-dddd', move: {} }), 403);
  await fails(handle(db, { action: 'restart', code, pid: C }), 403);
});

await t('conflito de versao: tenta de novo e conclui; esgotando, devolve 409', async () => {
  const db = memDb({ failApplyTimes: 2 });
  const { code } = await handle(db, { action: 'create', game: 'damas', pid: A, name: 'L' });
  await handle(db, { action: 'join', code, pid: B, name: 'Ana' });
  await handle(db, { action: 'move', code, pid: A, move: { from: [5, 0], path: [[4, 1]] } });
  assert.strictEqual(db.rows.get(code).view.turn, 1);
  const db2 = memDb({ failApplyTimes: 99 });
  const r = await handle(db2, { action: 'create', game: 'damas', pid: A, name: 'L' });
  await fails(handle(db2, { action: 'join', code: r.code, pid: B, name: 'Ana' }), 409);
});

await t('reiniciar partida', async () => {
  const db = memDb();
  const { code } = await handle(db, { action: 'create', game: 'damas', pid: A, name: 'L' });
  await handle(db, { action: 'join', code, pid: B, name: 'Ana' });
  await handle(db, { action: 'move', code, pid: A, move: { from: [5, 0], path: [[4, 1]] } });
  await handle(db, { action: 'restart', code, pid: B });
  assert.strictEqual(db.rows.get(code).view.turn, 0);
  assert.strictEqual(db.rows.get(code).view.board[5][0], 'w');
});

await t('entradas invalidas', async () => {
  const db = memDb();
  await fails(handle(db, { action: 'create', game: 'xadrez', pid: A }), 400);
  await fails(handle(db, { action: 'create', game: 'damas', pid: 'x' }), 400);
  await fails(handle(db, { action: 'join', code: 'ZZZZ', pid: A }), 404);
  await fails(handle(db, { action: 'join', code: '12', pid: A }), 404);
  await fails(handle(db, { action: 'foo' }), 400);
});

console.log(`${n} testes passaram`);
