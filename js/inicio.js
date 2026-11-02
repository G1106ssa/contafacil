// Início de cada tela: confere o login, a empresa escolhida e carrega os dados dela.
// Sem login → entrar.html. Sem empresa ativada → empresas.html.
(() => {
  'use strict';
  const nunca = () => new Promise(() => {});        // a página vai trocar; o resto não roda

  function carregando(sim, texto = 'Carregando…') {
    let el = document.getElementById('carregando');
    if (!el) {
      el = document.createElement('div');
      el.id = 'carregando';
      el.className = 'carregando';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.innerHTML = `<div class="spinner" aria-hidden="true"></div><span>${texto}</span>`;
    el.hidden = !sim;
  }

  async function pronto({ precisaEmpresa = true } = {}) {
    carregando(true);
    try {
      const ctx = await window.Dados.contexto();
      if (!ctx) {
        const volta = location.pathname.split('/').pop() + location.search;
        location.replace('entrar.html?volta=' + encodeURIComponent(volta));
        return nunca();
      }
      if (precisaEmpresa && !ctx.empresa) { location.replace('empresas.html'); return nunca(); }
      const st = ctx.empresa ? await window.Dados.carregarEstado(ctx.empresa) : null;
      if (st) window.PLANO_PADRAO = st.plano;       // as telas buscam as contas aqui
      carregando(false);
      return { ctx, st };
    } catch (e) {
      carregando(true, `Não foi possível carregar: ${e.message}`);
      throw e;
    }
  }

  window.Inicio = { pronto, carregando };
})();
