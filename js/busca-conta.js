// Busca no plano de contas (F2 ou lupa em qualquer campo de chamada).
// Mostra o plano em árvore: sintéticas como títulos, analíticas escolhíveis. Devolve a chamada no campo.
(() => {
  'use strict';
  const plano = () => window.PLANO_PADRAO || [];   // plano da empresa, carregado depois do login
  const nivel = c => c.c.split('.').length;
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const sem = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();   // busca sem acento

  let dlg, campo, lista, alvo, visiveis = [], pos = 0;

  function criar() {
    dlg = document.createElement('dialog');
    dlg.id = 'dlg-plano';
    dlg.setAttribute('aria-labelledby', 'plano-titulo');
    dlg.innerHTML = `
      <div class="dlg-head"><i class="ti ti-list-tree"></i><h2 id="plano-titulo">Plano de contas</h2></div>
      <div class="dlg-body">
        <label class="sr-only" for="plano-q">Filtrar contas</label>
        <input class="input" id="plano-q" placeholder="Chamada ou nome da conta" autocomplete="off">
        <div class="plano-lista" id="plano-lista" role="listbox" aria-label="Contas do plano"></div>
      </div>
      <div class="hint"><kbd>↑ ↓</kbd> mover · <kbd>Enter</kbd> escolher · <kbd>Esc</kbd> fechar · só contas analíticas recebem lançamento</div>
      <div class="dlg-foot"><button type="button" class="btn" id="plano-fechar">Fechar</button></div>`;
    document.body.appendChild(dlg);
    campo = dlg.querySelector('#plano-q');
    lista = dlg.querySelector('#plano-lista');
    campo.addEventListener('input', () => { pos = 0; desenhar(); });
    campo.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
      else if (e.key === 'PageDown') { e.preventDefault(); mover(10); }
      else if (e.key === 'PageUp') { e.preventDefault(); mover(-10); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (visiveis[pos]) escolher(visiveis[pos]); }
    });
    lista.addEventListener('click', e => {
      const b = e.target.closest('[data-ch]');
      if (b) escolher(plano().find(c => c.ch === Number(b.dataset.ch)));
    });
    dlg.querySelector('#plano-fechar').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => alvo?.focus());
  }

  function desenhar() {
    const q = sem(campo.value.trim());
    // analíticas que batem com o filtro, e os grupos (sintéticas) acima delas
    const achadas = plano().filter(c => c.t === 'A' && (!q || sem(c.n).includes(q) || String(c.ch).startsWith(q)));
    const grupos = new Set();
    for (const a of achadas) {
      const partes = a.c.split('.');
      for (let i = 1; i < partes.length; i++) grupos.add(partes.slice(0, i).join('.'));
    }
    visiveis = achadas;
    pos = Math.max(0, Math.min(pos, visiveis.length - 1));
    if (!achadas.length) { lista.innerHTML = `<div class="empty">Nenhuma conta encontrada para “${esc(campo.value)}”</div>`; return; }
    lista.innerHTML = plano().filter(c => (c.t === 'S' && grupos.has(c.c)) || (c.t === 'A' && achadas.includes(c))).map(c => {
      const pad = 8 + (nivel(c) - 1) * 14;
      if (c.t === 'S') {
        return `<div class="plano-grupo n${nivel(c)}" style="padding-left:${pad}px"><span>${esc(c.n)}</span><span class="mono muted">${c.c}</span></div>`;
      }
      const i = visiveis.indexOf(c);
      return `<button type="button" role="option" data-ch="${c.ch}" aria-selected="${i === pos}" style="padding-left:${pad}px">
        <b class="num">${c.ch}</b><span>${esc(c.n)}</span><span class="mono muted">${c.c}</span></button>`;
    }).join('');
    lista.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  function mover(d) {
    if (!visiveis.length) return;
    pos = Math.max(0, Math.min(visiveis.length - 1, pos + d));
    lista.querySelectorAll('[data-ch]').forEach(b => b.setAttribute('aria-selected', String(Number(b.dataset.ch) === visiveis[pos].ch)));
    lista.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  function escolher(c) {
    alvo.value = c.ch;
    alvo.dispatchEvent(new Event('input', { bubbles: true }));
    alvo.dispatchEvent(new Event('change', { bubbles: true }));
    dlg.close();
  }

  // abre o plano para o campo; se o campo já tem chamada, começa nela
  function abrir(input) {
    if (!dlg) criar();
    alvo = input;
    campo.value = '';
    const atual = Number(input.value);
    pos = 0;
    desenhar();
    const i = visiveis.findIndex(c => c.ch === atual);
    if (i >= 0) { pos = i; desenhar(); }
    dlg.showModal();
    campo.focus();
  }

  // F2 em qualquer campo marcado com data-chamada abre o plano
  document.addEventListener('keydown', e => {
    if (e.key === 'F2' && e.target.matches?.('[data-chamada]')) { e.preventDefault(); e.stopPropagation(); abrir(e.target); }
  }, true);

  window.BuscaConta = { abrir };
})();
