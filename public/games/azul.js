'use strict';
// Interface do Azul. Toque num azulejo (fabrica ou centro) para escolher a cor, depois toque na linha de destino.
// Intencoes: { t:'start' } | { t:'take', src: indiceDaFabrica | 'c', color: 0-4, row: 0-4 (padrao) | 5 (chao) }

(function () {
  const K = window.GameKit;
  const NAMES = ['Azul', 'Amarelo', 'Vermelho', 'Preto', 'Turquesa'];
  const GLYPH = ['●', '■', '▲', '◆', '★'];
  const PEN = [-1, -1, -2, -2, -2, -3, -3];
  let sel = null; // { src, color }
  let seenVersion = null;
  let showWall = null; // assento cujo painel esta expandido

  const colAt = (row, color) => (color + row) % 5;
  const colorAt = (row, col) => (col - row + 5) % 5;

  function tile(color, extra) {
    const t = K.el('span', `az-t c${color}${extra ? ` ${extra}` : ''}`, GLYPH[color]);
    t.setAttribute('aria-label', NAMES[color]);
    return t;
  }

  function roomFor(board, row, color) {
    const line = board.pattern[row];
    if (board.wall[row][colAt(row, color)]) return -1;
    if (line.n > 0 && line.color !== color) return -1;
    return row + 1 - line.n;
  }

  function boardEl(room, seat, canPlace, onPlace) {
    const v = room.view;
    const b = v.boards[seat];
    const p = room.players.find((x) => x.seat === seat) || { name: `Jogador ${seat + 1}` };
    const box = K.el('div', `az-board${v.turn === seat ? ' turn' : ''}${seat === room.you.seat ? ' me' : ''}`);
    const head = K.el('div', 'az-head');
    head.append(K.el('b', null, p.name + (seat === room.you.seat ? ' (você)' : '')), K.el('span', 'az-score', `${b.score} pts`));
    box.append(head);

    const grid = K.el('div', 'az-grid');
    const left = K.el('div', 'az-pattern');
    for (let r = 0; r < 5; r++) {
      const line = b.pattern[r];
      const ok = canPlace && sel && roomFor(b, r, sel.color) > 0;
      const row = K.el('button', `az-line${ok ? ' ok' : ''}`);
      row.type = 'button';
      row.disabled = !ok;
      for (let i = 0; i < r + 1; i++) {
        const filled = i >= r + 1 - line.n;
        row.append(filled ? tile(line.color) : K.el('span', 'az-slot'));
      }
      if (ok) row.addEventListener('click', () => onPlace(r));
      left.append(row);
    }
    const wall = K.el('div', 'az-wall');
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const color = colorAt(r, c);
        wall.append(b.wall[r][c] ? tile(color) : K.el('span', `az-ghost c${color}`));
      }
    }
    grid.append(left, wall);
    box.append(grid);

    const floor = K.el('button', `az-floor${canPlace && sel ? ' ok' : ''}`);
    floor.type = 'button';
    floor.disabled = !(canPlace && sel);
    for (let i = 0; i < 7; i++) {
      const cell = K.el('span', 'az-fc');
      const t = b.floor[i];
      if (t !== undefined) cell.append(t === 'M' ? K.el('span', 'az-t mk', '1') : tile(t));
      cell.append(K.el('small', null, String(PEN[i])));
      floor.append(cell);
    }
    if (canPlace && sel) floor.addEventListener('click', () => onPlace(5));
    box.append(floor);
    return box;
  }

  function render(el, room, send) {
    const v = room.view;
    const seat = room.you.seat;

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'Azul',
        min: 2,
        max: 4,
        rules: [
          'Cada rodada, as fábricas recebem 4 azulejos. No seu turno, pegue TODOS os azulejos de uma cor de uma fábrica; os demais vão para o centro. Também pode pegar de uma cor do centro.',
          'Quem pega do centro primeiro leva o marcador de primeiro jogador (vai para o chão, -1) e abre a próxima rodada.',
          'Coloque os azulejos em UMA linha de padrão (1 a 5 casas) vazia ou da mesma cor, cuja linha da parede ainda não tenha essa cor. O que sobrar cai no chão.',
          'Ao fim da rodada, cada linha cheia leva 1 azulejo à parede e pontua pelas sequências vizinhas. O chão tira pontos (-1, -1, -2, -2, -2, -3, -3).',
          'A partida acaba quando alguém completa uma linha da parede. Bônus: +2 por linha, +7 por coluna, +10 por cor completa.',
        ],
      });
    }

    if (room.version !== seenVersion) {
      seenVersion = room.version;
      sel = null;
    }
    el.innerHTML = '';
    const inGame = seat !== null && seat < v.players;
    const myTurn = inGame && v.turn === seat && !v.over;
    const nameOf = (s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;
    const wrap = K.el('div', 'mesa az-wrap');
    const redraw = () => render(el, room, send);

    wrap.append(K.el('div', 'az-info', `Rodada ${v.round} · Saco ${v.bagCount} · Tampa ${v.boxCount}`));

    /* fabricas e centro */
    const fac = K.el('div', 'az-factories');
    v.factories.forEach((f, i) => {
      const fx = K.el('div', `az-fac${f.length ? '' : ' empty'}`);
      for (const c of f) {
        const t = tile(c, myTurn ? (sel && sel.src === i && sel.color === c ? 'sel' : sel && sel.color === c ? '' : '') : 'dim');
        if (myTurn) t.addEventListener('click', () => { sel = { src: i, color: c }; redraw(); });
        fx.append(t);
      }
      fac.append(fx);
    });
    wrap.append(fac);

    const ctr = K.el('div', 'az-center');
    ctr.append(K.el('small', null, 'Centro'));
    const cwrap = K.el('div', 'az-cwrap');
    if (v.marker) cwrap.append(K.el('span', 'az-t mk', '1'));
    for (const c of v.center) {
      const t = tile(c, myTurn ? (sel && sel.src === 'c' && sel.color === c ? 'sel' : '') : 'dim');
      if (myTurn) t.addEventListener('click', () => { sel = { src: 'c', color: c }; redraw(); });
      cwrap.append(t);
    }
    if (!v.center.length && !v.marker) cwrap.append(K.el('span', 'az-none', 'vazio'));
    ctr.append(cwrap);
    wrap.append(ctr);

    if (v.log) wrap.append(K.el('div', 'logline', v.log));
    if (v.lastRound && !v.over) {
      wrap.append(K.el('div', 'az-last', `Rodada ${v.lastRound.round}: ` + v.lastRound.lines.map((l) => `${nameOf(l.seat)} ${l.delta >= 0 ? '+' : ''}${l.delta}`).join(' · ')));
    }

    /* paineis: o seu primeiro */
    const place = (row) => {
      const s = sel;
      sel = null;
      send({ t: 'take', src: s.src, color: s.color, row });
    };
    const order = [];
    if (inGame) order.push(seat);
    for (let s = 0; s < v.players; s++) if (s !== seat) order.push(s);
    for (const s of order) wrap.append(boardEl(room, s, myTurn && s === seat, place));

    if (v.over && v.bonus) {
      const box = K.el('div', 'az-final');
      v.boards.forEach((b, s) => {
        const bo = v.bonus[s];
        box.append(K.el('div', null, `${nameOf(s)}: ${b.score} pts (bônus ${bo.total}: ${bo.rows} linha(s), ${bo.cols} coluna(s), ${bo.colors} cor(es))`));
      });
      wrap.append(box);
    }
    el.append(wrap);

    if (v.over) {
      const names = v.winners.map(nameOf).join(' e ');
      return v.winners.length > 1 ? `Empate: ${names}. "Nova partida" joga outra.` : `${names} venceu! "Nova partida" joga outra.`;
    }
    if (!inGame) return `Você está assistindo. Vez de ${nameOf(v.turn)}.`;
    if (!myTurn) return `Vez de ${nameOf(v.turn)}.`;
    if (!sel) return 'Sua vez: toque num azulejo de uma fábrica ou do centro.';
    return `${NAMES[sel.color]} escolhido (todos os dessa cor). Toque numa linha de padrão destacada ou no chão.`;
  }

  window.GameUI.azul = { render };
})();
