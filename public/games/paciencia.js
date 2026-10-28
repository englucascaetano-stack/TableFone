'use strict';
// Interface da Paciencia (Klondike). Recebe a visao publica e envia a intencao da jogada:
//   { t: 'draw' } | { t: 'undo' } | { t: 'mode', draw: 1|3 } | { t: 'move', from, to }
// Toque numa carta para seleciona-la; toque no destino destacado para mover.
// Toque de novo na carta selecionada: envia para a fundacao (ou para o primeiro destino possivel).

(function () {
  const SYMBOL = { S: '♠︎', H: '♥︎', D: '♦︎', C: '♣︎' };
  const LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const DOWN_STEP = 0.16; // deslocamento (em alturas de carta) entre cartas viradas para baixo
  const UP_STEP = 0.33; // idem, para cartas visiveis

  let selected = null; // origem escolhida: { k, i?, n? }
  let seenVersion = null;
  let pending = null; // jogada ja mostrada na tela, aguardando o servidor: { version, view }
  let latest = null; // ultima chamada de render, para redesenhar se o servidor recusar

  const sameFrom = (a, b) => a && b && a.k === b.k && a.i === b.i && a.n === b.n;
  const sameTo = (a, b) => a.k === b.k && a.i === b.i;
  const isRed = (c) => c.endsWith('H') || c.endsWith('D');

  function cardEl(c, extra) {
    const el = document.createElement('div');
    el.className = `card ${isRed(c) ? 'red' : 'black'}${extra ? ` ${extra}` : ''}`;
    const r = parseInt(c, 10);
    const s = SYMBOL[c.slice(-1)];
    const corner = document.createElement('span');
    corner.className = 'corner';
    corner.textContent = `${LABEL[r] || r}${s}`;
    const pip = document.createElement('span');
    pip.className = 'pip';
    pip.textContent = s;
    el.append(corner, pip);
    el.setAttribute('aria-label', `${LABEL[r] || r} de ${{ S: 'espadas', H: 'copas', D: 'ouros', C: 'paus' }[c.slice(-1)]}`);
    return el;
  }

  const slotEl = (label) => {
    const el = document.createElement('div');
    el.className = 'card slot';
    if (label) el.textContent = label;
    return el;
  };

  // Mostra a jogada na hora. A carta de baixo da coluna so e virada quando o servidor responde.
  function applyLocal(view, from, to) {
    const next = JSON.parse(JSON.stringify(view));
    let cards;
    if (from.k === 'waste') cards = [next.waste.pop()];
    else if (from.k === 'found') cards = [next.foundations[from.i].pop()];
    else cards = next.tableau[from.i].splice(from.n).map((x) => x.c);
    if (to.k === 'tab') next.tableau[to.i].push(...cards.map((c) => ({ c, up: true })));
    else next.foundations[to.i].push(cards[0]);
    next.moves += 1;
    return next;
  }

  function render(el, room, send) {
    if (pending && pending.version !== room.version) pending = null; // chegou estado novo do servidor
    latest = { el, room, send };
    const v = pending ? pending.view : room.view;
    const seat = room.you.seat;
    const canPlay = seat === 0 && !v.over && !pending;
    if (room.version !== seenVersion) {
      seenVersion = room.version;
      selected = null;
    }
    const legal = canPlay ? room.view.legal.filter((m) => m.from) : [];
    const fromSel = selected ? legal.filter((m) => sameFrom(m.from, selected)) : [];
    const dests = fromSel.map((m) => m.to);
    const isDest = (to) => dests.some((d) => sameTo(d, to));
    const hasMoveFrom = (from) => legal.some((m) => sameFrom(m.from, from));

    const redraw = () => render(el, room, send);

    function sendMove(from, to) {
      selected = null;
      pending = { version: room.version, view: applyLocal(room.view, from, to) };
      const mine = pending;
      render(el, room, send);
      // Se o servidor recusar (ou nao responder), volta ao estado oficial.
      Promise.resolve(send({ t: 'move', from, to })).finally(() => {
        if (pending === mine) {
          pending = null;
          if (latest) render(latest.el, latest.room, latest.send);
        }
      });
    }

    function onSource(from) {
      if (!canPlay) return;
      if (sameFrom(selected, from)) {
        const options = legal.filter((m) => sameFrom(m.from, from));
        const choice = options.find((m) => m.to.k === 'found') || options[0];
        selected = null;
        if (choice) sendMove(choice.from, choice.to);
        else redraw();
        return;
      }
      selected = hasMoveFrom(from) ? from : null;
      redraw();
    }

    function onDest(to) {
      const m = fromSel.find((x) => sameTo(x.to, to));
      selected = null;
      if (m) sendMove(m.from, m.to);
      else redraw();
    }

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'solitaire';

    /* Linha superior: monte, descarte e fundacoes */
    const top = document.createElement('div');
    top.className = 'sol-top';

    const stock = v.stockCount > 0 ? Object.assign(document.createElement('div'), { className: 'card down' }) : slotEl(v.waste.length ? '↻' : '');
    stock.classList.add('stock');
    if (canPlay) stock.addEventListener('click', () => { selected = null; send({ t: 'draw' }); });
    if (v.stockCount > 0) stock.dataset.count = v.stockCount;
    top.appendChild(stock);

    const waste = document.createElement('div');
    waste.className = 'waste';
    const shownWaste = v.waste.slice(-3);
    shownWaste.forEach((c, idx) => {
      const isTop = idx === shownWaste.length - 1;
      const cEl = cardEl(c, isTop ? '' : 'under');
      cEl.style.left = `calc(var(--cw) * ${0.32 * idx})`;
      if (isTop) {
        if (sameFrom(selected, { k: 'waste' })) cEl.classList.add('sel');
        cEl.addEventListener('click', () => onSource({ k: 'waste' }));
      }
      waste.appendChild(cEl);
    });
    if (!shownWaste.length) waste.appendChild(slotEl());
    top.appendChild(waste);

    const suits = ['S', 'H', 'D', 'C'];
    v.foundations.forEach((f, i) => {
      const slot = f.length ? cardEl(f[f.length - 1]) : slotEl(SYMBOL[suits[i]]);
      slot.classList.add('found');
      if (isDest({ k: 'found', i })) slot.classList.add('dest');
      if (f.length && sameFrom(selected, { k: 'found', i })) slot.classList.add('sel');
      slot.addEventListener('click', () => {
        if (isDest({ k: 'found', i })) onDest({ k: 'found', i });
        else if (f.length) onSource({ k: 'found', i });
      });
      top.appendChild(slot);
    });
    wrap.appendChild(top);

    /* Colunas */
    const tab = document.createElement('div');
    tab.className = 'sol-tab';
    v.tableau.forEach((pile, i) => {
      const col = document.createElement('div');
      col.className = 'col';
      const dest = isDest({ k: 'tab', i });
      let offset = 0;
      if (!pile.length) {
        const s = slotEl('K');
        s.classList.add('empty');
        if (dest) s.classList.add('dest');
        col.appendChild(s);
      }
      pile.forEach((x, n) => {
        const cEl = x.up ? cardEl(x.c) : Object.assign(document.createElement('div'), { className: 'card down' });
        cEl.style.top = `calc(var(--ch) * ${offset})`;
        offset += x.up ? UP_STEP : DOWN_STEP;
        const last = n === pile.length - 1;
        if (x.up) {
          const from = { k: 'tab', i, n };
          if (selected && selected.k === 'tab' && selected.i === i && n >= selected.n) cEl.classList.add('sel');
          if (dest && last) cEl.classList.add('dest');
          cEl.addEventListener('click', () => (dest ? onDest({ k: 'tab', i }) : onSource(from)));
        } else if (dest) {
          cEl.addEventListener('click', () => onDest({ k: 'tab', i }));
        }
        col.appendChild(cEl);
      });
      if (!pile.length) col.addEventListener('click', () => dest && onDest({ k: 'tab', i }));
      col.style.height = `calc(var(--ch) * ${(pile.length ? offset - (pile[pile.length - 1].up ? UP_STEP : DOWN_STEP) : 0) + 1})`;
      tab.appendChild(col);
    });
    wrap.appendChild(tab);
    el.appendChild(wrap);

    /* Controles */
    if (seat === 0) {
      const bar = document.createElement('div');
      bar.className = 'sol-controls';
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'ghost';
      undo.textContent = 'Desfazer';
      undo.disabled = !v.canUndo || v.over;
      undo.addEventListener('click', () => { selected = null; send({ t: 'undo' }); });
      const mode = document.createElement('button');
      mode.type = 'button';
      mode.className = 'ghost';
      mode.textContent = `Compra: ${v.drawCount} carta${v.drawCount > 1 ? 's' : ''}`;
      mode.disabled = !v.canChangeMode;
      mode.title = v.canChangeMode ? 'Alterna entre comprar 1 ou 3 cartas' : 'Só pode mudar antes da primeira jogada';
      mode.addEventListener('click', () => send({ t: 'mode', draw: v.drawCount === 1 ? 3 : 1 }));
      bar.append(undo, mode);
      el.appendChild(bar);
    }

    if (v.over) return `Parabéns! Paciência concluída em ${v.moves} jogadas.`;
    if (seat === null) return `Você está assistindo. Jogadas: ${v.moves}.`;
    if (selected) return 'Toque na coluna ou na fundação de destino. Toque na carta de novo para desmarcar.';
    return v.legal.length ? `Jogadas: ${v.moves}. Toque numa carta para movê-la, ou no monte para comprar.` : `Jogadas: ${v.moves}. Sem jogadas na mesa: compre do monte${v.canUndo ? ' ou desfaça a última jogada' : ''}.`;
  }

  window.GameUI.paciencia = { render };
})();
