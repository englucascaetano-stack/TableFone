import assert from 'node:assert';
import { checkAccess, adminHandle, hashCode, newCode, clearCache, AuthError, isBlocked, recordFail, MAX_FAILS, WINDOW_MS } from '../supabase/functions/mesa/auth.mjs';

let n = 0;
const t = async (name, fn) => { clearCache(); await fn(); n++; console.log('ok -', name); };
function memAuthDb() {
  const rows = [];
  return {
    rows,
    async findCode(hash) { return rows.find((r) => r.code_hash === hash) || null; },
    async touchCode(id) { const r = rows.find((x) => x.id === id); if (r) r.last_used_at = new Date().toISOString(); },
    async getGroup() { return rows.filter((r) => !r.revoked_at).slice(-1)[0] || null; },
    async createCode(c) { rows.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), revoked_at: null, last_used_at: null, ...c }); },
    async revokeAll() { for (const r of rows) if (!r.revoked_at) r.revoked_at = new Date().toISOString(); },
    fails: [],
    async countFails(ip, since) { return this.fails.filter((f) => f.ip === ip && f.at >= since).length; },
    async addFail(ip) { this.fails.push({ ip, at: new Date().toISOString() }); },
  };
}
const ENV = { MASTER_KEY: 'mestre-super-secreto', ACCESS_KEY: '' };
const fails = async (p, status) => { try { await p; } catch (e) { assert.ok(e instanceof AuthError); assert.strictEqual(e.status, status); return; } assert.fail('esperava erro'); };

await t('mestre entra; vazio e errado nao entram; sem MASTER_KEY nao ha mestre', async () => {
  const db = memAuthDb();
  assert.deepStrictEqual(await checkAccess(db, 'mestre-super-secreto', ENV), { ok: true, master: true });
  assert.strictEqual((await checkAccess(db, '', ENV)).ok, false);
  assert.strictEqual((await checkAccess(db, 'qualquer-coisa', ENV)).ok, false);
  assert.strictEqual((await checkAccess(db, 'mestre-super-secreto', { MASTER_KEY: '', ACCESS_KEY: '' })).ok, false);
});

await t('mestre gera o codigo do grupo; todos usam o mesmo; ninguem do grupo administra', async () => {
  const db = memAuthDb();
  const master = await checkAccess(db, 'mestre-super-secreto', ENV);
  assert.deepStrictEqual(await adminHandle(db, { action: 'admin_group' }, master), { group: null });
  const made = await adminHandle(db, { action: 'admin_set_group' }, master);
  assert.match(made.code, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.strictEqual(db.rows[0].code_hash, await hashCode(made.code));
  assert.strictEqual((await adminHandle(db, { action: 'admin_group' }, master)).group.code_plain, made.code);
  for (const form of [made.code, made.code.toLowerCase(), ` ${made.code} `, `${made.code.slice(0, 2)}-${made.code.slice(2)}`]) {
    const a = await checkAccess(db, form, ENV);
    assert.ok(a.ok && !a.master, form);
  }
  const jogador = await checkAccess(db, made.code, ENV);
  await fails(adminHandle(db, { action: 'admin_group' }, jogador), 403);
  await fails(adminHandle(db, { action: 'admin_set_group', code: 'abcdef' }, jogador), 403);
  assert.deepStrictEqual(await adminHandle(db, { action: 'admin_whoami' }, jogador), { master: false });
  assert.deepStrictEqual(await adminHandle(db, { action: 'admin_whoami' }, master), { master: true });
});

await t('trocar o codigo desativa o anterior na hora; revogar corta todos', async () => {
  const db = memAuthDb();
  const master = await checkAccess(db, 'mestre-super-secreto', ENV);
  const a = await adminHandle(db, { action: 'admin_set_group', code: 'AAAB' }, master);
  assert.ok((await checkAccess(db, a.code, ENV)).ok);
  const b = await adminHandle(db, { action: 'admin_set_group', code: 'ZZZY' }, master);
  assert.notStrictEqual(a.code, b.code);
  assert.strictEqual((await checkAccess(db, a.code, ENV)).ok, false);
  assert.ok((await checkAccess(db, b.code, ENV)).ok);
  assert.strictEqual(db.rows.filter((r) => !r.revoked_at).length, 1);
  await adminHandle(db, { action: 'admin_revoke_group' }, master);
  assert.strictEqual((await checkAccess(db, b.code, ENV)).ok, false);
  assert.strictEqual((await adminHandle(db, { action: 'admin_group' }, master)).group, null);
});

await t('mestre pode escolher o proprio codigo (com validacoes) e definir validade', async () => {
  const db = memAuthDb();
  const master = await checkAccess(db, 'mestre-super-secreto', ENV);
  await fails(adminHandle(db, { action: 'admin_set_group', code: '123' }, master), 400);
  assert.strictEqual((await adminHandle(db, { action: 'admin_set_group', code: 'k7p2' }, master)).code, 'k7p2');
  await fails(adminHandle(db, { action: 'admin_set_group', code: 'aaaa' }, master), 400);
  await fails(adminHandle(db, { action: 'admin_set_group', code: 'x'.repeat(40) }, master), 400);
  await fails(adminHandle(db, { action: 'admin_set_group', days: 0 }, master), 400);
  await fails(adminHandle(db, { action: 'admin_set_group', days: 'abc' }, master), 400);
  const r = await adminHandle(db, { action: 'admin_set_group', code: 'Mesa Boa 2026', days: 1 }, master);
  assert.strictEqual(r.code, 'Mesa Boa 2026');
  assert.ok((await checkAccess(db, 'mesaboa2026', ENV)).ok);
  assert.ok((await checkAccess(db, 'MESA-BOA-2026', ENV)).ok);
  clearCache();
  assert.strictEqual((await checkAccess(db, 'Mesa Boa 2026', ENV, Date.now() + 2 * 86400000)).ok, false);
});

await t('limite de tentativas erradas por IP: bloqueia depois de MAX_FAILS e libera depois da janela', async () => {
  const db = memAuthDb();
  assert.strictEqual(await isBlocked(db, '1.1.1.1'), false);
  for (let i = 0; i < MAX_FAILS - 1; i++) await recordFail(db, '1.1.1.1');
  assert.strictEqual(await isBlocked(db, '1.1.1.1'), false);
  await recordFail(db, '1.1.1.1');
  assert.strictEqual(await isBlocked(db, '1.1.1.1'), true);
  assert.strictEqual(await isBlocked(db, '2.2.2.2'), false, 'outro IP nao e afetado');
  assert.strictEqual(await isBlocked(db, '1.1.1.1', Date.now() + WINDOW_MS + 1000), false, 'a janela expira');
});

await t('senha unica antiga (ACCESS_KEY) vale so se o segredo existir', async () => {
  const db = memAuthDb();
  assert.ok((await checkAccess(db, 'antiga', { MASTER_KEY: '', ACCESS_KEY: 'antiga' })).ok);
  assert.strictEqual((await checkAccess(db, 'antiga', { MASTER_KEY: 'm', ACCESS_KEY: '' })).ok, false);
});

await t('codigos gerados sao diferentes entre si', async () => {
  assert.ok(new Set(Array.from({ length: 300 }, newCode)).size > 250);
});

console.log(`\n${n} testes passaram.`);
