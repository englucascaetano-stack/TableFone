'use strict';
// Interface do War. Visao publica: room.view (dono e exercitos de cada territorio, vez, fase, ultimo ataque);
// visao privada: room.mine (objetivo secreto, cartas e o que voce pode fazer agora).
// Intencoes: { t:'start' } | { t:'place', plan:[[territorio, n]] } | { t:'trade', cards:[3 posicoes] }
//            | { t:'attack', from, to, dice?, until? } | { t:'move', from, to, n } | { t:'end' }

(function () {
  const K = window.GameKit;
  const NAMES = ['Alasca', 'Mackenzie', 'Groenlândia', 'Vancouver', 'Ottawa', 'Labrador', 'Califórnia', 'Nova York', 'México', 'Colômbia', 'Peru', 'Brasil', 'Argentina', 'Islândia', 'Inglaterra', 'Suécia', 'Alemanha', 'Portugal', 'Polônia', 'Moscou', 'Argélia', 'Egito', 'Sudão', 'Congo', 'África do Sul', 'Madagascar', 'Aral', 'Omsk', 'Dudinka', 'Sibéria', 'Tchita', 'Vladivostok', 'Mongólia', 'Japão', 'China', 'Índia', 'Vietnã', 'Oriente Médio', 'Sumatra', 'Bornéu', 'Nova Guiné', 'Austrália'];
  const CONT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5];
  const CONT_NAME = ['América do Norte', 'América do Sul', 'Europa', 'África', 'Ásia', 'Oceania'];
  const ADJ = [[1, 3, 31], [0, 3, 4, 2], [1, 4, 5, 13], [0, 1, 4, 6], [1, 2, 3, 5, 6, 7], [2, 4, 7], [3, 4, 7, 8], [4, 5, 6, 8], [6, 7, 9], [8, 10, 11], [9, 11, 12], [9, 10, 12, 20], [10, 11], [2, 14, 15], [13, 15, 16, 17], [13, 14, 16, 19], [14, 15, 17, 18, 19], [14, 16, 18, 20], [16, 17, 19, 37, 21, 20], [15, 16, 18, 26, 27, 37], [11, 17, 18, 21, 22, 23], [18, 20, 22, 37], [20, 21, 23, 24, 25, 37], [20, 22, 24], [22, 23, 25], [22, 24], [19, 28, 34, 27], [19, 26, 34, 35, 37], [26, 29, 30, 32, 34], [28, 30, 31], [28, 29, 31, 32], [0, 29, 30, 32, 33], [28, 30, 31, 33, 34], [31, 32], [26, 27, 28, 32, 35, 36], [27, 34, 36, 37], [34, 35, 38], [18, 19, 21, 22, 27, 35], [36, 39, 41], [38, 40, 41], [39, 41], [38, 39, 40]];
  const XY = [[70, 90], [160, 95], [330, 50], [150, 165], [235, 160], [310, 150], [150, 235], [240, 240], [185, 320], [250, 400], [235, 470], [320, 450], [270, 540], [430, 95], [430, 175], [500, 110], [505, 185], [455, 245], [555, 235], [610, 150], [490, 330], [565, 320], [585, 400], [540, 445], [560, 520], [640, 500], [690, 130], [700, 200], [760, 90], [830, 80], [830, 150], [910, 100], [845, 215], [935, 200], [780, 250], [720, 300], [810, 320], [635, 290], [780, 420], [865, 415], [940, 470], [880, 520]];
  const COLORS = ['Vermelho', 'Azul', 'Verde', 'Amarelo', 'Preto', 'Branco'];
  const FILL = ['#d64545', '#3d7bd8', '#3fa65a', '#e0b83a', '#2c2c2c', '#eeeeee'];
  const TEXT = ['#fff', '#fff', '#fff', '#1c1a17', '#fff', '#1c1a17'];
  const SYMBOL = ['●', '■', '▲', '★'];
  const SYMBOL_NAME = ['círculo', 'quadrado', 'triângulo', 'coringa'];
  const NS = 'http://www.w3.org/2000/svg';

  let pending = new Map(); // reforcos ainda nao confirmados: territorio -> exercitos
  let pickedPlace = null; // territorio escolhido para receber reforcos
  let from = null; // origem de ataque ou remanejamento
  let to = null; // alvo
  let mode = 'attack'; // attack | move
  let moveN = 1;
  let tradeSel = new Set();
  let view = 'map'; // map | list
  let seenVersion = null;

  const svg = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  };

  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'War',
        min: 3,
        max: 6,
        rules: [
          'Conquiste o mundo: cada jogador tem uma cor e um objetivo secreto (conquistar continentes, 24 territórios ou destruir um adversário).',
          'Preparação: os territórios são sorteados e cada jogador reparte 5 exércitos e, depois, mais 3.',
          'No seu turno: 1) reforce (metade dos territórios, mínimo 3, mais bônus de continente e trocas de cartas); 2) ataque vizinhos com dados; 3) remanejar (opcional) encerra o turno.',
          'Ataque: até 3 dados contra até 3 de defesa; os maiores dados se enfrentam e o empate favorece a defesa. Sempre fica 1 exército no território de origem.',
          'Quem conquista ao menos um território no turno recebe uma carta. 3 cartas iguais ou 3 diferentes valem exércitos (4, 6, 8, 10, 12, 15 e depois +5). Com 5 cartas a troca é obrigatória.',
          'Vence o primeiro a cumprir o objetivo. Só você vê o seu.',
        ],
      });
    }

    if (room.version !== seenVersion) {
      seenVersion = room.version;
      pending = new Map();
      pickedPlace = null;
      from = null;
      to = null;
      mode = 'attack';
      moveN = 1;
      tradeSel = new Set();
    }
    el.innerHTML = '';
    const nameOf = (s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;
    const inGame = seat !== null && seat < v.players && mine;
    const myTurn = inGame && v.turn === seat && !v.over;
    const placing = myTurn && mine.canPlace;
    const attacking = myTurn && mine.canAttack;
    const pendingTotal = [...pending.values()].reduce((a, b) => a + b, 0);
    const remaining = v.pool - pendingTotal;
    const wrap = K.el('div', 'mesa war');

    /* jogadores */
    const strip = K.el('div', 'wr-players');
    for (let s = 0; s < v.players; s++) {
      const p = K.el('div', `wr-p${v.turn === s ? ' turn' : ''}${v.alive[s] ? '' : ' dead'}${s === seat ? ' me' : ''}`);
      const dot = K.el('span', 'wr-dot');
      dot.style.background = FILL[s];
      p.append(dot, K.el('span', 'wr-pn', `${nameOf(s)}`), K.el('span', 'wr-pc', `${v.terr[s]} terr. · ${v.cards[s]} cartas`));
      strip.append(p);
    }
    wrap.append(strip);

    /* situacao */
    let situation = '';
    if (v.over) situation = `${COLORS[v.winner]} (${nameOf(v.winner)}) venceu!`;
    else if (v.phase === 'setup') situation = `Preparação (volta ${v.lap}): ${COLORS[v.turn]} reparte ${v.pool} exércitos.`;
    else if (v.stage === 'place') situation = `Reforços de ${COLORS[v.turn]} (${nameOf(v.turn)}): ${v.pool} exércitos.`;
    else situation = `${COLORS[v.turn]} (${nameOf(v.turn)}) está atacando.`;
    wrap.append(K.el('div', 'wr-sit', situation));

    /* ultimo ataque */
    const la = v.lastAttack;
    if (la && !v.over) {
      const row = K.el('div', 'wr-last');
      row.append(K.el('span', null, `${NAMES[la.from]} → ${NAMES[la.to]}: `));
      for (const d of la.att) row.append(K.el('span', 'wr-die att', String(d)));
      row.append(K.el('span', null, ' x '));
      for (const d of la.def) row.append(K.el('span', 'wr-die def', String(d)));
      row.append(K.el('span', null, la.conquered ? ' conquistado!' : ` (−${la.lossA} / −${la.lossD})`));
      wrap.append(row);
    }

    /* abas mapa / lista */
    const tabs = K.el('div', 'wr-tabs');
    for (const [id, label] of [['map', 'Mapa'], ['list', 'Lista']]) {
      const b = K.el('button', view === id ? 'on' : 'ghost', label);
      b.type = 'button';
      b.addEventListener('click', () => { view = id; render(el, room, send); });
      tabs.append(b);
    }
    wrap.append(tabs);

    /* estado de cada territorio na tela */
    const owner = (i) => v.owner[i];
    const mineT = (i) => owner(i) === seat;
    const shown = (i) => v.armies[i] + (pending.get(i) || 0);
    const targets = new Set();
    if (attacking && from !== null && mode === 'attack') ADJ[from].forEach((j) => { if (owner(j) !== seat) targets.add(j); });
    if (attacking && from !== null && mode === 'move') ADJ[from].forEach((j) => { if (owner(j) === seat) targets.add(j); });

    const tap = (i) => {
      if (placing) {
        if (mineT(i)) pickedPlace = pickedPlace === i ? null : i;
      } else if (attacking) {
        if (mode === 'attack') {
          if (mineT(i) && v.armies[i] >= 2) { from = from === i ? null : i; to = null; }
          else if (from !== null && targets.has(i)) to = to === i ? null : i;
        } else if (mineT(i)) {
          if (from === null || !targets.has(i)) { from = i; to = null; moveN = 1; }
          else { to = i; moveN = Math.min(Math.max(moveN, 1), v.armies[from] - 1); }
        }
      } else {
        pickedPlace = pickedPlace === i ? null : i;
      }
      render(el, room, send);
    };

    if (view === 'map') {
      const box = K.el('div', 'wr-map');
      const s = svg('svg', { viewBox: '0 0 1000 590', class: 'wr-svg', role: 'img', 'aria-label': 'Mapa-múndi' });
      // ligacoes
      for (let a = 0; a < ADJ.length; a++) {
        for (const b of ADJ[a]) {
          if (b < a) continue;
          const [x1, y1] = XY[a];
          const [x2, y2] = XY[b];
          if (Math.abs(x1 - x2) > 600) {
            const left = x1 < x2 ? [x1, y1] : [x2, y2];
            const right = x1 < x2 ? [x2, y2] : [x1, y1];
            s.append(svg('line', { x1: left[0], y1: left[1], x2: 0, y2: left[1] - 10, class: 'wr-link' }));
            s.append(svg('line', { x1: right[0], y1: right[1], x2: 1000, y2: right[1] - 10, class: 'wr-link' }));
          } else s.append(svg('line', { x1, y1, x2, y2, class: 'wr-link' }));
        }
      }
      for (let i = 0; i < NAMES.length; i++) {
        const [x, y] = XY[i];
        const o = owner(i);
        const cls = ['wr-node'];
        if (from === i) cls.push('from');
        if (to === i) cls.push('to');
        if (targets.has(i)) cls.push('tgt');
        if (pickedPlace === i) cls.push('pick');
        const g = svg('g', { class: cls.join(' '), transform: `translate(${x} ${y})` });
        g.append(svg('circle', { r: 21, fill: FILL[o], class: 'wr-c' }));
        g.append(svg('text', { y: 6, class: 'wr-n', fill: TEXT[o] }, String(shown(i))));
        if (pending.get(i)) g.append(svg('text', { x: 18, y: -14, class: 'wr-plus' }, `+${pending.get(i)}`));
        g.append(svg('text', { y: 36, class: 'wr-name' }, NAMES[i]));
        g.addEventListener('click', () => tap(i));
        s.append(g);
      }
      box.append(s);
      wrap.append(box);
      wrap.append(K.el('div', 'logline', 'Deslize o mapa para os lados. A aba Lista mostra tudo por continente.'));
    } else {
      const list = K.el('div', 'wr-list');
      for (let c = 0; c < CONT_NAME.length; c++) {
        list.append(K.el('h3', null, CONT_NAME[c]));
        NAMES.forEach((n, i) => {
          if (CONT[i] !== c) return;
          const o = owner(i);
          const cls = ['wr-row'];
          if (from === i) cls.push('from');
          if (to === i) cls.push('to');
          if (targets.has(i)) cls.push('tgt');
          if (pickedPlace === i) cls.push('pick');
          const r = K.el('div', cls.join(' '));
          const dot = K.el('span', 'wr-dot');
          dot.style.background = FILL[o];
          const extra = pending.get(i) ? ` (+${pending.get(i)})` : '';
          r.append(dot, K.el('span', 'wr-rn', n), K.el('span', 'wr-ro', `${COLORS[o]} · ${nameOf(o)}`), K.el('span', 'wr-ra', `${shown(i)}${extra}`));
          r.addEventListener('click', () => tap(i));
          list.append(r);
        });
      }
      wrap.append(list);
    }
    el.append(wrap);

    const btn = (parent, label, enabled, onClick, ghost) => {
      const b = K.el('button', ghost ? 'ghost' : null, label);
      b.type = 'button';
      b.disabled = !enabled;
      b.addEventListener('click', onClick);
      parent.append(b);
      return b;
    };
    const rerender = () => render(el, room, send);

    /* controles da minha vez */
    if (myTurn) {
      const panel = K.el('div', 'wr-panel');
      if (placing) {
        // troca de cartas
        if (v.phase === 'playing' && mine.hand.length >= 3) {
          const tr = K.el('div', 'wr-trade');
          tr.append(K.el('div', 'wr-h', mine.mustTrade ? 'Troque cartas (obrigatório com 5 ou mais)' : `Trocar cartas (próxima troca: ${v.nextTrade} exércitos)`));
          const chips = K.el('div', 'wr-cards');
          mine.hand.forEach((c, i) => {
            const t = mine.cardTerr[i];
            const chip = K.el('button', `wr-card s${mine.symbols[i]}${tradeSel.has(i) ? ' sel' : ''}`, `${SYMBOL[mine.symbols[i]]} ${t === null ? 'Coringa' : NAMES[t]}`);
            chip.type = 'button';
            chip.addEventListener('click', () => {
              if (tradeSel.has(i)) tradeSel.delete(i);
              else if (tradeSel.size < 3) tradeSel.add(i);
              rerender();
            });
            chips.append(chip);
          });
          tr.append(chips);
          const row = K.el('div', 'ctrls');
          btn(row, `Trocar por ${v.nextTrade}`, tradeSel.size === 3, () => { const cards = [...tradeSel]; tradeSel = new Set(); send({ t: 'trade', cards }); });
          tr.append(row);
          panel.append(tr);
        }
        if (mine.mustTrade) {
          panel.append(K.el('div', 'logline', 'Faça a troca antes de distribuir os reforços.'));
        } else {
          const info = pickedPlace === null ? 'Toque num território seu para escolher onde reforçar.' : `${NAMES[pickedPlace]}: ${shown(pickedPlace)} exércitos`;
          panel.append(K.el('div', 'wr-h', `Reforços: faltam ${remaining} de ${v.pool}`));
          panel.append(K.el('div', 'logline', info));
          const row = K.el('div', 'ctrls');
          const add = (n) => { if (pickedPlace === null) return; const k = Math.min(n, remaining); if (k > 0) pending.set(pickedPlace, (pending.get(pickedPlace) || 0) + k); rerender(); };
          btn(row, '+1', pickedPlace !== null && remaining > 0, () => add(1));
          btn(row, '+5', pickedPlace !== null && remaining > 0, () => add(5));
          btn(row, 'Todos', pickedPlace !== null && remaining > 0, () => add(remaining));
          btn(row, '−1', pickedPlace !== null && (pending.get(pickedPlace) || 0) > 0, () => { const k = pending.get(pickedPlace) - 1; if (k > 0) pending.set(pickedPlace, k); else pending.delete(pickedPlace); rerender(); }, true);
          btn(row, 'Limpar', pendingTotal > 0, () => { pending = new Map(); rerender(); }, true);
          panel.append(row);
          const ok = K.el('div', 'ctrls');
          btn(ok, 'Confirmar reforços', remaining === 0, () => { const plan = [...pending.entries()]; pending = new Map(); send({ t: 'place', plan }); });
          panel.append(ok);
        }
      } else if (attacking) {
        const modes = K.el('div', 'wr-tabs');
        for (const [id, label] of [['attack', 'Atacar'], ['move', 'Remanejar']]) {
          const b = K.el('button', mode === id ? 'on' : 'ghost', label);
          b.type = 'button';
          b.addEventListener('click', () => { mode = id; from = null; to = null; rerender(); });
          modes.append(b);
        }
        panel.append(modes);
        if (mode === 'attack') {
          if (from === null) panel.append(K.el('div', 'logline', 'Toque num território seu com 2 ou mais exércitos para atacar a partir dele.'));
          else if (to === null) panel.append(K.el('div', 'logline', `Atacando de ${NAMES[from]} (${v.armies[from]}). Toque num vizinho inimigo destacado.`));
          else {
            panel.append(K.el('div', 'wr-h', `${NAMES[from]} (${v.armies[from]}) → ${NAMES[to]} (${v.armies[to]}, ${COLORS[owner(to)]})`));
            const row = K.el('div', 'ctrls');
            const max = Math.min(3, v.armies[from] - 1);
            for (let d = 1; d <= max; d++) btn(row, `${d} dado${d > 1 ? 's' : ''}`, true, () => send({ t: 'attack', from, to, dice: d }));
            btn(row, 'Até o fim', true, () => send({ t: 'attack', from, to, until: true }));
            panel.append(row);
          }
        } else if (from === null) {
          panel.append(K.el('div', 'logline', 'Remanejar encerra o turno: toque no território de origem e depois num vizinho seu.'));
        } else if (to === null) {
          panel.append(K.el('div', 'logline', `Origem: ${NAMES[from]} (${v.armies[from]}). Toque num vizinho seu destacado.`));
        } else {
          const maxN = v.armies[from] - 1;
          panel.append(K.el('div', 'wr-h', `Mover de ${NAMES[from]} para ${NAMES[to]}: ${moveN} (máx. ${maxN})`));
          const row = K.el('div', 'ctrls');
          btn(row, '−', moveN > 1, () => { moveN -= 1; rerender(); }, true);
          btn(row, '+', moveN < maxN, () => { moveN += 1; rerender(); }, true);
          btn(row, 'Todos', moveN < maxN, () => { moveN = maxN; rerender(); }, true);
          btn(row, 'Mover e encerrar turno', maxN >= 1, () => send({ t: 'move', from, to, n: moveN }));
          panel.append(row);
        }
        const end = K.el('div', 'ctrls');
        btn(end, 'Encerrar turno', true, () => send({ t: 'end' }), true);
        panel.append(end);
      }
      el.append(panel);
    } else if (pickedPlace !== null) {
      const o = owner(pickedPlace);
      el.append(K.el('div', 'logline', `${NAMES[pickedPlace]}: ${COLORS[o]} (${nameOf(o)}), ${v.armies[pickedPlace]} exércitos.`));
    }

    /* objetivo e cartas (privado) */
    if (inGame) {
      const det = K.el('details', 'wr-obj');
      if (!v.over) det.open = false;
      det.append(K.el('summary', null, `Meu objetivo${mine.done ? ' (cumprido!)' : ''} · você é ${COLORS[seat]}`));
      det.append(K.el('p', null, mine.objective));
      det.append(K.el('p', 'muted', `Você tem ${mine.owned} territórios. Reforço do próximo turno: ${mine.reinforce}.`));
      if (mine.hand.length) {
        const cs = K.el('div', 'wr-cards');
        mine.hand.forEach((c, i) => cs.append(K.el('span', `wr-card s${mine.symbols[i]}`, `${SYMBOL[mine.symbols[i]]} ${mine.cardTerr[i] === null ? 'Coringa' : NAMES[mine.cardTerr[i]]}`)));
        det.append(cs);
      }
      el.append(det);
    }
    if (v.over && v.reveal) {
      const ul = K.el('ul', 'rules');
      v.reveal.forEach((t, i) => ul.append(K.el('li', null, `${COLORS[i]} (${nameOf(i)}): ${t}`)));
      el.append(K.el('div', 'wr-h', 'Objetivos'), ul);
    }
    if (v.log) el.append(K.el('div', 'logline', v.log));

    if (v.over) return `${COLORS[v.winner]} venceu! "Nova partida" joga de novo.`;
    if (!inGame) return seat !== null ? '' : 'Você está assistindo.';
    if (placing) return remaining === 0 ? 'Confirme os reforços.' : 'Distribua os reforços.';
    if (attacking) return 'Sua vez de atacar.';
    return '';
  }

  window.GameUI.war = { render, map: { names: NAMES, cont: CONT, adj: ADJ, xy: XY } };
})();
