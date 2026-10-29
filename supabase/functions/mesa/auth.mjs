// Controle de acesso da Mesa de Jogos, independente do banco (recebe um adaptador `adb`).
//  - MASTER_KEY: codigo do mestre. Acessa tudo e administra os codigos dos jogadores.
//  - Codigo do grupo: UM codigo para todos, definido ou gerado pelo mestre (validade opcional). Guarda o hash para conferir e o texto
//    para o mestre rever no painel; gerar outro desativa o anterior.
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

// Codigo gerado: 4 caracteres (letras e numeros, sem I, O, 0 e 1 para nao confundir). Curto de proposito; ver o limite de tentativas.
export function newCode() {
  const buf = new Uint32Array(4);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

// Limite de tentativas erradas por IP: MAX_FAILS em WINDOW_MS bloqueia novas tentativas (inclusive as certas) desse IP.
export const MAX_FAILS = 15;
export const WINDOW_MS = 10 * 60 * 1000;
export async function isBlocked(adb, ip, now = Date.now()) {
  return (await adb.countFails(ip, new Date(now - WINDOW_MS).toISOString())) >= MAX_FAILS;
}
export async function recordFail(adb, ip) {
  await adb.addFail(ip);
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

// Acoes do mestre. `access` = resultado de checkAccess.
// Ha um unico codigo ativo para o grupo: gerar/definir um novo desativa o anterior.
export async function adminHandle(adb, body, access) {
  if (body.action === 'admin_whoami') return { master: access.master };
  if (!access.master) throw new AuthError(403, 'Apenas o mestre pode fazer isso.');
  switch (body.action) {
    case 'admin_group':
      return { group: await adb.getGroup() };
    case 'admin_set_group': {
      let code;
      if (body.code !== undefined && body.code !== null && String(body.code).trim() !== '') {
        code = String(body.code).trim();
        const n = normalize(code);
        if (n.length < 4 || n.length > 32) throw new AuthError(400, 'O código deve ter de 4 a 32 caracteres (espaços e hífens não contam).');
        if (isWeak(n)) throw new AuthError(400, 'Escolha outro código.');
      } else code = newCode();
      const days = body.days === null || body.days === undefined || body.days === '' ? null : Number(body.days);
      if (days !== null && (!Number.isFinite(days) || days < 1 || days > 3650)) throw new AuthError(400, 'Validade inválida (de 1 a 3650 dias).');
      const expires_at = days === null ? null : new Date(Date.now() + days * 86400000).toISOString();
      await adb.revokeAll();
      await adb.createCode({ label: 'Grupo', code_hash: await hashCode(code), code_plain: code, expires_at });
      clearCache();
      return { code, expires_at };
    }
    case 'admin_revoke_group':
      await adb.revokeAll();
      clearCache();
      return { ok: true };
    default:
      throw new AuthError(400, 'Ação desconhecida.');
  }
}

// Recusa codigos obviamente fracos (so repeticao de um caractere ou sequencias triviais).
function isWeak(n) {
  return /^(.)\1+$/.test(n) || ['123456', '1234567', '12345678', 'ABCDEF', 'SENHA', 'PASSWORD', 'SENHA123'].includes(n);
}
