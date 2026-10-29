// Controle de acesso da Mesa de Jogos, independente do banco (recebe um adaptador `adb`).
//  - MASTER_KEY: codigo do mestre. Acessa tudo e administra os codigos dos jogadores.
//  - Codigos individuais: emitidos pelo mestre (rotulo + validade opcional), guardados so como hash, revogaveis.
//  - ACCESS_KEY (opcional, legado): senha unica do grupo. Apague o segredo para desativar.

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CACHE_MS = 30000; // revogacao vale em ate 30 s
const TOUCH_MS = 60000;
const cache = new Map(); // hash -> { row, at }
const touched = new Map(); // id -> instante do ultimo registro de uso

export function sameSecret(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const normalize = (code) => String(code || '').toUpperCase().replace(/[\s-]/g, '');

export async function hashCode(code) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalize(code)));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function newCode() {
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  const s = Array.from(buf, (n) => ALPHABET[n % ALPHABET.length]).join('');
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

// Retorna { ok, master, label? }. `env` = { MASTER_KEY, ACCESS_KEY }; `now` so para testes.
export async function checkAccess(adb, key, env, now = Date.now()) {
  const k = String(key || '');
  if (!k) return { ok: false, master: false };
  if (env.MASTER_KEY && sameSecret(k, env.MASTER_KEY)) return { ok: true, master: true };
  if (env.ACCESS_KEY && sameSecret(k, env.ACCESS_KEY)) return { ok: true, master: false, legacy: true };
  const hash = await hashCode(k);
  let hit = cache.get(hash);
  if (!hit || now - hit.at > CACHE_MS) {
    hit = { row: await adb.findCode(hash), at: now };
    cache.set(hash, hit);
  }
  const row = hit.row;
  if (!row || row.revoked_at || (row.expires_at && new Date(row.expires_at).getTime() <= now)) return { ok: false, master: false };
  if (!touched.has(row.id) || now - touched.get(row.id) > TOUCH_MS) {
    touched.set(row.id, now);
    adb.touchCode(row.id).catch(() => {});
  }
  return { ok: true, master: false, label: row.label };
}

export function clearCache() {
  cache.clear();
  touched.clear();
}

const cleanLabel = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);

// Acoes do mestre. `access` = resultado de checkAccess.
export async function adminHandle(adb, body, access) {
  if (body.action === 'admin_whoami') return { master: access.master };
  if (!access.master) throw new AuthError(403, 'Apenas o mestre pode fazer isso.');
  switch (body.action) {
    case 'admin_list':
      return { codes: await adb.listCodes() };
    case 'admin_create': {
      const label = cleanLabel(body.label);
      if (!label) throw new AuthError(400, 'Dê um nome para identificar quem vai usar o código.');
      const days = body.days === null || body.days === undefined || body.days === '' ? null : Number(body.days);
      if (days !== null && (!Number.isFinite(days) || days < 1 || days > 3650)) throw new AuthError(400, 'Validade inválida (de 1 a 3650 dias).');
      const code = newCode();
      const expires_at = days === null ? null : new Date(Date.now() + days * 86400000).toISOString();
      const row = await adb.createCode({ label, code_hash: await hashCode(code), expires_at });
      return { code, id: row.id, label, expires_at };
    }
    case 'admin_revoke': {
      if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/.test(body.id)) throw new AuthError(400, 'Código inválido.');
      await adb.revokeCode(body.id);
      clearCache();
      return { ok: true };
    }
    default:
      throw new AuthError(400, 'Ação desconhecida.');
  }
}
