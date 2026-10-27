'use strict';
// Camada de comunicacao. Duas implementacoes com a mesma interface:
//   - nuvem: Edge Function "mesa" (escrita) + Supabase Realtime (leitura em tempo real)
//   - local: servidor Node (node server.js) com Server-Sent Events
//
// open(code, name, { onRoom }) entra na sala e passa a chamar onRoom(room) a cada mudanca.
// room = { code, version, game: {id,name,roles,maxPlayers}, players: [{name,seat,online}],
//          spectators: [{name}], you: {seat,name}, view }

window.createTransport = function createTransport({ pid, getKey }) {
  const cfg = window.MESA_CONFIG || {};
  const cloud = Boolean(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);

  async function readJson(res) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Falha na comunicação com o servidor.');
    return data;
  }

  /* ---------- Nuvem (Supabase) ---------- */
  if (cloud) {
    const base = cfg.supabaseUrl.replace(/\/$/, '');
    const sb = window.supabase.createClient(base, cfg.supabaseKey, { auth: { persistSession: false } });
    let gamesCache = null;
    const active = {}; // codigo da sala -> funcao que aplica uma sala atualizada

    async function call(action, body) {
      let res;
      try {
        res = await fetch(`${base}/functions/v1/mesa`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: cfg.supabaseKey,
            'x-access-key': getKey(),
            // Executa a funcao na mesma regiao do banco: evita varias idas e voltas entre continentes.
            ...(cfg.supabaseRegion ? { 'x-region': cfg.supabaseRegion } : {}),
          },
          body: JSON.stringify({ action, pid, ...body }),
        });
      } catch {
        throw new Error('Sem conexão com o servidor. Verifique a internet.');
      }
      return readJson(res);
    }

    async function games() {
      if (!gamesCache) gamesCache = await call('games', {});
      return gamesCache;
    }

    return {
      mode: 'cloud',
      needsKey: async () => true,
      games,
      async create(game, name) {
        return call('create', { game, name });
      },
      async move(code, move) {
        const res = await call('move', { code, move });
        if (res.room && active[code]) active[code](res.room); // mostra o resultado sem esperar o Realtime
        return res;
      },
      async restart(code) {
        const res = await call('restart', { code });
        if (res.room && active[code]) active[code](res.room);
        return res;
      },
      async open(code, name, { onRoom }) {
        const meta = Object.fromEntries((await games()).map((g) => [g.id, g]));
        const joined = await call('join', { code, name });
        const myPk = joined.pk;
        let lastVersion = 0;
        let latest = null;
        let online = new Set();
        let closed = false;

        const build = (row) => {
          const g = meta[row.game];
          const mine = row.roster.find((m) => m.pk === myPk);
          return {
            code: row.code,
            version: row.version,
            game: { id: g.id, name: g.name, roles: g.roles, maxPlayers: g.maxPlayers },
            players: row.roster
              .filter((m) => m.seat !== null)
              .sort((a, b) => a.seat - b.seat)
              .map((m) => ({ name: m.name, seat: m.seat, online: online.has(m.pk) })),
            spectators: row.roster.filter((m) => m.seat === null).map((m) => ({ name: m.name })),
            you: { seat: mine ? mine.seat : null, name: mine ? mine.name : null },
            view: row.view,
          };
        };
        const emit = () => { if (!closed && latest) onRoom(build(latest)); };
        const apply = (row) => {
          if (!row || row.version < lastVersion) return;
          lastVersion = row.version;
          latest = row;
          emit();
        };
        const resync = async () => {
          const { data } = await sb.from('rooms').select('*').eq('code', code).maybeSingle();
          if (!closed) apply(data);
        };

        apply(joined.room);
        active[code] = apply;

        const channel = sb.channel(`sala:${code}`, { config: { presence: { key: myPk } } });
        channel
          .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, (p) => apply(p.new))
          .on('presence', { event: 'sync' }, () => {
            online = new Set(Object.keys(channel.presenceState()));
            emit();
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              channel.track({ at: Date.now() });
              resync(); // recupera o que passou enquanto a conexao estava fora
            }
          });

        // Celular bloqueado ou rede trocada: ao voltar, busca o estado atual.
        const onVisible = () => { if (document.visibilityState === 'visible') resync(); };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', resync);
        const poll = setInterval(resync, 20000); // rede de seguranca

        return {
          close() {
            closed = true;
            delete active[code];
            clearInterval(poll);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', resync);
            sb.removeChannel(channel);
          },
        };
      },
    };
  }

  /* ---------- Local (servidor Node) ---------- */
  async function post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Access-Key': getKey() },
      body: JSON.stringify({ pid, ...body }),
    });
    return readJson(res);
  }

  return {
    mode: 'local',
    async needsKey() {
      try {
        return Boolean((await (await fetch('api/config')).json()).needsKey);
      } catch {
        return false;
      }
    },
    async games() {
      const res = await fetch('api/games', { headers: { 'X-Access-Key': getKey() } });
      return readJson(res);
    },
    async create(game, name) {
      return post('api/rooms', { game, name });
    },
    async move(code, move) {
      return post(`api/rooms/${code}/move`, { move });
    },
    async restart(code) {
      return post(`api/rooms/${code}/restart`, {});
    },
    async open(code, name, { onRoom }) {
      await post(`api/rooms/${code}/join`, { name });
      const source = new EventSource(`api/rooms/${code}/events?pid=${pid}&key=${encodeURIComponent(getKey())}`);
      source.onmessage = (event) => onRoom(JSON.parse(event.data));
      const ping = setInterval(() => { fetch('api/ping').catch(() => {}); }, 4 * 60 * 1000);
      return { close() { clearInterval(ping); source.close(); } };
    },
  };
};
