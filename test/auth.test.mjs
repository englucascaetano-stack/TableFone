import assert from 'node:assert';
import { checkAccess, adminHandle, hashCode, newCode, clearCache, AuthError } from '../supabase/functions/mesa/auth.mjs';

let n = 0;
const t = async (name, fn) => { clearCache(); await fn(); n++; console.log('ok -', name); };
function memAuthDb() {
  const rows = [];
  return {
    rows,
    async findCode(hash) { return rows.find((r) => r.code_hash === hash) || null; },
    async touchCode(id) { const r = rows.find((x) => x.id === id); if (r) r.last_used_at = new Date().toISOString(); },
    async listCodes() { return rows.map(({ code_hash, ...r }) => r); },
    async createCode(c) { const r = { id: crypto.randomUUID(), created_at: new Date().toISOString(), revoked_at: null, last_used_at: null, ...c }; rows.push(r); return r; },
    async revokeCode(id) { const r = rows.find((x) => x.id === id); if (r) r.revoked_at = new Date().toISOString(); },
  };
}
const ENV = { MASTER_KEY: 'mestre-super-secreto', ACCESS_KEY: '' };
const fails = async (p, status) => { try { await p; } catch (e) { assert.ok(e instanceof AuthError); assert.strictEqual(e.status, status); return; } assert.fail('esperava erro'); };

await t('mestre entra e administra; vazio e errado nao entram', async () => {
  const db = memAuthDb();
  assert.deepStrictEqual(await checkAccess(db, 'mestre-super-secreto', ENV), { ok: true, master: true });
  assert.strictEqual((await checkAccess(db, '', ENV)).ok, false);
  assert.strictEqual((await checkAccess(db, 'qualquer-coisa', ENV)).ok, false);
});

await t('codigo emitido pelo mestre libera o jogador (sem poder administrar); so o hash e guardado', async () => {
  const db = memAuthDb();
  const master = await checkAccess(db, 'mestre-super-secreto', ENV);
  const made = await adminHandle(db, { action: 'admin_create', label: 'Ana' }, master);
  assert.match(made.code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  assert.ok(!JSON.stringify(db.rows).includes(made.code), 'o codigo nao pode ficar guardado');
  assert.strictEqual(db.rows[0].code_hash, await hashCode(made.code));
  for (const form of [made.code, made.code.toLowerCase(), made.code.replace('-', ''), ` ${made.code} `]) {
    const a = await checkAccess(db, form, ENV);
    assert.ok(a.ok && !a.master && a.label === 'Ana', form);
  }
  const ana = await checkAccess(db, made.code, ENV);
  await fails(adminHandle(db, { action: 'admin_list' }, ana), 403);
  await fails(adminHandle(db, { action: 'admin_create', label: 'X' }, ana), 403);
  assert.deepStrictEqual(await adminHandle(db, { action: 'admin_whoami' }, ana), { master: false });
  assert.deepStrictEqual(await adminHandle(db, { action: 'admin_whoami' }, master), { master: true });
});

await t('revogar bloqueia na hora; expirado nao entra', async () => {
  const db = memAuthDb();
  const master = await checkAccess(db, 'mestre-super-secreto', ENV);
  const a = await adminHandle(db, { action: 'admin_create', label: 'Pedro' }, master);
  assert.ok((await checkAccess(db, a.code, ENV)).ok);
  await adminHandle(db, { action: 'admin_revoke', id: a.id }, master);
  assert.strictEqual((await checkAccess(db, a.code, ENV)).ok, false);
  const b = await adminHandle(db, { action: 'admin_create', label: 'Bia', days: 1 }, master);
  assert.ok((await checkAccess(db, b.code, ENV)).ok);
  clearCache();
  assert.strictEqual((await checkAccess(db, b.code, ENV, Date.now() + 2 * 86400000)).ok, false);
});

await t('validacoes: nome obrigatorio, validade, id; lista nao expoe hash', async () => {
  const db = memAuthDb();
  const master = await checkAccess(db, 'mestre-super-secreto', ENV);
  await fails(adminHandle(db, { action: 'admin_create', label: '   ' }, master), 400);
  await fails(adminHandle(db, { action: 'admin_create', label: 'X', days: 0 }, master), 400);
  await fails(adminHandle(db, { action: 'admin_create', label: 'X', days: 'abc' }, master), 400);
  await fails(adminHandle(db, { action: 'admin_revoke', id: 'nao-e-uuid' }, master), 400);
  await adminHandle(db, { action: 'admin_create', label: 'Ana', days: 30 }, master);
  const { codes } = await adminHandle(db, { action: 'admin_list' }, master);
  assert.strictEqual(codes.length, 1);
  assert.ok(!('code_hash' in codes[0]));
});

await t('senha unica antiga (ACCESS_KEY) continua valendo so se o segredo existir; sem MASTER_KEY nao ha mestre', async () => {
  const db = memAuthDb();
  assert.ok((await checkAccess(db, 'antiga', { MASTER_KEY: '', ACCESS_KEY: 'antiga' })).ok);
  assert.strictEqual((await checkAccess(db, 'antiga', { MASTER_KEY: 'm', ACCESS_KEY: '' })).ok, false);
  assert.strictEqual((await checkAccess(db, '', { MASTER_KEY: '', ACCESS_KEY: '' })).ok, false);
  assert.strictEqual((await checkAccess(db, 'x', { MASTER_KEY: '', ACCESS_KEY: '' })).master, false);
});

await t('codigos gerados sao diferentes entre si', async () => {
  assert.strictEqual(new Set(Array.from({ length: 200 }, newCode)).size, 200);
});

console.log(`\n${n} testes passaram.`);
