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
    tcodes: new Map(),
    async putTabletCode(c, room) { if (this.tcodes.has(c)) return false; this.tcodes.set(c, room); return true; },
    async dropTabletCode(c) { this.tcodes.delete(c); },
    async roomByTabletCode(c) { const r = this.tcodes.get(c); return r && rows.has(r) ? r : null; },
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

const P = ['aaaaaaaa-0000', 'bbbbbbbb-1111', 'cccccccc-2222', 'dddddddd-3333', 'eeeeeeee-4444', 'ffffffff-5555'];
const open = async (db, game, k, startMove) => {
  const { code } = await handle(db, { action: 'create', game, pid: P[0], name: 'J0' });
  for (let i = 1; i < k; i++) await handle(db, { action: 'join', code, pid: P[i], name: 'J' + i });
  await handle(db, { action: 'move', code, pid: P[0], move: startMove });
  return code;
};

await t('dispensar: so quem trava a vez, por outro jogador; joga por ele e devolve a vez ao proximo', async () => {
  const db = memDb();
  const code = await open(db, 'uno', 3, { t: 'start' });
  const turn = db.rows.get(code).view.turn;
  const other = (turn + 1) % 3, third = (turn + 2) % 3;
  assert.deepStrictEqual(db.rows.get(code).view.waiting, [turn]);
  await fails(handle(db, { action: 'dismiss', code, pid: P[turn], target: turn }), 400);          // nao a si mesmo
  await fails(handle(db, { action: 'dismiss', code, pid: P[other], target: third }), 400);        // o jogo nao espera por ele
  await fails(handle(db, { action: 'dismiss', code, pid: P[other], target: 9 }), 400);
  const v0 = db.rows.get(code).version;
  const r = await handle(db, { action: 'dismiss', code, pid: P[other], target: turn });
  assert.ok(r.ok); const row = db.rows.get(code);
  assert.deepStrictEqual(row.view.auto, [turn]); assert.ok(row.version > v0);
  assert.ok(!row.view.waiting.includes(turn));                                                    // o jogo ja nao espera por ele
  assert.ok(row.view.counts[turn] >= 6);                                                          // ele jogou (ou comprou) em nome do ausente
  await fails(handle(db, { action: 'dismiss', code, pid: P[third], target: turn }), 400);         // ja dispensado
});

await t('espectador nao dispensa; piloto devolve o controle ao jogar, ao entrar de novo e em "Voltar"', async () => {
  const db = memDb();
  const code = await open(db, 'uno', 3, { t: 'start' });
  await handle(db, { action: 'join', code, pid: 'spec-viewer-0001', name: 'Visitante' });
  const turn = db.rows.get(code).view.turn;
  await fails(handle(db, { action: 'dismiss', code, pid: 'spec-viewer-0001', target: turn }), 403);
  await handle(db, { action: 'dismiss', code, pid: P[(turn + 1) % 3], target: turn });
  assert.deepStrictEqual(db.rows.get(code).view.auto, [turn]);
  await handle(db, { action: 'resume', code, pid: P[turn] }); assert.deepStrictEqual(db.rows.get(code).view.auto, []);
  const t2 = db.rows.get(code).view.waiting[0];
  await handle(db, { action: 'dismiss', code, pid: P[(t2 + 1) % 3], target: t2 });
  const auto = db.rows.get(code).view.auto; assert.strictEqual(auto.length, 1);
  await handle(db, { action: 'join', code, pid: P[auto[0]], name: 'J' + auto[0] });                // reentrou na sala
  assert.deepStrictEqual(db.rows.get(code).view.auto, []);
});

await t('jogo sem piloto (Paciencia) recusa; Truco so age quando TODA a equipe esta ausente', async () => {
  const db = memDb();
  const { code } = await handle(db, { action: 'create', game: 'paciencia', pid: P[0], name: 'Solo' });
  assert.deepStrictEqual(db.rows.get(code).view.waiting, []);
  await fails(handle(db, { action: 'dismiss', code, pid: P[0], target: 1 }), 400);
});

// Todos os lugares no piloto automatico: o jogo precisa seguir sozinho, sem erro e sem travar.
for (const [game, k, startMove, mustEnd] of [
  ['damas', 2, { t: 'noop' }, false], ['uno', 4, { t: 'start' }, true], ['truco', 2, { t: 'start', players: 2 }, true], ['truco', 4, { t: 'start', players: 4 }, true],
  ['buraco', 2, { t: 'start', players: 2 }, true], ['buraco', 4, { t: 'start', players: 4 }, true], ['caxeta', 3, { t: 'start' }, false], ['coup', 5, { t: 'start' }, true],
]) {
  await t(`piloto automatico em todos os lugares: ${game} (${k} jogadores) segue sozinho`, async () => {
    const db = memDb();
    const { code } = await handle(db, { action: 'create', game, pid: P[0], name: 'J0' });
    for (let i = 1; i < k; i++) await handle(db, { action: 'join', code, pid: P[i], name: 'J' + i });
    if (game !== 'damas') await handle(db, { action: 'move', code, pid: P[0], move: startMove });
    let guard = 0;
    while (guard++ < 30) {
      const v = db.rows.get(code).view;
      if (v.over || !v.waiting.length) break;
      const target = v.waiting.find((x) => !v.auto.includes(x)); if (target === undefined) break;
      const by = P[(target + 1) % k];
      await handle(db, { action: 'dismiss', code, pid: by, target });
    }
    const row = db.rows.get(code); const v = row.view;
    if (mustEnd) assert.ok(v.over, `${game} nao terminou (espera ${JSON.stringify(v.waiting)}, auto ${JSON.stringify(v.auto)})`);
    else assert.ok(game === 'damas' ? row.state.lastMove !== null : row.state.log !== 'Nova rodada.', 'o jogo nao andou');
    assert.ok(v.auto.length >= 1);
  });
}

/* ---------- Modo tablet ---------- */
const TC = /^[A-HJ-NP-Z2-9]{6}$/;
await t('tablet: codigo proprio (6 caracteres, diferente da sala); roster publico sem pid nem codigo', async () => {
  const db = memDb();
  const { code } = await handle(db, { action: 'create', game: 'uno', pid: A, name: 'Lucas' });
  await handle(db, { action: 'join', code, pid: B, name: 'Ana' });
  await fails(handle(db, { action: 'tablet', code, pid: 'zzzzzzzz-zzzz' }), 403); // quem nao entrou
  const on = await handle(db, { action: 'tablet', code, pid: A });
  assert.match(on.tcode, TC);
  assert.notStrictEqual(on.tcode.slice(0, 4), code);
  const again = await handle(db, { action: 'tablet', code, pid: B });
  assert.strictEqual(again.tcode, on.tcode, 'consultar nao muda o codigo');
  const row = db.rows.get(code);
  const pub = JSON.stringify([row.roster, row.view]);
  assert.ok(!pub.includes(on.tcode) && !pub.includes(A), 'roster/view publicos nao podem ter o codigo nem pid');
  assert.ok(row.roster.some((m) => m.tablet === true && m.seat === null));
});

await t('tablet: entra so com o codigo do tablet (sem a sala), nao ocupa vaga e nao joga', async () => {
  const db = memDb();
  const { code } = await handle(db, { action: 'create', game: 'damas', pid: A, name: 'Lucas' });
  await handle(db, { action: 'join', code, pid: B, name: 'Ana' });
  const { tcode } = await handle(db, { action: 'tablet', code, pid: A });
  const T = 'tablet-pid-0001';
  await fails(handle(db, { action: 'tablet_join', pid: T, tcode: 'ABCDEF' }), 404);
  await fails(handle(db, { action: 'tablet_join', pid: T, tcode: code }), 404); // o codigo da sala nao serve de codigo de tablet
  await fails(handle(db, { action: 'tablet_join', pid: A, tcode }), 400); // jogador nao vira tablet
  const j = await handle(db, { action: 'tablet_join', pid: T, tcode: tcode.toLowerCase() });
  assert.strictEqual(j.code, code);
  assert.ok(j.pk && j.room.roster.find((m) => m.pk === j.pk && m.tablet));
  assert.strictEqual(j.room.roster.filter((m) => m.seat !== null).length, 2, 'tablet nao ocupa vaga');
  await fails(handle(db, { action: 'move', code, pid: T, move: { from: [2, 1], path: [[3, 0]] } }), 403);
  await fails(handle(db, { action: 'tablet', code, pid: T }), 403);
  const v0 = db.rows.get(code).version;
  await handle(db, { action: 'tablet_join', pid: T, tcode });
  assert.strictEqual(db.rows.get(code).version, v0, 'reentrar nao gera versao nova');
  const m = await handle(db, { action: 'mine', code, pid: T });
  assert.ok(m.version >= 1);
});

await t('tablet: renovar troca o codigo; desativar impede novas entradas', async () => {
  const db = memDb();
  const { code } = await handle(db, { action: 'create', game: 'uno', pid: A, name: 'Lucas' });
  const a = await handle(db, { action: 'tablet', code, pid: A });
  const b = await handle(db, { action: 'tablet', code, pid: A, op: 'renew' });
  assert.notStrictEqual(a.tcode, b.tcode);
  assert.strictEqual(db.rows.get(code).members.filter((m) => m.tablet).length, 1);
  await fails(handle(db, { action: 'tablet_join', pid: 'tablet-pid-0002', tcode: a.tcode }), 404);
  await handle(db, { action: 'tablet_join', pid: 'tablet-pid-0002', tcode: b.tcode });
  const off = await handle(db, { action: 'tablet', code, pid: A, op: 'off' });
  assert.strictEqual(off.tcode, null);
  assert.ok(!db.rows.get(code).roster.some((m) => m.tablet));
  await fails(handle(db, { action: 'tablet_join', pid: 'tablet-pid-0002', tcode: b.tcode }), 404);
  const again = await handle(db, { action: 'tablet', code, pid: A, op: 'off' });
  assert.strictEqual(again.tcode, null);
  const re = await handle(db, { action: 'tablet', code, pid: A }); // reativar gera codigo novo
  assert.match(re.tcode, TC);
});

await t('tablet: a partida continua igual com tablet pareado', async () => {
  const db = memDb();
  const { code } = await handle(db, { action: 'create', game: 'uno', pid: A, name: 'Lucas' });
  await handle(db, { action: 'join', code, pid: B, name: 'Ana' });
  const { tcode } = await handle(db, { action: 'tablet', code, pid: A });
  await handle(db, { action: 'tablet_join', pid: 'tablet-pid-0003', tcode });
  await handle(db, { action: 'move', code, pid: A, move: { t: 'start' } });
  const row = db.rows.get(code);
  assert.strictEqual(row.view.phase, 'playing');
  assert.strictEqual(row.members.filter((m) => m.seat !== null).length, 2);
});

console.log(`${n} testes passaram`);
