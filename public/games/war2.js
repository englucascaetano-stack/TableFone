'use strict';
// Interface do War II. Visao publica: room.view (dono e exercitos, CEs, bombardeiros, ultimo ataque);
// visao privada: room.mine (objetivo secreto, cartas e o que voce pode fazer agora).
// Intencoes: { t:'start' } | { t:'ceChoose', ce } | { t:'ceChoose', terrs:[a,b] } | { t:'claim', i } | { t:'place', plan }
//   | { t:'attack', from, to, dice?, until? } | { t:'occupy', n } | { t:'air', target, n } | { t:'shift', from, to, n }
//   | { t:'cardArmy', cards, terr } | { t:'cardAir', cards, terr } | { t:'cardMove', cards, from, to, n } | { t:'discard', cards } | { t:'end' }

(function () {
  const K = window.GameKit;
  const NAMES = ["Alasca","Mackenzie","Groenlândia","Vancouver","Ottawa","Labrador","Califórnia","Nova York","México","Cuba","Venezuela","Peru","Brasil","Argentina","Islândia","Inglaterra","Suécia","Alemanha","França","Polônia","Moscou","Argélia","Egito","Sudão","Congo","África do Sul","Madagascar","Aral","Omsk","Dudinka","Sibéria","Tchita","Vladivostok","Mongólia","Japão","China","Índia","Vietnã","Oriente Médio","Sumatra","Bornéu","Nova Guiné","Austrália"];
  const CONT = [0,0,0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4,4,5,5,5,5];
  const ADJ = [[1,3,32],[0,3,4,2],[1,5,14],[0,1,4,6],[1,3,6,7,5],[4,7,2],[3,4,7,8],[4,5,6,8,9],[6,7,9,10],[7,8,10],[8,9,11,12],[10,12,13],[10,11,13,21],[11,12],[2,15,16],[14,16,18],[14,15,17,20],[16,20,19,18],[15,17,19,21,22],[17,20,18,38,22],[16,17,19,38,27,28],[12,18,22,23,24],[18,19,21,23,38],[21,22,24,25,26],[21,23,25],[23,24,26],[23,25],[20,28,29,35,36,38],[20,27,29],[27,28,30,31,33],[29,31,32],[29,30,32,33],[0,30,31,35,34],[29,31,35],[35,32],[27,33,32,36,37,34],[27,35,37,38,39],[35,36,40],[19,20,22,27,36],[36,42],[37,41,42],[40,42],[39,40,41]];
  const CE = [4,7,15,17,20,22,38,35,34,12,25,42];
  const XY = [[95, 232], [225, 225], [410, 150], [205, 292], [290, 300], [350, 300], [235, 350], [322, 372], [245, 420], [348, 420], [320, 470], [345, 525], [405, 525], [350, 590], [445, 245], [478, 272], [580, 220], [550, 290], [535, 335], [590, 330], [645, 280], [520, 420], [575, 385], [600, 435], [570, 485], [580, 548], [655, 522], [700, 325], [672, 262], [725, 240], [800, 205], [795, 288], [895, 228], [800, 325], [915, 398], [790, 368], [722, 402], [792, 420], [648, 372], [790, 520], [845, 495], [925, 530], [895, 598]];
  const CONT_NAME = ['América do Norte', 'América do Sul', 'Europa', 'África', 'Ásia', 'Oceania'];
  const COLORS = ['Vermelho', 'Azul', 'Verde', 'Amarelo', 'Preto', 'Branco'];
  const FILL = ['#d64545', '#3d7bd8', '#3fa65a', '#e0b83a', '#2c2c2c', '#eeeeee'];
  const TEXT = ['#fff', '#fff', '#fff', '#1c1a17', '#fff', '#1c1a17'];
  const NS = 'http://www.w3.org/2000/svg';
  const X0 = 40, X1 = 1040;

  let pending = new Map(); // reforcos ainda nao confirmados
  let picked = null; // territorio escolhido (reforco, ocupacao ou deslocamento)
  let from = null;
  let to = null;
  let mode = 'attack'; // attack | air | shift
  let num = 1; // numero de exercitos / bombardeiros / levados
  let sel = new Set(); // cartas escolhidas
  let cmFrom = null;
  let cmTo = null;
  let cePick = [];
  let view = 'map';
  let seenVersion = null;

  const svg = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const isCE = (i) => CE.includes(i);

  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'War II',
        min: 3,
        max: 6,
        rules: [
          'Conquista do mundo com 12 Centros Estratégicos (CE), bombardeiros e objetivos secretos. Cada jogador tem uma cor.',
          'Preparação: os CEs são sorteados (2 exércitos cada) e depois cada jogador ocupa um território vago por vez, com 1 exército. Com 5 jogadores há uma escolha especial.',
          'Reforços: metade dos territórios, mais o bônus de continente (inteiro ou maioria, como na tabela do tabuleiro), mais 1 exército por CE (mínimo 3). Cada CE também dá 1 bombardeiro na sua base aérea. Na primeira rodada todos reforçam e só depois atacam.',
          'Ataque terrestre: até 3 dados contra até 3; o empate favorece a defesa. Ataque aéreo: bombardeiros da base (ou da caixa, com cartas) contra qualquer território inimigo com 2 ou mais exércitos; nunca destrói o último exército.',
          'Cartas (até 5): 1 carta de território + numeradas valem exércitos, bombardeiros ou, com 2 cartas de território, um transporte. Quem conquista ao menos um território recebe 3 cartas no fim do turno.',
          'Depois dos ataques: deslocamento entre vizinhos (cada exército uma vez) e aerotransporte entre CEs. Vence quem cumprir o objetivo.',
          'Aviso: o agrupamento das cartas de território, os valores das cartas numeradas e os objetivos ainda são provisórios (o PDF do manual não traz esses dados).',
        ],
      });
    }

    if (room.version !== seenVersion) {
      seenVersion = room.version;
      pending = new Map();
      picked = null;
      from = null;
      to = null;
      mode = 'attack';
      num = 1;
      sel = new Set();
      cmFrom = null;
      cmTo = null;
      cePick = [];
    }
    el.innerHTML = '';
    const nameOf = (s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;
    const inGame = seat !== null && seat < v.players && mine;
    const myTurn = inGame && v.turn === seat && !v.over;
    if (myTurn && !mine.canAttack && mine.canShift) mode = 'shift';
    const owner = (i) => v.owner[i];
    const mineT = (i) => owner(i) === seat;
    const shown = (i) => v.armies[i] + (pending.get(i) || 0);
    const pendingTotal = [...pending.values()].reduce((a, b) => a + b, 0);
    const need = v.pool.free + v.pool.cont.reduce((a, b) => a + b, 0);
    const remaining = need - pendingTotal;
    const contOk = v.pool.cont.every((n, c) => [...pending.entries()].filter(([i]) => CONT[i] === c).reduce((a, [, k]) => a + k, 0) >= n);
    const rerender = () => render(el, room, send);
    const wrap = K.el('div', 'mesa war');

    /* jogadores */
    const strip = K.el('div', 'wr-players');
    for (let s = 0; s < v.players; s++) {
      const p = K.el('div', `wr-p${v.turn === s ? ' turn' : ''}${v.alive[s] ? '' : ' dead'}${s === seat ? ' me' : ''}`);
      const dot = K.el('span', 'wr-dot');
      dot.style.background = FILL[s];
      p.append(dot, K.el('span', 'wr-pn', nameOf(s)), K.el('span', 'wr-pc', `${v.terr[s]} terr. · ${v.cards[s]} cartas · ${v.air[s]} aviões`));
      strip.append(p);
    }
    wrap.append(strip);

    /* situacao */
    let situation;
    if (v.over) situation = `${COLORS[v.winner]} (${nameOf(v.winner)}) venceu!`;
    else if (v.phase === 'ce5') situation = `${COLORS[v.turn]} escolhe: 1 CE restante ou 2 territórios vagos.`;
    else if (v.phase === 'claim') situation = `${COLORS[v.turn]} ocupa um território vago.`;
    else if (v.occupy) situation = `${COLORS[v.turn]} conquistou ${NAMES[v.occupy.to]}: leva exércitos para lá.`;
    else if (v.stage === 'place') situation = `Reforços de ${COLORS[v.turn]} (${nameOf(v.turn)}): ${need} exércitos${v.opening ? ' (primeira rodada)' : ''}.`;
    else situation = `${COLORS[v.turn]} (${nameOf(v.turn)}) está ${v.stage === 'shift' ? 'deslocando' : 'atacando'}.`;
    wrap.append(K.el('div', 'wr-sit', situation));

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
    const air = v.lastAir;
    if (air && !v.over) wrap.append(K.el('div', 'wr-last', `Ataque aéreo em ${NAMES[air.target]}: ${air.planes} avião${air.planes === 1 ? '' : 'ões'}, −${air.lostArmies} exércitos, −${air.lostPlanes} aviões abatidos.`));

    /* alvos destacados */
    const targets = new Set();
    const canAttackNow = myTurn && mine.canAttack;
    if (canAttackNow && mode === 'attack' && from !== null) ADJ[from].forEach((j) => { if (owner(j) !== seat && owner(j) >= 0) targets.add(j); });
    if (canAttackNow && mode === 'air') v.owner.forEach((o, i) => { if (o !== seat && o >= 0 && v.armies[i] >= 2) targets.add(i); });
    if (myTurn && mine.canShift && mode === 'shift' && from !== null) {
      ADJ[from].forEach((j) => { if (mineT(j)) targets.add(j); });
      if (isCE(from)) CE.forEach((j) => { if (j !== from && mineT(j)) targets.add(j); });
    }
    const vacant = (i) => owner(i) === -1;

    const tap = (i) => {
      if (myTurn && v.phase === 'ce5') {
        if (v.ceLeft.includes(i)) cePick = [i];
        else if (vacant(i) && !isCE(i)) cePick = cePick.filter((x) => !isCE(x)).includes(i) ? cePick.filter((x) => x !== i) : [...cePick.filter((x) => !isCE(x)), i].slice(-2);
      } else if (myTurn && v.phase === 'claim') {
        if (vacant(i)) picked = picked === i ? null : i;
      } else if (myTurn && mine.mustOccupy) {
        // nada a tocar: usa os botoes
      } else if (myTurn && mine.canPlace) {
        if (mineT(i)) picked = picked === i ? null : i;
      } else if (canAttackNow && mode === 'attack') {
        if (mineT(i) && v.armies[i] >= 2) { from = from === i ? null : i; to = null; }
        else if (from !== null && targets.has(i)) to = to === i ? null : i;
      } else if (canAttackNow && mode === 'air') {
        if (targets.has(i)) to = to === i ? null : i;
      } else if (myTurn && mine.canShift && mode === 'shift') {
        if (mineT(i) && (from === null || !targets.has(i)) && mine.freeShift[i] > 0) { from = i; to = null; num = 1; }
        else if (from !== null && targets.has(i)) { to = i; num = Math.min(Math.max(num, 1), mine.freeShift[from]); }
      } else picked = picked === i ? null : i;
      rerender();
    };
    const state = (i) => {
      const c = [];
      if (from === i) c.push('from');
      if (to === i) c.push('to');
      if (targets.has(i)) c.push('tgt');
      if (picked === i || cePick.includes(i)) c.push('pick');
      if (v.phase === 'ce5' && v.ceLeft.includes(i)) c.push('tgt');
      if (v.phase === 'claim' && myTurn && vacant(i)) c.push('tgt');
      return c.join(' ');
    };

    /* abas mapa / lista */
    const tabs = K.el('div', 'wr-tabs');
    for (const [id, label] of [['map', 'Mapa'], ['list', 'Lista']]) {
      const b = K.el('button', view === id ? 'on' : 'ghost', label);
      b.type = 'button';
      b.addEventListener('click', () => { view = id; rerender(); });
      tabs.append(b);
    }
    wrap.append(tabs);

    if (view === 'map') {
      const box = K.el('div', 'wr-map');
      const s = svg('svg', { viewBox: `${X0} 120 ${X1 - X0} 520`, class: 'wr-svg', role: 'img', 'aria-label': 'Mapa-múndi' });
      for (let a = 0; a < ADJ.length; a++) {
        for (const b of ADJ[a]) {
          if (b < a) continue;
          const [x1, y1] = XY[a];
          const [x2, y2] = XY[b];
          if (Math.abs(x1 - x2) > 600) {
            const l = x1 < x2 ? [x1, y1] : [x2, y2];
            const r = x1 < x2 ? [x2, y2] : [x1, y1];
            s.append(svg('line', { x1: l[0], y1: l[1], x2: X0, y2: l[1] - 8, class: 'wr-link' }));
            s.append(svg('line', { x1: r[0], y1: r[1], x2: X1, y2: r[1] - 8, class: 'wr-link' }));
          } else s.append(svg('line', { x1, y1, x2, y2, class: 'wr-link' }));
        }
      }
      for (let i = 0; i < NAMES.length; i++) {
        const [x, y] = XY[i];
        const o = owner(i);
        const g = svg('g', { class: `wr-node ${state(i)}`, transform: `translate(${x} ${y})` });
        g.append(svg('circle', { r: 18, fill: o >= 0 ? FILL[o] : '#555', class: 'wr-c' }));
        if (isCE(i)) g.append(svg('path', { d: 'M0 -33 L7 -23 L-7 -23 Z', class: 'wr-ce' }));
        g.append(svg('text', { y: 6, class: 'wr-n', fill: o >= 0 ? TEXT[o] : '#ddd' }, o >= 0 ? String(shown(i)) : '–'));
        if (pending.get(i)) g.append(svg('text', { x: 17, y: -13, class: 'wr-plus' }, `+${pending.get(i)}`));
        g.append(svg('text', { y: 33, class: 'wr-name' }, NAMES[i]));
        g.addEventListener('click', () => tap(i));
        s.append(g);
      }
      box.append(s);
      wrap.append(box);
      wrap.append(K.el('div', 'logline', 'Triângulo branco = Centro Estratégico. Deslize o mapa para os lados.'));
    } else {
      const list = K.el('div', 'wr-list');
      for (let c = 0; c < CONT_NAME.length; c++) {
        list.append(K.el('h3', null, CONT_NAME[c]));
        NAMES.forEach((n, i) => {
          if (CONT[i] !== c) return;
          const o = owner(i);
          const r = K.el('div', `wr-row ${state(i)}`);
          const dot = K.el('span', 'wr-dot');
          dot.style.background = o >= 0 ? FILL[o] : '#555';
          const extra = pending.get(i) ? ` (+${pending.get(i)})` : '';
          r.append(dot, K.el('span', 'wr-rn', `${n}${isCE(i) ? ' ▲CE' : ''}`), K.el('span', 'wr-ro', o >= 0 ? `${COLORS[o]} · ${nameOf(o)}` : 'vago'), K.el('span', 'wr-ra', o >= 0 ? `${shown(i)}${extra}` : '–'));
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
    const stepper = (parent, max, label) => {
      const row = K.el('div', 'ctrls');
      btn(row, '−', num > 1, () => { num -= 1; rerender(); }, true);
      row.append(K.el('span', 'wr-num', `${label} ${num}`));
      btn(row, '+', num < max, () => { num += 1; rerender(); }, true);
      btn(row, 'Máx.', num < max, () => { num = max; rerender(); }, true);
      parent.append(row);
    };

    /* painel da minha vez */
    if (myTurn) {
      const panel = K.el('div', 'wr-panel');
      if (v.phase === 'ce5') {
        const ce = cePick.length === 1 && v.ceLeft.includes(cePick[0]);
        const two = cePick.length === 2 && cePick.every((i) => !isCE(i) && vacant(i)) && CONT[cePick[0]] !== CONT[cePick[1]];
        panel.append(K.el('div', 'logline', cePick.length ? `Escolhido: ${cePick.map((i) => NAMES[i]).join(' e ')}` : 'Toque num CE restante (triângulo verde) ou em 2 territórios vagos de continentes diferentes.'));
        const row = K.el('div', 'ctrls');
        btn(row, 'Ficar com o CE (2 exércitos)', ce, () => send({ t: 'ceChoose', ce: cePick[0] }));
        btn(row, 'Ocupar os 2 territórios', two, () => send({ t: 'ceChoose', terrs: cePick }));
        panel.append(row);
      } else if (v.phase === 'claim') {
        panel.append(K.el('div', 'logline', picked === null ? 'Toque num território vago para ocupá-lo.' : `Ocupar ${NAMES[picked]}?`));
        const row = K.el('div', 'ctrls');
        btn(row, picked === null ? 'Ocupar' : `Ocupar ${NAMES[picked]}`, picked !== null, () => { const i = picked; picked = null; send({ t: 'claim', i }); });
        panel.append(row);
      } else if (mine.mustOccupy) {
        const max = v.occupy.max;
        num = Math.min(Math.max(num, 1), max);
        panel.append(K.el('div', 'wr-h', `Levar para ${NAMES[v.occupy.to]} (de ${NAMES[v.occupy.from]}, máx. ${max})`));
        stepper(panel, max, 'Exércitos');
        const row = K.el('div', 'ctrls');
        btn(row, 'Confirmar', true, () => { const n = num; num = 1; send({ t: 'occupy', n }); });
        panel.append(row);
      } else if (mine.canPlace) {
        const needs = v.pool.cont.map((n, c) => (n > 0 ? `${n} em ${CONT_NAME[c]}` : null)).filter(Boolean);
        panel.append(K.el('div', 'wr-h', `Reforços: faltam ${remaining} de ${need}`));
        panel.append(K.el('div', 'logline', `${v.pool.free} livres${needs.length ? '; obrigatórios: ' + needs.join(', ') : ''}. Os exércitos dos CEs e os bombardeiros já foram colocados.`));
        panel.append(K.el('div', 'logline', picked === null ? 'Toque num território seu para escolher onde reforçar.' : `${NAMES[picked]}: ${shown(picked)} exércitos`));
        const row = K.el('div', 'ctrls');
        const add = (k) => { if (picked === null) return; const m = Math.min(k, remaining); if (m > 0) pending.set(picked, (pending.get(picked) || 0) + m); rerender(); };
        btn(row, '+1', picked !== null && remaining > 0, () => add(1));
        btn(row, '+5', picked !== null && remaining > 0, () => add(5));
        btn(row, 'Todos', picked !== null && remaining > 0, () => add(remaining));
        btn(row, '−1', picked !== null && (pending.get(picked) || 0) > 0, () => { const k = pending.get(picked) - 1; if (k > 0) pending.set(picked, k); else pending.delete(picked); rerender(); }, true);
        btn(row, 'Limpar', pendingTotal > 0, () => { pending = new Map(); rerender(); }, true);
        panel.append(row);
        if (remaining === 0 && !contOk) panel.append(K.el('div', 'logline', 'Falta colocar os exércitos de continente dentro do continente certo.'));
        const ok = K.el('div', 'ctrls');
        btn(ok, 'Confirmar reforços', remaining === 0 && contOk, () => { const plan = [...pending.entries()]; pending = new Map(); send({ t: 'place', plan }); });
        panel.append(ok);
      } else if (mine.canAttack || mine.canShift) {
        const modes = K.el('div', 'wr-tabs');
        const list = [['attack', 'Atacar', mine.canAttack], ['air', 'Aéreo', mine.canAttack], ['shift', 'Deslocar', mine.canShift]];
        for (const [id, label, enabled] of list) {
          const b = K.el('button', mode === id ? 'on' : 'ghost', label);
          b.type = 'button';
          b.disabled = !enabled;
          b.addEventListener('click', () => { mode = id; from = null; to = null; num = 1; rerender(); });
          modes.append(b);
        }
        panel.append(modes);
        if (mode === 'attack' && mine.canAttack) {
          if (from === null) panel.append(K.el('div', 'logline', 'Toque num território seu com 2 ou mais exércitos.'));
          else if (to === null) panel.append(K.el('div', 'logline', `Atacando de ${NAMES[from]} (${v.armies[from]}). Toque num vizinho inimigo destacado.`));
          else {
            panel.append(K.el('div', 'wr-h', `${NAMES[from]} (${v.armies[from]}) → ${NAMES[to]} (${v.armies[to]}, ${COLORS[owner(to)]})`));
            const row = K.el('div', 'ctrls');
            const max = Math.min(3, v.armies[from] - 1);
            for (let d = 1; d <= max; d++) btn(row, `${d} dado${d > 1 ? 's' : ''}`, true, () => send({ t: 'attack', from, to, dice: d }));
            btn(row, 'Até o fim', true, () => send({ t: 'attack', from, to, until: true }));
            panel.append(row);
          }
        } else if (mode === 'air' && mine.canAttack) {
          const base = v.air[seat];
          if (base < 1) panel.append(K.el('div', 'logline', 'Sem bombardeiros na base aérea. Cartas dão ataque aéreo pela caixa.'));
          else if (to === null) panel.append(K.el('div', 'logline', `Base aérea: ${base}. Toque num território inimigo (2 ou mais exércitos).`));
          else {
            num = Math.min(Math.max(num, 1), base);
            panel.append(K.el('div', 'wr-h', `Bombardear ${NAMES[to]} (${v.armies[to]}, ${COLORS[owner(to)]})`));
            stepper(panel, base, 'Bombardeiros');
            const row = K.el('div', 'ctrls');
            btn(row, 'Lançar ataque', true, () => { const n = num; num = 1; send({ t: 'air', target: to, n }); });
            panel.append(row);
          }
        } else if (mode === 'shift' && mine.canShift) {
          if (from === null) panel.append(K.el('div', 'logline', 'Cada exército se move uma vez. Toque na origem (território seu com exércitos livres).'));
          else if (to === null) panel.append(K.el('div', 'logline', `Origem: ${NAMES[from]} (${mine.freeShift[from]} livres). Toque num vizinho seu, ou em outro CE se for um CE.`));
          else {
            const max = mine.freeShift[from];
            num = Math.min(Math.max(num, 1), max);
            panel.append(K.el('div', 'wr-h', `Mover de ${NAMES[from]} para ${NAMES[to]}`));
            stepper(panel, max, 'Exércitos');
            const row = K.el('div', 'ctrls');
            btn(row, 'Mover', true, () => { const n = num; num = 1; send({ t: 'shift', from, to, n }); });
            panel.append(row);
          }
        }
        const end = K.el('div', 'ctrls');
        btn(end, 'Encerrar turno', !mine.mustDiscard, () => send({ t: 'end' }), true);
        panel.append(end);
        if (mine.mustDiscard) panel.append(K.el('div', 'logline', 'Você tem mais de 5 cartas: use ou descarte até ficar com 5.'));
      }
      el.append(panel);
    } else if (picked !== null) {
      const o = owner(picked);
      el.append(K.el('div', 'logline', `${NAMES[picked]}${isCE(picked) ? ' (CE)' : ''}: ${o >= 0 ? `${COLORS[o]} (${nameOf(o)}), ${v.armies[picked]} exércitos` : 'vago'}.`));
    }

    /* cartas (privado) */
    if (inGame) {
      const det = K.el('details', 'wr-obj');
      det.open = myTurn && (mine.mustDiscard || sel.size > 0);
      det.append(K.el('summary', null, `Meu objetivo e cartas (${mine.hand.length}) · você é ${COLORS[seat]}${mine.done ? ' · objetivo cumprido!' : ''}`));
      det.append(K.el('p', null, mine.objective));
      det.append(K.el('p', 'muted', `Você tem ${mine.owned} territórios e ${v.air[seat]} bombardeiros na base (${mine.box} na caixa). Reforço do próximo turno: ${mine.reinforce}.`));
      const cs = K.el('div', 'wr-cards');
      mine.hand.forEach((c, i) => {
        const label = c.kind === 'num' ? `Nº ${c.value}` : `${c.kind === 'ce' ? '▲ ' : ''}${c.terrs.map((t) => NAMES[t]).join(' / ')}`;
        const chip = K.el('button', `wr-card ${c.kind}${sel.has(i) ? ' sel' : ''}`, label);
        chip.type = 'button';
        chip.addEventListener('click', () => { if (sel.has(i)) sel.delete(i); else sel.add(i); cmFrom = null; cmTo = null; rerender(); });
        cs.append(chip);
      });
      det.append(cs);
      if (mine.canCards && sel.size) {
        const idx = [...sel].sort((a, b) => a - b);
        const chosen = idx.map((i) => mine.hand[i]);
        const terrCards = chosen.filter((c) => c.kind !== 'num');
        const bonus = chosen.filter((c) => c.kind === 'num').reduce((a, c) => a + c.value, 0);
        const ops = K.el('div', 'ctrls');
        if (terrCards.length === 1) {
          for (const t of terrCards[0].terrs) {
            if (mineT(t)) btn(ops, `+${1 + bonus} em ${NAMES[t]}`, true, () => send({ t: 'cardArmy', cards: idx, terr: t }));
            else if (owner(t) >= 0 && v.armies[t] >= 2) btn(ops, `Aéreo ${1 + bonus}× em ${NAMES[t]}`, mine.box >= 1 + bonus, () => send({ t: 'cardAir', cards: idx, terr: t }));
          }
        } else if (terrCards.length === 2 && !bonus) {
          const a = terrCards[0].terrs.filter(mineT);
          const b = terrCards[1].terrs.filter(mineT);
          det.append(K.el('div', 'logline', 'Transporte: a 1ª carta marca a origem e a 2ª o destino (na ordem em que você tocou).'));
          if (cmFrom === null) a.forEach((t) => btn(ops, `Origem: ${NAMES[t]}`, true, () => { cmFrom = t; num = 1; rerender(); }, true));
          else if (cmTo === null) b.forEach((t) => btn(ops, `Destino: ${NAMES[t]}`, t !== cmFrom, () => { cmTo = t; rerender(); }, true));
          else {
            const max = Math.max(1, v.armies[cmFrom] - 1);
            num = Math.min(Math.max(num, 1), max);
            stepper(ops, max, `${NAMES[cmFrom]} → ${NAMES[cmTo]}:`);
            btn(ops, 'Transportar', true, () => send({ t: 'cardMove', cards: idx, from: cmFrom, to: cmTo, n: num }));
          }
        }
        btn(ops, 'Descartar', true, () => send({ t: 'discard', cards: idx }), true);
        det.append(ops);
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
    if (!myTurn) return '';
    if (v.phase === 'ce5') return 'Sua vez: escolha um CE ou 2 territórios.';
    if (v.phase === 'claim') return 'Sua vez de ocupar um território.';
    if (mine.mustOccupy) return 'Escolha quantos exércitos levar.';
    if (mine.canPlace) return remaining === 0 ? 'Confirme os reforços.' : 'Distribua os reforços.';
    return 'Sua vez.';
  }

  window.GameUI.war2 = { render, map: { names: NAMES, cont: CONT, adj: ADJ, xy: XY, ce: CE } };
})();
