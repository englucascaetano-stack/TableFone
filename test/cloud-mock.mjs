// Simula o Supabase para testar as telas no navegador: serve public/, executa a logica REAL da
// Edge Function (core.mjs) sobre um banco em memoria e troca a biblioteca supabase-js por um
// substituto minimo. Nao testa a rede real do Supabase.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, HttpError } from '../supabase/functions/mesa/core.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const KEY = 'segredo';
export const rows = new Map();

// O Postgres guarda colunas jsonb com as chaves reordenadas (mais curtas primeiro, depois alfabetica).
// O simulador faz o mesmo, para pegar codigo que dependa da ordem das chaves.
const jsonb = (v) => {
  if (Array.isArray(v)) return v.map(jsonb);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).map((k) => [k, jsonb(v[k])]));
  }
  return v;
};
let latency = 0;        // atraso artificial das jogadas (ms)
let rejectNext = false; // faz a proxima jogada ser recusada
const db = {
  async getRoom(code) { const r = rows.get(code); return r ? structuredClone(r) : null; },
  async insertRoom(r) { if (rows.has(r.code)) return false; rows.set(r.code, { ...jsonb(structuredClone(r)), version: 1 }); return true; },
  async applyRoom(r) {
    const cur = rows.get(r.code);
    if (!cur || cur.version !== r.expected) return false;
    rows.set(r.code, { ...cur, view: jsonb(structuredClone(r.view)), roster: jsonb(structuredClone(r.roster)), state: jsonb(structuredClone(r.state)), members: jsonb(structuredClone(r.members)), version: cur.version + 1 });
    return true;
  },
  async purgeOld() {},
};

const FAKE_SUPABASE = `
window.supabase = { createClient(url) {
  const get = async (code) => { const r = await fetch(url + '/mock/room/' + code); return r.ok ? r.json() : null; };
  return {
    from: () => ({ select: () => ({ eq: (_c, code) => ({ maybeSingle: async () => ({ data: await get(code) }) }) }) }),
    channel(name, opts) {
      const key = opts.config.presence.key; const code = name.split(':')[1];
      let cb = null, sync = null, timer = null, last = 0;
      const ch = {
        on(type, _f, fn) { if (type === 'postgres_changes') cb = fn; else sync = fn; return ch; },
        presenceState() { return { [key]: [{}] }; },
        track() { if (sync) sync(); },
        subscribe(f) {
          setTimeout(() => f('SUBSCRIBED'), 10);
          timer = setInterval(async () => { const r = await get(code); if (r && r.version !== last) { last = r.version; cb && cb({ new: r }); } }, 150);
          return ch;
        },
        _stop() { clearInterval(timer); },
      };
      return ch;
    },
    removeChannel(ch) { ch._stop(); },
  };
} };`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

export function start(port) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (url.pathname === '/functions/v1/mesa') {
      const send = (s, b) => { res.writeHead(s, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
      if (req.headers['x-access-key'] !== KEY) return send(401, { error: 'Senha do grupo incorreta.' });
      let data = ''; for await (const c of req) data += c;
      try {
        const body = JSON.parse(data || '{}');
        if (body.action === 'move') {
          if (latency) await new Promise((r) => setTimeout(r, latency));
          if (rejectNext) { rejectNext = false; return send(400, { error: 'Jogada recusada (teste).' }); }
        }
        return send(200, await handle(db, body));
      }
      catch (e) { return e instanceof HttpError ? send(e.status, { error: e.message }) : send(500, { error: String(e) }); }
    }
    if (url.pathname === '/mock/latency') { latency = Number(url.searchParams.get('ms')) || 0; res.writeHead(200, cors); return res.end('ok'); }
    if (url.pathname === '/mock/reject-next') { rejectNext = true; res.writeHead(200, cors); return res.end('ok'); }
    if (url.pathname.startsWith('/mock/room/')) {
      const r = rows.get(url.pathname.split('/').pop());
      if (!r) { res.writeHead(404, cors); return res.end(); }
      const { code, game, view, roster, version } = r;   // somente colunas publicas
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ code, game, view, roster, version }));
    }
    if (url.pathname === '/config.js') { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end(`window.MESA_CONFIG={supabaseUrl:'http://localhost:${port}',supabaseKey:'sb_publishable_fake'};`); }
    if (url.pathname === '/vendor/supabase.js') { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end(FAKE_SUPABASE); }
    let rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}
