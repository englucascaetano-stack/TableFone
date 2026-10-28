'use strict';
// Interface do Scrabble. Toque numa peca do cavalete e depois numa casa vazia para coloca-la; toque numa peca colocada
// por voce (ainda nao jogada) para devolve-la. A validacao das palavras e feita no servidor.
// Intencoes: { t:'start' } | { t:'play', tiles:[{r,c,ch,as?}] } | { t:'exchange', tiles:[letras] } | { t:'pass' }

(function () {
  const K = window.GameKit;
  const LETTERS = 'abcdefghijlmnopqrstuvxzç'.split('');
  const PREM_LABEL = { TW: 'PT', DW: 'PD', TL: 'LT', DL: 'LD' };
  let placed = []; // [{ r, c, ch, as?, from }] pecas colocadas neste turno (from = indice no cavalete)
  let sel = null; // indice do cavalete selecionado
  let order = null; // ordem local do cavalete (embaralhar)
  let askBlank = null; // indice do coringa aguardando a letra
  let zoomed = false; // tabuleiro ampliado (rolagem lateral)
  let exchangeMode = false;
  let marked = new Set(); // indices marcados para troca
  let seenVersion = null;

  const up = (s) => String(s).toUpperCase();

  function tileEl(ch, value, cls) {
    const t = K.el('span', `sc-t${cls ? ` ${cls}` : ''}`);
    t.append(K.el('b', null, ch === '?' ? '' : up(ch)));
    if (value !== undefined && value !== null && ch !== '?') t.append(K.el('small', null, String(value)));
    return t;
  }

  function boardEl(v, room, canPlace, onCell, onTake) {
    const grid = K.el('div', 'sc-board');
    const lastCells = new Set(v.last && v.last.cells ? v.last.cells.map(([r, c]) => r * 15 + c) : []);
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const cell = v.board[r][c];
        const mine = placed.find((p) => p.r === r && p.c === c);
        const prem = v.premium[r][c];
        const b = K.el('button', `sc-c${prem ? ` p-${prem}` : ''}${r === 7 && c === 7 ? ' center' : ''}${cell ? ' has' : ''}${lastCells.has(r * 15 + c) ? ' last' : ''}`);
        b.type = 'button';
        if (cell) {
          b.append(tileEl(cell.l, cell.blank ? 0 : v.values[cell.l], cell.blank ? 'blank' : ''));
          b.disabled = true;
        } else if (mine) {
          const letter = mine.ch === '?' ? mine.as : mine.ch;
          b.append(tileEl(letter, mine.ch === '?' ? 0 : v.values[letter], `new${mine.ch === '?' ? ' blank' : ''}`));
          b.disabled = !canPlace;
          b.addEventListener('click', () => onTake(r, c));
        } else {
          if (prem) b.append(K.el('i', null, r === 7 && c === 7 ? '★' : PREM_LABEL[prem]));
          b.disabled = !canPlace || sel === null;
          b.addEventListener('click', () => onCell(r, c));
        }
        grid.append(b);
      }
    }
    return grid;
  }

  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'Scrabble',
        min: 2,
        max: 4,
        rules: [
          'Cada jogador tem 7 peças. A primeira palavra passa pela casa central (★); depois, toda jogada se liga às palavras já postas.',
          'Coloque as peças em uma só linha ou coluna. Todas as palavras formadas (inclusive as cruzadas) precisam existir no dicionário; o servidor confere sozinho. Acentos são ignorados; o Ç é uma peça.',
          'Casas LD/LT dobram/triplicam a letra e PD/PT dobram/triplicam a palavra, só para peças postas na jogada. O coringa vale 0 e vira a letra que você escolher.',
          'Usar as 7 peças de uma vez dá 50 pontos extras. Você pode passar ou trocar peças (com 7 ou mais no saco).',
          'A partida acaba quando o saco esvazia e alguém fica sem peças, ou após 6 jogadas seguidas sem pontuar.',
        ],
      });
    }

    const rack = mine ? mine.rack : [];
    if (room.version !== seenVersion) {
      seenVersion = room.version;
      placed = [];
      sel = null;
      order = null;
      askBlank = null;
      exchangeMode = false;
      marked = new Set();
    }
    if (!order || order.length !== rack.length) order = rack.map((_, i) => i);
    el.innerHTML = '';
    const inGame = seat !== null && seat < v.players && Boolean(mine);
    const myTurn = inGame && v.turn === seat && !v.over;
    const nameOf = (s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;
    const wrap = K.el('div', 'mesa sc-wrap');
    const redraw = () => render(el, room, send);
    const usedFrom = new Set(placed.map((p) => p.from));

    /* placar */
    const score = K.el('div', 'sc-score');
    for (let i = 0; i < v.players; i++) {
      const row = K.el('div', `sc-pl${v.turn === i ? ' turn' : ''}${i === seat ? ' me' : ''}`);
      row.append(K.el('b', null, nameOf(i) + (i === seat ? ' (você)' : '')), K.el('span', 'sc-pts', `${v.scores[i]}`), K.el('small', null, `${v.counts[i]} peças`));
      score.append(row);
    }
    wrap.append(score);
    wrap.append(K.el('div', 'sc-info', `Saco: ${v.bagCount} peças${v.scoreless ? ` · ${v.scoreless} sem pontuar (fim em 6)` : ''}`));

    const zoomBtn = K.el('button', 'ghost sc-zoom', zoomed ? 'Reduzir tabuleiro' : 'Ampliar tabuleiro');
    zoomBtn.type = 'button';
    zoomBtn.addEventListener('click', () => { zoomed = !zoomed; redraw(); });
    wrap.append(zoomBtn);
    const scroller = K.el('div', `sc-scroll${zoomed ? ' zoomed' : ''}`);
    scroller.append(boardEl(
      v, room, myTurn && !askBlank && !exchangeMode,
      (r, c) => {
        if (sel === null) return;
        const ch = rack[order[sel]];
        if (ch === '?') { askBlank = { r, c, from: order[sel] }; redraw(); return; }
        placed.push({ r, c, ch, from: order[sel] });
        sel = null;
        redraw();
      },
      (r, c) => { placed = placed.filter((p) => !(p.r === r && p.c === c)); redraw(); }
    ));
    wrap.append(scroller);

    if (v.log) wrap.append(K.el('div', 'logline', v.log));
    if (v.last && v.last.kind === 'play') {
      wrap.append(K.el('div', 'sc-last', `Última: ${nameOf(v.last.seat)} fez ${v.last.total} (${v.last.words.map((w) => `${w.word} ${w.points}`).join(' · ')})${v.last.bingo ? ' + bingo 50' : ''}`));
    }

    /* escolha da letra do coringa */
    if (askBlank) {
      const box = K.el('div', 'sc-box');
      box.append(K.el('b', null, 'Qual letra o coringa representa?'));
      const row = K.el('div', 'sc-letters');
      for (const l of LETTERS) {
        const b = K.el('button', 'ghost', up(l));
        b.type = 'button';
        b.addEventListener('click', () => {
          placed.push({ r: askBlank.r, c: askBlank.c, ch: '?', as: l, from: askBlank.from });
          askBlank = null;
          sel = null;
          redraw();
        });
        row.append(b);
      }
      const cancel = K.el('button', 'ghost', 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', () => { askBlank = null; redraw(); });
      box.append(row, cancel);
      wrap.append(box);
    }

    /* cavalete e acoes */
    if (inGame && !v.over) {
      const me = K.el('div', 'sc-me');
      const rackEl = K.el('div', 'sc-rack');
      order.forEach((idx, pos) => {
        if (usedFrom.has(idx)) { rackEl.append(K.el('span', 'sc-slot')); return; }
        const ch = rack[idx];
        const b = K.el('button', `sc-rt${sel === pos && !exchangeMode ? ' sel' : ''}${marked.has(idx) ? ' mark' : ''}`);
        b.type = 'button';
        b.append(tileEl(ch, v.values[ch]));
        b.disabled = !myTurn || Boolean(askBlank);
        b.addEventListener('click', () => {
          if (exchangeMode) { if (marked.has(idx)) marked.delete(idx); else marked.add(idx); } else sel = sel === pos ? null : pos;
          redraw();
        });
        rackEl.append(b);
      });
      me.append(rackEl);
      if (myTurn) {
        const act = K.el('div', 'sc-actions');
        const btn = (label, fn, opts = {}) => {
          const b = K.el('button', opts.cls || null, label);
          b.type = 'button';
          b.disabled = Boolean(opts.disabled);
          b.addEventListener('click', fn);
          act.append(b);
        };
        if (!exchangeMode) {
          btn('Jogar', () => send({ t: 'play', tiles: placed.map((p) => ({ r: p.r, c: p.c, ch: p.ch, as: p.as })) }), { disabled: !placed.length });
          btn('Recolher', () => { placed = []; sel = null; redraw(); }, { cls: 'ghost', disabled: !placed.length });
          btn('Embaralhar', () => { order = order.slice().sort(() => Math.random() - 0.5); sel = null; redraw(); }, { cls: 'ghost' });
          btn('Trocar peças', () => { exchangeMode = true; placed = []; sel = null; redraw(); }, { cls: 'ghost', disabled: !mine.canExchange });
          btn('Passar', () => send({ t: 'pass' }), { cls: 'ghost' });
        } else {
          btn(`Trocar ${marked.size} peça${marked.size === 1 ? '' : 's'}`, () => send({ t: 'exchange', tiles: [...marked].map((i) => rack[i]) }), { disabled: !marked.size });
          btn('Cancelar', () => { exchangeMode = false; marked = new Set(); redraw(); }, { cls: 'ghost' });
        }
        me.append(act);
      }
      wrap.append(me);
    }

    if (v.over && v.endBonus) {
      const box = K.el('div', 'sc-final');
      for (let i = 0; i < v.players; i++) {
        const b = v.endBonus[i];
        box.append(K.el('div', null, `${nameOf(i)}: ${v.scores[i]} pts (${b >= 0 ? '+' : ''}${b} das peças restantes)`));
      }
      wrap.append(box);
    }
    el.append(wrap);

    if (v.over) {
      const names = v.winners.map(nameOf).join(' e ');
      return v.winners.length > 1 ? `Empate: ${names}. "Nova partida" joga outra.` : `${names} venceu! "Nova partida" joga outra.`;
    }
    if (!inGame) return `Você está assistindo. Vez de ${nameOf(v.turn)}.`;
    if (!myTurn) return `Vez de ${nameOf(v.turn)}.`;
    if (exchangeMode) return 'Toque nas peças que quer trocar e confirme.';
    if (askBlank) return 'Escolha a letra do coringa.';
    if (!placed.length) return sel === null ? 'Sua vez: toque numa peça do cavalete e depois numa casa do tabuleiro.' : 'Agora toque numa casa vazia do tabuleiro.';
    return `${placed.length} peça${placed.length === 1 ? '' : 's'} no tabuleiro. Toque em Jogar para confirmar.`;
  }

  window.GameUI.scrabble = { render };
})();
