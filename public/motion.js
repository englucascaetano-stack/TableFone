'use strict';
// Animacoes de movimento (tecnica FLIP): a tela e redesenhada do zero a cada estado novo, entao guardamos a posicao
// dos elementos marcados com data-mk (cartas) antes do redesenho e animamos da posicao antiga para a nova.
// Usa so transform/opacity (rodam na GPU). Respeita "reduzir movimento" do sistema.
(function () {
  const MOVE_MS = 300;
  const ENTER_MS = 260;
  const MAX_ENTER = 14; // distribuicoes grandes (ex.: 100+ cartas) nao animam peca a peca
  let state = new WeakMap(); // raiz -> { id, version }

  const reduced = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function indexed(root) {
    const seen = {};
    const out = [];
    root.querySelectorAll('[data-mk]').forEach((n) => {
      const k = n.dataset.mk;
      seen[k] = (seen[k] || 0) + 1;
      out.push([`${k}#${seen[k]}`, n]);
    });
    return out;
  }

  function snapshot(root) {
    const rects = new Map();
    for (const [k, n] of indexed(root)) rects.set(k, n.getBoundingClientRect());
    const pile = root.querySelector('[data-pile]');
    return { rects, pile: pile ? pile.getBoundingClientRect() : null };
  }

  function play(root, snap) {
    let entering = 0;
    const nodes = indexed(root);
    const fresh = nodes.filter(([k]) => !snap.rects.has(k)).length;
    for (const [k, n] of nodes) {
      if (!n.animate) return;
      const now = n.getBoundingClientRect();
      const old = snap.rects.get(k);
      if (old) {
        const dx = old.left - now.left;
        const dy = old.top - now.top;
        if (Math.abs(dx) + Math.abs(dy) < 4) continue;
        n.style.zIndex = '6';
        const a = n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: MOVE_MS, easing: 'cubic-bezier(.2,.7,.2,1)' });
        a.onfinish = a.oncancel = () => { n.style.zIndex = ''; };
      } else if (fresh <= MAX_ENTER) {
        // carta nova: sai do monte, se houver um na tela; senao surge com um pequeno "pop"
        const delay = Math.min(entering++, 8) * 45;
        let from = { transform: 'scale(0.8)', opacity: 0 };
        if (snap.pile) {
          const dx = snap.pile.left + snap.pile.width / 2 - (now.left + now.width / 2);
          const dy = snap.pile.top + snap.pile.height / 2 - (now.top + now.height / 2);
          from = { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.2 };
        }
        n.style.zIndex = '6';
        const a = n.animate([from, { transform: 'none', opacity: 1 }], { duration: ENTER_MS + 120, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
        a.onfinish = a.oncancel = () => { n.style.zIndex = ''; };
      }
    }
  }

  // Executa o redesenho `draw` e anima o que mudou, somente quando chegou um estado novo da mesma sala.
  function run(root, id, version, draw) {
    const prev = state.get(root);
    const animate = !reduced() && prev && prev.id === id && prev.version !== version;
    const snap = animate ? snapshot(root) : null;
    const result = draw();
    state.set(root, { id, version });
    if (snap) {
      try { play(root, snap); } catch (e) { console.error(e); }
    }
    return result;
  }

  window.Motion = { run, reset: () => { state = new WeakMap(); } };
})();
