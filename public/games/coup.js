'use strict';
// Interface do Coup. Visao publica: room.view (moedas, influencia, cartas reveladas, janela de resposta);
// visao privada: room.mine (suas cartas e o que voce pode fazer agora).
// Intencoes: { t:'start' } | { t:'action', action, target? } | { t:'pass' } | { t:'challenge' } | { t:'block', claim }
//            | { t:'lose', index } | { t:'exchange', keep:[indices] }

(function () {
  const K = window.GameKit;
  const CHAR = {
    duke: { name: 'Duque', hint: 'Taxar (+3). Bloqueia ajuda externa.' },
    assassin: { name: 'Assassino', hint: 'Assassinar (paga 3).' },
    captain: { name: 'Capitão', hint: 'Extorquir. Bloqueia extorsão.' },
    ambassador: { name: 'Embaixador', hint: 'Trocar cartas. Bloqueia extorsão.' },
    contessa: { name: 'Condessa', hint: 'Bloqueia assassinato.' },
  };
  const ACTION = {
    income: { label: 'Renda', sub: '+1 moeda' },
    foreignAid: { label: 'Ajuda externa', sub: '+2 (Duque bloqueia)' },
    coup: { label: 'Golpe', sub: 'paga 7' },
    tax: { label: 'Taxar', sub: 'Duque: +3' },
    assassinate: { label: 'Assassinar', sub: 'Assassino: paga 3' },
    steal: { label: 'Extorquir', sub: 'Capitão: rouba 2' },
    exchange: { label: 'Trocar', sub: 'Embaixador' },
  };

  let pickTarget = null; // acao que aguarda a escolha do alvo
  let loseIdx = null; // carta escolhida para perder
  let keepSet = new Set(); // cartas escolhidas para ficar na troca
  let seenVersion = null;

  function charCard(c, opts = {}) {
    const d = K.el('div', `ch ${c}${opts.sel ? ' sel' : ''}${opts.small ? ' small' : ''}`);
    d.append(K.el('div', 'cn', CHAR[c].name));
    if (!opts.small) d.append(K.el('div', 'chint', CHAR[c].hint));
    return d;
  }

  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'Coup',
        min: 2,
        max: 6,
        rules: [
          'Cada jogador tem 2 cartas de personagem escondidas (sua influência) e 2 moedas. Vence o último com influência.',
          'No seu turno, escolha uma ação. Você pode blefar: dizer que tem o personagem sem tê-lo.',
          'Qualquer jogador pode desafiar um personagem declarado. Quem erra perde uma influência.',
          'Alguns personagens bloqueiam ações: Duque (ajuda externa), Condessa (assassinato), Capitão ou Embaixador (extorsão).',
          'Com 10 ou mais moedas é obrigatório dar o Golpe (paga 7, sem defesa). Com 2 jogadores, quem começa tem 1 moeda.',
        ],
      });
    }

    if (room.version !== seenVersion) {
      seenVersion = room.version;
      pickTarget = null;
      loseIdx = null;
      keepSet = new Set();
    }

    el.innerHTML = '';
    const nameOf = (s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;
    const fmt = (text) => text.replace(/@(\d+)/g, (_, n) => nameOf(Number(n)));
    const st = v.step;
    const inGame = seat !== null && seat < v.players && mine;
    const wrap = K.el('div', 'mesa coup');

    /* jogadores */
    const list = K.el('div', 'cplist');
    for (let s = 0; s < v.players; s++) {
      const dead = v.influence[s] === 0;
      const targetable = pickTarget && mine && mine.targets && mine.targets.includes(s);
      const row = K.el('div', `cprow${s === v.turn ? ' turn' : ''}${dead ? ' dead' : ''}${s === seat ? ' me' : ''}${targetable ? ' targetable' : ''}`);
      const left = K.el('div', 'cpl');
      left.append(K.el('div', 'cpn', `${nameOf(s)}${s === seat ? ' (você)' : ''}${dead ? ' · eliminado' : ''}`));
      const cards = K.el('div', 'cpcards');
      for (let i = 0; i < v.influence[s]; i++) cards.append(K.el('div', 'ch back small'));
      for (const c of v.revealed[s]) cards.append(charCard(c, { small: true }));
      left.append(cards);
      row.append(left, K.el('div', 'coins', `${v.coins[s]}`));
      if (targetable) {
        row.addEventListener('click', () => {
          const action = pickTarget;
          pickTarget = null;
          send({ t: 'action', action, target: s });
        });
      }
      list.append(row);
    }
    wrap.append(list);

    /* situacao */
    let situation = '';
    if (v.over) situation = `${nameOf(v.winner)} venceu o jogo!`;
    else if (st) {
      const act = st.action ? ACTION[st.action].label : '';
      const who = st.actor !== null ? nameOf(st.actor) : '';
      const tgt = st.target !== null ? ` em ${nameOf(st.target)}` : '';
      const wait = st.waiting.map(nameOf).join(', ');
      if (st.k === 'action') situation = `Vez de ${nameOf(v.turn)}.`;
      else if (st.k === 'challenge') situation = `${who} declarou ${act}${tgt} como ${CHAR[st.claim].name}. Alguém desafia? Falta responder: ${wait}.`;
      else if (st.k === 'block') situation = `${who} declarou ${act}${tgt}. Alguém bloqueia? Falta responder: ${wait}.`;
      else if (st.k === 'challengeBlock') situation = `${nameOf(st.blocker)} bloqueou como ${CHAR[st.claim].name}. Alguém desafia? Falta responder: ${wait}.`;
      else if (st.k === 'lose') situation = `${nameOf(st.seat)} deve escolher uma influência para perder.`;
      else if (st.k === 'exchange') situation = `${nameOf(st.seat)} está trocando cartas com o baralho.`;
    }
    wrap.append(K.el('div', 'cpsit', situation));
    const ev = K.el('div', 'cplog');
    for (const e of v.events.slice(-4)) ev.append(K.el('div', null, fmt(e)));
    wrap.append(ev);
    el.append(wrap);

    /* minhas cartas e controles */
    if (inGame && mine.alive) {
      const myCards = K.el('div', 'hand');
      mine.hand.forEach((c, i) => {
        const sel = mine.mustLose && loseIdx === i;
        const d = charCard(c, { sel });
        if (mine.mustLose) d.addEventListener('click', () => { loseIdx = loseIdx === i ? null : i; render(el, room, send); });
        myCards.append(d);
      });
      if (!mine.exchange) el.append(myCards);

      const ctrls = K.el('div', 'ctrls cpctrls');
      const btn = (label, sub, enabled, onClick, ghost) => {
        const b = K.el('button', ghost ? 'ghost' : null);
        b.type = 'button';
        b.append(K.el('span', 'bl', label));
        if (sub) b.append(K.el('span', 'bs', sub));
        b.disabled = !enabled;
        b.addEventListener('click', onClick);
        ctrls.append(b);
      };

      if (mine.canAct && pickTarget) {
        el.append(K.el('div', 'logline', `Escolha o alvo de ${ACTION[pickTarget].label} tocando num jogador.`));
        btn('Cancelar', '', true, () => { pickTarget = null; render(el, room, send); }, true);
      } else if (mine.canAct) {
        if (mine.mustCoup) el.append(K.el('div', 'logline', 'Você tem 10 ou mais moedas: precisa dar o Golpe.'));
        for (const a of mine.actions) {
          const info = ACTION[a.type];
          btn(info.label, info.sub, a.ok, () => {
            if (a.needsTarget) { pickTarget = a.type; render(el, room, send); } else send({ t: 'action', action: a.type });
          });
        }
      } else if (mine.respond) {
        btn('Passar', 'aceitar', true, () => send({ t: 'pass' }), true);
        if (mine.respond.canChallenge) btn('Desafiar!', 'acho que é blefe', true, () => send({ t: 'challenge' }));
        for (const c of mine.respond.blocks || []) btn(`Bloquear`, `como ${CHAR[c].name}`, true, () => send({ t: 'block', claim: c }));
      } else if (mine.mustLose) {
        btn('Perder esta carta', loseIdx === null ? 'escolha uma carta acima' : CHAR[mine.hand[loseIdx]].name, loseIdx !== null, () => { const index = loseIdx; loseIdx = null; send({ t: 'lose', index }); });
      } else if (mine.exchange) {
        el.append(K.el('div', 'logline', `Escolha ${mine.exchange.keep} carta${mine.exchange.keep > 1 ? 's' : ''} para ficar com você:`));
        const pool = K.el('div', 'hand');
        mine.exchange.pool.forEach((c, i) => {
          const d = charCard(c, { sel: keepSet.has(i) });
          d.addEventListener('click', () => {
            if (keepSet.has(i)) keepSet.delete(i);
            else if (keepSet.size < mine.exchange.keep) keepSet.add(i);
            render(el, room, send);
          });
          pool.append(d);
        });
        el.append(pool);
        btn('Confirmar troca', `${keepSet.size} de ${mine.exchange.keep}`, keepSet.size === mine.exchange.keep, () => { const keep = [...keepSet].sort((a, b) => a - b); keepSet = new Set(); send({ t: 'exchange', keep }); });
      }
      if (ctrls.childNodes.length) el.append(ctrls);
    } else if (inGame) {
      el.append(K.el('div', 'logline', 'Você foi eliminado. Continue assistindo a partida.'));
    }

    const help = K.el('details', 'cphelp');
    help.append(K.el('summary', null, 'Resumo das ações'));
    const ul = K.el('ul', 'rules');
    ['Renda: +1 moeda.', 'Ajuda externa: +2 (qualquer um pode bloquear como Duque).', 'Golpe: paga 7, o alvo perde 1 influência.', 'Taxar (Duque): +3.', 'Assassinar (Assassino): paga 3; o alvo perde 1 influência (Condessa bloqueia).', 'Extorquir (Capitão): rouba 2 do alvo (Capitão ou Embaixador bloqueiam).', 'Trocar (Embaixador): compra 2 cartas e devolve as que sobrarem.'].forEach((t) => ul.append(K.el('li', null, t)));
    help.append(ul);
    el.append(help);

    if (v.over) return `${nameOf(v.winner)} venceu! "Nova partida" joga de novo.`;
    if (!inGame) return seat !== null ? '' : 'Você está assistindo.';
    if (mine && mine.canAct) return pickTarget ? 'Escolha o alvo.' : 'Sua vez: escolha uma ação.';
    if (mine && mine.respond) return 'Você pode responder agora.';
    if (mine && mine.mustLose) return 'Escolha a carta que vai perder.';
    return '';
  }

  window.GameUI.coup = { render };
})();
