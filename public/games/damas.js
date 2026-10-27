'use strict';
// Interface da dama. Recebe a visao publica do servidor e envia apenas a
// intencao da jogada: { from: [r, c], path: [[r, c], ...] }.

(function () {
  let selected = null; // [r, c] da peca escolhida
  let path = []; // casas ja escolhidas numa captura em sequencia
  let seenVersion = null;

  const same = (a, b) => a[0] === b[0] && a[1] === b[1];

  function render(el, room, send) {
    const v = room.view;
    const seat = room.you.seat;
    const myTurn = seat !== null && !v.over && v.turn === seat;
    const flip = seat === 1;

    if (room.version !== seenVersion) {
      seenVersion = room.version;
      selected = null;
      path = [];
    }

    const moves = myTurn ? v.legal : [];
    const candidates = selected
      ? moves.filter((m) => same(m.from, selected) && path.every((p, i) => same(m.path[i], p)))
      : [];
    const destinations = candidates.map((m) => m.path[path.length]).filter(Boolean);
    const movableFrom = selected ? [] : moves.map((m) => m.from);
    const last = v.lastMove ? [v.lastMove.from, ...v.lastMove.path] : [];

    el.innerHTML = '';
    const board = document.createElement('div');
    board.className = 'board';
    board.setAttribute('role', 'grid');

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const r = flip ? 7 - i : i;
        const c = flip ? 7 - j : j;
        const cell = document.createElement('div');
        cell.className = 'sq' + ((r + c) % 2 === 1 ? ' dark' : '');
        if (last.some((p) => same(p, [r, c]))) cell.classList.add('last');
        if (selected && same(selected, [r, c])) cell.classList.add('sel');
        if (destinations.some((p) => same(p, [r, c]))) cell.classList.add('dest');
        if (path.some((p) => same(p, [r, c]))) cell.classList.add('via');

        const p = v.board[r][c];
        if (p) {
          const piece = document.createElement('div');
          piece.className = `piece ${p.toLowerCase()}${p === p.toUpperCase() ? ' king' : ''}`;
          if (movableFrom.some((m) => same(m, [r, c]))) piece.classList.add('movable');
          cell.appendChild(piece);
        }
        cell.addEventListener('click', () => onTap(r, c, moves, candidates, send, el, room));
        board.appendChild(cell);
      }
    }
    el.appendChild(board);

    if (v.winner !== null) return `Fim de jogo: ${room.players.find((p) => p.seat === v.winner)?.name || room.game.roles[v.winner]} venceu.`;
    if (v.draw) return 'Fim de jogo: empate.';
    if (seat === null) return `Vez das ${room.game.roles[v.turn]}.`;
    if (!myTurn) return 'Aguardando o adversário.';
    const mustCapture = v.legal.some((m) => m.captured.length > 0);
    return mustCapture ? 'Sua vez. Captura obrigatória.' : 'Sua vez.';
  }

  function onTap(r, c, moves, candidates, send, el, room) {
    if (!moves.length) return;
    const pos = [r, c];

    if (selected) {
      const step = candidates.filter((m) => m.path[path.length] && same(m.path[path.length], pos));
      if (step.length) {
        path.push(pos);
        if (step.some((m) => m.path.length === path.length)) {
          const move = { from: selected, path };
          selected = null;
          path = [];
          send(move);
        } else {
          render(el, room, send);
        }
        return;
      }
    }

    if (!path.length && moves.some((m) => same(m.from, pos))) {
      selected = pos;
    } else {
      selected = null;
      path = [];
    }
    render(el, room, send);
  }

  window.GameUI.damas = { render };
})();
