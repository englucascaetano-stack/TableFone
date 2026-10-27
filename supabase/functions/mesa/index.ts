// Edge Function "mesa": unica porta de escrita da Mesa de Jogos.
// Exige a senha do grupo (segredo ACCESS_KEY) no cabecalho x-access-key.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle, HttpError } from './core.mjs';

const ACCESS_KEY = Deno.env.get('ACCESS_KEY') ?? '';
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

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const db = {
  async getRoom(code: string) {
    // Uma unica consulta (sala + dados privados): cada ida ao banco custa tempo.
    const { data, error } = await supabase
      .from('rooms')
      .select('*, rooms_private(state, members)')
      .eq('code', code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { rooms_private: embedded, ...room } = data;
    const priv = Array.isArray(embedded) ? embedded[0] : embedded;
    if (!priv) return null;
    return { ...room, state: priv.state, members: priv.members };
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
  async purgeOld(days: number) {
    const limit = new Date(Date.now() - days * 86400000).toISOString();
    await supabase.from('rooms').delete().lt('updated_at', limit);
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Método não permitido.' });
  if (!ACCESS_KEY) return reply(500, { error: 'Servidor sem senha do grupo configurada.' });
  if (!sameSecret(req.headers.get('x-access-key') ?? '', ACCESS_KEY)) {
    return reply(401, { error: 'Senha do grupo incorreta.' });
  }
  try {
    const body = await req.json().catch(() => ({}));
    return reply(200, await handle(db, body));
  } catch (err) {
    if (err instanceof HttpError) return reply(err.status, { error: err.message });
    console.error(err);
    return reply(500, { error: 'Erro interno do servidor.' });
  }
});
