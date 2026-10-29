'use strict';
// Interface da dama. Recebe a visao publica do servidor e envia apenas a
// intencao da jogada: { from: [r, c], path: [[r, c], ...] }.

(function () {
  let selected = null; // [r, c] da peca escolhida
  let path = []; // casas ja escolhidas numa captura em sequencia
  let seenVersion = null;
  let pending = null; // jogada ja mostrada na tela, aguardando confirmacao do servidor: { version, board, last }
  let latest = null; // ultima chamada de render, para redesenhar se o servidor recusar

  let animStart = 0;
  let animKey; // assinatura do ultimo lance ja animado (undefined = primeira exibicao, sem animar)
  const STEP_MS = 230;
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const same = (a, b) => a[0] === b[0] && a[1] === b[1];

  function animateMove(board, flip, lm, shown, elapsed) {
    if (reduced()) return;
    const cellAt = (r, c) => board.children[(flip ? 7 - r : r) * 8 + (flip ? 7 - c : c)];
    const pts = [lm.from, ...lm.path];
    const dest = cellAt(...pts[pts.length - 1]);
    const piece = dest && dest.querySelector('.piece');
    if (!piece || !piece.animate) return;
    const base = dest.getBoundingClientRect();
    const frames = pts.map((p) => {
      const rc = cellAt(...p).getBoundingClientRect();
      return { transform: `translate(${rc.left - base.left}px, ${rc.top - base.top}px)` };
    });
    piece.style.zIndex = '4';
    const anim = piece.animate(frames, { duration: STEP_MS * (pts.length - 1), easing: 'ease-in-out' });
    anim.currentTime = elapsed;
    anim.onfinish = anim.oncancel = () => { piece.style.zIndex = ''; };
    // pecas capturadas somem aos poucos, no instante em que a peca que anda chega nelas
    const mover = (shown[pts[pts.length - 1][0]][pts[pts.length - 1][1]] || 'w').toLowerCase();
    const other = mover === 'w' ? 'b' : 'w';
    (lm.captured || []).forEach((cap, i) => {
      const cell = cellAt(cap[0], cap[1]);
      if (!cell) return;
      const ghost = document.createElement('div');
      ghost.className = `piece ${other}`;
      cell.appendChild(ghost);
      const fade = ghost.animate(
        [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.55)' }],
        { duration: STEP_MS, delay: STEP_MS * (i + 0.5), easing: 'ease-in', fill: 'both' }
      );
      fade.currentTime = elapsed;
      fade.onfinish = fade.oncancel = () => ghost.remove();
    });
  }

  function render(el, room, send) {
    const v = room.view;
    const seat = room.you.seat;
    latest = { el, room, send };
    if (pending && pending.version !== room.version) pending = null; // chegou estado novo do servidor
    const shown = pending ? pending.board : v.board;
    const myTurn = !pending && seat !== null && !v.over && v.turn === seat;
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
    const last = pending ? pending.last : v.lastMove ? [v.lastMove.from, ...v.lastMove.path] : [];

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

        const p = shown[r][c];
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

    // Anima a jogada (da peca que andou e das capturadas) uma unica vez por lance.
    const lm = pending ? { from: pending.last[0], path: pending.last.slice(1), captured: pending.captured } : v.lastMove;
    const key = `${room.code}|${lm ? JSON.stringify([lm.from, lm.path]) : ''}`;
    if (animKey !== undefined && lm && lm.path.length) {
      // se o servidor confirma o lance no meio da animacao, o tabuleiro e redesenhado e a animacao continua de onde estava
      if (animKey !== key) animStart = performance.now();
      const elapsed = performance.now() - animStart;
      if (elapsed < STEP_MS * (lm.path.length + 1)) animateMove(board, flip, lm, shown, animKey !== key ? 0 : elapsed);
    }
    animKey = key;

    if (pending) return 'Aguardando o adversário.'; // mesmo texto do estado seguinte: a faixa de turno nao pisca
    if (v.winner !== null) return `Fim de jogo: ${room.players.find((p) => p.seat === v.winner)?.name || room.game.roles[v.winner]} venceu.`;
    if (v.draw) return 'Fim de jogo: empate.';
    if (seat === null) return `Vez das ${room.game.roles[v.turn]}.`;
    if (!myTurn) return 'Aguardando o adversário.';
    const mustCapture = v.legal.some((m) => m.captured.length > 0);
    if (selected) return path.length ? 'Captura em sequência: toque na próxima casa.' : 'Toque na casa marcada para mover.';
    return mustCapture ? 'Sua vez: captura obrigatória. Toque numa peça destacada.' : 'Sua vez: toque numa peça destacada.';
  }

  // Mostra a jogada na tela na hora; o servidor continua sendo quem decide.
  function showLocally(room, move, captured) {
    const board = room.view.board.map((row) => row.slice());
    const [fr, fc] = move.from;
    let piece = board[fr][fc];
    board[fr][fc] = null;
    for (const [cr, cc] of captured) board[cr][cc] = null;
    const [lr, lc] = move.path[move.path.length - 1];
    if ((piece === 'w' && lr === 0) || (piece === 'b' && lr === 7)) piece = piece.toUpperCase();
    board[lr][lc] = piece;
    pending = { version: room.version, board, last: [move.from, ...move.path], captured };
  }

  function onTap(r, c, moves, candidates, send, el, room) {
    if (!moves.length) return;
    const pos = [r, c];

    if (selected) {
      const step = candidates.filter((m) => m.path[path.length] && same(m.path[path.length], pos));
      if (step.length) {
        path.push(pos);
        const full = step.find((m) => m.path.length === path.length);
        if (full) {
          const move = { from: selected, path };
          selected = null;
          path = [];
          showLocally(room, move, full.captured);
          const mine = pending;
          const status = render(el, room, send);
          const statusEl = document.querySelector('#status');
          if (statusEl) statusEl.textContent = status;
          // Se o servidor recusar (ou nao responder), volta ao estado oficial.
          Promise.resolve(send(move)).finally(() => {
            if (pending === mine) {
              pending = null;
              if (latest) render(latest.el, latest.room, latest.send);
            }
          });
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
