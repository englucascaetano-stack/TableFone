'use strict';
// Interface do Ito (cooperativo). Cada jogador ve os numeros e as pistas das proprias cartas (room.mine.mine);
// as cartas de todos ficam numa fila compartilhada, da menor (em cima) para a maior (embaixo), que qualquer um pode reordenar.
// Intencoes: { t:'start' } | { t:'clue', card, text } | { t:'move', id, to } | { t:'ready', ok } | { t:'next' }

(function () {
  const K = window.GameKit;
  let seenVersion = null;
  let drafts = {}; // pista em digitacao, por carta

  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'Ito',
        min: 2,
        max: 10,
        rules: [
          'Jogo cooperativo: todos ganham ou perdem juntos. Cada jogador recebe em segredo uma carta de 1 a 100 (sem repetir).',
          'Aparece um tema com uma escala (ex.: "tamanho de um animal"). Cada um dá uma pista, sem números, que mostre se a sua carta é alta ou baixa nessa escala.',
          'Depois, todos juntos ordenam as cartas da menor para a maior, sem vê-las, e confirmam. Na revelação, se estiver em ordem crescente, a equipe vence a rodada.',
          'A cada rodada vencida, mais um jogador passa a receber 2 cartas, até todos terem 2; vencer nessa etapa vence o jogo.',
          'A equipe tem 3 vidas: cada rodada perdida custa 1 vida e a etapa se repete. Sem vidas, a partida acaba.',
        ],
      });
    }

    if (room.version !== seenVersion) {
      seenVersion = room.version;
      if (v.step !== 'clue') drafts = {};
    }
    const hadFocus = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.card !== undefined ? document.activeElement.dataset.card : null;
    el.innerHTML = '';
    const nameOf = (s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;
    const inGame = seat !== null && seat < v.players && Boolean(mine);
    const myCards = inGame ? mine.mine : [];
    const myById = new Map(myCards.map((c) => [c.id, c]));
    const step = v.step;
    const wrap = K.el('div', 'mesa it-wrap');

    /* estado da equipe */
    const hud = K.el('div', 'it-hud');
    hud.append(K.el('span', null, `Etapa ${Math.min(v.stage + 1, v.players + 1)} de ${v.players + 1}`), K.el('span', null, `Rodada ${v.round}`));
    hud.append(K.el('span', 'it-lives', `Vidas: ${'●'.repeat(v.lives)}${'○'.repeat(v.maxLives - v.lives)}`));
    wrap.append(hud);

    /* tema */
    if (v.theme && !v.over) {
      const th = K.el('div', 'it-theme');
      th.append(K.el('b', null, v.theme.text));
      th.append(K.el('div', 'it-scale', `1 = ${v.theme.low}   →   100 = ${v.theme.high}`));
      wrap.append(th);
    }

    /* pistas */
    if (step === 'clue') {
      const waiting = [...new Set(v.cards.filter((c) => !c.hasClue).map((c) => c.owner))];
      wrap.append(K.el('div', 'logline', waiting.length ? `Faltam dar pista: ${waiting.map(nameOf).join(', ')}.` : ''));
      if (inGame) {
        for (const c of myCards) {
          const box = K.el('div', 'it-mycard');
          box.append(K.el('div', 'it-num', String(c.n)));
          if (c.clue) {
            box.append(K.el('div', 'it-done', `Sua pista: "${c.clue}"`));
          } else {
            const input = K.el('input');
            input.type = 'text';
            input.maxLength = 40;
            input.autocomplete = 'off';
            input.placeholder = 'Sua pista (sem números)';
            input.dataset.card = String(c.id);
            input.value = drafts[c.id] || '';
            input.addEventListener('input', () => { drafts[c.id] = input.value; });
            const go = K.el('button', null, 'Dar pista');
            go.type = 'button';
            const submit = () => { const text = drafts[c.id] || ''; delete drafts[c.id]; send({ t: 'clue', card: c.id, text }); };
            go.addEventListener('click', submit);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
            box.append(input, go);
          }
          wrap.append(box);
        }
        if (myCards.length > 1) wrap.append(K.el('small', 'muted', 'Você tem duas cartas: dê uma pista para cada uma.'));
      }
    }

    /* fila de cartas */
    if (step === 'arrange' || step === 'reveal') {
      const reveal = step === 'reveal';
      const wrong = new Set(reveal && v.result ? v.result.wrong : []);
      wrap.append(K.el('div', 'it-end top', 'MENOR (começo da fila)'));
      const line = K.el('div', 'it-line');
      const byId = new Map(v.cards.map((c) => [c.id, c]));
      v.order.forEach((id, pos) => {
        const c = byId.get(id);
        const own = myById.get(id);
        const tile = K.el('div', `it-tile${own ? ' mine' : ''}${reveal ? (wrong.has(id) ? ' bad' : ' ok') : ''}`);
        tile.dataset.mk = `it-${id}`;
        const info = K.el('div', 'it-info');
        info.append(K.el('b', null, `"${c.clue}"`), K.el('small', null, `${nameOf(c.owner)}${own ? ' (você)' : ''}`));
        tile.append(K.el('span', 'it-pos', String(pos + 1)), info);
        if (reveal) tile.append(K.el('span', 'it-num rev', String(c.n)));
        else if (own) tile.append(K.el('span', 'it-num', String(own.n)));
        if (!reveal && inGame) {
          const btns = K.el('div', 'it-mv');
          for (const [label, aria, d] of [['▲', 'Subir (mais baixo)', -1], ['▼', 'Descer (mais alto)', 1]]) {
            const b = K.el('button', 'ghost', label);
            b.type = 'button';
            b.setAttribute('aria-label', `${aria}: ${c.clue}`);
            b.disabled = pos + d < 0 || pos + d >= v.order.length;
            b.addEventListener('click', () => send({ t: 'move', id, to: pos + d }));
            btns.append(b);
          }
          tile.append(btns);
        }
        line.append(tile);
      });
      wrap.append(line);
      wrap.append(K.el('div', 'it-end bottom', 'MAIOR (fim da fila)'));
    }

    if (step === 'arrange' && inGame) {
      const iAmReady = v.ready.includes(seat);
      const b = K.el('button', iAmReady ? 'ghost' : null, iAmReady ? 'Cancelar confirmação' : 'Confirmar a ordem');
      b.type = 'button';
      b.addEventListener('click', () => send({ t: 'ready', ok: !iAmReady }));
      wrap.append(b);
      const pend = Array.from({ length: v.players }, (_, i) => i).filter((i) => !v.ready.includes(i));
      wrap.append(K.el('div', 'logline', pend.length ? `Aguardando confirmar: ${pend.map(nameOf).join(', ')}.` : ''));
    }

    /* resultado */
    if (step === 'reveal') {
      const box = K.el('div', `it-result ${v.result.ok ? 'win' : 'lose'}`);
      box.append(K.el('b', null, v.log));
      if (inGame) {
        const label = v.final ? 'Ver resultado final' : 'Próxima rodada';
        const nx = K.el('button', null, label);
        nx.type = 'button';
        nx.addEventListener('click', () => send({ t: 'next' }));
        box.append(nx);
      }
      wrap.append(box);
    }

    if (v.over) {
      wrap.append(K.el('div', `it-result ${v.won ? 'win' : 'lose'}`, v.won ? 'Vitória da equipe! Todos jogaram com duas cartas e acertaram a ordem.' : 'Derrota: as vidas acabaram. "Nova partida" tenta de novo.'));
    }

    el.append(wrap);
    if (hadFocus !== null) {
      const i = el.querySelector(`input[data-card="${hadFocus}"]`);
      if (i) { i.focus(); const n = i.value.length; try { i.setSelectionRange(n, n); } catch (e) { /* tipo sem selecao */ } }
    }

    if (v.over) return v.won ? 'Vitória da equipe!' : 'Fim da partida.';
    if (step === 'reveal') return v.result.ok ? 'Ordem correta!' : 'Ordem errada.';
    if (step === 'clue') return inGame && myCards.some((c) => !c.clue) ? 'Dê a sua pista.' : 'Aguardando as pistas dos outros.';
    if (step === 'arrange') return inGame ? 'Ordenem as cartas juntos e confirmem.' : 'A equipe está ordenando as cartas.';
    return '';
  }

  window.GameUI.ito = { render };
})();
