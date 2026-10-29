// Edge Function "mesa": unica porta de escrita da Mesa de Jogos.
// Exige um codigo de acesso valido no cabecalho x-access-key: o do mestre (segredo MASTER_KEY), o codigo do grupo
// definido por ele (tabela access_codes) ou, se ainda existir, a senha antiga do grupo (segredo ACCESS_KEY).
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle, HttpError } from './core.mjs';
import { AuthError, adminHandle, checkAccess } from './auth.mjs';

// MASTER_KEY: codigo do mestre (so voce). ACCESS_KEY: senha unica antiga do grupo, opcional (apague o segredo para desativar).
const ACCESS_KEY = Deno.env.get('ACCESS_KEY') ?? '';
const MASTER_KEY = Deno.env.get('MASTER_KEY') ?? '';
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-access-key, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '7200', // o navegador guarda a autorizacao e evita o pedido extra a cada jogada
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = {
  async getRoom(code: string) {
    // Uma unica consulta (sala + dados privados): cada ida ao banco custa tempo.
    const joined = await supabase
      .from('rooms')
      .select('*, rooms_private(state, members)')
      .eq('code', code)
      .maybeSingle();
    if (!joined.error) {
      if (!joined.data) return null;
      const { rooms_private: embedded, ...room } = joined.data;
      const priv = Array.isArray(embedded) ? embedded[0] : embedded;
      return priv ? { ...room, state: priv.state, members: priv.members } : null;
    }
    // Alternativa: duas consultas, caso a juncao nao esteja disponivel.
    console.error('juncao rooms/rooms_private falhou, usando duas consultas:', joined.error.message);
    const { data: room, error } = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
    if (error) throw error;
    if (!room) return null;
    const { data: priv, error: e2 } = await supabase.from('rooms_private').select('*').eq('code', code).maybeSingle();
    if (e2) throw e2;
    return priv ? { ...room, state: priv.state, members: priv.members } : null;
  },
  async insertRoom(r: any) {
    const { error } = await supabase
      .from('rooms')
      .insert({ code: r.code, game: r.game, view: r.view, roster: r.roster });
    if (error) {
      if (error.code === '23505') return false; // codigo ja existe
      throw error;
    }
    const { error: e2 } = await supabase.from('rooms_private').insert({ code: r.code, state: r.state, members: r.members });
    if (e2) {
      await supabase.from('rooms').delete().eq('code', r.code);
      throw e2;
    }
    return true;
  },
  async applyRoom(r: any) {
    const { data, error } = await supabase.rpc('apply_room', {
      p_code: r.code,
      p_expected: r.expected,
      p_view: r.view,
      p_roster: r.roster,
      p_state: r.state,
      p_members: r.members,
    });
    if (error) throw error;
    return data === true;
  },
  // Codigo proprio do tablet -> sala (tabela tablet_codes; apagada junto com a sala).
  async putTabletCode(tcode: string, roomCode: string) {
    const { error } = await supabase.from('tablet_codes').insert({ code: tcode, room_code: roomCode });
    if (error) {
      if (error.code === '23505') return false; // codigo ja existe
      throw error;
    }
    return true;
  },
  async dropTabletCode(tcode: string) {
    await supabase.from('tablet_codes').delete().eq('code', tcode);
  },
  async roomByTabletCode(tcode: string) {
    const { data, error } = await supabase.from('tablet_codes').select('room_code').eq('code', tcode).maybeSingle();
    if (error) throw error;
    return data ? (data.room_code as string) : null;
  },
  async purgeOld(days: number) {
    const limit = new Date(Date.now() - days * 86400000).toISOString();
    await supabase.from('rooms').delete().lt('updated_at', limit);
  },
};

// Codigo de acesso do grupo (tabela access_codes; so a funcao, com service role, enxerga).
const adb = {
  async findCode(hash: string) {
    const { data, error } = await supabase.from('access_codes').select('id,label,expires_at,revoked_at').eq('code_hash', hash).maybeSingle();
    if (error) throw error;
    return data;
  },
  async touchCode(id: string) {
    await supabase.from('access_codes').update({ last_used_at: new Date().toISOString() }).eq('id', id);
  },
  async getGroup() {
    const { data, error } = await supabase.from('access_codes').select('id,code_plain,created_at,expires_at,last_used_at').is('revoked_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },
  async createCode(c: any) {
    const { error } = await supabase.from('access_codes').insert(c);
    if (error) throw error;
  },
  async revokeAll() {
    const { error } = await supabase.from('access_codes').update({ revoked_at: new Date().toISOString() }).is('revoked_at', null);
    if (error) throw error;
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Método não permitido.' });
  if (!MASTER_KEY && !ACCESS_KEY) return reply(500, { error: 'Servidor sem código de acesso configurado.' });
  let access;
  try {
    access = await checkAccess(adb, req.headers.get('x-access-key') ?? '', { MASTER_KEY, ACCESS_KEY });
  } catch (err) {
    console.error(err);
    return reply(500, { error: 'Erro ao verificar o acesso.' });
  }
  if (!access.ok) return reply(401, { error: 'Código de acesso incorreto, vencido ou revogado.' });
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.action === 'string' && body.action.startsWith('admin_')) return reply(200, await adminHandle(adb, body, access));
    return reply(200, await handle(db, body));
  } catch (err) {
    if (err instanceof HttpError || err instanceof AuthError) return reply(err.status, { error: err.message });
    console.error(err);
    return reply(500, { error: 'Erro interno do servidor.' });
  }
});
