'use strict';
// Interface do Uno. Visao publica: room.view (mesa, contagem de cartas); visao privada: room.mine (sua mao).
// Intencoes enviadas: { t: 'start', manual? } | { t: 'play', card, color?, target? } | { t: 'draw' } | { t: 'pass' }
//                     | { t: 'accept' } | { t: 'challenge' } (resposta ao +4) | { t: 'uno' } | { t: 'catch' }

(function () {
  const K = window.GameKit;
  const COLOR_NAME = { R: 'vermelho', Y: 'amarelo', G: 'verde', B: 'azul' };
  const COLOR_LABEL = { R: 'Vermelho', Y: 'Amarelo', G: 'Verde', B: 'Azul' };
  // simbolos especiais explicados (valor da carta -> [letra do valor, simbolo], texto)
  const SPECIAL = [[['S', '⊘'], 'Pula a vez do próximo'], [['V', '⇄'], 'Inverte o sentido'], [['+', '+2/+4'], 'Próximo compra cartas'], [['C', '★'], 'Coringa: escolha a cor'], [['H', '⇆'], 'Trocar as Mãos']];
  let pendingWild = null; // carta coringa escolhida, aguardando a cor
  let pendingIdx = null; // posicao dessa carta na mao
  let chosen = null; // posicao (na mao) da carta comum selecionada, aguardando o botao Jogar
  let pendingColor = null; // cor escolhida para o Trocar as Maos, aguardando o jogador
  let seenVersion = null;

  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;
    if (room.version !== seenVersion) {
      seenVersion = room.version;
      pendingWild = null;
      pendingIdx = null;
      pendingColor = null;
      chosen = null;
    }

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'Uno',
        min: 2,
        max: 8,
        options: (n) => [
          { label: 'Começar (UNO automático)', payload: { t: 'start' }, enabled: n >= 2 },
          { label: 'Começar (UNO manual: gritar UNO!)', payload: { t: 'start', manual: true }, enabled: n >= 2 },
        ],
        rules: [
          'Jogue uma carta da mesma cor ou do mesmo número/símbolo da carta do topo.',
          'Sem carta jogável, compre uma; se ela servir, você pode jogá-la.',
          'Coringa +4: pode ser jogado a qualquer momento, mas quem o recebe pode desafiar. Desafio certo: quem jogou compra 4. Desafio errado: o desafiante compra 6.',
          'Coringa Trocar as Mãos: escolha a cor e um jogador; vocês trocam todas as cartas. Não pode ser a última carta.',
          'UNO automático: o aviso é feito pelo sistema. UNO manual: toque em UNO! ao ficar com 1 carta; se esquecer, outro jogador pode "Pegar" antes do próximo jogar (você compra 2).',
          'Não é permitido acumular +2 ou +4. Com 2 jogadores, Inverte vale como Pula.',
          'Pontuação: quem zera a mão soma as cartas dos outros (número = valor; +2, Inverte e Pula = 20; coringas = 50). Vence quem chegar a 500 pontos.',
        ],
      });
    }

    el.innerHTML = '';
    const wrap = K.el('div', 'mesa');

    // Modo tablet: a mesa inteira fica no tablet; o celular mostra so a carta do topo (para escolher) e a mao.
    if (!room.tableMode) wrap.append(
      K.playerList(room, v.turn, {
        extra: (p) => `${v.counts[p.seat]} carta${v.counts[p.seat] === 1 ? '' : 's'}${v.counts[p.seat] === 1 && (!v.manual || (v.uno && v.uno.shouted)) ? ' · UNO!' : ''} · ${v.scores[p.seat] || 0} pts`,
      })
    );

    const row = K.el('div', 'row2');
    const pile = K.el('div', 'uno back');
    pile.title = 'Monte';
    const pileBox = K.el('div');
    pileBox.append(pile, K.el('div', 'lbl', `Monte: ${v.drawCount}`));
    const topBox = K.el('div');
    if (v.top) topBox.append(K.unoCard(v.top));
    topBox.append(K.el('div', 'lbl', `Cor atual: ${COLOR_NAME[v.color]}`));
    const dirBox = K.el('div', 'lbl', v.dir === 1 ? '↻' : '↺');
    dirBox.style.fontSize = '1.8rem';
    if (room.tableMode) row.append(topBox);
    else row.append(pileBox, topBox, dirBox);
    wrap.append(row);
    // faixa com a cor atual
    const bar = K.el('div');
    bar.style.cssText = `height:6px;border-radius:3px;margin:4px auto;width:140px;background:${{ R: '#d23b3b', Y: '#e8b923', G: '#3a9d4f', B: '#3a6fd2' }[v.color]}`;
    wrap.append(bar);

    const who = (s) => room.players.find((p) => p.seat === s);
    if (v.log && !room.tableMode) {
      const actor = v.lastSeat !== null && v.lastSeat !== undefined && /jogou/.test(v.log) ? who(v.lastSeat) : null;
      wrap.append(K.el('div', 'logline', actor ? `${actor.name} ${v.log}` : v.log));
    }
    el.append(wrap);

    if (seat !== null && mine) {
      const myTurn = v.turn === seat && !v.over && !mine.mustRespond;
      const playable = new Set(mine.playable);
      const hand = K.el('div', `hand${mine.hand.length > 12 ? ' tight' : ''}`);
      mine.hand.forEach((card, idx) => {
        const ok = myTurn && playable.has(card);
        const isSel = chosen === idx || (pendingWild === card && pendingIdx === idx);
        const c = K.unoCard(card, { dim: myTurn && !ok, selected: isSel });
        const nm = c.getAttribute('aria-label');
        K.interactive(c, () => {
          if (!ok) return;
          if (card.startsWith('W-')) {
            const same = pendingWild === card && pendingIdx === idx;
            pendingWild = same ? null : card;
            pendingIdx = same ? null : idx;
            pendingColor = null;
            chosen = null;
            render(el, room, send);
            return;
          }
          chosen = chosen === idx ? null : idx;   // tocar de novo desmarca; jogar so pelo botao
          pendingWild = null;
          pendingIdx = null;
          render(el, room, send);
        }, { label: `${nm}${ok ? '' : ' (indisponível)'}`, pressed: isSel, disabled: !ok, key: `uno-${idx}` });
        hand.append(c);
      });
      el.append(hand);
      if (chosen !== null && mine.hand[chosen] && playable.has(mine.hand[chosen]) && myTurn) {
        const box = K.el('div', 'confirm');
        box.append(K.unoCard(mine.hand[chosen]));
        const go = K.el('button', null, 'Jogar esta carta');
        go.type = 'button';
        go.addEventListener('click', () => { const card = mine.hand[chosen]; chosen = null; send({ t: 'play', card }); });
        const no = K.el('button', 'ghost', 'Escolher outra');
        no.type = 'button';
        no.addEventListener('click', () => { chosen = null; render(el, room, send); });
        const side = K.el('div', 'confirm-btns');
        side.append(go, no);
        box.append(side);
        el.append(box);
      }
      const specials = SPECIAL.filter(([sym]) => mine.hand.some((c) => String(c.split('-')[1]).startsWith(sym[0])));
      if (specials.length) el.append(K.el('div', 'legend', specials.map(([sym, txt]) => `${sym[1]} ${txt}`).join(' · ')));

      if (pendingWild && pendingColor === null) {
        const picker = K.el('div', 'colors');
        for (const c of ['R', 'Y', 'G', 'B']) {
          const b = K.el('button', c.toLowerCase(), COLOR_LABEL[c]);
          b.type = 'button';
          b.setAttribute('aria-label', COLOR_NAME[c]);
          b.addEventListener('click', () => {
            const card = pendingWild;
            if (card === 'W-H') {                       // Trocar as Maos: falta escolher o jogador
              pendingColor = c;
              render(el, room, send);
              return;
            }
            pendingWild = null;
            send({ t: 'play', card, color: c });
          });
          picker.append(b);
        }
        el.append(K.el('div', 'logline', card_hint(pendingWild)), picker);
      }
      if (pendingWild === 'W-H' && pendingColor !== null) {
        el.append(K.el('div', 'logline', 'Com quem você quer trocar de mão?'));
        const box = K.el('div', 'ctrls');
        for (const p of room.players) {
          if (p.seat === seat || p.seat >= v.players) continue;
          const b = K.el('button', null, `${p.name} (${v.counts[p.seat]})`);
          b.type = 'button';
          b.addEventListener('click', () => {
            const card = pendingWild;
            const color = pendingColor;
            pendingWild = null;
            pendingColor = null;
            send({ t: 'play', card, color, target: p.seat });
          });
          box.append(b);
        }
        const cancel = K.el('button', 'ghost', 'Cancelar');
        cancel.type = 'button';
        cancel.addEventListener('click', () => { pendingWild = null; pendingColor = null; render(el, room, send); });
        box.append(cancel);
        el.append(box);
      }

      if (mine.mustRespond) {
        const by = who(v.pending.by);
        el.append(K.el('div', 'logline', `${by ? by.name : 'Alguém'} jogou +4 em você. Aceitar (comprar 4) ou desafiar?`));
        const box = K.el('div', 'ctrls');
        const acc = K.el('button', null, 'Aceitar (comprar 4)');
        acc.type = 'button';
        acc.addEventListener('click', () => send({ t: 'accept' }));
        const chal = K.el('button', 'ghost', 'Desafiar!');
        chal.type = 'button';
        chal.addEventListener('click', () => send({ t: 'challenge' }));
        box.append(acc, chal);
        el.append(box);
      }
      if (mine.canUno || mine.canCatch) {
        const box = K.el('div', 'ctrls');
        const b = K.el('button', null, mine.canUno ? 'UNO!' : `Pegar! ${who(v.uno.seat) ? who(v.uno.seat).name : ''} esqueceu o UNO`);
        b.type = 'button';
        b.addEventListener('click', () => send({ t: mine.canUno ? 'uno' : 'catch' }));
        box.append(b);
        el.append(box);
      }

      const ctrls = K.el('div', 'ctrls');
      const draw = K.el('button', null, 'Comprar');
      draw.type = 'button';
      draw.disabled = !mine.canDraw;
      draw.addEventListener('click', () => send({ t: 'draw' }));
      const pass = K.el('button', 'ghost', 'Passar');
      pass.type = 'button';
      pass.disabled = !mine.canPass;
      pass.addEventListener('click', () => send({ t: 'pass' }));
      ctrls.append(draw, pass);
      el.append(ctrls);
    }

    if (v.over) {
      const w = who(v.winner) ? who(v.winner).name : 'Alguém';
      const board = room.players.map((p) => `${p.name} ${v.scores[p.seat] || 0}`).join(' · ');
      if (v.gameWinner !== null) return `${who(v.gameWinner) ? who(v.gameWinner).name : 'Alguém'} chegou a ${v.target} pontos e venceu o jogo! (${board}) "Nova partida" zera o placar.`;
      return `${w} zerou a mão e fez ${v.roundPoints} pontos. Placar: ${board}. "Nova partida" joga a próxima rodada.`;
    }
    if (v.pending) {
      const victim = who(v.pending.victim);
      if (mine && mine.mustRespond) return 'Responda ao +4: aceitar ou desafiar.';
      return `Aguardando ${victim ? victim.name : 'o jogador'} responder ao +4.`;
    }
    if (seat === null) return `Você está assistindo. Vez de ${who(v.turn) ? who(v.turn).name : ''}.`;
    if (v.turn === seat) return mine && mine.canPass ? 'Sua vez: jogue a carta comprada ou passe.' : mine && mine.playable.length ? 'Sua vez: toque numa carta e confirme (ou compre).' : 'Sua vez: você não tem carta que sirva, compre.';
    return `Vez de ${who(v.turn) ? who(v.turn).name : ''}.`;
  }

  function card_hint(card) {
    return card === 'W-H' ? 'Trocar as Mãos: escolha a nova cor.' : card === 'W-+4' ? 'Coringa +4: escolha a nova cor (o próximo jogador pode desafiar).' : 'Escolha a nova cor:';
  }

  window.GameUI.uno = { render };
})();
