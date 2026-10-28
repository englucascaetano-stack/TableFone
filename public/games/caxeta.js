'use strict';
// Interface da Caxeta (Cacheta). Toque numa carta para seleciona-la e use os botoes.
// Intencoes: { t:'start' } | { t:'draw' } | { t:'take' } | { t:'discard', card } | { t:'bater', card? }

(function () {
  const K = window.GameKit;
  let selected = null; // indice na mao
  let seenVersion = null;

  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'Caxeta',
        min: 2,
        max: 6,
        rules: [
          '2 baralhos + 4 coringas. Cada jogador recebe 9 cartas.',
          'No seu turno: compre do monte ou pegue a carta do topo do descarte, e depois descarte 1 carta.',
          'Bate quem conseguir organizar as 9 cartas em jogos de 3 ou mais, sem sobrar nenhuma.',
          'Jogo = sequência do mesmo naipe (A baixo ou alto) ou trinca/quadra (mesmo valor, naipes diferentes).',
          'O coringa serve para qualquer carta, no máximo 1 por jogo. O 2 é carta comum.',
        ],
      });
    }

    if (room.version !== seenVersion) {
      seenVersion = room.version;
      if (!mine || !mine.canDiscard) selected = null;
    }
    if (mine && selected !== null && selected >= mine.hand.length) selected = null;

    el.innerHTML = '';
    const inGame = seat !== null;
    const nameOf = (s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;
    const wrap = K.el('div', 'mesa');

    // Modo tablet: jogadores, monte e historico ficam no tablet; o celular mostra o descarte (para decidir) e a mao.
    if (!room.tableMode) wrap.append(
      K.playerList(room, v.turn, {
        extra: (p) => `${v.counts[p.seat]} carta${v.counts[p.seat] === 1 ? '' : 's'} · ${v.wins[p.seat] || 0} vit.`,
      })
    );
    const row = K.el('div', 'row2');
    const stock = K.el('div');
    stock.append(K.playingCard('', { down: true }), K.el('div', 'lbl', `Monte: ${v.stockCount}`));
    const disc = K.el('div');
    disc.append(v.discardTop ? K.playingCard(v.discardTop) : K.el('div', 'pc dim'), K.el('div', 'lbl', 'Descarte'));
    if (room.tableMode) row.append(disc);
    else row.append(stock, disc);
    wrap.append(row);
    if (v.log && !room.tableMode) wrap.append(K.el('div', 'logline', v.log));
    el.append(wrap);

    // fim da rodada: maos reveladas e jogos de quem bateu
    if (v.over && v.reveal && !room.tableMode) {
      const box = K.el('div', 'mesa');
      if (v.groups) {
        box.append(K.el('div', 'lbl', `Jogos de ${nameOf(v.winner)}:`));
        const gr = K.el('div', 'hand');
        v.groups.forEach((group, gi) => {
          const g = K.el('div', 'meld');
          group.forEach((c) => g.append(K.playingCard(c, { small: true })));
          gr.append(g);
        });
        box.append(gr);
      }
      v.reveal.forEach((h, s) => {
        if (s === v.winner) return;
        box.append(K.el('div', 'lbl', `Mão de ${nameOf(s)}:`));
        const hr = K.el('div', 'hand');
        h.forEach((c) => hr.append(K.playingCard(c, { small: true })));
        box.append(hr);
      });
      el.append(box);
    }

    if (inGame && mine) {
      const hand = K.el('div', 'hand');
      mine.hand.forEach((card, i) => {
        const c = K.playingCard(card, { selected: selected === i });
        c.addEventListener('click', () => {
          selected = selected === i ? null : i;
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
      if (mine.canDraw) {
        btn('Comprar', true, () => send({ t: 'draw' }));
        btn('Pegar descarte', mine.canTake, () => send({ t: 'take' }), true);
      } else if (mine.canDiscard) {
        btn('Descartar', selected !== null, () => { const card = mine.hand[selected]; selected = null; send({ t: 'discard', card }); });
        btn('Bater!', mine.canBater, () => { const card = selected !== null ? mine.hand[selected] : undefined; selected = null; send({ t: 'bater', card }); });
      }
      if (ctrls.childNodes.length) el.append(ctrls);
    }

    if (v.over) return v.winner === null ? 'Rodada empatada. "Nova partida" joga outra.' : `${nameOf(v.winner)} bateu! "Nova partida" joga outra rodada.`;
    if (!inGame) return `Você está assistindo. Vez de ${nameOf(v.turn)}.`;
    if (v.turn !== seat) return `Vez de ${nameOf(v.turn)}.`;
    return mine && mine.canDiscard ? (mine.canBater ? 'Você pode bater! Ou descarte uma carta.' : 'Descarte uma carta.') : 'Sua vez: compre do monte ou pegue o descarte.';
  }

  window.GameUI.caxeta = { render };
})();
