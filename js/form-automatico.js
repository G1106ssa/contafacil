// Formulário de lançamento automático (cadastro e F9 no lançamento).
// Um código único (do escritório) liga, em cada plano de contas, a conta devedora e/ou a credora e o
// histórico. Só um lado = partida simples. Contas pela chamada (F2 = plano).
(() => {
  'use strict';
  // contas por chamada, do plano da empresa (carregado depois do login)
  let base = null, mapa = new Map();
  const porCh = { get(ch) {
    if (base !== window.PLANO_PADRAO) { base = window.PLANO_PADRAO; mapa = new Map((base || []).filter(c => c.ch).map(c => [c.ch, c])); }
    return mapa.get(ch);
  } };
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  let dlg, st, editando, resolver;

  function conta(txt) {
    txt = String(txt ?? '').trim();
    if (!txt) return { vazia: true };
    if (!/^\d+$/.test(txt)) return { erro: 'Digite a chamada da conta (F2 abre o plano)' };
    const c = porCh.get(Number(txt));
    if (!c) return { erro: `Chamada ${txt} não existe` };
    if (c.t !== 'A') return { erro: `${c.n} é sintética e não recebe lançamento` };
    return { conta: c };
  }

  function criar() {
    dlg = document.createElement('dialog');
    dlg.id = 'dlg-auto';
    dlg.setAttribute('aria-labelledby', 'auto-titulo');
    dlg.innerHTML = `
      <form method="dialog" novalidate>
        <div class="dlg-head"><i class="ti ti-bolt"></i><h2 id="auto-titulo">Lançamento automático</h2></div>
        <div class="dlg-body">
          <div class="auto-top">
            <div class="field"><label for="a-cod">Código</label><input class="input code" id="a-cod" inputmode="numeric" aria-describedby="ae-cod"><div class="err" id="ae-cod"></div></div>
            <div class="field" style="flex:1"><label for="a-nome">Descrição</label><input class="input" id="a-nome" placeholder="Ex.: Pagamento de aluguel" aria-describedby="ae-nome"><div class="err" id="ae-nome"></div></div>
          </div>
          <div class="auto-plano" id="a-plano"></div>
          <div class="field"><label for="a-deb">Chamada devedora</label>
            <div class="combo"><input class="input code debit" id="a-deb" data-chamada inputmode="numeric" aria-describedby="ae-deb">
              <button type="button" class="btn icon sm" data-busca="a-deb" aria-label="Abrir plano de contas (F2)"><i class="ti ti-search"></i></button>
              <input class="input name" id="a-deb-nome" readonly tabindex="-1" aria-label="Nome da conta devedora"></div>
            <div class="err" id="ae-deb"></div></div>
          <div class="field"><label for="a-cre">Chamada credora</label>
            <div class="combo"><input class="input code credit" id="a-cre" data-chamada inputmode="numeric" aria-describedby="ae-cre">
              <button type="button" class="btn icon sm" data-busca="a-cre" aria-label="Abrir plano de contas (F2)"><i class="ti ti-search"></i></button>
              <input class="input name" id="a-cre-nome" readonly tabindex="-1" aria-label="Nome da conta credora"></div>
            <div class="err" id="ae-cre"></div></div>
          <div class="field"><label for="a-hist">Histórico padrão</label>
            <div class="combo"><input class="input code" id="a-hist" inputmode="numeric" aria-describedby="ae-hist"><span class="muted" id="a-hist-txt"></span></div>
            <div class="err" id="ae-hist"></div></div>
          <div class="field"><label for="a-texto">Complemento do histórico <span class="muted">(opcional)</span></label>
            <input class="input" id="a-texto" placeholder="Texto que vem depois do histórico padrão"></div>
          <div class="field"><label for="a-obs">Observações <span class="muted">(opcional)</span></label>
            <input class="input" id="a-obs"></div>
          <div class="auto-resumo" id="a-resumo" aria-live="polite"></div>
        </div>
        <div class="hint"><kbd>Enter</kbd> próximo campo · <kbd>F2</kbd> plano de contas · <kbd>Ctrl+Enter</kbd> gravar · <kbd>Esc</kbd> cancelar</div>
        <div class="dlg-foot">
          <button type="button" class="btn" id="a-cancelar"><i class="ti ti-x"></i>Cancelar</button>
          <button type="button" class="btn primary" id="a-gravar"><i class="ti ti-check"></i>Gravar</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);

    const atualiza = () => resumo();
    ['#a-deb', '#a-cre'].forEach(id => $(id, dlg).addEventListener('input', e => {
      const r = conta(e.target.value);
      $(id + '-nome', dlg).value = r.conta ? r.conta.n : '';
      $(id + '-nome', dlg).title = r.conta ? r.conta.c : '';
      erro(id === '#a-deb' ? 'deb' : 'cre', e.target.value.trim() ? (r.erro || '') : '');
      atualiza();
    }));
    $('#a-hist', dlg).addEventListener('input', () => {
      const v = $('#a-hist', dlg).value.trim();
      const h = st.historicos.find(x => x.cod === Number(v));
      $('#a-hist-txt', dlg).textContent = h ? h.texto : (v ? 'Histórico padrão não cadastrado' : st.historicos.map(x => `${x.cod} ${x.texto}`).slice(0, 3).join(' · '));
      atualiza();
    });
    ['#a-nome', '#a-texto', '#a-cod'].forEach(id => $(id, dlg).addEventListener('input', atualiza));
    dlg.querySelectorAll('[data-busca]').forEach(b => b.addEventListener('click', () => window.BuscaConta.abrir($('#' + b.dataset.busca, dlg))));
    $('#a-gravar', dlg).addEventListener('click', gravar);
    $('#a-cancelar', dlg).addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { resolver?.(null); resolver = null; });
    dlg.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); gravar(); return; }
      if (e.key === 'Enter' && !e.shiftKey && e.target.matches('input')) {
        e.preventDefault();
        const campos = [...dlg.querySelectorAll('input:not([readonly]):not([tabindex="-1"])')];
        const i = campos.indexOf(e.target);
        if (i === campos.length - 1) gravar(); else campos[i + 1].focus();
      }
    });
  }

  function erro(id, msg) {
    $('#ae-' + id, dlg).textContent = msg || '';
    $('#a-' + id, dlg).setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  // frase que mostra o que o código vai fazer no lote
  function resumo() {
    const cod = $('#a-cod', dlg).value.trim() || '?';
    const d = conta($('#a-deb', dlg).value).conta, c = conta($('#a-cre', dlg).value).conta;
    const h = st.historicos.find(x => x.cod === Number($('#a-hist', dlg).value));
    const texto = [h?.texto, $('#a-texto', dlg).value.trim()].filter(Boolean).join(' ');
    const lado = (letra, conta) => conta ? `${letra} ${conta.ch} ${esc(conta.n)}` : `${letra} <i>em aberto</i>`;
    $('#a-resumo', dlg).innerHTML = `<i class="ti ti-bolt"></i> Digitando <b>${esc(cod)}</b> em "L. Auto." o lote preenche:
      <span class="d">${lado('D', d)}</span> · <span class="c">${lado('C', c)}</span>
      · histórico "${esc(texto || '—')}"${d && c ? '' : (d || c ? ' <span class="muted">(partida simples: o outro lado você digita ou vem de outro lançamento)</span>' : '')}`;
  }

  async function gravar() {
    let ok = true, primeiro = null;
    const falha = (id, msg) => { erro(id, msg); ok = false; primeiro ??= $('#a-' + id, dlg); };
    ['cod', 'nome', 'deb', 'cre', 'hist'].forEach(k => erro(k, ''));

    const codTxt = $('#a-cod', dlg).value.trim();
    const cod = Number(codTxt);
    if (!/^\d+$/.test(codTxt) || cod <= 0) falha('cod', 'Código deve ser um número inteiro maior que zero');
    else if (st.automaticos.some(a => a.cod === cod && a !== editando)) {
      const outro = st.automaticos.find(a => a.cod === cod);
      falha('cod', `Código ${cod} já é usado por "${outro.nome}"`);
    }
    const nome = $('#a-nome', dlg).value.trim();
    if (!nome) falha('nome', 'Informe a descrição');
    const d = conta($('#a-deb', dlg).value), c = conta($('#a-cre', dlg).value);
    if (d.erro) falha('deb', d.erro);
    if (c.erro) falha('cre', c.erro);
    if (d.vazia && c.vazia) falha('deb', 'Informe a chamada devedora, a credora ou as duas');
    if (d.conta && c.conta && d.conta.ch === c.conta.ch) falha('cre', 'Débito e crédito na mesma conta');
    const histTxt = $('#a-hist', dlg).value.trim();
    const hist = histTxt ? Number(histTxt) : null;
    if (histTxt && !st.historicos.some(h => h.cod === hist)) falha('hist', `Histórico padrão ${histTxt} não existe`);
    const texto = $('#a-texto', dlg).value.trim();
    if (hist == null && !texto) falha('hist', 'Informe um histórico padrão ou o complemento');

    if (!ok) { primeiro?.focus(); return; }

    const reg = { cod, nome, d: d.conta?.ch ?? null, c: c.conta?.ch ?? null, hist, texto, obs: $('#a-obs', dlg).value.trim(), semPlano: false };
    const botao = $('#a-gravar', dlg);
    botao.disabled = true;
    try {
      reg.id = await window.Dados.salvarAutomatico(st, reg, editando?.id);
    } catch (e) {
      falha(/codigo|unique|duplicate/i.test(e.message) ? 'cod' : 'nome', e.message);
      primeiro?.focus();
      return;
    } finally { botao.disabled = false; }
    if (editando) Object.assign(editando, reg); else st.automaticos.push(reg);
    st.automaticos.sort((a, b) => a.cod - b.cod);
    const r = resolver; resolver = null;
    dlg.close();
    r?.(editando || reg);
  }

  // abre para novo (preset opcional: { d, c, hist, texto, nome }) ou edição (registro)
  function abrir(estado, { registro = null, preset = {} } = {}) {
    if (!dlg) criar();
    st = estado;
    editando = registro;
    const base = registro || preset;
    const proximo = Math.max(0, ...st.automaticos.map(a => a.cod)) + 1;
    $('#auto-titulo', dlg).textContent = !registro ? 'Novo lançamento automático'
      : registro.semPlano ? `Configurar o lançamento automático ${registro.cod} neste plano` : `Editar lançamento automático ${registro.cod}`;
    const pl = st.planoAtual;
    $('#a-plano', dlg).innerHTML = `<i class="ti ti-list-tree"></i> Plano de contas <b>${esc(pl?.codigo || '')}</b> ${esc(pl?.nome || '')}
      <span class="muted">· as chamadas abaixo valem para este plano</span>`;
    $('#a-cod', dlg).value = registro ? registro.cod : (preset.cod ?? proximo);
    $('#a-cod', dlg).readOnly = !!registro;          // o código não muda depois de criado
    $('#a-cod', dlg).title = registro ? 'O código não muda depois de criado' : '';
    $('#a-nome', dlg).value = base.nome || '';
    $('#a-deb', dlg).value = base.d ?? '';
    $('#a-cre', dlg).value = base.c ?? '';
    $('#a-hist', dlg).value = base.hist ?? '';
    $('#a-texto', dlg).value = base.texto || '';
    $('#a-obs', dlg).value = base.obs || '';
    ['#a-deb', '#a-cre', '#a-hist'].forEach(id => $(id, dlg).dispatchEvent(new Event('input')));
    ['cod', 'nome', 'deb', 'cre', 'hist'].forEach(k => erro(k, ''));
    resumo();
    dlg.showModal();
    (registro ? (registro.semPlano ? $('#a-deb', dlg) : $('#a-nome', dlg)) : preset.d || preset.cod ? $('#a-nome', dlg) : $('#a-cod', dlg)).focus();
    return new Promise(ok => { resolver = ok; });
  }

  window.FormAutomatico = { abrir };
})();
