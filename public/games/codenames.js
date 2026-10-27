'use strict';
// Interface do Código Secreto. Visao publica: room.view (palavras, cores reveladas, pista, placar);
// visao privada: room.mine (equipe, funcao e, para os espioes, a chave com as cores de todas as palavras).
// Intencoes: { t:'start' } | { t:'clue', word, number } | { t:'guess', i } | { t:'pass' }

(function () {
  const K = window.GameKit;
  const TEAM = ['Vermelha', 'Azul'];
  let sel = null; // palavra escolhida, aguardando confirmacao
  let seenVersion = null;
  let draft = { word: '', number: 1 };

  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'Código Secreto',
        min: 4,
        max: 8,
        rules: [
          'Duas equipes: Vermelha (jogadores 1, 3, 5, 7) e Azul (jogadores 2, 4, 6, 8). Mínimo de 2 por equipe.',
          'O jogador 1 é o espião da Vermelha e o jogador 2 é o espião da Azul. Os demais são agentes de campo.',
          'Só os espiões veem quais palavras são de cada equipe. Eles dão uma pista de UMA palavra e um número (quantas palavras ela liga).',
          'Os agentes tocam numa palavra e confirmam. Acertou: continua (até número + 1 palpites). Inocente ou palavra do adversário: a vez passa.',
          'Se tocarem no assassino, a equipe perde na hora. Vence quem encontrar todos os seus agentes primeiro.',
          'A equipe que começa tem 9 agentes; a outra, 8.',
        ],
      });
    }

    if (room.version !== seenVersion) {
      seenVersion = room.version;
      sel = null;
    }
    el.innerHTML = '';
    const nameOf = (s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;
    const namesOf = (team) => room.players.filter((p) => p.seat % 2 === team && p.seat < v.players).map((p) => `${p.name}${p.seat < 2 ? ' (espião)' : ''}`).join(', ');
    const inGame = seat !== null && seat < v.players && mine;
    const wrap = K.el('div', 'mesa cn-wrap');

    /* placar */
    const score = K.el('div', 'cn-score');
    for (const t of [0, 1]) {
      const box = K.el('div', `cn-team t${t}${v.team === t && !v.over ? ' on' : ''}`, `${TEAM[t]}: faltam ${v.left[t]}`);
      box.append(K.el('small', null, namesOf(t)));
      score.append(box);
    }
    wrap.append(score);

    /* pista */
    const clue = K.el('div', 'cn-clue');
    if (v.over) {
      clue.textContent = v.cause === 'assassin' ? `Assassino! Vitória da equipe ${TEAM[v.winner]}.` : `Vitória da equipe ${TEAM[v.winner]}!`;
    } else if (v.clue) {
      clue.append(`Equipe ${TEAM[v.team]}: `, K.el('b', null, `${v.clue.word}, ${v.clue.number}`));
      if (v.guesses !== null) clue.append(` (${v.guesses} palpite${v.guesses === 1 ? '' : 's'} restante${v.guesses === 1 ? '' : 's'})`);
    } else {
      clue.textContent = mine && mine.canClue ? `Dê a pista da equipe ${TEAM[v.team]}.` : `Aguardando a pista do espião da equipe ${TEAM[v.team]}.`;
    }
    wrap.append(clue);

    /* tabuleiro */
    const grid = K.el('div', 'cn-grid');
    v.words.forEach((w, i) => {
      const color = v.colors[i];
      const key = mine && mine.key ? mine.key[i] : null;
      let cls = 'cn-card';
      if (color) cls += ` rev ${color}`;
      else if (key) cls += ` spy ${key}`;
      const canTap = !!(mine && mine.canGuess && !v.revealed[i]);
      if (canTap) cls += ' can';
      if (sel === i) cls += ' sel';
      const c = K.el('div', cls, w);
      if (canTap) c.addEventListener('click', () => { sel = sel === i ? null : i; render(el, room, send); });
      grid.append(c);
    });
    wrap.append(grid);
    el.append(wrap);

    /* controles */
    const box = K.el('div', 'ctrls');
    if (inGame && !v.over) {
      const role = mine.spy ? `espião da equipe ${TEAM[mine.team]}` : `agente da equipe ${TEAM[mine.team]}`;
      el.append(K.el('div', 'cn-roles', `Você é ${role}.`));
      if (mine.canClue) {
        const form = K.el('div', 'cn-form');
        const input = K.el('input');
        input.type = 'text';
        input.placeholder = 'Pista (uma palavra)';
        input.maxLength = 24;
        input.autocomplete = 'off';
        input.value = draft.word;
        input.addEventListener('input', () => { draft.word = input.value; });
        const select = K.el('select');
        for (let n = 0; n <= 9; n++) select.append(new Option(String(n), String(n)));
        select.value = String(draft.number);
        select.addEventListener('change', () => { draft.number = Number(select.value); });
        form.append(input, select);
        el.append(form);
        const b = K.el('button', null, 'Dar pista');
        b.type = 'button';
        b.addEventListener('click', () => {
          const word = draft.word.trim();
          draft = { word: '', number: draft.number };
          send({ t: 'clue', word, number: draft.number });
        });
        box.append(b);
        el.append(K.el('div', 'logline', 'Número 0 = sem limite de palpites.'));
      } else if (mine.canGuess) {
        const b = K.el('button', null, sel === null ? 'Toque numa palavra' : `Confirmar: ${v.words[sel]}`);
        b.type = 'button';
        b.disabled = sel === null;
        b.addEventListener('click', () => { const i = sel; sel = null; send({ t: 'guess', i }); });
        box.append(b);
        const p = K.el('button', 'ghost', 'Encerrar palpites');
        p.type = 'button';
        p.disabled = !mine.canPass;
        p.addEventListener('click', () => send({ t: 'pass' }));
        box.append(p);
      }
    }
    if (box.childNodes.length) el.append(box);
    if (v.log) el.append(K.el('div', 'logline', v.log));

    if (v.over) return 'Fim da rodada. "Nova partida" joga de novo (a outra equipe começa).';
    if (!inGame) return seat !== null ? '' : 'Você está assistindo.';
    if (mine.canClue) return 'Sua vez: dê uma pista.';
    if (mine.canGuess) return 'Sua equipe está palpitando.';
    return '';
  }

  window.GameUI.codenames = { render };
})();
