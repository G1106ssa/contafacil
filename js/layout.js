// Menu lateral, topo, tema e toast — compartilhados por todas as telas.
(() => {
  'use strict';
  const MENU = [
    ['Movimento', [
      ['lote', 'lotes.html', 'stack-2', 'Lotes'],
      [null, null, 'arrow-bar-to-down', 'Implantação de saldos'],
      [null, null, 'lock-square', 'Encerramento'],
      [null, null, 'trash', 'Lixeira'],
    ]],
    ['Cadastros', [
      ['empresas', 'empresas.html', 'building', 'Empresas'],
      [null, null, 'list-tree', 'Plano de contas'],
      [null, null, 'notes', 'Históricos padrão'],
      ['automaticos', 'automaticos.html', 'bolt', 'Lançamentos automáticos'],
      [null, null, 'sitemap', 'Centros de custo'],
    ]],
    ['Livros e relatórios', [
      ['diario', 'diario.html', 'book', 'Diário'],
      ['razao', 'razao.html', 'book-2', 'Razão'],
      ['balancete', 'balancete.html', 'table', 'Balancete'],
      [null, null, 'scale', 'Balanço patrimonial'],
      [null, null, 'chart-bar', 'DRE'],
    ]],
    ['Consultas', [[null, null, 'zoom-money', 'Diferença']]],
  ];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  function toast(msg) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  // grupos do menu: o da página atual sempre abre; os outros ficam como o usuário deixou (padrão: fechados)
  const CHAVE_MENU = 'siscontabil-menu';
  let estadoMenu = {};
  try { estadoMenu = JSON.parse(localStorage.getItem(CHAVE_MENU) || '{}'); } catch { estadoMenu = {}; }
  const abertoGrupo = (grupo, temPaginaAtual) => temPaginaAtual || estadoMenu[grupo] === true;
  function lembrarGrupo(grupo, aberto) {
    estadoMenu[grupo] = aberto;
    try { localStorage.setItem(CHAVE_MENU, JSON.stringify(estadoMenu)); } catch { /* só não lembra */ }
  }

  function montar({ pagina, crumb, ctx }) {
    const side = document.getElementById('sidebar');
    side.innerHTML = `
      <div class="brand"><i class="ti ti-calculator" aria-hidden="true"></i><span>Sis<b>Contábil</b></span></div>
      <nav class="nav" aria-label="Menu principal">${MENU.map(([grupo, itens], g) => {
        const aberto = abertoGrupo(grupo, itens.some(([id]) => id === pagina));
        return `
        <div class="nav-grupo${aberto ? '' : ' fechado'}">
          <button type="button" class="nav-titulo" aria-expanded="${aberto}" aria-controls="nav-g${g}" data-grupo="${grupo}">
            <span>${grupo}</span><i class="ti ti-chevron-down" aria-hidden="true"></i></button>
          <div class="nav-itens" id="nav-g${g}">${itens.map(([id, href, ic, rot]) => href
            ? `<a href="${href}"${id === pagina ? ' aria-current="page"' : ''}><i class="ti ti-${ic}" aria-hidden="true"></i>${rot}</a>`
            : `<button type="button" data-demo><i class="ti ti-${ic}" aria-hidden="true"></i>${rot}</button>`).join('')}
          </div>
        </div>`;
      }).join('')}
      </nav>
      <div class="side-foot">
        <div class="usuario" title="${esc(ctx?.user?.email)}"><i class="ti ti-user-circle"></i><span>${esc(ctx?.nome || '')}</span>
          <small>${esc({ admin: 'Administrador', analista: 'Analista', leitura: 'Somente leitura' }[ctx?.papel] || '')}</small></div>
        <button type="button" class="btn sm" id="btn-sair"><i class="ti ti-logout"></i>Sair</button>
      </div>`;

    const top = document.getElementById('topbar');
    top.innerHTML = `
      <button class="btn icon menu-toggle" id="btn-menu" aria-label="Abrir menu"><i class="ti ti-menu-2"></i></button>
      <div class="crumb">${crumb}</div>
      <div class="sp"></div>
      ${ctx?.empresa ? `<a class="chip accent empresa-chip" href="empresas.html" title="Trocar de empresa">
        <i class="ti ti-building"></i>${esc(ctx.empresa.razao_social)}<i class="ti ti-switch-horizontal"></i></a>` : ''}
      <button class="btn icon" id="btn-tema" aria-label="Alternar tema claro/escuro"></button>`;

    side.querySelectorAll('.nav-titulo').forEach(b => b.addEventListener('click', () => {
      const grupo = b.closest('.nav-grupo');
      const aberto = grupo.classList.toggle('fechado') === false;
      b.setAttribute('aria-expanded', String(aberto));
      lembrarGrupo(b.dataset.grupo, aberto);
    }));
    side.querySelectorAll('[data-demo]').forEach(b =>
      b.addEventListener('click', () => toast('Esta tela ainda vai ser construída')));
    document.getElementById('btn-menu').addEventListener('click', () => document.getElementById('app').classList.toggle('nav-open'));
    document.getElementById('btn-sair').addEventListener('click', async () => {
      await window.Dados.sair();
      location.replace('entrar.html');
    });
    aplicarTema(document.getElementById('btn-tema'));
  }

  // tema: claro / escuro / segue o sistema
  function aplicarTema(btn) {
    const raiz = document.documentElement;
    const escuroAgora = () => (raiz.dataset.theme ? raiz.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
    const icone = () => { if (btn) btn.innerHTML = `<i class="ti ti-${escuroAgora() ? 'sun' : 'moon'}"></i>`; };
    let tema = null;
    try { tema = localStorage.getItem('siscontabil-tema'); } catch { /* segue o sistema */ }
    if (tema) raiz.dataset.theme = tema;
    icone();
    btn?.addEventListener('click', () => {
      const novo = escuroAgora() ? 'light' : 'dark';
      raiz.dataset.theme = novo;
      try { localStorage.setItem('siscontabil-tema', novo); } catch { /* ignora */ }
      icone();
    });
  }

  window.Layout = { montar, toast, aplicarTema };
})();
