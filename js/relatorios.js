// Relatórios: Balancete, Razão e Diário. Página escolhe em <body data-relatorio="...">.
(async () => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const qual = document.body.dataset.relatorio;
  const TITULOS = { balancete: 'Balancete de verificação', razao: 'Livro Razão', diario: 'Livro Diário' };
  const { ctx, st } = await window.Inicio.pronto();
  window.Layout.montar({ pagina: qual, crumb: `Livros e relatórios › <b>${TITULOS[qual]}</b>`, ctx });

  const M = window.Motor;
  const porCh = M.porCh;
  // período padrão: o mês do último lançamento (ou o mês atual, se ainda não há lançamento)
  const ultimo = st.lotes.flatMap(l => l.lancs.map(x => x.data)).sort().pop()
    || new Date().toISOString().slice(0, 10);
  const [anoP, mesP] = ultimo.split('-').map(Number);
  const iniPadrao = `${anoP}-${String(mesP).padStart(2, '0')}-01`;
  const fimPadrao = new Date(Date.UTC(anoP, mesP, 0)).toISOString().slice(0, 10);

  // ── formatação ──
  const fmt = c => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtV = c => (c ? fmt(c) : '');                       // vazio quando zero (colunas de movimento)
  const fmtDC = c => (c === 0 ? '0,00' : `${fmt(Math.abs(c))} ${c > 0 ? 'D' : 'C'}`);
  const fmtData = iso => iso.split('-').reverse().join('/');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  // ── painel de emissão ──
  const extras = {
    balancete: `
      <div class="field"><label for="p-nivel">Nível</label>
        <select class="input" id="p-nivel">${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === 5 ? ' selected' : ''}>${n}${n === 5 ? ' (analíticas)' : ''}</option>`).join('')}</select></div>
      <label class="check"><input type="checkbox" id="p-zeradas"> Contas sem saldo</label>`,
    razao: `
      <div class="field"><label for="p-conta">Chamada</label>
        <div class="combo"><input class="input code" id="p-conta" data-chamada inputmode="numeric" placeholder="todas" title="F2 abre o plano de contas">
          <button type="button" class="btn icon sm" id="p-conta-busca" aria-label="Abrir plano de contas (F2)"><i class="ti ti-search"></i></button>
          <span class="muted" id="p-conta-nome"></span></div></div>
      <label class="check"><input type="checkbox" id="p-semmov"> Contas com saldo e sem movimento</label>`,
    diario: '',
  }[qual];

  $('#rel').innerHTML = `
    <form class="painel" id="painel" aria-label="Opções do relatório">
      <div class="field"><label for="p-ini">Período de</label><input class="input" type="date" id="p-ini" value="${iniPadrao}" required></div>
      <div class="field"><label for="p-fim">até</label><input class="input" type="date" id="p-fim" value="${fimPadrao}" required></div>
      ${extras}
      <label class="check"><input type="checkbox" id="p-abertos"> Incluir lotes a liberar</label>
      <div class="sp"></div>
      <button class="btn primary" type="submit"><i class="ti ti-eye"></i>Visualizar</button>
      <button class="btn" type="button" id="p-imprimir"><i class="ti ti-printer"></i>Imprimir</button>
      <button class="btn" type="button" id="p-exportar"><i class="ti ti-file-spreadsheet"></i>Excel</button>
    </form>
    <div class="aviso" id="aviso" role="status" hidden></div>
    <section class="rel-doc" id="doc" aria-live="polite"></section>`;

  const opc = () => ({
    ini: $('#p-ini').value, fim: $('#p-fim').value, abertos: $('#p-abertos').checked,
  });

  function cabecalho(o) {
    const agora = new Date();
    return `<header class="rel-cab">
      <div><b>${esc(st.empresa.nome)}</b><span>CNPJ ${esc(st.empresa.cnpj)}</span></div>
      <div class="t"><h1>${TITULOS[qual]}</h1><span>Período: ${fmtData(o.ini)} a ${fmtData(o.fim)}</span>
        ${o.abertos ? '<span class="prov">Provisório: inclui lotes a liberar</span>' : ''}</div>
      <div class="r"><span>Emitido em ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        <span>${esc(ctx.nome)}</span></div>
    </header>`;
  }

  function aviso(o) {
    const el = $('#aviso');
    const abertos = M.abertosNoPeriodo(st, o.ini, o.fim);
    if (!o.abertos && abertos.length) {
      const n = abertos.reduce((s, l) => s + l.qtd, 0);
      el.innerHTML = `<i class="ti ti-alert-triangle"></i><span>${abertos.length === 1 ? 'Há 1 lote a liberar' : `Há ${abertos.length} lotes a liberar`}
        no período (${abertos.map(l => `${l.cod} ${esc(l.nome)}`).join(', ')}; ${n} lançamento${n > 1 ? 's' : ''}) fora deste relatório.
        Só lote liberado entra no saldo.</span><button type="button" class="btn sm" id="incluir">Incluir mesmo assim</button>`;
      el.hidden = false;
      $('#incluir').onclick = () => { $('#p-abertos').checked = true; gerar(); };
    } else el.hidden = true;
  }

  let ultimoCSV = [];
  let ultimoRazao = null;
  const opcoesExcelRazao = () => ({ empresa: st.empresa, ...ultimoRazao, nomeConta: ch => porCh.get(ch)?.n || '' });

  // ── balancete ──
  function balancete(o) {
    const nivel = Number($('#p-nivel').value);
    const zeradas = $('#p-zeradas').checked;
    const linhas = M.balancete(st, o.ini, o.fim, o.abertos)
      .filter(r => r.nivel <= nivel && (zeradas || r.ant || r.deb || r.cred));
    const an = M.balancete(st, o.ini, o.fim, o.abertos).filter(r => r.t === 'A');
    const totD = an.reduce((s, r) => s + r.deb, 0), totC = an.reduce((s, r) => s + r.cred, 0);
    ultimoCSV = [['Classificação', 'Chamada', 'Conta', 'Saldo anterior', 'Débito', 'Crédito', 'Saldo atual'],
      ...linhas.map(r => [r.c, r.ch ?? '', r.n, fmtDC(r.ant), fmt(r.deb), fmt(r.cred), fmtDC(r.fin)])];
    return `
      <table class="rel-tab">
        <thead><tr><th>Classificação</th><th class="num">Chamada</th><th>Conta</th>
          <th class="num">Saldo anterior</th><th class="num">Débito</th><th class="num">Crédito</th><th class="num">Saldo atual</th></tr></thead>
        <tbody>${linhas.length ? linhas.map(r => `
          <tr class="${r.t === 'S' ? 'sint n' + r.nivel : ''} abre" tabindex="0" data-c="${r.c}"
              title="${r.t === 'A' ? 'Clique para ver os lançamentos desta conta' : 'Clique para ver as contas deste grupo'}">
            <td class="mono">${r.c}</td><td class="num">${r.ch ?? ''}</td>
            <td style="padding-left:${8 + (r.nivel - 1) * 12}px">${esc(r.n)}</td>
            <td class="num">${fmtDC(r.ant)}</td><td class="num">${fmtV(r.deb)}</td><td class="num">${fmtV(r.cred)}</td>
            <td class="num">${fmtDC(r.fin)}</td></tr>`).join('')
          : '<tr><td colspan="7" class="vazio">Nenhuma conta com saldo no período</td></tr>'}</tbody>
        <tfoot><tr><td colspan="4">Totais do período</td><td class="num">${fmt(totD)}</td><td class="num">${fmt(totC)}</td>
          <td class="num ${totD === totC ? 'ok' : 'bad'}">${totD === totC
            ? '<i class="ti ti-circle-check"></i> Débito = Crédito'
            : `<i class="ti ti-alert-triangle"></i> Diferença ${fmt(totD - totC)}`}</td></tr></tfoot>
      </table>`;
  }

  // ── balancete: clicar na linha abre o movimento ──
  // analítica: razão da conta no período (no banco: uma chamada a razao(), só ao clicar).
  // sintética: as analíticas do grupo, com os números que o balancete já trouxe (sem nova consulta).
  let dlgMov = null, pilha = [];
  function janelaMov() {
    if (dlgMov) return dlgMov;
    dlgMov = document.createElement('dialog');
    dlgMov.id = 'dlg-mov';
    dlgMov.setAttribute('aria-labelledby', 'mov-titulo');
    dlgMov.innerHTML = `
      <div class="dlg-head"><button type="button" class="btn icon sm" id="mov-voltar" aria-label="Voltar" hidden><i class="ti ti-arrow-left"></i></button>
        <i class="ti ti-list-details"></i><h2 id="mov-titulo"></h2>
        <a class="btn sm" id="mov-razao" hidden><i class="ti ti-book-2"></i>Abrir no Razão</a></div>
      <div class="dlg-body"><div class="muted" id="mov-sub"></div><div class="mov-corpo" id="mov-corpo"></div></div>
      <div class="dlg-foot"><button type="button" class="btn" id="mov-fechar">Fechar</button></div>`;
    document.body.appendChild(dlgMov);
    $('#mov-fechar', dlgMov).addEventListener('click', () => dlgMov.close());
    $('#mov-voltar', dlgMov).addEventListener('click', () => { pilha.pop(); mostrarMov(pilha.pop()); });
    dlgMov.addEventListener('close', () => { pilha = []; });
    $('#mov-corpo', dlgMov).addEventListener('click', e => {
      const tr = e.target.closest('[data-c]');
      if (tr) mostrarMov(tr.dataset.c);
    });
    $('#mov-corpo', dlgMov).addEventListener('keydown', e => {
      const tr = e.target.closest('[data-c]');
      if (tr && e.key === 'Enter') { e.preventDefault(); mostrarMov(tr.dataset.c); }
    });
    return dlgMov;
  }
  function mostrarMov(classif) {
    const d = janelaMov();
    const o = opc();
    const conta = window.PLANO_PADRAO.find(c => c.c === classif);
    pilha.push(classif);
    $('#mov-voltar', d).hidden = pilha.length < 2;
    $('#mov-sub', d).textContent = `Período de ${fmtData(o.ini)} a ${fmtData(o.fim)}${o.abertos ? ' · inclui lotes a liberar' : ''}`;
    const corpo = $('#mov-corpo', d);
    const linkRazao = $('#mov-razao', d);
    if (conta.t === 'A') {
      $('#mov-titulo', d).innerHTML = `<span class="ch">${conta.ch}</span> ${esc(conta.n)} <span class="mono muted">${conta.c}</span>`;
      const b = M.razao(st, o.ini, o.fim, o.abertos, { chamada: conta.ch })[0];
      linkRazao.hidden = false;
      linkRazao.href = `razao.html?conta=${conta.ch}&ini=${o.ini}&fim=${o.fim}${o.abertos ? '&abertos=1' : ''}`;
      corpo.innerHTML = `
        <table class="rel-tab">
          <thead><tr><th>Data</th><th class="num">Nº</th><th>Lote</th><th>Histórico</th><th>Contrapartida</th>
            <th class="num">Débito</th><th class="num">Crédito</th><th class="num">Saldo</th></tr></thead>
          <tbody>
            <tr class="ant"><td colspan="7">Saldo anterior</td><td class="num">${fmtDC(b.ant)}</td></tr>
            ${b.linhas.length ? b.linhas.map(l => `<tr>
              <td>${fmtData(l.data)}</td><td class="num">${l.n}</td><td>${l.lote}</td>
              <td>${esc(l.hist)}${l.doc ? ` <span class="muted">· ${esc(l.doc)}</span>` : ''}</td>
              <td title="${esc(l.contra.map(c => `${c} ${porCh.get(c)?.n || ''}`).join(' / '))}">${l.contra.length ? l.contra.map(c => `${c} ${esc(porCh.get(c)?.n || '')}`).join('; ') : '—'}</td>
              <td class="num">${fmtV(l.deb)}</td><td class="num">${fmtV(l.cred)}</td><td class="num">${fmtDC(l.saldo)}</td></tr>`).join('')
            : '<tr><td colspan="8" class="vazio">Sem lançamentos no período</td></tr>'}
          </tbody>
          <tfoot><tr><td colspan="5">Totais do período</td><td class="num">${fmt(b.deb)}</td><td class="num">${fmt(b.cred)}</td>
            <td class="num">${fmtDC(b.fin)}</td></tr></tfoot>
        </table>`;
    } else {
      $('#mov-titulo', d).innerHTML = `${esc(conta.n)} <span class="mono muted">${conta.c}</span>`;
      linkRazao.hidden = true;
      const filhas = M.balancete(st, o.ini, o.fim, o.abertos)
        .filter(r => r.t === 'A' && r.c.startsWith(conta.c + '.') && (r.ant || r.deb || r.cred));
      const tot = filhas.reduce((s, r) => ({ ant: s.ant + r.ant, deb: s.deb + r.deb, cred: s.cred + r.cred, fin: s.fin + r.fin }), { ant: 0, deb: 0, cred: 0, fin: 0 });
      corpo.innerHTML = `
        <table class="rel-tab">
          <thead><tr><th class="num">Chamada</th><th>Conta</th><th class="num">Saldo anterior</th><th class="num">Débito</th>
            <th class="num">Crédito</th><th class="num">Saldo atual</th></tr></thead>
          <tbody>${filhas.length ? filhas.map(r => `
            <tr class="abre" tabindex="0" data-c="${r.c}" title="Ver os lançamentos de ${esc(r.n)}">
              <td class="num"><b>${r.ch}</b></td><td>${esc(r.n)} <span class="mono muted">${r.c}</span></td>
              <td class="num">${fmtDC(r.ant)}</td><td class="num">${fmtV(r.deb)}</td><td class="num">${fmtV(r.cred)}</td>
              <td class="num">${fmtDC(r.fin)}</td></tr>`).join('')
            : '<tr><td colspan="6" class="vazio">Nenhuma conta com saldo neste grupo</td></tr>'}</tbody>
          <tfoot><tr><td colspan="2">Total do grupo</td><td class="num">${fmtDC(tot.ant)}</td><td class="num">${fmt(tot.deb)}</td>
            <td class="num">${fmt(tot.cred)}</td><td class="num">${fmtDC(tot.fin)}</td></tr></tfoot>
        </table>`;
    }
    if (!d.open) d.showModal();
    (corpo.querySelector('[data-c]') || $('#mov-fechar', d)).focus();
  }

  // ── razão ──
  function razao(o) {
    const txt = $('#p-conta').value.trim();
    const chamada = txt ? Number(txt) : null;
    const blocos = M.razao(st, o.ini, o.fim, o.abertos, { chamada, comSaldoSemMovimento: $('#p-semmov').checked });
    ultimoRazao = { ...o, blocos };
    ultimoCSV = [['Chamada', 'Conta', 'Data', 'Nº', 'Lote', 'Histórico', 'Documento', 'Contrapartida', 'Débito', 'Crédito', 'Saldo']];
    if (!blocos.length) return '<p class="vazio">Nenhuma conta com movimento no período.</p>';
    return blocos.map(b => {
      ultimoCSV.push([b.conta.ch, b.conta.n, '', '', '', 'Saldo anterior', '', '', '', '', fmtDC(b.ant)]);
      b.linhas.forEach(l => ultimoCSV.push([b.conta.ch, b.conta.n, fmtData(l.data), l.n, l.lote, l.hist, l.doc,
        l.contra.join(', '), fmt(l.deb), fmt(l.cred), fmtDC(l.saldo)]));
      return `
      <section class="razao-conta">
        <h2><span class="ch">${b.conta.ch}</span> ${esc(b.conta.n)} <span class="mono muted">${b.conta.c}</span></h2>
        <table class="rel-tab">
          <thead><tr><th>Data</th><th class="num">Nº</th><th>Lote</th><th>Histórico</th><th>Contrapartida</th>
            <th class="num">Débito</th><th class="num">Crédito</th><th class="num">Saldo</th></tr></thead>
          <tbody>
            <tr class="ant"><td colspan="7">Saldo anterior</td><td class="num">${fmtDC(b.ant)}</td></tr>
            ${b.linhas.map(l => `<tr>
              <td>${fmtData(l.data)}</td><td class="num">${l.n}</td><td>${l.lote}</td>
              <td title="${esc(l.doc)}">${esc(l.hist)}${l.doc ? ` <span class="muted">· ${esc(l.doc)}</span>` : ''}</td>
              <td title="${esc(l.contra.map(c => `${c} ${porCh.get(c)?.n || ''}`).join(' / '))}">${l.contra.length ? l.contra.join(', ') : '—'}</td>
              <td class="num">${fmtV(l.deb)}</td><td class="num">${fmtV(l.cred)}</td><td class="num">${fmtDC(l.saldo)}</td></tr>`).join('')}
          </tbody>
          <tfoot><tr><td colspan="5">Totais da conta</td><td class="num">${fmt(b.deb)}</td><td class="num">${fmt(b.cred)}</td>
            <td class="num">${fmtDC(b.fin)}</td></tr></tfoot>
        </table>
      </section>`;
    }).join('');
  }

  // ── diário ──
  function diario(o) {
    const lancs = M.diario(st, o.ini, o.fim, o.abertos);
    let totD = 0, totC = 0;
    ultimoCSV = [['Data', 'Nº', 'Lote', 'Chamada', 'Conta', 'Histórico', 'Documento', 'Débito', 'Crédito']];
    if (!lancs.length) return '<p class="vazio">Nenhum lançamento no período.</p>';
    const corpo = lancs.map(l => {
      // débitos primeiro, créditos depois (com "a"), como no diário tradicional
      const ps = [...l.partidas].sort((a, b) => (a.nat === b.nat ? 0 : a.nat === 'D' ? -1 : 1));
      const linhas = ps.map((p, i) => {
        const c = porCh.get(p.ch);
        if (p.nat === 'D') totD += p.v; else totC += p.v;
        ultimoCSV.push([fmtData(l.data), l.n, l.lote, p.ch, c?.n || '', l.hist, l.doc, p.nat === 'D' ? fmt(p.v) : '', p.nat === 'C' ? fmt(p.v) : '']);
        return `<tr class="${i === 0 ? 'ini' : ''}">
          <td>${i === 0 ? fmtData(l.data) : ''}</td><td class="num">${i === 0 ? l.n : ''}</td>
          <td class="${p.nat === 'C' ? 'cred-conta' : ''}">${p.nat === 'C' ? 'a ' : ''}<b>${p.ch}</b> ${esc(c?.n || '?')}</td>
          <td class="num">${p.nat === 'D' ? fmt(p.v) : ''}</td><td class="num">${p.nat === 'C' ? fmt(p.v) : ''}</td></tr>`;
      }).join('');
      return linhas + `<tr class="hist"><td></td><td></td><td colspan="3">${esc(l.hist)}${l.doc ? ` · ${esc(l.doc)}` : ''} <span class="muted">(lote ${l.lote})</span></td></tr>`;
    }).join('');
    return `
      <table class="rel-tab diario">
        <thead><tr><th>Data</th><th class="num">Nº</th><th>Conta / histórico</th><th class="num">Débito</th><th class="num">Crédito</th></tr></thead>
        <tbody>${corpo}</tbody>
        <tfoot><tr><td colspan="3">Totais do período (${lancs.length} lançamento${lancs.length > 1 ? 's' : ''})</td>
          <td class="num">${fmt(totD)}</td><td class="num">${fmt(totC)}</td></tr></tfoot>
      </table>`;
  }

  // ── gerar, imprimir, exportar ──
  function gerar() {
    const o = opc();
    if (!o.ini || !o.fim || o.ini > o.fim) { window.Layout.toast('Período inválido'); return; }
    aviso(o);
    const corpo = { balancete, razao, diario }[qual](o);
    $('#doc').innerHTML = cabecalho(o) + corpo;
  }
  if (qual === 'balancete') {
    $('#doc').addEventListener('click', e => { const tr = e.target.closest('tr[data-c]'); if (tr) mostrarMov(tr.dataset.c); });
    $('#doc').addEventListener('keydown', e => {
      const tr = e.target.closest('tr[data-c]');
      if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); mostrarMov(tr.dataset.c); }
    });
  }
  // abrir já filtrado: razao.html?conta=52&ini=2026-01-01&fim=2026-01-31&abertos=1
  const url = new URLSearchParams(location.search);
  if (url.get('ini')) $('#p-ini').value = url.get('ini');
  if (url.get('fim')) $('#p-fim').value = url.get('fim');
  if (url.get('abertos')) $('#p-abertos').checked = true;
  if (url.get('conta') && $('#p-conta')) $('#p-conta').value = url.get('conta');
  $('#painel').addEventListener('submit', e => { e.preventDefault(); gerar(); });
  $('#painel').addEventListener('change', e => { if (e.target.matches('input[type=checkbox], select')) gerar(); });
  $('#p-imprimir').addEventListener('click', () => { gerar(); window.print(); });
  $('#p-exportar').addEventListener('click', async () => {
    gerar();
    if (qual === 'razao') {                        // Razão: .xlsx estruturado por conta
      if (!ultimoRazao?.blocos.length) { window.Layout.toast('Nada para exportar no período'); return; }
      const b = $('#p-exportar');
      b.disabled = true;
      try { await window.ExcelRazao.baixar(opcoesExcelRazao()); window.Layout.toast('Excel do Razão gerado'); }
      catch (e) { window.Layout.toast(e.message); }
      finally { b.disabled = false; }
      return;
    }
    const csv = '﻿' + ultimoCSV.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${qual}_${opc().ini}_${opc().fim}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  if (qual === 'razao') {
    $('#p-conta').addEventListener('input', e => {
      const c = porCh.get(Number(e.target.value));
      $('#p-conta-nome').textContent = e.target.value.trim() ? (c ? c.n : 'chamada não existe') : 'todas com movimento';
    });
    $('#p-conta').addEventListener('change', gerar);   // escolheu no plano: já mostra o razão da conta
    $('#p-conta-busca').addEventListener('click', () => window.BuscaConta.abrir($('#p-conta')));
    $('#p-conta').dispatchEvent(new Event('input'));
  }
  gerar();
  window.SisRelatorio = { opcoesExcelRazao };      // usado para conferir o Excel em teste
})();
