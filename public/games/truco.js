'use strict';
// Interface do Truco paulista (2 jogadores ou 4 em duplas).
// Intencoes: { t:'start', players } | { t:'play', card } | { t:'truco' } | { t:'accept' } | { t:'run' } | { t:'raise' } | { t:'onze', play }

(function () {
  const K = window.GameKit;

  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'Truco',
        min: 2,
        max: 4,
        options: (n) => [
          { label: 'Começar com 2 jogadores', payload: { t: 'start', players: 2 }, enabled: n >= 2 },
          { label: 'Começar com 4 jogadores (duplas)', payload: { t: 'start', players: 4 }, enabled: n >= 4 },
        ],
        rules: [
          'Truco paulista: 40 cartas; a vira define a manilha (o valor seguinte). Manilhas: paus, copas, espadas, ouros.',
          'Ordem: 3, 2, A, K, J, Q, 7, 6, 5, 4. Ganha a mão quem vencer 2 de 3 rodadas.',
          'Truco vale 3; a outra equipe pode aceitar, correr ou aumentar (6, 9, 12). Jogo vai a 12 pontos.',
          'Com 4 jogadores: assentos 1 e 3 contra 2 e 4 (duplas alternadas na mesa).',
          'Mão de onze: quem tem 11 pontos vê a mão e decide jogar (vale 3) ou correr. Sem "encobrir" cartas.',
        ],
      });
    }

    el.innerHTML = '';
    const inGame = seat !== null && seat < v.players;
    const nameOf = (s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;
    const teamName = (t) => room.players.filter((p) => p.seat < v.players && p.seat % 2 === t).map((p) => p.name).join(' e ');
    const wrap = K.el('div', 'mesa');

    const score = K.el('div', 'score');
    score.append(K.el('span', 't0', `${teamName(0)}: ${v.points[0]}`), K.el('span', 't1', `${teamName(1)}: ${v.points[1]}`));
    wrap.append(score);
    wrap.append(
      K.playerList({ ...room, players: room.players.filter((p) => p.seat < v.players) }, v.turn, {
        teamOf: (s) => s % 2,
        extra: (p) => (p.seat === v.mao ? 'mão' : ''),
      })
    );

    const info = K.el('div', 'row2');
    const viraBox = K.el('div');
    viraBox.append(K.playingCard(v.vira, { small: true }), K.el('div', 'lbl', `Vira · manilha: ${v.manilha}`));
    const valueBox = K.el('div');
    valueBox.append(K.el('div', 'score', `Vale ${v.value}`));
    if (v.call) valueBox.append(K.el('div', 'lbl', `${teamName(v.call.team)} pede ${v.call.name}!`));
    row2Append(info, viraBox, valueBox);
    wrap.append(info);

    // rodadas ja decididas
    if (v.rounds.length) {
      const hist = K.el('div', 'lbl', 'Rodadas: ' + v.rounds.map((r, i) => `${i + 1}ª ${r.win === null ? 'empate' : teamName(r.win)}`).join(' · '));
      wrap.append(hist);
    }
    // cartas na mesa (rodada em andamento) ou ultima rodada
    const shown = v.table.length ? v.table : v.rounds.length ? v.rounds[v.rounds.length - 1].cards : [];
    const tbl = K.el('div', 'row2');
    for (const p of shown) {
      const box = K.el('div');
      box.append(K.playingCard(p.card, { small: false }), K.el('div', 'lbl', nameOf(p.seat)));
      tbl.append(box);
    }
    if (!shown.length) tbl.append(K.el('div', 'lbl', 'Mesa vazia'));
    wrap.append(tbl);
    if (v.log) wrap.append(K.el('div', 'logline', v.log));
    el.append(wrap);

    if (inGame && mine) {
      // decisao da mao de onze
      if (mine.mustDecide) {
        if (mine.partnerHand) {
          const ph = K.el('div', 'hand');
          mine.partnerHand.forEach((c) => ph.append(K.playingCard(c, { small: true })));
          el.append(K.el('div', 'logline', 'Mão do seu parceiro:'), ph);
        }
        const ctrls = K.el('div', 'ctrls');
        const yes = K.el('button', null, 'Jogar (vale 3)');
        yes.type = 'button';
        yes.addEventListener('click', () => send({ t: 'onze', play: true }));
        const no = K.el('button', 'ghost', 'Correr');
        no.type = 'button';
        no.addEventListener('click', () => send({ t: 'onze', play: false }));
        ctrls.append(yes, no);
        el.append(ctrls);
      }

      const hand = K.el('div', 'hand');
      mine.hand.forEach((card) => {
        const c = K.playingCard(card, { dim: !mine.canPlay });
        c.addEventListener('click', () => mine.canPlay && send({ t: 'play', card }));
        hand.append(c);
      });
      el.append(hand);

      const ctrls = K.el('div', 'ctrls');
      if (mine.mustRespond) {
        const acc = K.el('button', null, 'Aceitar');
        acc.type = 'button';
        acc.addEventListener('click', () => send({ t: 'accept' }));
        const run = K.el('button', 'ghost', 'Correr');
        run.type = 'button';
        run.addEventListener('click', () => send({ t: 'run' }));
        ctrls.append(acc, run);
        if (mine.canRaise) {
          const up = K.el('button', null, `${mine.raiseName}!`);
          up.type = 'button';
          up.addEventListener('click', () => send({ t: 'raise' }));
          ctrls.append(up);
        }
      } else if (mine.canTruco) {
        const t = K.el('button', null, `${mine.nextName}!`);
        t.type = 'button';
        t.addEventListener('click', () => send({ t: 'truco' }));
        ctrls.append(t);
      }
      if (ctrls.childNodes.length) el.append(ctrls);
    }

    if (v.over) return `${teamName(v.winner)} venceu o jogo!`;
    if (!inGame) return `Você está assistindo. Vez de ${v.turn === null ? '' : nameOf(v.turn)}.`;
    if (v.decision !== null) return mine && mine.mustDecide ? 'Mão de onze: jogar ou correr?' : 'Aguardando a decisão da mão de onze.';
    if (v.call) return mine && mine.mustRespond ? `${teamName(v.call.team)} pede ${v.call.name}! Responda.` : 'Aguardando a resposta do pedido.';
    return v.turn === seat ? 'Sua vez.' : `Vez de ${nameOf(v.turn)}.`;
  }

  function row2Append(row, ...children) {
    children.forEach((c) => row.append(c));
  }

  window.GameUI.truco = { render };
})();
