'use strict';
// Interface do Hues and Cues. O dador da pista ve a cor-alvo (room.mine.target); os demais tocam no tabuleiro de 30x16 cores,
// ajustam a casa com as setas e confirmam o marcador.
// Intencoes: { t:'start' } | { t:'clue', text } | { t:'place', r, c } | { t:'next' }

(function () {
  const K = window.GameKit;
  const LETTERS = 'ABCDEFGHIJKLMNOP';
  // cor de cada marcador por assento: [fundo, texto]
  const SEAT = [['#d62828', '#fff'], ['#f77f00', '#1b1b1b'], ['#fcbf49', '#1b1b1b'], ['#2a9d8f', '#fff'], ['#1d3557', '#fff'], ['#7b2cbf', '#fff'], ['#ff5ca8', '#1b1b1b'], ['#6c757d', '#fff'], ['#2d6a4f', '#fff'], ['#111', '#fff']];

  let draft = null; // { r, c } casa escolhida para o proximo marcador
  let clueText = '';
  let zoomed = false;
  let seenVersion = null;
  let scrollPos = { x: 0, y: 0 };

  // Aproximacao das cores do tabuleiro: coluna = matiz, linha = do claro ao escuro.
  const colorAt = (r, c) => `hsl(${c * 12} ${r === 0 ? 70 : 88}% ${Math.round(90 - r * 4.2)}%)`;
  const coord = (r, c) => `${LETTERS[r]}${c + 1}`;

  function tok(seat, n, extra) {
    const [bg, fg] = SEAT[seat % SEAT.length];
    const t = K.el('span', `hc-tok${extra ? ` ${extra}` : ''}`, String(seat + 1));
    t.style.background = bg;
    t.style.color = fg;
    if (n === 2) t.classList.add('two');
    t.dataset.mk = `hc-${seat}-${n}`;
    return t;
  }

  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'Hues and Cues',
        min: 3,
        max: 10,
        rules: [
          'O tabuleiro tem 480 cores (colunas 1 a 30, linhas A a P). A cada rodada, um jogador é o dador e vê em segredo uma cor-alvo.',
          'O dador dá uma pista de UMA palavra (sem citar nomes de cores nem a posição). Cada outro jogador, em ordem, coloca um marcador onde acha que está a cor.',
          'O dador dá uma segunda pista, de até DUAS palavras, e cada um coloca o segundo marcador. Depois a cor é revelada.',
          'Quem acerta a casa faz 3 pontos; vizinha, 2; a duas casas, 1. O dador faz 1 ponto por marcador (de todos) colado no alvo, na moldura 3x3 (2 pontos com 3 jogadores).',
          'Cada jogador é dador 2 vezes (1 vez com 7 ou mais jogadores). Vence quem tiver mais pontos.',
          'As cores da tela são aproximadas e variam com o brilho do aparelho; combinem as pistas pensando nisso.',
        ],
      });
    }

    const step = v.step;
    const key = `${v.round}|${step}|${v.tokens.length}`;
    if (room.version !== seenVersion) {
      seenVersion = room.version;
      draft = null;
    }
    const hadFocus = document.activeElement && document.activeElement.id === 'hc-clue';
    el.innerHTML = '';
    const nameOf = (s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;
    const inGame = seat !== null && seat < v.players && Boolean(mine);
    const isCuer = inGame && seat === v.cuer;
    const myPlace = inGame && !v.over && (step === 'guess1' || step === 'guess2') && v.turn === seat;
    const redraw = () => render(el, room, send);
    const wrap = K.el('div', 'mesa hc-wrap');

    /* placar */
    const score = K.el('div', 'hc-score');
    for (let i = 0; i < v.players; i++) {
      const row = K.el('div', `hc-pl${i === v.cuer && !v.over ? ' cuer' : ''}${i === seat ? ' me' : ''}${v.placing.includes(i) && v.placing[0] === i ? ' turn' : ''}`);
      const dot = tok(i, 1, 'mini');
      dot.removeAttribute('data-mk');
      row.append(dot, K.el('span', 'hc-nm', `${nameOf(i)}${i === seat ? ' (você)' : ''}`), K.el('b', null, String(v.scores[i])));
      if (i === v.cuer && !v.over) row.append(K.el('small', null, 'dador'));
      score.append(row);
    }
    wrap.append(score);
    if (!v.over) wrap.append(K.el('div', 'hc-info', `Rodada ${v.round + 1} de ${v.totalRounds}`));

    /* pistas */
    if (!v.over) {
      const clues = K.el('div', 'hc-clues');
      const c1 = K.el('div', 'hc-clue', v.clues[0] ? `Pista 1: ${v.clues[0]}` : 'Pista 1: aguardando');
      const c2 = K.el('div', 'hc-clue', v.clues[1] ? `Pista 2: ${v.clues[1]}` : 'Pista 2: —');
      if (!v.clues[0]) c1.classList.add('wait');
      clues.append(c1, c2);
      wrap.append(clues);
    }

    /* cor secreta do dador */
    if (isCuer && mine.target) {
      const [tr, tc] = mine.target;
      const box = K.el('div', 'hc-secret');
      const sw = K.el('span', 'hc-swatch');
      sw.style.background = colorAt(tr, tc);
      box.append(sw, K.el('div', null, `Sua cor secreta: ${coord(tr, tc)}`), K.el('small', null, 'Só você vê. Descreva-a sem dizer o nome da cor nem a posição.'));
      wrap.append(box);
    }

    /* tabuleiro */
    const zoomBtn = K.el('button', 'ghost sc-zoom', zoomed ? 'Reduzir tabuleiro' : 'Ampliar tabuleiro');
    zoomBtn.type = 'button';
    zoomBtn.addEventListener('click', () => { zoomed = !zoomed; redraw(); });
    wrap.append(zoomBtn);

    const taken = new Map(v.tokens.map((t) => [`${t.r},${t.c}`, t]));
    const target = v.last ? v.last.target : null;
    const scroller = K.el('div', `hc-scroll${zoomed ? ' zoomed' : ''}`);
    const board = K.el('div', 'hc-board');
    board.setAttribute('role', 'grid');
    board.append(K.el('span', 'hc-ax'));
    for (let c = 0; c < v.cols; c++) board.append(K.el('span', `hc-ax top${draft && draft.c === c ? ' on' : ''}`, String(c + 1)));
    for (let r = 0; r < v.rows; r++) {
      board.append(K.el('span', `hc-ax left${draft && draft.r === r ? ' on' : ''}`, LETTERS[r]));
      for (let c = 0; c < v.cols; c++) {
        const cell = K.el('div', 'hc-cell');
        cell.style.background = colorAt(r, c);
        cell.dataset.r = r;
        cell.dataset.c = c;
        const t = taken.get(`${r},${c}`);
        if (t) cell.append(tok(t.seat, t.n));
        if (target && target[0] === r && target[1] === c) {
          const ring = K.el('span', 'hc-target');
          ring.dataset.mk = 'hc-target';
          cell.append(ring);
        }
        if (draft && draft.r === r && draft.c === c && !t) cell.append(K.el('span', 'hc-draft'));
        board.append(cell);
      }
    }
    if (myPlace) {
      board.addEventListener('click', (e) => {
        const cell = e.target.closest('.hc-cell');
        if (!cell) return;
        draft = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
        redraw();
      });
    }
    scroller.append(board);
    scroller.addEventListener('scroll', () => { scrollPos = { x: scroller.scrollLeft, y: scroller.scrollTop }; });
    wrap.append(scroller);
    if (v.log && !v.over) wrap.append(K.el('div', 'logline', v.log.replace(/Jogador (\d+)/g, (m, n) => nameOf(Number(n) - 1))));

    /* controles */
    if (inGame && !v.over) {
      const ctrls = K.el('div', 'hc-ctrls');
      if (isCuer && (step === 'clue1' || step === 'clue2')) {
        ctrls.append(K.el('b', null, step === 'clue1' ? 'Dê a primeira pista: UMA palavra.' : 'Dê a segunda pista: até DUAS palavras.'));
        const input = K.el('input');
        input.id = 'hc-clue';
        input.type = 'text';
        input.maxLength = 40;
        input.autocomplete = 'off';
        input.placeholder = step === 'clue1' ? 'Uma palavra' : 'Até duas palavras';
        input.value = clueText;
        input.addEventListener('input', () => { clueText = input.value; });
        const go = K.el('button', null, 'Dar pista');
        go.type = 'button';
        const submit = () => { const text = clueText; clueText = ''; send({ t: 'clue', text }); };
        go.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        ctrls.append(input, go);
      } else if (myPlace) {
        const busy = draft && taken.has(`${draft.r},${draft.c}`);
        ctrls.append(K.el('b', null, `Marcador ${step === 'guess1' ? 1 : 2}: ${draft ? `casa ${coord(draft.r, draft.c)}` : 'toque numa cor do tabuleiro'}`));
        if (draft) {
          const sw = K.el('span', 'hc-swatch big');
          sw.style.background = colorAt(draft.r, draft.c);
          ctrls.append(sw);
        }
        const pad = K.el('div', 'hc-pad');
        const nudge = (label, dr, dc) => {
          const b = K.el('button', 'ghost', label);
          b.type = 'button';
          b.setAttribute('aria-label', { '◀': 'Esquerda', '▶': 'Direita', '▲': 'Acima', '▼': 'Abaixo' }[label]);
          b.addEventListener('click', () => {
            const base = draft || { r: 7, c: 14 };
            draft = { r: Math.min(v.rows - 1, Math.max(0, base.r + dr)), c: Math.min(v.cols - 1, Math.max(0, base.c + dc)) };
            redraw();
          });
          pad.append(b);
        };
        nudge('◀', 0, -1); nudge('▲', -1, 0); nudge('▼', 1, 0); nudge('▶', 0, 1);
        ctrls.append(pad);
        const ok = K.el('button', null, busy ? 'Casa ocupada' : 'Colocar marcador aqui');
        ok.type = 'button';
        ok.disabled = !draft || busy;
        ok.addEventListener('click', () => { const d = draft; draft = null; send({ t: 'place', r: d.r, c: d.c }); });
        ctrls.append(ok);
      }
      if (ctrls.childNodes.length) wrap.append(ctrls);
    }

    /* resultado da rodada */
    if (step === 'reveal' && v.last) {
      const L = v.last;
      const box = K.el('div', 'hc-result');
      box.append(K.el('b', null, `A cor era ${coord(L.target[0], L.target[1])}. Pistas: "${L.clues[0]}" e "${L.clues[1]}".`));
      for (const r of L.results) {
        const parts = r.tokens.map((t) => `${coord(t.r, t.c)} (+${t.pts})`).join(' · ');
        box.append(K.el('div', null, `${nameOf(r.seat)}: ${parts} = ${r.total} ponto${r.total === 1 ? '' : 's'}`));
      }
      box.append(K.el('div', null, `${nameOf(L.cuer)} (dador): ${L.inFrame} marcador${L.inFrame === 1 ? '' : 'es'} na moldura = ${L.cuerPts} ponto${L.cuerPts === 1 ? '' : 's'}`));
      if (inGame) {
        const nx = K.el('button', null, v.round + 1 >= v.totalRounds ? 'Ver resultado final' : 'Próxima rodada');
        nx.type = 'button';
        nx.addEventListener('click', () => send({ t: 'next' }));
        box.append(nx);
      }
      wrap.append(box);
    }

    if (v.over) {
      const box = K.el('div', 'hc-result');
      const order = v.scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
      box.append(K.el('b', null, v.winners.length > 1 ? `Empate: ${v.winners.map(nameOf).join(' e ')}.` : `${nameOf(v.winners[0])} venceu!`));
      order.forEach(([s, i], k) => box.append(K.el('div', null, `${k + 1}º ${nameOf(i)}: ${s} pontos`)));
      wrap.append(box);
    }

    el.append(wrap);
    // mantem o ponto de rolagem e o foco depois de redesenhar
    scroller.scrollLeft = scrollPos.x;
    scroller.scrollTop = scrollPos.y;
    if (hadFocus) { const i = el.querySelector('#hc-clue'); if (i) { i.focus(); const n = i.value.length; try { i.setSelectionRange(n, n); } catch (e) { /* tipo sem selecao */ } } }
    void key;

    if (v.over) return 'Fim da partida. "Nova partida" joga outra.';
    if (step === 'reveal') return `A cor era ${coord(v.last.target[0], v.last.target[1])}.`;
    if (step === 'clue1' || step === 'clue2') return isCuer ? 'Sua vez de dar a pista.' : `${nameOf(v.cuer)} está pensando na pista.`;
    if (!inGame) return `Vez de ${nameOf(v.turn)} colocar o marcador.`;
    if (isCuer) return 'Os outros estão escolhendo as cores.';
    return myPlace ? 'Sua vez: toque numa cor, ajuste com as setas e confirme.' : `Vez de ${nameOf(v.turn)} colocar o marcador.`;
  }

  window.GameUI.huesandcues = { render };
})();
