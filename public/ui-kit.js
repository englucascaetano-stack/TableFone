'use strict';
// Pecas de interface compartilhadas pelos jogos de varios jogadores:
// lobby (lista de quem entrou e botao Comecar), lista de jogadores e cartas do baralho.

window.GameKit = (function () {
  const SUIT = { S: '♠︎', H: '♥︎', D: '♦︎', C: '♣︎' };
  const SUIT_NAME = { S: 'espadas', H: 'copas', D: 'ouros', C: 'paus' };
  const RANK = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Carta do baralho frances. Formatos: "7H", "10D", "AS", "KC", "JK" (coringa).
  function playingCard(card, opts = {}) {
    const c = el('div', `pc${opts.selected ? ' sel' : ''}${opts.small ? ' small' : ''}${opts.dim ? ' dim' : ''}`);
    if (opts.down) {
      c.classList.add('down');
      return c;
    }
    if (card === 'JK') {
      c.classList.add('joker');
      c.append(el('span', 'rk', '★'), el('span', 'st', 'C'));
      c.setAttribute('aria-label', 'Coringa');
      return c;
    }
    const suit = card.slice(-1);
    const rankText = card.slice(0, -1);
    const red = suit === 'H' || suit === 'D';
    c.classList.add(red ? 'red' : 'black');
    const label = RANK[rankText] || rankText;
    c.append(el('span', 'rk', label), el('span', 'st', SUIT[suit]));
    c.setAttribute('aria-label', `${label} de ${SUIT_NAME[suit]}`);
    return c;
  }

  const UNO_COLOR = { R: 'r', Y: 'y', G: 'g', B: 'b', W: 'w' };
  const UNO_LABEL = { S: '⊘', V: '⇄', '+2': '+2', '+4': '+4', C: '★', H: '⇆' };

  // Carta do Uno: "R-5", "G-S", "B-V", "Y-+2", "W-C", "W-+4".
  function unoCard(card, opts = {}) {
    const [color, value] = card.split('-');
    const c = el('div', `uno ${UNO_COLOR[color]}${opts.selected ? ' sel' : ''}${opts.dim ? ' dim' : ''}${opts.small ? ' small' : ''}`);
    c.append(el('span', 'uv', UNO_LABEL[value] || value));
    c.setAttribute('aria-label', `${{ R: 'vermelho', Y: 'amarelo', G: 'verde', B: 'azul', W: 'coringa' }[color]} ${UNO_LABEL[value] || value}`);
    return c;
  }

  // Lista de jogadores. opts.extra(player) -> texto; opts.teamOf(seat) -> 0/1 para colorir equipes.
  function playerList(room, turnSeat, opts = {}) {
    const box = el('div', 'plist');
    const mySeat = room.you.seat;
    for (const p of room.players) {
      const row = el('div', `pl${p.seat === turnSeat ? ' turn' : ''}${p.seat === mySeat ? ' me' : ''}`);
      if (opts.teamOf) row.classList.add(`team${opts.teamOf(p.seat)}`);
      row.append(el('span', `dot${p.online ? ' on' : ''}`), el('span', 'nm', p.name + (p.seat === mySeat ? ' (você)' : '')));
      if (opts.host && p.seat === 0) row.append(el('span', 'ex', 'anfitrião'));
      const extra = opts.extra ? opts.extra(p) : '';
      if (extra) row.append(el('span', 'ex', extra));
      box.append(row);
    }
    return box;
  }

  // Tela de espera antes de comecar. cfg: { title, rules: [texto], min, max, allowed(n) }
  function lobby(container, room, send, cfg) {
    container.innerHTML = '';
    const n = room.players.length;
    const box = el('div', 'lobby');
    box.append(el('h2', null, cfg.title));
    box.append(playerList(room, null, { host: true }));
    const ok = cfg.options ? n >= cfg.min : cfg.allowed ? cfg.allowed(n) : n >= cfg.min;
    const host = room.players.find((p) => p.seat === 0);
    let msg;
    if (n < cfg.min) msg = `Faltam ${cfg.min - n} jogador${cfg.min - n > 1 ? 'es' : ''} para começar (mínimo ${cfg.min}).`;
    else if (!ok) msg = cfg.badCount || `Número de jogadores não permitido (${n}).`;
    else msg = host && room.you.seat === 0 ? 'Todos prontos. Toque para começar.' : 'Pronto para começar.';
    const code = el('div', 'lobby-code');
    code.append(el('small', null, 'Código da sala'), el('b', null, room.code));
    box.append(code);
    box.append(el('p', 'lobby-count', `${n} de ${cfg.max} jogadores`));
    box.append(el('p', 'muted', msg));
    if (room.you.seat === 0) {
      // cfg.options: varias formas de comecar (ex.: 2 ou 4 jogadores); senao, um unico botao.
      const options = cfg.options ? cfg.options(n) : [{ label: 'Começar', payload: { t: 'start' }, enabled: ok }];
      for (const o of options) {
        const b = el('button', null, o.label);
        b.type = 'button';
        b.disabled = !o.enabled;
        b.addEventListener('click', () => send(o.payload));
        box.append(b);
      }
    } else if (room.you.seat !== null) {
      box.append(el('p', 'muted', `Aguardando ${host ? host.name : 'o anfitrião'} começar a partida.`));
    } else {
      box.append(el('p', 'muted', 'Você está assistindo.'));
    }
    if (cfg.rules && cfg.rules.length) {
      const ul = el('ul', 'rules');
      for (const r of cfg.rules) ul.append(el('li', null, r));
      box.append(ul);
    }
    container.append(box);
    return `Máximo de ${cfg.max} jogadores.`;
  }

  // Torna um elemento (carta) operavel por toque, teclado (Enter/Espaco) e leitor de tela.
  // opts: { label, pressed, disabled }. Cartas so de exposicao nao devem usar isto.
  function interactive(node, onClick, opts = {}) {
    node.setAttribute('role', 'button');
    node.tabIndex = opts.disabled ? -1 : 0;
    if (opts.label) node.setAttribute('aria-label', opts.label);
    if (opts.pressed !== undefined) node.setAttribute('aria-pressed', String(Boolean(opts.pressed)));
    if (opts.disabled) node.setAttribute('aria-disabled', 'true');
    if (opts.key) node.dataset.fkey = opts.key;
    // A interface se redesenha a cada mudanca: ao operar pelo teclado, devolve o foco ao elemento equivalente do novo desenho.
    const run = (e) => {
      if (opts.disabled) return;
      onClick(e);
      if (e.type === 'keydown' && opts.key) {
        const again = document.querySelector(`[data-fkey="${opts.key}"]`);
        if (again && again !== node) again.focus();
      }
    };
    node.addEventListener('click', run);
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(e); }
    });
    return node;
  }

  // Faixa de confirmacao de jogada: previa ampliada da carta + botao principal + "escolher outra".
  function confirmBar({ preview, label, cancelLabel, onConfirm, onCancel, note }) {
    const box = el('div', 'confirm');
    if (preview) box.append(preview);
    const side = el('div', 'confirm-btns');
    const go = el('button', null, label);
    go.type = 'button';
    go.addEventListener('click', onConfirm);
    const no = el('button', 'ghost', cancelLabel || 'Escolher outra');
    no.type = 'button';
    no.addEventListener('click', onCancel);
    if (note) side.append(el('small', 'muted', note));
    side.append(go, no);
    box.append(side);
    return box;
  }

  return { el, interactive, confirmBar, playingCard, unoCard, playerList, lobby, SUIT, SUIT_NAME };
})();
