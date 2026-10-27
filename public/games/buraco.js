'use strict';
// Interface do Buraco. Toque nas cartas da mao para seleciona-las; use os botoes para baixar um jogo novo,
// ampliar um jogo da sua dupla (toque no jogo para escolhe-lo) ou descartar.
// Intencoes: { t:'start', players } | { t:'draw' } | { t:'take' } | { t:'meld', cards, target } | { t:'discard', card }

(function () {
  const K = window.GameKit;
  let selected = new Set(); // indices na mao
  let target = null; // indice do jogo da propria dupla a ampliar
  let seenVersion = null;

  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'Buraco',
        min: 2,
        max: 4,
        options: (n) => [
          { label: 'Começar com 2 jogadores', payload: { t: 'start', players: 2 }, enabled: n >= 2 },
          { label: 'Começar com 4 jogadores (duplas)', payload: { t: 'start', players: 4 }, enabled: n >= 4 },
        ],
        rules: [
          '2 baralhos + 4 coringas. 11 cartas por jogador e 2 mortos de 11 cartas.',
          'Só sequências do mesmo naipe (3 ou mais). A vale baixo ou alto. Coringas: os 2 e os coringas, no máximo 1 por jogo.',
          'No seu turno: compre do monte ou pegue todo o descarte, baixe jogos e descarte uma carta.',
          'Canastra (7+ cartas): limpa 200, suja 100, real (A a K limpa) 500. Bater exige canastra e vale 100.',
          'Ao zerar a mão, a dupla pega o morto. Sem pegar o morto: -100. Jogo vai a 3000 pontos.',
        ],
      });
    }

    if (room.version !== seenVersion) {
      seenVersion = room.version;
      if (!mine || !mine.canPlay) {
        selected = new Set();
        target = null;
      }
    }
    if (mine) selected = new Set([...selected].filter((i) => i < mine.hand.length));

    el.innerHTML = '';
    const inGame = seat !== null && seat < v.players;
    const players = room.players.filter((p) => p.seat < v.players);
    const teamOfSeat = (s) => (v.players === 2 ? s : s % 2);
    const teamName = (t) => players.filter((p) => teamOfSeat(p.seat) === t).map((p) => p.name).join(' e ');
    const nameOf = (s) => (players.find((p) => p.seat === s) || { name: '' }).name;
    const myTeam = inGame ? teamOfSeat(seat) : null;
    const wrap = K.el('div', 'mesa');

    const score = K.el('div', 'score');
    score.append(K.el('span', 't0', `${teamName(0)}: ${v.totals[0]}`), K.el('span', 't1', `${teamName(1)}: ${v.totals[1]}`));
    wrap.append(score);
    wrap.append(
      K.playerList({ ...room, players }, v.turn, {
        teamOf: teamOfSeat,
        extra: (p) => `${v.counts[p.seat]} carta${v.counts[p.seat] === 1 ? '' : 's'}`,
      })
    );

    // monte, descarte e mortos
    const row = K.el('div', 'row2');
    const stock = K.el('div');
    stock.append(K.playingCard('', { down: true }), K.el('div', 'lbl', `Monte: ${v.stockCount}`));
    const disc = K.el('div');
    disc.append(v.discardTop ? K.playingCard(v.discardTop) : K.el('div', 'pc dim'), K.el('div', 'lbl', `Descarte: ${v.discardCount}`));
    const dead = K.el('div', 'lbl', `Mortos restantes: ${v.deadLeft}\n${teamName(0).split(' ')[0] || 'Eq.1'}: ${v.deadTaken[0] ? 'pegou' : 'não pegou'}\n${teamName(1).split(' ')[0] || 'Eq.2'}: ${v.deadTaken[1] ? 'pegou' : 'não pegou'}`);
    dead.style.whiteSpace = 'pre-line';
    row.append(stock, disc, dead);
    wrap.append(row);
    if (v.log) wrap.append(K.el('div', 'logline', v.log));

    // jogos baixados
    for (const t of [0, 1]) {
      const box = K.el('div', 'melds');
      box.append(K.el('div', `lbl t${t}`, `Jogos de ${teamName(t)}`));
      if (!v.melds[t].length) box.append(K.el('div', 'lbl', '—'));
      v.melds[t].forEach((m, i) => {
        const r = K.el('div', `meld${t === myTeam && target === i ? ' target' : ''}${m.cards.length >= 7 ? ' canastra' : ''}`);
        m.cards.forEach((c, k) => {
          const pc = K.playingCard(c, { small: true });
          if (m.wildAt === k) pc.classList.add('wildmark');
          r.append(pc);
        });
        if (m.cards.length >= 7) r.append(K.el('span', 'badge', m.wildAt === null ? (m.cards.length >= 13 ? 'real' : 'limpa') : 'suja'));
        if (t === myTeam && mine && mine.canPlay) {
          r.addEventListener('click', () => {
            target = target === i ? null : i;
            render(el, room, send);
          });
        }
        box.append(r);
      });
      wrap.append(box);
    }
    el.append(wrap);

    // fim da rodada: resumo de pontos
    if (v.phase === 'roundEnd' && v.roundScores) {
      const tbl = K.el('table', 'sum');
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
        const tr = K.el('tr');
        r.forEach((cell) => tr.append(K.el(i === 0 ? 'th' : 'td', null, String(cell))));
        tbl.append(tr);
      });
      el.append(tbl);
    }

    if (inGame && mine) {
      const hand = K.el('div', `hand${mine.hand.length > 14 ? ' tight' : ''}`);
      mine.hand.forEach((card, i) => {
        const c = K.playingCard(card, { selected: selected.has(i) });
        c.addEventListener('click', () => {
          if (selected.has(i)) selected.delete(i);
          else selected.add(i);
          render(el, room, send);
        });
        hand.append(c);
      });
      el.append(hand);

      const ctrls = K.el('div', 'ctrls');
      const btn = (label, enabled, onClick, ghost) => {
        const b = K.el('button', ghost ? 'ghost' : null, label);
        b.type = 'button';
        b.disabled = !enabled;
        b.addEventListener('click', onClick);
        ctrls.append(b);
      };
      const picked = () => [...selected].sort((a, b) => a - b).map((i) => mine.hand[i]);
      if (mine.canDraw || mine.canTake || mine.canEnd) {
        btn('Comprar', mine.canDraw, () => send({ t: 'draw' }));
        btn(`Pegar descarte (${v.discardCount})`, mine.canTake, () => send({ t: 'take' }), true);
      } else if (mine.canPlay) {
        const n = selected.size;
        btn('Baixar jogo', n >= 3, () => { const cards = picked(); selected = new Set(); target = null; send({ t: 'meld', cards, target: null }); });
        btn('Adicionar ao jogo', n >= 1 && target !== null, () => { const cards = picked(); const tg = target; selected = new Set(); target = null; send({ t: 'meld', cards, target: tg }); }, true);
        btn('Descartar', n === 1, () => { const card = picked()[0]; selected = new Set(); target = null; send({ t: 'discard', card }); });
      }
      el.append(ctrls);
    }

    const winTeam = v.winner;
    if (v.phase === 'roundEnd') return winTeam !== null ? `${teamName(winTeam)} venceu o jogo! ("Nova partida" zera o placar.)` : 'Rodada encerrada. "Nova partida" inicia a próxima rodada.';
    if (!inGame) return `Você está assistindo. Vez de ${nameOf(v.turn)}.`;
    if (v.turn !== seat) return `Vez de ${nameOf(v.turn)}.`;
    return mine && mine.canPlay ? 'Baixe jogos e descarte uma carta.' : 'Sua vez: compre do monte ou pegue o descarte.';
  }

  window.GameUI.buraco = { render };
})();
