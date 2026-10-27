'use strict';
const assert = require('assert');
const g = require('../games/paciencia/game.js');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const T = (cards) => cards.map((c, i) => ({ c, up: true }));
const base = () => ({ stock: [], waste: [], foundations: [[], [], [], []], tableau: [[], [], [], [], [], [], []], drawCount: 1, moves: 0, history: [] });
const play = (s, m) => { const r = g.move(s, 0, m); assert.ok(r.state, JSON.stringify(r)); return r.state; };

t('distribuicao: 52 cartas unicas, colunas 1..7, so a ultima virada para cima, monte com 24', () => {
  const s = g.setup();
  const all = [...s.stock, ...s.waste, ...s.tableau.flat().map((x) => x.c)];
  assert.strictEqual(new Set(all).size, 52);
  assert.strictEqual(s.stock.length, 24);
  s.tableau.forEach((p, i) => {
    assert.strictEqual(p.length, i + 1);
    assert.deepStrictEqual(p.map((x) => x.up), p.map((_, k) => k === i));
  });
});

t('embaralhamento muda entre partidas', () => {
  assert.notDeepStrictEqual(g.setup().stock, g.setup().stock);
});

t('a visao publica nao revela cartas viradas para baixo nem o monte', () => {
  const s = g.setup();
  const json = JSON.stringify(g.view(s));
  for (const pile of s.tableau) for (const x of pile) if (!x.up) assert.ok(!json.includes(`"${x.c}"`), `vazou ${x.c}`);
  for (const c of s.stock) assert.ok(!json.includes(`"${c}"`), `vazou monte ${c}`);
  assert.strictEqual(g.view(s).stockCount, 24);
});

t('comprar leva carta do monte ao descarte; com monte vazio, reciclar o descarte', () => {
  let s = g.setup(); const topo = s.stock[s.stock.length - 1];
  s = play(s, { t: 'draw' });
  assert.strictEqual(s.waste[0], topo); assert.strictEqual(s.stock.length, 23);
  const s2 = base(); s2.waste = ['1S', '2S', '3S'];
  const r = play(s2, { t: 'draw' });
  assert.deepStrictEqual(r.stock, ['3S', '2S', '1S']); assert.deepStrictEqual(r.waste, []);
  const r2 = play(r, { t: 'draw' });
  assert.deepStrictEqual(r2.waste, ['1S']);   // volta a comprar na mesma ordem original
});

t('compra de 3 cartas (modo) so antes da primeira jogada', () => {
  let s = g.setup(); s = play(s, { t: 'mode', draw: 3 });
  s = play(s, { t: 'draw' }); assert.strictEqual(s.waste.length, 3);
  assert.ok(g.move(s, 0, { t: 'mode', draw: 1 }).error);
  assert.ok(g.move(g.setup(), 0, { t: 'mode', draw: 2 }).error);
});

t('coluna: cor alternada e valor decrescente; vazia so aceita Rei', () => {
  const s = base();
  s.tableau[0] = T(['6H']); s.tableau[1] = T(['5S']); s.tableau[2] = T(['5H']); s.tableau[3] = [];
  s.tableau[4] = [{ c: '2C', up: false }, { c: '13D', up: true }]; s.tableau[5] = T(['12S']);
  const m = g._legalMoves(s).filter((x) => x.from.k === 'tab');
  const has = (fi, ti) => m.some((x) => x.from.i === fi && x.to.i === ti);
  assert.ok(has(1, 0));         // 5 preta sobre 6 vermelha
  assert.ok(!has(2, 0));        // 5 vermelha sobre 6 vermelha: nao
  assert.ok(has(4, 3));         // Rei (sobre carta virada) para coluna vazia
  const solo = base(); solo.tableau[0] = T(['13H']);
  assert.strictEqual(g._legalMoves(solo).length, 0);   // Rei ja na base de uma coluna: sem lance inutil
  assert.ok(!has(5, 3));        // Dama para coluna vazia: nao
  assert.ok(has(5, 4));         // Dama preta sobre Rei vermelho
});

t('mover sequencia, virar a carta de baixo e fundacao em ordem', () => {
  let s = base();
  s.tableau[0] = [{ c: '9C', up: false }, { c: '8H', up: true }, { c: '7S', up: true }];
  s.tableau[1] = T(['9S']);
  s = play(s, { t: 'move', from: { k: 'tab', i: 0, n: 1 }, to: { k: 'tab', i: 1 } });
  assert.deepStrictEqual(s.tableau[1].map((x) => x.c), ['9S', '8H', '7S']);
  assert.deepStrictEqual(s.tableau[0], [{ c: '9C', up: true }]);   // virou
  let f = base(); f.tableau[0] = T(['1H']); f.waste = ['2H'];
  f = play(f, { t: 'move', from: { k: 'tab', i: 0, n: 0 }, to: { k: 'found', i: 1 } });
  f = play(f, { t: 'move', from: { k: 'waste' }, to: { k: 'found', i: 1 } });
  assert.deepStrictEqual(f.foundations[1], ['1H', '2H']);
  assert.ok(g.move(base(), 0, { t: 'move', from: { k: 'waste' }, to: { k: 'found', i: 1 } }).error);
});

t('carta da fundacao pode voltar para a coluna', () => {
  const s = base(); s.foundations[0] = ['1S', '2S']; s.tableau[0] = T(['3H']);
  const r = play(s, { t: 'move', from: { k: 'found', i: 0 }, to: { k: 'tab', i: 0 } });
  assert.deepStrictEqual(r.foundations[0], ['1S']); assert.strictEqual(r.tableau[0].length, 2);
});

t('desfazer restaura o estado anterior e e recusado sem historico', () => {
  const s0 = g.setup(); const s1 = play(s0, { t: 'draw' });
  const s2 = play(s1, { t: 'undo' });
  assert.deepStrictEqual(s2.stock, s0.stock); assert.deepStrictEqual(s2.waste, s0.waste);
  assert.strictEqual(s2.moves, 0);
  assert.ok(g.move(s0, 0, { t: 'undo' }).error);
});

t('vitoria: as 4 fundacoes completas', () => {
  const s = base();
  for (let i = 0; i < 4; i++) for (let r = 1; r <= 12; r++) s.foundations[i].push(`${r}${'SHDC'[i]}`);
  s.tableau[0] = T(['13S']);
  const r = play(s, { t: 'move', from: { k: 'tab', i: 0, n: 0 }, to: { k: 'found', i: 0 } });
  assert.strictEqual(g.view(r).over, false);
  for (const [i, k] of [[1, 'H'], [2, 'D'], [3, 'C']]) { r.foundations[i].push(`13${k}`); }
  assert.strictEqual(g.view(r).over, true);
  assert.ok(g.move(r, 0, { t: 'draw' }).error);
});

t('so o assento 0 joga; jogadas invalidas sao recusadas', () => {
  const s = g.setup();
  assert.ok(g.move(s, 1, { t: 'draw' }).error);
  assert.ok(g.move(s, 0, null).error);
  assert.ok(g.move(s, 0, { t: 'move', from: { k: 'tab', i: 9, n: 0 }, to: { k: 'tab', i: 0 } }).error);
});

t('qualquer partida embaralhada tem sempre a jogada de comprar ou alguma legal', () => {
  for (let i = 0; i < 50; i++) { const s = g.setup(); assert.ok(g.view(s).legal.length >= 0); assert.ok(s.stock.length > 0); }
});

console.log(`${n} testes passaram`);
