// Lista de lotes (S06): criar, abrir, liberar, reabrir e apagar lotes.
(async () => {
  'use strict';
  const $ = s => document.querySelector(s);
  const { ctx, st } = await window.Inicio.pronto();
  window.Layout.montar({ pagina: 'lote', crumb: 'Movimento › <b>Lotes</b>', ctx });
  const D = window.Dados;
  const toast = window.Layout.toast;
  const totaisLote = lote => {
    let deb = 0, cred = 0;
    for (const l of lote.lancs) for (const p of l.partidas) { if (p.nat === 'D') deb += p.v; else cred += p.v; }
    return { qtd: lote.lancs.length, deb, cred, dif: deb - cred };
  };
  // grava no banco e relê tudo (o banco confere as regras; a tela só mostra o resultado)
  async function noBanco(acao, msgOk) {
    try {
      await acao();
      Object.assign(st, await D.carregarEstado(ctx.empresa));
      render();
      if (msgOk) toast(msgOk);
      return true;
    } catch (e) { toast(e.message); return false; }
  }
  const fmt = c => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtData = iso => (iso ? iso.split('-').reverse().join('/') : '');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const porCh = new Map(st.plano.filter(c => c.ch).map(c => [c.ch, c]));
  let sel = 0, filtro = '';
  const abertos = new Set();                                   // lotes expandidos (cod)

  const visiveis = () => st.lotes
    .filter(l => ({ todos: true, abertos: !l.liberado, liberados: l.liberado })[$('#f-sit').value])
    .filter(l => !filtro || [l.cod, l.nome, fmtData(l.data)].some(t => t.toLowerCase().includes(filtro.toLowerCase())))
    .sort((a, b) => (a.cod < b.cod ? 1 : -1));                 // mais novo em cima
  const atual = () => visiveis()[sel];

  function render() {
    const lista = visiveis();
    sel = Math.max(0, Math.min(sel, lista.length - 1));
    $('#grid-body').innerHTML = lista.map((l, i) => {
      const t = totaisLote(l);
      const aberto = abertos.has(l.cod);
      return `<tr data-i="${i}" class="lote-linha" aria-selected="${i === sel}" aria-expanded="${aberto}">
        <td class="mono"><i class="ti ti-chevron-${aberto ? 'down' : 'right'} seta" aria-hidden="true"></i><b>${l.cod}</b></td>
        <td title="${esc(l.nome)}">${esc(l.nome)}</td><td>${fmtData(l.data)}</td>
        <td>${l.liberado ? '<span class="chip success"><i class="ti ti-lock"></i>Liberado</span>' : '<span class="chip warning"><i class="ti ti-clock"></i>A liberar</span>'}</td>
        <td class="num">${t.qtd}</td><td class="num">${fmt(t.deb)}</td><td class="num">${fmt(t.cred)}</td>
        <td class="num ${t.dif ? 'bad' : 'ok'}">${t.dif ? fmt(t.dif) : '<i class="ti ti-check"></i> 0,00'}</td></tr>` +
        (aberto ? `<tr class="lote-filhos"><td colspan="8">${lancamentosDo(l)}</td></tr>` : '');
    }).join('');
    $('#grid-empty').hidden = lista.length > 0;
    const aLiberar = st.lotes.filter(l => !l.liberado).length;
    $('#registros').textContent = `Lotes: ${lista.length}${lista.length !== st.lotes.length ? ` de ${st.lotes.length}` : ''} · ${aLiberar} a liberar`;
    $('#t-expandir').innerHTML = lista.length && lista.every(l => abertos.has(l.cod))
      ? '<i class="ti ti-fold"></i>Recolher todos' : '<i class="ti ti-fold-down"></i>Expandir todos';
    const l = atual();
    $('#t-abrir').disabled = !l;
    $('#t-liberar').disabled = !l || l.liberado;
    $('#t-reabrir').disabled = !l || !l.liberado;
    $('#t-apagar').disabled = !l || l.liberado;
  }

  // lançamentos do lote, só para ver (editar é dentro do lote)
  function lancamentosDo(l) {
    if (!l.lancs.length) return `<div class="filhos-vazio">Lote vazio. <button type="button" class="btn sm" data-abrir="${l.cod}"><i class="ti ti-file-plus"></i>Abrir para lançar</button></div>`;
    const linhas = [...l.lancs].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.n - b.n)).map(x => {
      const simples = x.partidas.length === 2 && x.partidas[0].nat === 'D' && x.partidas[1].nat === 'C';
      const ps = simples ? [[x.partidas[0], x.partidas[1]]] : x.partidas.map(p => (p.nat === 'D' ? [p, null] : [null, p]));
      return ps.map(([d, c], k) => `<tr>
        <td class="num">${k ? '' : x.n}</td><td>${k ? '' : fmtData(x.data)}</td><td class="num">${k || !x.auto ? '' : x.auto}</td>
        <td class="num d">${d ? d.ch : ''}</td><td>${d ? esc(porCh.get(d.ch)?.n || '?') : ''}</td>
        <td class="num c">${c ? c.ch : ''}</td><td>${c ? esc(porCh.get(c.ch)?.n || '?') : ''}</td>
        <td title="${esc(x.hist)}">${k ? '' : esc(x.hist)}</td><td class="num">${fmt((d || c).v)}</td></tr>`).join('');
    }).join('');
    return `<table class="filhos"><thead><tr><th class="num">Nº</th><th>Data</th><th class="num">L. Auto.</th><th class="num">Débito</th>
      <th>Conta débito</th><th class="num">Crédito</th><th>Conta crédito</th><th>Histórico</th><th class="num">Valor</th></tr></thead>
      <tbody>${linhas}</tbody></table>`;
  }
  function alternar(i, abrirSim) {
    const l = visiveis()[i];
    if (!l) return;
    const quer = abrirSim ?? !abertos.has(l.cod);
    if (quer) abertos.add(l.cod); else abertos.delete(l.cod);
    sel = i;
    render();
  }

  const abrir = l => { if (l) location.href = `lote.html?lote=${encodeURIComponent(l.cod)}`; };

  // ── novo lote ──
  const dlg = $('#dlg-lote');
  function nomeDoMes(iso) {
    const [a, m] = iso.split('-').map(Number);
    return `${MESES[m - 1]}/${a}`;
  }
  function sugestoes() {
    const d = $('#nl-data').value;
    if (!d) { $('#nl-sug').innerHTML = ''; return; }
    const mes = nomeDoMes(d);
    $('#nl-sug').innerHTML = ['Movimento de', 'Folha de pagamento de', 'Notas de entrada de', 'Notas de saída de', 'Despesas de']
      .map(p => `<button type="button" class="btn sm">${p} ${mes}</button>`).join('');
  }
  function novo() {
    const hoje = new Date();
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    $('#nl-cod').value = String(Math.max(0, ...st.lotes.map(l => l.codigo)) + 1).padStart(4, '0');   // o banco confirma ao gravar
    $('#nl-data').value = iso;
    $('#nl-nome').value = '';
    $('#ne-nome').textContent = $('#ne-data').textContent = '';
    sugestoes();
    dlg.showModal();
    $('#nl-nome').focus();
  }
  async function criar() {
    const nome = $('#nl-nome').value.trim(), data = $('#nl-data').value;
    $('#ne-nome').textContent = nome ? '' : 'Dê um nome ao lote';
    $('#ne-data').textContent = data ? '' : 'Informe a data';
    if (!nome || !data) { (nome ? $('#nl-data') : $('#nl-nome')).focus(); return; }
    $('#nl-criar').disabled = true;
    try {
      const cod = await D.novoLote(st, { nome, data });
      dlg.close();
      abrir({ cod });
    } catch (e) { $('#ne-nome').textContent = e.message; }
    finally { $('#nl-criar').disabled = false; }
  }
  $('#nl-data').addEventListener('change', sugestoes);
  $('#nl-sug').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { $('#nl-nome').value = b.textContent; $('#nl-nome').focus(); } });
  $('#nl-criar').addEventListener('click', criar);
  $('#nl-cancelar').addEventListener('click', () => dlg.close());
  dlg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); criar(); } });

  // ── confirmação ──
  function confirmar(msg, digitar = false) {
    const d = $('#dlg-confirm');
    $('#conf-msg').textContent = msg;
    $('#conf-wrap').hidden = !digitar;
    $('#conf-txt').value = '';
    return new Promise(ok => {
      const fim = v => { d.close(); ok(v); };
      $('#conf-sim').onclick = () => {
        if (digitar && $('#conf-txt').value.trim() !== 'CONFIRMA') { toast('Digite CONFIRMA para continuar'); $('#conf-txt').focus(); return; }
        fim(true);
      };
      $('#conf-nao').onclick = () => fim(false);
      d.addEventListener('cancel', () => ok(false), { once: true });
      d.showModal();
      (digitar ? $('#conf-txt') : $('#conf-nao')).focus();
    });
  }

  // ── ações ──
  $('#t-novo').addEventListener('click', novo);
  $('#t-abrir').addEventListener('click', () => abrir(atual()));
  $('#t-liberar').addEventListener('click', async () => {
    const l = atual(); if (!l || l.liberado) return;
    const t = totaisLote(l);
    if (!t.qtd) { toast('Lote vazio não pode ser liberado'); return; }
    if (t.dif) { toast(`O lote ${l.cod} tem diferença de ${fmt(t.dif)} entre débito e crédito: abra e corrija antes de liberar`); return; }
    if (!(await confirmar(`Liberar o lote ${l.cod} (${l.nome})? Os ${t.qtd} lançamentos passam a contar no saldo e o lote fica somente leitura.`))) return;
    await noBanco(() => D.liberarLote(l.id), `Lote ${l.cod} liberado`);
  });
  $('#t-reabrir').addEventListener('click', async () => {
    const l = atual(); if (!l || !l.liberado) return;
    if (!(await confirmar(`Reabrir o lote ${l.cod}? Os lançamentos saem do saldo até ser liberado de novo.`))) return;
    await noBanco(() => D.reabrirLote(l.id), `Lote ${l.cod} reaberto`);
  });
  $('#t-apagar').addEventListener('click', async () => {
    const l = atual(); if (!l || l.liberado) return;
    const t = totaisLote(l);
    if (!(await confirmar(`Apagar o lote ${l.cod} (${l.nome})${t.qtd ? ` com ${t.qtd} lançamentos` : ''}? Isso não pode ser desfeito.`, t.qtd > 0))) return;
    await noBanco(() => D.apagarLote(l.id, t.qtd ? 'CONFIRMA' : null), `Lote ${l.cod} apagado`);
  });
  $('#t-localizar').addEventListener('click', () => {
    const f = $('#findbar');
    f.classList.toggle('open');
    if (f.classList.contains('open')) $('#find').focus(); else { filtro = ''; $('#find').value = ''; render(); }
  });
  $('#find').addEventListener('input', e => { filtro = e.target.value.trim(); sel = 0; render(); });
  $('#find-close').addEventListener('click', () => $('#t-localizar').click());
  $('#f-sit').addEventListener('change', () => { sel = 0; render(); });
  // clique no lote: expande/recolhe. Duplo clique, Enter ou Abrir: entra no lote.
  let cliqueTimer = null;
  $('#grid-body').addEventListener('click', e => {
    const b = e.target.closest('[data-abrir]');
    if (b) { abrir(st.lotes.find(l => l.cod === b.dataset.abrir)); return; }
    const tr = e.target.closest('tr.lote-linha'); if (!tr) return;
    clearTimeout(cliqueTimer);
    cliqueTimer = setTimeout(() => alternar(Number(tr.dataset.i)), 220);   // espera para não brigar com o duplo clique
  });
  $('#grid-body').addEventListener('dblclick', e => {
    const tr = e.target.closest('tr.lote-linha'); if (!tr) return;
    clearTimeout(cliqueTimer);
    abrir(visiveis()[Number(tr.dataset.i)]);
  });
  $('#t-expandir').addEventListener('click', () => {
    const lista = visiveis();
    const todos = lista.every(l => abertos.has(l.cod));
    lista.forEach(l => (todos ? abertos.delete(l.cod) : abertos.add(l.cod)));
    render();
  });
  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Insert') { e.preventDefault(); novo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); if (!$('#findbar').classList.contains('open')) $('#t-localizar').click(); else $('#find').focus(); return; }
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'Delete') { e.preventDefault(); $('#t-apagar').click(); return; }
    if (document.activeElement === $('#grid')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, visiveis().length - 1); render(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); alternar(sel, true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); alternar(sel, false); }
      if (e.key === ' ') { e.preventDefault(); alternar(sel); }
      if (e.key === 'Enter') { e.preventDefault(); abrir(atual()); }
    }
  });

  // voltando de um lote (Fechar), deixa ele selecionado
  const veio = new URLSearchParams(location.search).get('lote');
  if (veio) { const i = visiveis().findIndex(l => l.cod === veio); if (i >= 0) sel = i; }
  render();
  $('#grid').focus();
})();
