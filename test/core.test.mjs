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
  assert.ok(g.some((x) => x.id === 'damas'));
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

await t('jogo solo: so um assento; segundo jogador assiste e ve so a visao publica', async () => {
  const db = memDb();
  const { code } = await handle(db, { action: 'create', game: 'paciencia', pid: A, name: 'Lucas' });
  const jb = await handle(db, { action: 'join', code, pid: B, name: 'Ana' });
  assert.strictEqual(jb.seat, null);
  const row = db.rows.get(code);
  for (const pile of row.state.tableau) for (const x of pile) if (!x.up) assert.ok(!JSON.stringify(row.view).includes(`"${x.c}"`), 'carta virada vazou na view publica');
  assert.ok(!JSON.stringify(row.view).includes(row.state.stock[0]), 'monte vazou');
  await fails(handle(db, { action: 'move', code, pid: B, move: { t: 'draw' } }), 403);
  const v0 = row.version;
  const r = await handle(db, { action: 'move', code, pid: A, move: { t: 'draw' } });
  assert.strictEqual(r.room.version, v0 + 1);
  assert.strictEqual(r.room.view.waste.length, 1);
  await fails(handle(db, { action: 'move', code, pid: A, move: { t: 'move', from: { k: 'tab', i: 0, n: 0 }, to: { k: 'tab', i: 0 } } }), 400);
});

await t('jogo com maos escondidas: lobby, comecar, visao privada, espectador tardio e acao mine', async () => {
  const db = memDb();
  const { code } = await handle(db, { action: 'create', game: 'uno', pid: A, name: 'Lucas' });
  const jb = await handle(db, { action: 'join', code, pid: B, name: 'Ana' });
  assert.strictEqual(jb.seat, 1); assert.strictEqual(jb.mine, null);                     // lobby: sem visao privada
  await fails(handle(db, { action: 'move', code, pid: B, move: { t: 'start' } }), 400);   // so o anfitriao comeca
  const started = await handle(db, { action: 'move', code, pid: A, move: { t: 'start' } });
  assert.strictEqual(started.mine.hand.length, 7);
  const row = db.rows.get(code);
  assert.strictEqual(row.view.phase, 'playing');
  for (const h of row.state.hands) for (const c of h) assert.ok(!JSON.stringify(row.view).replace(/"top":"[^"]+"/, '').includes(`"${c}"`), 'mao vazou na view publica');
  const late = await handle(db, { action: 'join', code, pid: C, name: 'Pedro' });
  assert.strictEqual(late.seat, null); assert.strictEqual(late.mine, null);               // entrou depois: assiste
  const mb = await handle(db, { action: 'mine', code, pid: B });
  assert.deepStrictEqual(mb.mine.hand, row.state.hands[1]); assert.strictEqual(mb.version, db.rows.get(code).version);
  const mc = await handle(db, { action: 'mine', code, pid: C }); assert.strictEqual(mc.mine, null);
  await fails(handle(db, { action: 'mine', code, pid: 'dddddddd-dddd' }), 403);
  const rs = await handle(db, { action: 'restart', code, pid: B });                     // nova mao com os mesmos jogadores
  assert.strictEqual(rs.mine.hand.length, 7); assert.strictEqual(db.rows.get(code).state.players, 2);
});

await t('lista de jogos informa quais usam visao privada', async () => {
  const g = await handle(memDb(), { action: 'games' });
  const by = Object.fromEntries(g.map((x) => [x.id, x.hasPrivate]));
  assert.deepStrictEqual([by.damas, by.paciencia, by.uno, by.truco, by.buraco, by.caxeta], [false, false, true, true, true, true]);
});

console.log(`${n} testes passaram`);
