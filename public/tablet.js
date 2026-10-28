'use strict';
// Telas do modo tablet: o tablet fica no meio da mesa e espelha a partida (visao publica), sem mostrar maos.
// Cada funcao recebe (elemento, sala) e devolve o texto da linha de situacao.
// Jogos que nao aparecem aqui usam a propria tela, em modo "assistindo", ampliada (ver renderTable em app.js).

window.TableUI = (function () {
  const K = window.GameKit;
  const el = K.el;
  const COLOR_NAME = { R: 'vermelho', Y: 'amarelo', G: 'verde', B: 'azul' };
  const COLOR_HEX = { R: '#d23b3b', Y: '#e8b923', G: '#3a9d4f', B: '#3a6fd2' };

  const nameOf = (room, s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;

  // Mesa com os lugares distribuidos em volta (assento 0 embaixo, seguindo no sentido horario).
  // seatEl(seat) devolve o elemento de cada lugar; centerEl e o miolo da mesa; sideEl (opcional) e a coluna lateral.
  function layout(root, n, seatEl, centerEl, sideEl, underEl) {
    root.innerHTML = '';
    const grid = el('div', `tb-grid${sideEl ? ' with-side' : ''}`);
    const felt = el('div', 'tb-felt');
    for (let i = 0; i < n; i++) {
      const a = (i * 2 * Math.PI) / n;
      const box = el('div', 'tb-seat');
      box.style.left = `${50 - 36 * Math.sin(a)}%`;
      box.style.top = `${50 + 37 * Math.cos(a)}%`;
      box.append(seatEl(i));
      felt.append(box);
    }
    const mid = el('div', 'tb-center');
    mid.append(centerEl);
    felt.append(mid);
    grid.append(felt);
    if (sideEl) grid.append(sideEl);
    root.append(grid);
    if (underEl) root.append(underEl);
  }

  function seatCard(room, i, { sub, extra, turn, dead, team, badge }) {
    const b = el('div', `tb-pl${turn ? ' turn' : ''}${dead ? ' dead' : ''}${team !== undefined ? ` team${team}` : ''}`);
    const p = room.players.find((x) => x.seat === i);
    const head = el('div', 'tb-pn');
    head.append(el('span', `dot${p && p.online ? ' on' : ''}`), el('b', null, nameOf(room, i)));
    if (badge) head.append(el('span', 'tb-badge', badge));
    b.append(head);
    if (sub) b.append(el('div', 'tb-sub', sub));
    if (extra) b.append(extra);
    return b;
  }

  function backs(count, kind) {
    const f = el('div', 'tb-fan');
    const shown = Math.min(count, 12);
    for (let k = 0; k < shown; k++) f.append(kind === 'uno' ? el('div', 'uno back small') : el('div', 'pc down small'));
    if (count > shown) f.append(el('span', 'tb-more', `+${count - shown}`));
    return f;
  }

  const logBox = (lines, title) => {
    const side = el('aside', 'tb-side');
    side.append(el('h3', null, title || 'Histórico'));
    lines.slice(-14).reverse().forEach((l) => side.append(el('div', 'tb-log', l)));
    return side;
  };

  const banner = (text) => el('div', 'tb-banner', text);

  const T = {};

  /* ---------- Uno ---------- */
  T.uno = function (root, room) {
    const v = room.view;
    if (v.phase === 'lobby') return lobbyScreen(root, room, 'Uno');
    const center = el('div', 'tb-mid');
    const piles = el('div', 'tb-row');
    const draw = el('div');
    draw.append(el('div', 'uno back'), el('div', 'lbl', `Monte: ${v.drawCount}`));
    const top = el('div');
    if (v.top) {
      const c = K.unoCard(v.top);
      c.style.boxShadow = `0 0 0 6px ${COLOR_HEX[v.color]}`;
      top.append(c);
    }
    top.append(el('div', 'lbl', `Cor atual: ${COLOR_NAME[v.color]}`));
    piles.append(draw, top, el('div', 'tb-dir', v.dir === 1 ? '↻' : '↺'));
    center.append(piles);
    if (v.log) {
      const actor = v.lastSeat !== null && v.lastSeat !== undefined && /jogou/.test(v.log) ? nameOf(room, v.lastSeat) : null;
      center.append(el('div', 'tb-note', actor ? `${actor} ${v.log}` : v.log));
    }
    if (v.over) center.append(banner(`${nameOf(room, v.winner)} venceu!`));
    layout(root, v.players, (i) => seatCard(room, i, {
      turn: v.turn === i, sub: `${v.counts[i]} carta${v.counts[i] === 1 ? '' : 's'}${v.counts[i] === 1 ? ' · UNO!' : ''}`, extra: backs(v.counts[i], 'uno'),
    }), center);
    return v.over ? `${nameOf(room, v.winner)} venceu a partida.` : `Vez de ${nameOf(room, v.turn)}.`;
  };

  /* ---------- Truco ---------- */
  T.truco = function (root, room) {
    const v = room.view;
    if (v.phase === 'lobby') return lobbyScreen(root, room, 'Truco');
    const seats = room.players.filter((p) => p.seat < v.players);
    const teamName = (t) => seats.filter((p) => p.seat % 2 === t).map((p) => p.name).join(' e ');
    const center = el('div', 'tb-mid');
    const score = el('div', 'tb-score');
    score.append(el('span', 't0', `${teamName(0)}: ${v.points[0]}`), el('span', 't1', `${teamName(1)}: ${v.points[1]}`));
    center.append(score);
    const row = el('div', 'tb-row');
    const vira = el('div');
    vira.append(K.playingCard(v.vira, { small: true }), el('div', 'lbl', `Vira · manilha ${v.manilha}`));
    row.append(vira);
    const shown = v.table.length ? v.table : v.rounds.length ? v.rounds[v.rounds.length - 1].cards : [];
    for (const p of shown) {
      const b = el('div');
      b.append(K.playingCard(p.card), el('div', 'lbl', nameOf(room, p.seat)));
      row.append(b);
    }
    center.append(row);
    center.append(el('div', 'tb-note', `Vale ${v.value}${v.call ? ` · ${teamName(v.call.team)} pede ${v.call.name}!` : ''}`));
    if (v.rounds.length) center.append(el('div', 'tb-note', 'Rodadas: ' + v.rounds.map((r, i) => `${i + 1}ª ${r.win === null ? 'empate' : teamName(r.win)}`).join(' · ')));
    if (v.log) center.append(el('div', 'tb-note', v.log));
    if (v.over) center.append(banner(`${teamName(v.winner)} venceu o jogo!`));
    layout(root, v.players, (i) => seatCard(room, i, { turn: v.turn === i, team: i % 2, badge: i === v.mao ? 'mão' : '' }), center);
    if (v.over) return `${teamName(v.winner)} venceu o jogo.`;
    if (v.call) return `${teamName(v.call.team)} pede ${v.call.name}. Aguardando a resposta.`;
    return v.turn === null ? '' : `Vez de ${nameOf(room, v.turn)}.`;
  };

  /* ---------- Caxeta ---------- */
  T.caxeta = function (root, room) {
    const v = room.view;
    if (v.phase === 'lobby') return lobbyScreen(root, room, 'Caxeta');
    const center = el('div', 'tb-mid');
    const piles = el('div', 'tb-row');
    const stock = el('div');
    stock.append(K.playingCard('', { down: true }), el('div', 'lbl', `Monte: ${v.stockCount}`));
    const disc = el('div');
    disc.append(v.discardTop ? K.playingCard(v.discardTop) : el('div', 'pc dim'), el('div', 'lbl', 'Descarte'));
    piles.append(stock, disc);
    center.append(piles);
    if (v.log) center.append(el('div', 'tb-note', v.log));
    if (v.over) center.append(banner(v.winner === null ? 'Rodada empatada.' : `${nameOf(room, v.winner)} bateu!`));
    let under = null;
    if (v.over && v.reveal) {
      under = el('div', 'tb-under');
      if (v.groups) {
        under.append(el('h3', null, `Jogos de ${nameOf(room, v.winner)}`));
        const gr = el('div', 'tb-melds');
        v.groups.forEach((g) => {
          const m = el('div', 'meld');
          g.forEach((c) => m.append(K.playingCard(c, { small: true })));
          gr.append(m);
        });
        under.append(gr);
      }
      v.reveal.forEach((h, s) => {
        if (s === v.winner) return;
        under.append(el('h3', null, `Mão de ${nameOf(room, s)}`));
        const r = el('div', 'tb-melds');
        const m = el('div', 'meld');
        h.forEach((c) => m.append(K.playingCard(c, { small: true })));
        r.append(m);
        under.append(r);
      });
    }
    layout(root, v.counts.length, (i) => seatCard(room, i, {
      turn: v.turn === i, sub: `${v.counts[i]} carta${v.counts[i] === 1 ? '' : 's'} · ${v.wins[i] || 0} vit.`, extra: backs(v.counts[i]),
    }), center, null, under);
    if (v.over) return v.winner === null ? 'Rodada empatada.' : `${nameOf(room, v.winner)} bateu!`;
    return `Vez de ${nameOf(room, v.turn)}.`;
  };

  /* ---------- Buraco ---------- */
  T.buraco = function (root, room) {
    const v = room.view;
    if (v.phase === 'lobby') return lobbyScreen(root, room, 'Buraco');
    const seats = room.players.filter((p) => p.seat < v.players);
    const teamOf = (s) => (v.players === 2 ? s : s % 2);
    const teamName = (t) => seats.filter((p) => teamOf(p.seat) === t).map((p) => p.name).join(' e ');
    const center = el('div', 'tb-mid');
    const score = el('div', 'tb-score');
    score.append(el('span', 't0', `${teamName(0)}: ${v.totals[0]}`), el('span', 't1', `${teamName(1)}: ${v.totals[1]}`));
    center.append(score);
    const piles = el('div', 'tb-row');
    const stock = el('div');
    stock.append(K.playingCard('', { down: true }), el('div', 'lbl', `Monte: ${v.stockCount}`));
    const disc = el('div');
    disc.append(v.discardTop ? K.playingCard(v.discardTop) : el('div', 'pc dim'), el('div', 'lbl', `Descarte: ${v.discardCount}`));
    const dead = el('div', 'lbl', `Mortos: ${v.deadLeft}\n${teamName(0).split(' ')[0] || 'Eq.1'}: ${v.deadTaken[0] ? 'pegou' : 'não pegou'}\n${teamName(1).split(' ')[0] || 'Eq.2'}: ${v.deadTaken[1] ? 'pegou' : 'não pegou'}`);
    dead.style.whiteSpace = 'pre-line';
    piles.append(stock, disc, dead);
    center.append(piles);
    if (v.log) center.append(el('div', 'tb-note', v.log));
    if (v.phase === 'roundEnd') center.append(banner(v.winner !== null ? `${teamName(v.winner)} venceu o jogo!` : 'Rodada encerrada.'));

    const under = el('div', 'tb-under two');
    for (const t of [0, 1]) {
      const col = el('div', 'tb-col');
      col.append(el('h3', `t${t}`, `Jogos de ${teamName(t)}`));
      if (!v.melds[t].length) col.append(el('div', 'lbl', '—'));
      v.melds[t].forEach((m) => {
        const r = el('div', `meld${m.cards.length >= 7 ? ' canastra' : ''}`);
        m.cards.forEach((c, k) => {
          const pc = K.playingCard(c, { small: true });
          if (m.wildAt === k) pc.classList.add('wildmark');
          r.append(pc);
        });
        if (m.cards.length >= 7) r.append(el('span', 'badge', m.wildAt === null ? (m.cards.length >= 13 ? 'real' : 'limpa') : 'suja'));
        col.append(r);
      });
      under.append(col);
    }
    if (v.phase === 'roundEnd' && v.roundScores) {
      const tbl = el('table', 'sum');
      const rows = [
        ['', teamName(0), teamName(1)],
        ['Cartas baixadas', ...v.roundScores.map((d) => d.melded)],
        ['Canastras', ...v.roundScores.map((d) => d.canastras)],
        ['Bater', ...v.roundScores.map((d) => d.bater)],
        ['Cartas na mão', ...v.roundScores.map((d) => d.hand)],
        ['Morto', ...v.roundScores.map((d) => d.morto)],
        ['Total da rodada', ...v.roundScores.map((d) => d.total)],
        ['Total do jogo', ...v.totals],
      ];
      rows.forEach((r, i) => {
        const tr = el('tr');
        r.forEach((cell) => tr.append(el(i === 0 ? 'th' : 'td', null, String(cell))));
        tbl.append(tr);
      });
      under.append(tbl);
    }
    layout(root, v.players, (i) => seatCard(room, i, {
      turn: v.turn === i, team: teamOf(i), sub: `${v.counts[i]} carta${v.counts[i] === 1 ? '' : 's'}`, extra: backs(v.counts[i]),
    }), center, null, under);
    if (v.phase === 'roundEnd') return v.winner !== null ? `${teamName(v.winner)} venceu o jogo.` : 'Rodada encerrada.';
    return `Vez de ${nameOf(room, v.turn)}.`;
  };

  /* ---------- BANG! ---------- */
  const BNAME = {
    bang: 'BANG!', missed: 'Errou!', beer: 'Cerveja', saloon: 'Saloon', stagecoach: 'Diligência', wells: 'Wells Fargo',
    store: 'Armazém', gatling: 'Gatling', indians: 'Índios!', duel: 'Duelo', panic: 'Pânico!', balou: 'Cat Balou',
    barrel: 'Barril', dynamite: 'Dinamite', jail: 'Cadeia', mustang: 'Mustang', scope: 'Mira',
    schofield: 'Schofield', remington: 'Remington', carabine: 'Carabina', winchester: 'Winchester', volcanic: 'Volcanic',
  };
  const BCHAR = {
    bart: 'Bart Cassidy', blackjack: 'Black Jack', janet: 'Calamity Janet', gringo: 'El Gringo', jesse: 'Jesse Jones', jourdonnais: 'Jourdonnais',
    kit: 'Kit Carlson', lucky: 'Lucky Duke', paul: 'Paul Regret', pedro: 'Pedro Ramirez', rose: 'Rose Doolan', sid: 'Sid Ketchum',
    slab: 'Slab the Killer', suzy: 'Suzy Lafayette', vulture: 'Vulture Sam', willy: 'Willy the Kid',
  };
  const BROLE = { sheriff: 'Xerife', deputy: 'Delegado', outlaw: 'Fora-da-lei', renegade: 'Renegado' };
  const BSUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const BRANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const BBLUE = ['barrel', 'dynamite', 'jail', 'mustang', 'scope', 'schofield', 'remington', 'carabine', 'winchester', 'volcanic'];

  T.bang = function (root, room) {
    const v = room.view;
    if (v.phase === 'lobby') return lobbyScreen(root, room, 'BANG!');
    const fill = (t) => String(t).replace(/@(\d)/g, (_, d) => nameOf(room, Number(d)));
    const bcard = (c) => {
      const b = el('span', `bg-card small${BBLUE.includes(c.type) ? ' blue' : ''}`);
      b.append(el('span', 'bn', BNAME[c.type]), el('span', `bs ${c.suit === 'H' || c.suit === 'D' ? 'red' : ''}`, `${BRANK[c.rank] || c.rank}${BSUIT[c.suit]}`));
      return b;
    };
    const center = el('div', 'tb-mid');
    const piles = el('div', 'tb-row');
    const deck = el('div');
    deck.append(el('div', 'pc down'), el('div', 'lbl', `Baralho: ${v.deck}`));
    const disc = el('div');
    disc.append(v.top ? bcard(v.top) : el('div', 'pc dim'), el('div', 'lbl', 'Descarte'));
    piles.append(deck, disc);
    center.append(piles);
    const waiting = v.step ? v.step.waiting[0] : null;
    center.append(el('div', 'tb-note', v.over ? '' : v.step ? `Aguardando ${nameOf(room, waiting)}.` : `Vez de ${nameOf(room, v.turn)}.`));
    if (v.over) {
      center.append(banner(`${v.winner === 'sheriff' ? 'O Xerife e os Delegados venceram' : v.winner === 'outlaws' ? 'Os Fora-da-lei venceram' : 'O Renegado venceu'}!`));
    }
    layout(root, v.players, (i) => {
      const p = v.seats[i];
      const hp = el('div', 'bg-hp');
      for (let h = 0; h < p.max; h++) hp.append(el('span', h < p.hp ? 'on' : 'off', '●'));
      const box = el('div');
      box.append(hp, el('div', 'tb-sub', `${p.hand} carta${p.hand === 1 ? '' : 's'} · alcance ${p.range}`));
      if (p.table.length) {
        const tb = el('div', 'bg-table');
        p.table.forEach((c) => tb.append(bcard(c)));
        box.append(tb);
      }
      const role = p.role ? BROLE[p.role] : '?';
      const seat = seatCard(room, i, {
        turn: v.turn === i || (v.step && v.step.waiting.includes(i)), dead: !p.alive,
        sub: `${BCHAR[p.char] || ''} · ${role}${p.alive ? '' : ' (eliminado)'}`, extra: box,
      });
      return seat;
    }, center, logBox(v.log.map(fill), 'Histórico'));
    if (v.over) return 'Fim de jogo.';
    return v.step ? `Aguardando ${nameOf(room, waiting)}.` : `Vez de ${nameOf(room, v.turn)}.`;
  };

  /* ---------- Coup ---------- */
  const CNAME = { duke: 'Duque', assassin: 'Assassino', captain: 'Capitão', ambassador: 'Embaixador', contessa: 'Condessa' };
  const CACTION = { income: 'Renda', foreignAid: 'Ajuda externa', coup: 'Golpe', tax: 'Taxar', assassinate: 'Assassinar', steal: 'Extorquir', exchange: 'Trocar' };
  T.coup = function (root, room) {
    const v = room.view;
    if (v.phase === 'lobby') return lobbyScreen(root, room, 'Coup');
    const fmt = (t) => String(t).replace(/@(\d+)/g, (_, n) => nameOf(room, Number(n)));
    const st = v.step;
    let situation = '';
    if (v.over) situation = `${nameOf(room, v.winner)} venceu o jogo!`;
    else if (st) {
      const act = st.action ? CACTION[st.action] : '';
      const who = st.actor !== null ? nameOf(room, st.actor) : '';
      const tgt = st.target !== null ? ` em ${nameOf(room, st.target)}` : '';
      const wait = st.waiting.map((s) => nameOf(room, s)).join(', ');
      if (st.k === 'action') situation = `Vez de ${nameOf(room, v.turn)}.`;
      else if (st.k === 'challenge') situation = `${who} declarou ${act}${tgt} como ${CNAME[st.claim]}. Alguém desafia? Falta: ${wait}.`;
      else if (st.k === 'block') situation = `${who} declarou ${act}${tgt}. Alguém bloqueia? Falta: ${wait}.`;
      else if (st.k === 'challengeBlock') situation = `${nameOf(room, st.blocker)} bloqueou como ${CNAME[st.claim]}. Alguém desafia? Falta: ${wait}.`;
      else if (st.k === 'lose') situation = `${nameOf(room, st.seat)} escolhe uma influência para perder.`;
      else if (st.k === 'exchange') situation = `${nameOf(room, st.seat)} está trocando cartas com o baralho.`;
    }
    const center = el('div', 'tb-mid');
    center.append(el('div', 'tb-note big', situation));
    if (v.over) center.append(banner(`${nameOf(room, v.winner)} venceu!`));
    layout(root, v.players, (i) => {
      const dead = v.influence[i] === 0;
      const cards = el('div', 'cpcards');
      for (let k = 0; k < v.influence[i]; k++) cards.append(el('div', 'ch back small'));
      for (const c of v.revealed[i]) {
        const d = el('div', `ch ${c} small`);
        d.append(el('div', 'cn', CNAME[c]));
        cards.append(d);
      }
      return seatCard(room, i, { turn: v.turn === i, dead, sub: `${v.coins[i]} moeda${v.coins[i] === 1 ? '' : 's'}${dead ? ' · eliminado' : ''}`, extra: cards });
    }, center, logBox(v.events.map(fmt), 'Histórico'));
    return v.over ? `${nameOf(room, v.winner)} venceu.` : situation;
  };

  function lobbyScreen(root, room, title) {
    root.innerHTML = '';
    const box = el('div', 'tb-lobby');
    box.append(el('h2', null, title), el('p', null, `Sala ${room.code}`));
    box.append(el('p', 'muted', 'Aguardando o anfitrião começar a partida no celular.'));
    const list = el('div', 'plist');
    room.players.forEach((p) => list.append(el('div', `pl${p.online ? '' : ' off'}`, p.name)));
    box.append(list);
    root.append(box);
    return '';
  }

  return T;
})();
