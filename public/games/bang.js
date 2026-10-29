'use strict';
// Interface do BANG! (cartas). Toque numa carta da sua mao para escolhe-la; se ela precisa de alvo, toque no jogador.
// Intencoes: start | draw{src} | play{card,target?,pick?} | sid{cards} | discard{card} | end
//            respostas: missed{card} | bang{card} | barrel | pass | pick{card} | kitPut{card} | beer{card} | giveup

(function () {
  const K = window.GameKit;
  const NAME = {
    bang: 'BANG!', missed: 'Errou!', beer: 'Cerveja', saloon: 'Saloon', stagecoach: 'Diligência', wells: 'Wells Fargo',
    store: 'Armazém', gatling: 'Gatling', indians: 'Índios!', duel: 'Duelo', panic: 'Pânico!', balou: 'Cat Balou',
    barrel: 'Barril', dynamite: 'Dinamite', jail: 'Cadeia', mustang: 'Mustang', scope: 'Mira',
    schofield: 'Schofield', remington: 'Remington', carabine: 'Carabina', winchester: 'Winchester', volcanic: 'Volcanic',
  };
  const BLUE = ['barrel', 'dynamite', 'jail', 'mustang', 'scope', 'schofield', 'remington', 'carabine', 'winchester', 'volcanic'];
  const DESC = {
    bang: 'Tira 1 vida de um jogador ao alcance, se ele não responder com Errou!.', missed: 'Cancela um BANG!.',
    beer: 'Recupera 1 vida (não vale com 2 jogadores).', saloon: 'Todos recuperam 1 vida.', stagecoach: 'Compre 2 cartas.',
    wells: 'Compre 3 cartas.', store: 'Cada jogador, na ordem, pega uma das cartas reveladas.', gatling: 'BANG! em todos os outros.',
    indians: 'Todos os outros descartam um BANG! ou perdem 1 vida.', duel: 'Alvo e você descartam BANG! em turnos; quem falhar perde 1 vida.',
    panic: 'Pegue uma carta de quem está a distância 1.', balou: 'Faça um jogador descartar uma carta (mão ou mesa).',
    barrel: 'Ao ser atacado, sorteie: copas conta como Errou!.', dynamite: 'No início do seu turno: espadas 2-9 explode (3 de dano); senão passa adiante.',
    jail: 'Preso: no seu turno, sorteie; só copas liberta, senão perde a vez.', mustang: 'Os outros o veem a +1 de distância.',
    scope: 'Você vê os outros a -1 de distância.', schofield: 'Arma: alcance 2.', remington: 'Arma: alcance 3.',
    carabine: 'Arma: alcance 4.', winchester: 'Arma: alcance 5.', volcanic: 'Arma: alcance 1, BANG! ilimitados.',
  };
  const CHAR = {
    bart: ['Bart Cassidy', 'Compra 1 carta cada vez que perde 1 vida.'], blackjack: ['Black Jack', 'Ao comprar, mostra a 2ª carta; se for de copas ou ouros, compra mais 1.'],
    janet: ['Calamity Janet', 'Usa BANG! como Errou! e Errou! como BANG!.'], gringo: ['El Gringo', 'Quando um jogador lhe tira vida, pega 1 carta da mão dele.'],
    jesse: ['Jesse Jones', 'Pode comprar a 1ª carta da mão de outro jogador.'], jourdonnais: ['Jourdonnais', 'Tem um Barril permanente.'],
    kit: ['Kit Carlson', 'Vê 3 cartas, fica com 2 e devolve 1 ao topo.'], lucky: ['Lucky Duke', 'Nos sorteios, revela 2 cartas e escolhe qual vale.'],
    paul: ['Paul Regret', 'Mustang permanente.'], pedro: ['Pedro Ramirez', 'Pode comprar a 1ª carta do descarte.'],
    rose: ['Rose Doolan', 'Mira permanente.'], sid: ['Sid Ketchum', 'Descarta 2 cartas para recuperar 1 vida.'],
    slab: ['Slab the Killer', 'Os BANG! dele exigem 2 Errou!.'], suzy: ['Suzy Lafayette', 'Quando ficar sem cartas na mão, compra 1.'],
    vulture: ['Vulture Sam', 'Fica com as cartas dos eliminados.'], willy: ['Willy the Kid', 'Pode jogar quantos BANG! quiser.'],
  };
  const ROLE = { sheriff: 'Xerife', deputy: 'Delegado', outlaw: 'Fora-da-lei', renegade: 'Renegado' };
  const ROLE_GOAL = {
    sheriff: 'Elimine os Fora-da-lei e o Renegado.', deputy: 'Proteja o Xerife e ajude a eliminar Fora-da-lei e Renegado.',
    outlaw: 'Elimine o Xerife.', renegade: 'Seja o último vivo: elimine todos, deixando o Xerife para o fim.',
  };
  const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const rk = (r) => RANK[r] || String(r);

  let sel = null;       // { id } carta escolhida da mao
  let pickFor = null;   // alvo para Panico!/Cat Balou aguardando a escolha da carta
  let sidMode = null;   // cartas escolhidas para o Sid
  let seenVersion = null;
  let showRole = true;

  function cardEl(c, opts = {}) {
    const b = K.el(opts.onClick ? 'button' : 'div', `bg-card ${BLUE.includes(c.type) ? 'blue' : ''}${opts.sel ? ' sel' : ''}${opts.dim ? ' dim' : ''}${opts.small ? ' small' : ''}`);
    if (opts.onClick) { b.type = 'button'; b.addEventListener('click', opts.onClick); }
    b.append(K.el('span', 'bn', NAME[c.type]), K.el('span', `bs ${c.suit === 'H' || c.suit === 'D' ? 'red' : ''}`, `${rk(c.rank)}${SUIT[c.suit]}`));
    b.title = DESC[c.type] || '';
    if (c.id !== undefined) b.dataset.mk = `bg${c.id}`;
    return b;
  }

  function render(el, room, send) {
    const v = room.view;
    const mine = room.mine;
    const seat = room.you.seat;

    if (v.phase === 'lobby') {
      return K.lobby(el, room, send, {
        title: 'BANG!',
        min: 4,
        max: 7,
        rules: [
          'Papéis secretos: Xerife (revelado), Delegados, Fora-da-lei e Renegado. Cada jogador recebe 2 personagens diferentes (nunca repetidos na mesa) e escolhe 1; o outro serve de marcador de vida.',
          'Xerife e Delegados vencem eliminando Fora-da-lei e Renegado. Fora-da-lei vencem se o Xerife morrer. O Renegado quer ser o último vivo.',
          'No turno: compre 2 cartas, jogue quantas puder (só 1 BANG! por turno) e descarte até ter tantas cartas quanto pontos de vida.',
          'Distância e alcance contam: o BANG! alcança 1 casa; armas, Mira e Mustang mudam isso. Cartas azuis ficam na mesa.',
          'Quem elimina um Fora-da-lei compra 3 cartas. O Xerife que elimina um Delegado perde todas as cartas.',
          'Naipes e valores das cartas têm distribuição própria; afetam só Barril, Dinamite, Cadeia e Lucky Duke (que revela 2 cartas e escolhe qual vale).',
        ],
      });
    }

    if (v.phase === 'pick') {
      el.innerHTML = '';
      const nm = (s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;
      const box = K.el('div', 'mesa bg-wrap bg-pick');
      const done = v.picked.filter(Boolean).length;
      box.append(K.el('h3', null, 'Escolha do personagem'));
      if (mine && mine.mode === 'pick') {
        box.append(K.el('p', 'muted', `Seu papel (secreto): ${ROLE[mine.role]}. ${ROLE_GOAL[mine.role]}`));
        if (mine.picked === null) {
          box.append(K.el('p', null, 'Escolha um dos dois personagens. O outro fica de lado, virado para baixo, como marcador de vida.'));
          mine.offer.forEach((id, k) => {
            const card = K.el('div', 'bg-char');
            card.append(K.el('b', null, CHAR[id][0]), K.el('span', 'muted', `${mine.offerHp[k]} vidas${mine.role === 'sheriff' ? ' (Xerife +1)' : ''}`), K.el('p', null, CHAR[id][1]));
            const b = K.el('button', null, `Ficar com ${CHAR[id][0]}`);
            b.type = 'button';
            b.addEventListener('click', () => send({ t: 'charPick', char: id }));
            card.append(b);
            box.append(card);
          });
        } else {
          box.append(K.el('p', null, `Você escolheu ${CHAR[mine.picked][0]}. Aguardando os outros.`));
        }
      } else {
        box.append(K.el('p', 'muted', 'Os jogadores estão escolhendo seus personagens.'));
      }
      const list = K.el('div', 'plist');
      for (let i = 0; i < v.players; i++) list.append(K.el('div', 'pl', `${nm(i)}: ${v.picked[i] ? 'escolheu' : 'escolhendo...'}`));
      box.append(list);
      el.append(box);
      return `${done} de ${v.players} escolheram. O Xerife é ${nm(v.sheriff)}.`;
    }

    if (room.version !== seenVersion) {
      seenVersion = room.version;
      sel = null; pickFor = null; sidMode = null;
    }
    el.innerHTML = '';
    const nameOf = (s) => (room.players.find((p) => p.seat === s) || { name: `Jogador ${s + 1}` }).name;
    const fill = (t) => String(t).replace(/@(\d)/g, (_, d) => nameOf(Number(d)));
    const inGame = seat !== null && seat < v.players && mine;
    const wrap = K.el('div', 'mesa bg-wrap');
    const redraw = () => render(el, room, send);

    /* mesa */
    // Modo tablet: baralho, descarte, cartas azuis dos outros e historico ficam no tablet.
    if (!room.tableMode) {
      const top = K.el('div', 'bg-top');
      const deckEl = K.el('span', null, `Baralho: ${v.deck}`);
      deckEl.dataset.pile = '1';
      top.append(deckEl);
      const disc = K.el('span', 'bg-disc', 'Descarte: ');
      disc.append(v.top ? cardEl(v.top, { small: true }) : K.el('span', null, 'vazio'));
      top.append(disc);
      wrap.append(top);
    }

    /* jogadores */
    const order = [];
    if (inGame) for (let k = 0; k < v.players; k++) order.push((seat + k) % v.players);
    else for (let k = 0; k < v.players; k++) order.push(k);
    const targets = sel && sel.targets ? sel.targets : [];
    const players = K.el('div', 'bg-players');
    for (const i of order) {
      const p = v.seats[i];
      const isTarget = targets.includes(i) && !pickFor;
      const box = K.el('div', `bg-p${p.alive ? '' : ' dead'}${v.turn === i ? ' turn' : ''}${i === seat ? ' me' : ''}${isTarget ? ' target' : ''}`);
      const head = K.el('div', 'bg-ph');
      head.append(K.el('b', null, nameOf(i) + (i === seat ? ' (você)' : '')), K.el('span', 'bg-role', p.role ? ROLE[p.role] : '?'));
      box.append(head);
      box.append(K.el('div', 'bg-char', `${CHAR[p.char] ? CHAR[p.char][0] : ''}`));
      const hp = K.el('div', 'bg-hp');
      for (let h = 0; h < p.max; h++) hp.append(K.el('span', h < p.hp ? 'on' : 'off', '●'));
      hp.append(K.el('small', null, ` ${p.hand} carta${p.hand === 1 ? '' : 's'} · alcance ${p.range}${inGame && mine.dist[i] ? ` · dist. ${mine.dist[i]}` : ''}`));
      box.append(hp);
      if (p.table.length && (!room.tableMode || i === seat)) {
        const tb = K.el('div', 'bg-table');
        p.table.forEach((c) => tb.append(cardEl(c, { small: true })));
        box.append(tb);
      }
      if (isTarget) {
        box.addEventListener('click', () => {
          const c = sel;
          if (c.pick) { pickFor = i; redraw(); return; }
          sel = null;
          send({ t: 'play', card: c.id, target: i });
        });
      }
      players.append(box);
    }
    wrap.append(players);

    /* escolha da carta para Panico!/Cat Balou */
    if (pickFor !== null && sel) {
      const t = v.seats[pickFor];
      const box = K.el('div', 'bg-pick');
      box.append(K.el('div', 'lbl', `Escolha a carta de ${nameOf(pickFor)}:`));
      const row = K.el('div', 'bg-row');
      if (t.hand) {
        const b = K.el('button', 'ghost', `Da mão (${t.hand}, aleatória)`);
        b.type = 'button';
        b.addEventListener('click', () => { const c = sel; const tg = pickFor; sel = null; pickFor = null; send({ t: 'play', card: c.id, target: tg, pick: 'hand' }); });
        row.append(b);
      }
      t.table.forEach((c) => row.append(cardEl(c, { onClick: () => { const cc = sel; const tg = pickFor; sel = null; pickFor = null; send({ t: 'play', card: cc.id, target: tg, pick: c.id }); } })));
      const cancel = K.el('button', 'ghost', 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', () => { pickFor = null; sel = null; redraw(); });
      row.append(cancel);
      box.append(row);
      wrap.append(box);
    }

    /* log */
    if (v.log.length && !room.tableMode) {
      const lg = K.el('div', 'bg-log');
      v.log.slice(-6).forEach((l) => lg.append(K.el('div', null, fill(l))));
      wrap.append(lg);
    }

    /* painel do jogador */
    if (inGame && mine.alive) {
      const me = K.el('div', 'bg-me');
      const roleLine = K.el('div', 'bg-rolebox');
      const toggle = K.el('button', 'ghost', showRole ? 'Esconder meu papel' : 'Mostrar meu papel');
      toggle.type = 'button';
      toggle.addEventListener('click', () => { showRole = !showRole; redraw(); });
      roleLine.append(toggle);
      if (showRole) {
        roleLine.append(K.el('div', null, `Papel: ${ROLE[mine.role]}. ${ROLE_GOAL[mine.role]}`));
        roleLine.append(K.el('div', null, `${CHAR[mine.char][0]}: ${CHAR[mine.char][1]}`));
      }
      me.append(roleLine);

      const ctrls = K.el('div', 'ctrls');
      const btn = (label, onClick, ghost, enabled = true) => {
        const b = K.el('button', ghost === 'danger' ? 'danger' : ghost ? 'ghost' : null, label);
        b.type = 'button';
        b.disabled = !enabled;
        b.addEventListener('click', onClick);
        ctrls.append(b);
      };
      const hand = K.el('div', 'bg-hand');

      if (mine.mode === 'draw') {
        btn('Comprar 2 cartas', () => send({ t: 'draw', src: 'deck' }));
        if (mine.draw.discard) btn('Comprar a 1ª do descarte', () => send({ t: 'draw', src: 'discard' }), true);
        mine.draw.hands.forEach((s2) => btn(`1ª carta da mão de ${nameOf(s2)}`, () => send({ t: 'draw', src: s2 }), true));
        mine.hand.forEach((c) => hand.append(cardEl(c)));
      } else if (mine.mode === 'play') {
        mine.hand.forEach((c) => {
          hand.append(cardEl(c, {
            sel: sel && sel.id === c.id,
            dim: !c.ok && !mine.over,
            onClick: () => {
              sel = sel && sel.id === c.id ? null : { id: c.id, type: c.type, ok: c.ok, targets: c.targets, pick: c.pick };
              pickFor = null;
              redraw();
            },
          }));
        });
        {
          if (sel) {
            if (sel.targets) {
              ctrls.append(K.el('div', 'bg-hint', sel.ok ? 'Toque no jogador alvo.' : 'Nenhum alvo ao alcance.'));
            } else {
              btn(`Jogar ${NAME[sel.type]}`, () => { const id = sel.id; sel = null; send({ t: 'play', card: id }); }, false, sel.ok);
            }
            if (mine.over) btn('Descartar essa carta', () => { const id = sel.id; sel = null; send({ t: 'discard', card: id }); }, true);
          }
          btn('Encerrar turno', () => send({ t: 'end' }), true, !mine.over);
          if (mine.over) ctrls.append(K.el('div', 'bg-hint', `Descarte ${mine.over} carta${mine.over > 1 ? 's' : ''} para encerrar.`));
        }
      } else if (mine.mode === 'respond') {
        mine.hand.forEach((c) => hand.append(cardEl(c, { dim: !mine.respond.cards.includes(c.id) })));
        const r = mine.respond;
        if (r.k === 'barrel') {
          ctrls.append(K.el('div', 'bg-hint', `Atiraram em você e você tem um Barril${r.left > 1 ? ` (mais de um: ${r.left} tentativas)` : ''}. Usar o Barril? Copas cancela o tiro.`));
          btn('Usar o Barril (comprar!)', () => send({ t: 'barrel' }));
          btn('Não usar', () => send({ t: 'pass' }), true);
        } else {
        const verb = r.k === 'bang' ? 'Atiraram em você' : r.k === 'indians' ? 'Índios!' : `Duelo com ${nameOf(r.other)}`;
        ctrls.append(K.el('div', 'bg-hint', `${verb}.${r.k === 'bang' && r.need > 1 ? ` Precisa de ${r.need} Errou!.` : ''}`));
        r.cards.forEach((id) => {
          const c = mine.hand.find((x) => x.id === id);
          btn(`Usar ${NAME[c.type]} (${rk(c.rank)}${SUIT[c.suit]})`, () => send({ t: r.k === 'bang' ? 'missed' : 'bang', card: id }));
        });
        btn(r.k === 'duel' ? 'Perder o duelo (-1 vida)' : 'Perder 1 vida', () => send({ t: 'pass' }), 'danger');
        }
      } else if (mine.mode === 'store') {
        mine.hand.forEach((c) => hand.append(cardEl(c)));
        ctrls.append(K.el('div', 'bg-hint', 'Armazém: escolha uma carta.'));
        v.step.cards.forEach((c) => ctrls.append(cardEl(c, { onClick: () => send({ t: 'pick', card: c.id }) })));
      } else if (mine.mode === 'kit') {
        mine.hand.forEach((c) => hand.append(cardEl(c)));
        ctrls.append(K.el('div', 'bg-hint', 'Kit Carlson: toque na carta que volta ao topo do baralho (você fica com as outras 2).'));
        mine.kit.forEach((c) => ctrls.append(cardEl(c, { onClick: () => send({ t: 'kitPut', card: c.id }) })));
      } else if (mine.mode === 'lucky') {
        mine.hand.forEach((c) => hand.append(cardEl(c)));
        const why = { barrel: 'o Barril (copas salva)', jail: 'a Cadeia (copas liberta)', dyn: 'a Dinamite (espadas 2 a 9 explode)' }[mine.lucky.kind];
        ctrls.append(K.el('div', 'bg-hint', `Lucky Duke: escolha qual carta vale para ${why}.`));
        mine.lucky.cards.forEach((c) => ctrls.append(cardEl(c, { onClick: () => send({ t: 'luckyPick', card: c.id }) })));
      } else if (mine.mode === 'dying') {
        mine.hand.forEach((c) => hand.append(cardEl(c, { sel: !!sidMode && sidMode.includes(c.id), dim: !sidMode && !mine.dying.beers.includes(c.id), onClick: sidMode ? () => { sidMode = sidMode.includes(c.id) ? sidMode.filter((x) => x !== c.id) : sidMode.length < 2 ? [...sidMode, c.id] : sidMode; redraw(); } : undefined })));
        ctrls.append(K.el('div', 'bg-hint', `Você está morrendo! Precisa recuperar ${mine.dying.need} vida${mine.dying.need > 1 ? 's' : ''}.`));
        mine.dying.beers.forEach((id) => btn('Tomar uma Cerveja', () => send({ t: 'beer', card: id })));
        if (mine.dying.sid) {
          if (sidMode) {
            btn('Confirmar: descartar 2 cartas', () => { const cards = sidMode; sidMode = null; send({ t: 'sid', cards }); }, false, sidMode.length === 2);
          } else btn('Sid Ketchum: descartar 2 cartas', () => { sidMode = []; redraw(); }, true);
        }
        btn('Desistir', () => send({ t: 'giveup' }), 'danger');
      } else {
        mine.hand.forEach((c) => hand.append(cardEl(c)));
      }
      // Sid Ketchum cura a qualquer momento (menos morrendo, que tem fluxo proprio acima).
      if (mine.sid && mine.mode !== 'dying') {
        if (sidMode) {
          ctrls.append(K.el('div', 'bg-hint', 'Sid Ketchum: toque em 2 cartas da mão para descartar.'));
          const pick = K.el('div', 'bg-row');
          mine.hand.forEach((c) => pick.append(cardEl(c, { sel: sidMode.includes(c.id), onClick: () => { sidMode = sidMode.includes(c.id) ? sidMode.filter((x) => x !== c.id) : sidMode.length < 2 ? [...sidMode, c.id] : sidMode; redraw(); } })));
          ctrls.append(pick);
          btn('Descartar 2 cartas e curar 1 vida', () => { const cards = sidMode; sidMode = null; send({ t: 'sid', cards }); }, false, sidMode.length === 2);
          btn('Cancelar', () => { sidMode = null; redraw(); }, true);
        } else btn('Sid Ketchum: curar 1 vida', () => { sidMode = []; sel = null; redraw(); }, true);
      }
      if (ctrls.childNodes.length) me.append(ctrls);
      me.append(hand);
      wrap.append(me);
    } else if (inGame) {
      wrap.append(K.el('div', 'bg-hint', 'Você foi eliminado. Pode continuar assistindo.'));
    }

    if (v.over) {
      const box = K.el('div', 'bg-final');
      v.seats.forEach((p, i) => box.append(K.el('div', null, `${nameOf(i)}: ${ROLE[p.role]} (${CHAR[p.char][0]})${p.alive ? '' : ' - eliminado'}`)));
      wrap.append(box);
    }
    el.append(wrap);

    if (v.over) return `${v.winner === 'sheriff' ? 'O Xerife e os Delegados venceram' : v.winner === 'outlaws' ? 'Os Fora-da-lei venceram' : 'O Renegado venceu'}! "Nova partida" joga outra.`;
    const w = v.step ? v.step.waiting[0] : v.turn;
    if (!inGame) return `Você está assistindo. ${v.step ? `Aguardando ${nameOf(w)}.` : `Vez de ${nameOf(v.turn)}.`}`;
    if (!mine.alive) return `Aguardando ${nameOf(w)}.`;
    if (mine.mode === 'wait') return v.step ? `Aguardando ${nameOf(w)}.` : `Vez de ${nameOf(v.turn)}.`;
    if (mine.mode === 'draw') return 'Sua vez: compre as cartas.';
    if (mine.mode === 'play') return sel ? `${NAME[sel.type]}: ${DESC[sel.type]}` : 'Sua vez: jogue cartas ou encerre o turno.';
    return { respond: 'Sua resposta é necessária: veja as opções acima da mão.', store: 'Armazém: escolha uma carta.', kit: 'Kit Carlson: escolha a carta que volta ao baralho.', lucky: 'Lucky Duke: escolha uma das cartas reveladas.', dying: 'Você está morrendo: tome uma Cerveja ou desista.' }[mine.mode] || 'Responda acima.';
  }

  window.GameUI.bang = { render };
})();
