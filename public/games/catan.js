'use strict';
// Interface do Catan. Visao publica: room.view (tabuleiro, pecas, contagens); visao privada: room.mine (mao, cartas, locais validos).
// Intencoes: { t:'start' } | { t:'settle', v } | { t:'road', e } | { t:'city', v } | { t:'roll' } | { t:'discard', cards }
//   | { t:'robber', hex } | { t:'steal', victim } | { t:'buy_dev' } | { t:'play_knight' } | { t:'play_road' }
//   | { t:'play_year', a, b } | { t:'play_monopoly', res } | { t:'trade_offer', give, get } | { t:'trade_accept' }
//   | { t:'trade_reject' } | { t:'trade_confirm', with } | { t:'trade_cancel' } | { t:'bank_trade', give, get } | { t:'end' }

(function () {
  const K = window.GameKit;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const RES = ['brick', 'lumber', 'wool', 'grain', 'ore'];
  const RES_NAME = { brick: 'Argila', lumber: 'Madeira', wool: 'Lã', grain: 'Grãos', ore: 'Minério' };
  const TERRAIN = {
    lumber: { color: '#2f6b3a', name: 'Floresta' },
    wool: { color: '#8cc152', name: 'Pasto' },
    grain: { color: '#e6c84a', name: 'Campo' },
    brick: { color: '#b5532f', name: 'Colina' },
    ore: { color: '#7b8794', name: 'Montanha' },
    desert: { color: '#d8c48f', name: 'Deserto' },
  };
  const RES_COLOR = { brick: '#b5532f', lumber: '#2f6b3a', wool: '#8cc152', grain: '#e6c84a', ore: '#7b8794' };
  const PLAYER_COLOR = ['#d64541', '#3b7dd8', '#e8932b', '#f1ebe0'];
  const DEV_NAME = { knight: 'Cavaleiro', vp: 'Ponto de vitória', road: 'Construção de estradas', year: 'Invenção', monopoly: 'Monopólio' };
  const COST_TEXT = {
    road: 'argila + madeira',
    settlement: 'argila + madeira + lã + grãos',
    city: '2 grãos + 3 minério',
    dev: 'lã + grãos + minério',
  };
  const SQ = Math.sqrt(3) / 2;

  let mode = null; // 'road' | 'settle' | 'city' (escolhido nos botoes)
  let panel = null; // 'trade' | 'bank' | 'year' | 'monopoly'
  let sel = { discard: {}, give: {}, get: {}, bankGive: null, yearA: null, yearB: null };
  let seenVersion = null;

  const sum = (o) => RES.reduce((a, r) => a + ((o && o[r]) || 0), 0);
  const empty = () => ({ brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 });
  const svg = (tag, attrs, text) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k of Object.keys(attrs || {})) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  };

  function chip(res, n, extra) {
    const c = K.el('span', `ct-chip${extra ? ` ${extra}` : ''}`);
    c.style.setProperty('--rc', RES_COLOR[res]);
    c.append(K.el('b', null, String(n)), K.el('span', null, RES_NAME[res]));
    return c;
  }
  const resList = (o) => RES.filter((r) => o[r]).map((r) => `${o[r]} ${RES_NAME[r].toLowerCase()}`).join(', ') || 'nada';

  /* ---------- tabuleiro ---------- */
  function boardSvg(v, spots, onVertex, onEdge, onHex) {
    const T = v.topo;
    const px = (p) => [p[0] * SQ, p[1] * 0.5];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const p of T.verts) {
      const [x, y] = px(p);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const pad = 0.9;
    const root = svg('svg', { class: 'ct-board', viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`, role: 'img', 'aria-label': 'Tabuleiro de Catan' });
    root.append(svg('rect', { x: minX - pad, y: minY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad, rx: 0.6, fill: '#2b5a7a' }));

    // portos (atras dos hexagonos)
    for (const h of v.harbors) {
      const [a, b] = T.edges[h.edge];
      const [ax, ay] = px(T.verts[a]);
      const [bx, by] = px(T.verts[b]);
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const len = Math.hypot(mx, my) || 1;
      const ox = mx + (mx / len) * 0.62, oy = my + (my / len) * 0.62;
      root.append(svg('line', { x1: ax, y1: ay, x2: ox, y2: oy, stroke: '#e9dcc0', 'stroke-width': 0.05 }), svg('line', { x1: bx, y1: by, x2: ox, y2: oy, stroke: '#e9dcc0', 'stroke-width': 0.05 }));
      const g = svg('g');
      g.append(svg('circle', { cx: ox, cy: oy, r: 0.3, fill: h.type === 'any' ? '#f1ebe0' : RES_COLOR[h.type], stroke: '#1c1a17', 'stroke-width': 0.04 }));
      g.append(svg('text', { x: ox, y: oy + 0.08, 'text-anchor': 'middle', 'font-size': 0.24, 'font-weight': 700, fill: h.type === 'any' || h.type === 'grain' ? '#1c1a17' : '#fff' }, h.type === 'any' ? '3:1' : '2:1'));
      root.append(g);
    }

    // hexagonos
    v.hexes.forEach((h, i) => {
      const verts = T.hexVerts[i].map((vi) => px(T.verts[vi]));
      const t = TERRAIN[h.res];
      const clickable = spots && spots.hexes.includes(i);
      const poly = svg('polygon', { points: verts.map((p) => p.join(',')).join(' '), fill: t.color, stroke: '#1c1a17', 'stroke-width': 0.04 });
      root.append(poly);
      const [cx, cy] = px([T.hexes[i].x, T.hexes[i].y]);
      root.append(svg('text', { x: cx, y: cy - 0.42, 'text-anchor': 'middle', 'font-size': 0.2, fill: h.res === 'grain' || h.res === 'wool' || h.res === 'desert' ? '#3a3320' : '#f3efe4', opacity: 0.9 }, t.name));
      if (h.num) {
        const hot = h.num === 6 || h.num === 8;
        root.append(svg('circle', { cx, cy, r: 0.36, fill: '#f4ead2', stroke: '#1c1a17', 'stroke-width': 0.03 }));
        root.append(svg('text', { x: cx, y: cy + 0.1, 'text-anchor': 'middle', 'font-size': 0.34, 'font-weight': 700, fill: hot ? '#b3261e' : '#1c1a17' }, String(h.num)));
        const dots = 6 - Math.abs(7 - h.num);
        for (let d = 0; d < dots; d++) root.append(svg('circle', { cx: cx + (d - (dots - 1) / 2) * 0.07, cy: cy + 0.25, r: 0.025, fill: hot ? '#b3261e' : '#1c1a17' }));
      }
      if (v.robber === i) {
        root.append(svg('ellipse', { cx, cy: cy + 0.45, rx: 0.2, ry: 0.07, fill: 'rgba(0,0,0,0.35)' }));
        root.append(svg('rect', { x: cx - 0.12, y: cy + 0.05, width: 0.24, height: 0.42, rx: 0.1, fill: '#1c1a17', stroke: '#f4ead2', 'stroke-width': 0.03 }));
        root.append(svg('circle', { cx, cy: cy + 0.02, r: 0.12, fill: '#1c1a17', stroke: '#f4ead2', 'stroke-width': 0.03 }));
      }
      if (clickable) {
        const hit = svg('polygon', { points: verts.map((p) => p.join(',')).join(' '), fill: 'rgba(255,255,255,0.28)', stroke: '#fff', 'stroke-width': 0.08, class: 'ct-hit', tabindex: 0, role: 'button', 'aria-label': `Mover o ladrão para ${t.name}` });
        hit.addEventListener('click', () => onHex(i));
        root.append(hit);
      }
    });

    // estradas
    v.roads.forEach((owner, e) => {
      if (owner < 0) return;
      const [a, b] = T.edges[e];
      const [ax, ay] = px(T.verts[a]);
      const [bx, by] = px(T.verts[b]);
      root.append(svg('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: '#1c1a17', 'stroke-width': 0.2, 'stroke-linecap': 'round' }));
      root.append(svg('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: PLAYER_COLOR[owner], 'stroke-width': 0.12, 'stroke-linecap': 'round' }));
    });

    // construcoes
    v.verts.forEach((b, vi) => {
      if (!b) return;
      const [x, y] = px(T.verts[vi]);
      const col = PLAYER_COLOR[b.seat];
      if (b.city) {
        root.append(svg('path', { d: `M${x - 0.26} ${y + 0.2} V${y - 0.05} H${x - 0.02} V${y - 0.25} L${x + 0.12} ${y - 0.38} L${x + 0.26} ${y - 0.25} V${y + 0.2} Z`, fill: col, stroke: '#1c1a17', 'stroke-width': 0.05, 'stroke-linejoin': 'round' }));
      } else {
        root.append(svg('path', { d: `M${x - 0.18} ${y + 0.16} V${y - 0.06} L${x} ${y - 0.24} L${x + 0.18} ${y - 0.06} V${y + 0.16} Z`, fill: col, stroke: '#1c1a17', 'stroke-width': 0.05, 'stroke-linejoin': 'round' }));
      }
    });

    // locais clicaveis
    if (spots) {
      for (const e of spots.roads) {
        const [a, b] = T.edges[e];
        const [ax, ay] = px(T.verts[a]);
        const [bx, by] = px(T.verts[b]);
        root.append(svg('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: 'rgba(255,255,255,0.85)', 'stroke-width': 0.2, 'stroke-linecap': 'round', class: 'ct-hit', 'pointer-events': 'none' }));
        // area de toque maior (invisivel) para o dedo
        const hit = svg('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: 'transparent', 'stroke-width': 0.6, 'stroke-linecap': 'round', tabindex: 0, role: 'button', 'aria-label': 'Construir estrada aqui', style: 'cursor:pointer' });
        hit.addEventListener('click', () => onEdge(e));
        root.append(hit);
      }
      const dots = [...spots.settlements.map((x) => [x, 'settle']), ...spots.cities.map((x) => [x, 'city'])];
      for (const [vi, kind] of dots) {
        const [x, y] = px(T.verts[vi]);
        root.append(svg('circle', { cx: x, cy: y, r: kind === 'city' ? 0.3 : 0.26, fill: 'rgba(255,255,255,0.9)', stroke: '#1c1a17', 'stroke-width': 0.05, class: 'ct-hit', 'pointer-events': 'none' }));
        const hit = svg('circle', { cx: x, cy: y, r: 0.5, fill: 'transparent', tabindex: 0, role: 'button', 'aria-label': kind === 'city' ? 'Evoluir para cidade' : 'Construir colônia aqui', style: 'cursor:pointer' });
        hit.addEventListener('click', () => onVertex(vi, kind));
        root.append(hit);
      }
    }
    return root;
  }

  /* ---------- pecas de interface ---------- */
  function stepper(obj, res, max, redraw) {
    const row = K.el('div', 'ct-step');
    const minus = K.el('button', 'ghost', '−');
    const plus = K.el('button', 'ghost', '+');
    minus.type = 'button';
    plus.type = 'button';
    minus.disabled = !obj[res];
    plus.disabled = max !== undefined && obj[res] >= max;
    minus.addEventListener('click', () => { obj[res]--; redraw(); });
    plus.addEventListener('click', () => { obj[res]++; redraw(); });
    row.append(K.el('span', 'ct-sname', RES_NAME[res]), minus, K.el('b', null, String(obj[res])), plus);
    return row;
  }

  function button(label, onClick, opts = {}) {
    const b = K.el('button', opts.cls || null, label);
    b.type = 'button';
    b.disabled = Boolean(opts.disabled);
    if (opts.title) b.title = opts.title;
    b.addEventListener('click', onClick);
    return b;
  }

  function playersBox(room, v) {
    const box = K.el('div', 'ct-players');
    room.players.forEach((p) => {
      if (p.seat === null || p.seat >= v.players) return;
      const st = v.stats[p.seat];
      const row = K.el('div', `ct-pl${v.turn === p.seat ? ' turn' : ''}${p.seat === room.you.seat ? ' me' : ''}`);
      const dot = K.el('span', 'ct-dot');
      dot.style.background = PLAYER_COLOR[p.seat];
      const badges = [];
      if (v.longest === p.seat) badges.push('Maior estrada');
      if (v.army === p.seat) badges.push('Maior exército');
      const need = v.discard && v.discard[p.seat] ? ` · descartando ${v.discard[p.seat]}` : '';
      row.append(dot, K.el('b', null, p.name + (p.seat === room.you.seat ? ' (você)' : '')), K.el('span', 'ct-pts', `${st.points} pt${st.points === 1 ? '' : 's'}`),
        K.el('small', null, `${st.cards} cartas · ${st.dev} desenv. · ${st.knights} cav. · estrada ${st.roadLen} · ${st.settlements}/5 col. ${st.cities}/4 cid.${badges.length ? ` · ${badges.join(', ')}` : ''}${need}`));
      box.append(row);
    });
    return box;
  }

  function diceEl(d) {
    const box = K.el('div', 'ct-dice');
    if (!d) return box;
    box.append(K.el('span', 'ct-die', String(d[0])), K.el('span', 'ct-die', String(d[1])), K.el('b', null, `= ${d[0] + d[1]}`));
    return box;
  }

  /* ---------- render ---------- */
  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'Catan',
        min: 3,
        max: 4,
        rules: [
          'Preparação: cada jogador põe uma colônia e uma estrada; depois, na ordem inversa, a segunda (que rende 1 recurso de cada hexágono vizinho).',
          'No turno: role os dados (cada hexágono com esse número produz 1 recurso por colônia e 2 por cidade). Depois negocie, construa e encerre.',
          'Com 7: quem tem mais de 7 cartas descarta metade; mova o ladrão e roube uma carta de quem tiver construção ali.',
          'Custos: estrada = argila + madeira; colônia = argila + madeira + lã + grãos; cidade = 2 grãos + 3 minério; carta de desenvolvimento = lã + grãos + minério.',
          'Colônias ficam a pelo menos 2 arestas de qualquer outra e devem se ligar a uma estrada sua. Portos melhoram a troca com o banco (4:1, 3:1 ou 2:1).',
          'Maior estrada (5 ou mais): 2 pontos. Maior exército (3 ou mais cavaleiros): 2 pontos. Vence quem chegar a 10 pontos no próprio turno.',
        ],
      });
    }

    if (room.version !== seenVersion) {
      seenVersion = room.version;
      sel = { discard: {}, give: {}, get: {}, bankGive: null, yearA: null, yearB: null };
      if (!['main'].includes(v.step) || v.turn !== seat) { mode = null; panel = null; }
      if (v.trade === null && panel === 'trade') panel = null;
    }
    el.innerHTML = '';
    const inGame = seat !== null && seat < v.players && mine;
    const myTurn = Boolean(inGame) && v.turn === seat && !v.over;
    const redraw = () => render(el, room, send);
    const nameOf = (s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;
    const wrap = K.el('div', 'mesa ct-wrap');

    // locais clicaveis conforme a etapa/modo
    let spots = null;
    if (myTurn && mine.spots) {
      const sp = mine.spots;
      if (v.step === 'setupSettle') spots = { roads: [], settlements: sp.settlements, cities: [], hexes: [] };
      else if (v.step === 'setupRoad' || v.step === 'freeRoad') spots = { roads: sp.roads, settlements: [], cities: [], hexes: [] };
      else if (v.step === 'robber') spots = { roads: [], settlements: [], cities: [], hexes: sp.hexes };
      else if (v.step === 'main' && mode === 'road') spots = { roads: sp.roads, settlements: [], cities: [], hexes: [] };
      else if (v.step === 'main' && mode === 'settle') spots = { roads: [], settlements: sp.settlements, cities: [], hexes: [] };
      else if (v.step === 'main' && mode === 'city') spots = { roads: [], settlements: [], cities: sp.cities, hexes: [] };
    }
    const board = boardSvg(
      v,
      spots,
      (vi, kind) => { mode = null; send({ t: kind === 'city' ? 'city' : 'settle', v: vi }); },
      (e) => { if (v.step === 'main') mode = null; send({ t: 'road', e }); },
      (hex) => send({ t: 'robber', hex })
    );
    wrap.append(board);

    const info = K.el('div', 'ct-info');
    info.append(diceEl(v.dice));
    const bank = K.el('small', null, `Banco: ${RES.map((r) => `${RES_NAME[r]} ${v.bank[r]}`).join(' · ')} · Cartas de desenv.: ${v.devLeft}`);
    info.append(bank);
    wrap.append(info);
    if (v.log) wrap.append(K.el('div', 'logline', v.log));
    wrap.append(playersBox(room, v));

    /* painel do jogador */
    if (inGame && !v.over) {
      const me = K.el('div', 'ct-me');
      const hand = K.el('div', 'ct-hand');
      for (const r of RES) hand.append(chip(r, mine.hand[r], mine.hand[r] ? '' : 'zero'));
      me.append(K.el('h3', null, 'Sua mão'), hand);
      if (mine.dev.length) {
        const dv = K.el('div', 'ct-dev');
        const counts = {};
        mine.dev.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
        for (const c of Object.keys(counts)) {
          const fresh = mine.fresh.filter((x) => x === c).length;
          dv.append(K.el('span', 'ct-card', `${DEV_NAME[c]} × ${counts[c]}${fresh ? ` (${fresh} nova${fresh > 1 ? 's' : ''})` : ''}`));
        }
        me.append(dv);
      }
      me.append(K.el('small', null, `Seus pontos (com cartas escondidas): ${mine.points}`));
      wrap.append(me);

      /* descarte (todos os jogadores com mais de 7 cartas) */
      if (mine.mustDiscard) {
        const box = K.el('div', 'ct-box');
        const n = mine.mustDiscard;
        const chosen = sum(sel.discard);
        box.append(K.el('h3', null, `Descarte ${n} cartas (${chosen}/${n})`));
        for (const r of RES) if (mine.hand[r]) box.append(stepper(sel.discard, r, Math.min(mine.hand[r], n - chosen + sel.discard[r]), redraw));
        box.append(button('Descartar', () => send({ t: 'discard', cards: sel.discard }), { disabled: chosen !== n }));
        wrap.append(box);
      }

      /* oferta de troca recebida */
      if (v.trade && !myTurn && v.step === 'main') {
        const box = K.el('div', 'ct-box');
        const t = v.trade;
        const accepted = t.accepted.includes(seat);
        const can = RES.every((r) => mine.hand[r] >= t.get[r]);
        box.append(K.el('h3', null, `${nameOf(v.turn)} oferece`), K.el('p', null, `Ele(a) dá ${resList(t.give)} e quer ${resList(t.get)}.`));
        if (accepted) box.append(K.el('p', 'muted', 'Você aceitou. Aguardando a confirmação.'));
        box.append(button('Aceitar', () => send({ t: 'trade_accept' }), { disabled: !can || accepted, title: can ? '' : 'Você não tem as cartas pedidas' }),
          button('Recusar', () => send({ t: 'trade_reject' }), { cls: 'ghost', disabled: t.rejected.includes(seat) }));
        if (!can) box.append(K.el('p', 'muted', 'Você não tem as cartas pedidas.'));
        wrap.append(box);
      }

      if (myTurn) {
        const box = K.el('div', 'ct-box');
        if (v.step === 'roll') {
          box.append(button('Rolar os dados', () => send({ t: 'roll' })));
          if (mine.canPlay.knight) box.append(button('Jogar Cavaleiro antes', () => send({ t: 'play_knight' }), { cls: 'ghost' }));
        } else if (v.step === 'steal') {
          box.append(K.el('h3', null, 'Roubar de quem?'));
          for (const s of v.victims) box.append(button(`${nameOf(s)} (${v.stats[s].cards} cartas)`, () => send({ t: 'steal', victim: s })));
        } else if (v.step === 'main') {
          const h = mine.hand;
          const can = (cost) => Object.keys(cost).every((r) => h[r] >= cost[r]);
          const sp = mine.spots;
          const row = K.el('div', 'ct-actions');
          const toggle = (m, label, ok, why) => {
            const b = button(label, () => { mode = mode === m ? null : m; panel = null; redraw(); }, { disabled: !ok, title: why, cls: mode === m ? 'on' : '' });
            return b;
          };
          row.append(
            toggle('road', 'Estrada', sp.roads.length > 0, `Custo: ${COST_TEXT.road}`),
            toggle('settle', 'Colônia', sp.settlements.length > 0, `Custo: ${COST_TEXT.settlement}`),
            toggle('city', 'Cidade', sp.cities.length > 0, `Custo: ${COST_TEXT.city}`),
            button('Comprar carta', () => send({ t: 'buy_dev' }), { disabled: !(can({ wool: 1, grain: 1, ore: 1 }) && v.devLeft > 0), title: `Custo: ${COST_TEXT.dev}` }),
            button('Negociar', () => { panel = panel === 'trade' ? null : 'trade'; mode = null; redraw(); }, { cls: panel === 'trade' ? 'on' : '' }),
            button('Banco / portos', () => { panel = panel === 'bank' ? null : 'bank'; mode = null; redraw(); }, { cls: panel === 'bank' ? 'on' : '' })
          );
          box.append(row);
          const dev = K.el('div', 'ct-actions');
          if (mine.canPlay.knight) dev.append(button('Cavaleiro', () => send({ t: 'play_knight' }), { cls: 'ghost' }));
          if (mine.canPlay.road) dev.append(button('Construção de estradas', () => send({ t: 'play_road' }), { cls: 'ghost' }));
          if (mine.canPlay.year) dev.append(button('Invenção', () => { panel = 'year'; mode = null; redraw(); }, { cls: 'ghost' }));
          if (mine.canPlay.monopoly) dev.append(button('Monopólio', () => { panel = 'monopoly'; mode = null; redraw(); }, { cls: 'ghost' }));
          if (dev.childNodes.length) box.append(dev);
          box.append(button('Encerrar turno', () => send({ t: 'end' }), { cls: 'ghost' }));

          if (panel === 'trade') {
            const tb = K.el('div', 'ct-sub');
            if (v.trade) {
              const t = v.trade;
              tb.append(K.el('h3', null, 'Sua oferta'), K.el('p', null, `Você dá ${resList(t.give)} e quer ${resList(t.get)}.`));
              const others = room.players.filter((p) => p.seat !== null && p.seat < v.players && p.seat !== seat);
              for (const p of others) {
                const st = t.accepted.includes(p.seat) ? 'aceitou' : t.rejected.includes(p.seat) ? 'recusou' : 'pensando';
                const line = K.el('div', 'ct-resp');
                line.append(K.el('span', null, `${p.name}: ${st}`));
                if (t.accepted.includes(p.seat)) line.append(button('Trocar', () => send({ t: 'trade_confirm', with: p.seat })));
                tb.append(line);
              }
              tb.append(button('Cancelar oferta', () => send({ t: 'trade_cancel' }), { cls: 'ghost' }));
            } else {
              tb.append(K.el('h3', null, 'Você dá'));
              for (const r of RES) tb.append(stepper(sel.give, r, h[r], redraw));
              tb.append(K.el('h3', null, 'Você quer'));
              for (const r of RES) tb.append(stepper(sel.get, r, 9, redraw));
              const bad = !sum(sel.give) || !sum(sel.get) || RES.some((r) => sel.give[r] && sel.get[r]);
              tb.append(button('Enviar oferta', () => send({ t: 'trade_offer', give: sel.give, get: sel.get }), { disabled: bad }));
              if (RES.some((r) => sel.give[r] && sel.get[r])) tb.append(K.el('p', 'muted', 'Não dá para dar e pedir o mesmo recurso.'));
            }
            box.append(tb);
          }
          if (panel === 'bank') {
            const tb = K.el('div', 'ct-sub');
            tb.append(K.el('h3', null, 'Trocar com o banco'));
            tb.append(K.el('small', null, 'Escolha o que dar (a razão considera seus portos) e depois o que receber.'));
            const give = K.el('div', 'ct-actions');
            for (const r of RES) give.append(button(`${RES_NAME[r]} (${mine.ratios[r]}:1)`, () => { sel.bankGive = r; redraw(); }, { disabled: h[r] < mine.ratios[r], cls: sel.bankGive === r ? 'on' : 'ghost' }));
            tb.append(give);
            if (sel.bankGive) {
              const get = K.el('div', 'ct-actions');
              for (const r of RES) if (r !== sel.bankGive) get.append(button(`Receber ${RES_NAME[r].toLowerCase()}`, () => { const g = sel.bankGive; sel.bankGive = null; send({ t: 'bank_trade', give: g, get: r }); }, { disabled: v.bank[r] < 1 }));
              tb.append(get);
            }
            box.append(tb);
          }
          if (panel === 'year') {
            const tb = K.el('div', 'ct-sub');
            tb.append(K.el('h3', null, 'Invenção: escolha 2 recursos do banco'));
            const a = K.el('div', 'ct-actions');
            for (const r of RES) a.append(button(RES_NAME[r], () => { if (!sel.yearA) sel.yearA = r; else { const x = sel.yearA; sel.yearA = null; panel = null; send({ t: 'play_year', a: x, b: r }); return; } redraw(); }, { cls: sel.yearA === r ? 'on' : 'ghost', disabled: v.bank[r] < 1 }));
            tb.append(a, K.el('small', null, sel.yearA ? `Primeiro: ${RES_NAME[sel.yearA]}. Escolha o segundo.` : 'Escolha o primeiro.'));
            box.append(tb);
          }
          if (panel === 'monopoly') {
            const tb = K.el('div', 'ct-sub');
            tb.append(K.el('h3', null, 'Monopólio: todos entregam este recurso'));
            const a = K.el('div', 'ct-actions');
            for (const r of RES) a.append(button(RES_NAME[r], () => { panel = null; send({ t: 'play_monopoly', res: r }); }, { cls: 'ghost' }));
            tb.append(a);
            box.append(tb);
          }
        }
        if (box.childNodes.length) wrap.append(box);
      }
    } else if (v.trade && v.step === 'main') {
      wrap.append(K.el('div', 'ct-box', `${nameOf(v.turn)} oferece ${resList(v.trade.give)} por ${resList(v.trade.get)}.`));
    }

    el.append(wrap);

    /* mensagem de status */
    if (v.over) {
      const w = v.winners.map(nameOf).join(' e ');
      return `${w} venceu com ${v.stats[v.winners[0]].points} pontos! "Nova partida" joga outra.`;
    }
    const waitingDiscard = v.discard ? Object.keys(v.discard).map(Number) : [];
    if (v.step === 'discard') {
      if (mine && mine.mustDiscard) return `Você tem mais de 7 cartas: descarte ${mine.mustDiscard}.`;
      return `Aguardando descarte de ${waitingDiscard.map(nameOf).join(', ')}.`;
    }
    if (!inGame) return `Você está assistindo. Vez de ${nameOf(v.turn)}.`;
    if (!myTurn) return `Vez de ${nameOf(v.turn)}.`;
    switch (v.step) {
      case 'setupSettle': return 'Preparação: toque num ponto branco para pôr sua colônia.';
      case 'setupRoad': return 'Preparação: toque numa aresta branca ao lado da colônia para pôr a estrada.';
      case 'roll': return 'Sua vez: role os dados.';
      case 'robber': return 'Toque no hexágono para onde mover o ladrão.';
      case 'steal': return 'Escolha de quem roubar uma carta.';
      case 'freeRoad': return `Construção de estradas: ponha ${v.freeRoads} estrada${v.freeRoads > 1 ? 's' : ''} grátis.`;
      case 'main':
        if (mode) return 'Toque num local destacado no tabuleiro (ou no botão de novo para cancelar).';
        return 'Sua vez: negocie, construa ou encerre o turno.';
      default: return '';
    }
  }

  window.GameUI.catan = { render };
})();
