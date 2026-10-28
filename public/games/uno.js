'use strict';
// Interface do Uno. Visao publica: room.view (mesa, contagem de cartas); visao privada: room.mine (sua mao).
// Intencoes enviadas: { t: 'start' } | { t: 'play', card, color? } | { t: 'draw' } | { t: 'pass' }

(function () {
  const K = window.GameKit;
  const COLOR_NAME = { R: 'vermelho', Y: 'amarelo', G: 'verde', B: 'azul' };
  let pendingWild = null; // carta coringa escolhida, aguardando a cor
  let seenVersion = null;

  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;
    if (room.version !== seenVersion) {
      seenVersion = room.version;
      pendingWild = null;
    }

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'Uno',
        min: 2,
        max: 8,
        rules: [
          'Jogue uma carta da mesma cor ou do mesmo número/símbolo da carta do topo.',
          'Sem carta jogável, compre uma; se ela servir, você pode jogá-la.',
          'Coringa +4 só pode ser jogado sem nenhuma carta da cor atual.',
          'Não é permitido acumular +2 ou +4. Com 2 jogadores, Inverte vale como Pula.',
          'Vence quem ficar sem cartas primeiro.',
        ],
      });
    }

    el.innerHTML = '';
    const wrap = K.el('div', 'mesa');

    // Modo tablet: a mesa inteira fica no tablet; o celular mostra so a carta do topo (para escolher) e a mao.
    if (!room.tableMode) wrap.append(
      K.playerList(room, v.turn, {
        extra: (p) => `${v.counts[p.seat]} carta${v.counts[p.seat] === 1 ? '' : 's'}${v.counts[p.seat] === 1 ? ' · UNO!' : ''}`,
      })
    );

    const row = K.el('div', 'row2');
    const pile = K.el('div', 'uno back');
    pile.title = 'Monte';
    const pileBox = K.el('div');
    pileBox.append(pile, K.el('div', 'lbl', `Monte: ${v.drawCount}`));
    const topBox = K.el('div');
    if (v.top) topBox.append(K.unoCard(v.top));
    topBox.append(K.el('div', 'lbl', `Cor atual: ${COLOR_NAME[v.color]}`));
    const dirBox = K.el('div', 'lbl', v.dir === 1 ? '↻' : '↺');
    dirBox.style.fontSize = '1.8rem';
    if (room.tableMode) row.append(topBox);
    else row.append(pileBox, topBox, dirBox);
    wrap.append(row);
    // faixa com a cor atual
    const bar = K.el('div');
    bar.style.cssText = `height:6px;border-radius:3px;margin:4px auto;width:140px;background:${{ R: '#d23b3b', Y: '#e8b923', G: '#3a9d4f', B: '#3a6fd2' }[v.color]}`;
    wrap.append(bar);

    const who = (s) => room.players.find((p) => p.seat === s);
    if (v.log && !room.tableMode) {
      const actor = v.lastSeat !== null && v.lastSeat !== undefined && /jogou/.test(v.log) ? who(v.lastSeat) : null;
      wrap.append(K.el('div', 'logline', actor ? `${actor.name} ${v.log}` : v.log));
    }
    el.append(wrap);

    if (seat !== null && mine) {
      const myTurn = v.turn === seat && !v.over;
      const playable = new Set(mine.playable);
      const hand = K.el('div', `hand${mine.hand.length > 12 ? ' tight' : ''}`);
      mine.hand.forEach((card) => {
        const ok = myTurn && playable.has(card);
        const c = K.unoCard(card, { dim: myTurn && !ok, selected: pendingWild === card });
        c.addEventListener('click', () => {
          if (!ok) return;
          if (card.startsWith('W-')) {
            pendingWild = pendingWild === card ? null : card;
            render(el, room, send);
            return;
          }
          send({ t: 'play', card });
        });
        hand.append(c);
      });
      el.append(hand);

      if (pendingWild) {
        const picker = K.el('div', 'colors');
        for (const c of ['R', 'Y', 'G', 'B']) {
          const b = K.el('button', c.toLowerCase());
          b.type = 'button';
          b.setAttribute('aria-label', COLOR_NAME[c]);
          b.addEventListener('click', () => {
            const card = pendingWild;
            pendingWild = null;
            send({ t: 'play', card, color: c });
          });
          picker.append(b);
        }
        el.append(K.el('div', 'logline', 'Escolha a nova cor:'), picker);
      }

      const ctrls = K.el('div', 'ctrls');
      const draw = K.el('button', null, 'Comprar');
      draw.type = 'button';
      draw.disabled = !mine.canDraw;
      draw.addEventListener('click', () => send({ t: 'draw' }));
      const pass = K.el('button', 'ghost', 'Passar');
      pass.type = 'button';
      pass.disabled = !mine.canPass;
      pass.addEventListener('click', () => send({ t: 'pass' }));
      ctrls.append(draw, pass);
      el.append(ctrls);
    }

    if (v.over) return `${who(v.winner) ? who(v.winner).name : 'Alguém'} venceu a partida!`;
    if (seat === null) return `Você está assistindo. Vez de ${who(v.turn) ? who(v.turn).name : ''}.`;
    if (v.turn === seat) return mine && mine.canPass ? 'Jogue a carta comprada ou passe.' : 'Sua vez.';
    return `Vez de ${who(v.turn) ? who(v.turn).name : ''}.`;
  }

  window.GameUI.uno = { render };
})();
