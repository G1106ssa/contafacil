// Importar lançamentos de planilha (Excel .xlsx/.xls ou .csv) para o lote.
// Colunas: Data | L. Auto. | Débito | Crédito | Valor | Histórico | Documento.
// Com o código do lançamento automático, débito, crédito e histórico podem ficar em branco.
// Confere tudo antes e grava tudo ou nada (como importar_lancamentos no banco).
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
  const fmt = c => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtData = iso => iso.split('-').reverse().join('/');
  const sem = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

  // qual coluna é qual, pelo título (sem acento, sem pontuação, aceita variações)
  const TITULOS = {
    data: t => t === 'data' || t === 'dt',
    auto: t => t.includes('auto') || t === 'la',
    deb: t => t.startsWith('deb') || t.includes('devedora'),
    cre: t => t.startsWith('cred') || t.includes('credora'),
    valor: t => t.startsWith('valor') || t === 'vlr',
    hist: t => t.startsWith('hist'),
    doc: t => t.startsWith('doc') || t === 'nf' || t === 'notafiscal',
  };

  // ── leitura dos valores da célula ──
  function lerData(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {                              // número de série do Excel
      const d = new Date(Math.round((v - 25569) * 86400000));
      return isNaN(d) ? undefined : d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);  // dd/mm/aaaa (padrão brasileiro)
    if (m) {
      const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      const iso = `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      return valida(iso) ? iso : undefined;
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return valida(m[0]) ? m[0] : undefined;
    return undefined;
  }
  function valida(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(a, m - 1, d));
    return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  function lerValor(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Math.round(v * 100);
    let s = String(v).trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');            // 1.234,56
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');       // 1.500 = mil e quinhentos
    if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return NaN;
    return Math.round(Number(s) * 100);
  }
  const lerInt = v => (v == null || String(v).trim() === '' ? null : (/^\d+$/.test(String(v).trim()) ? Number(v) : NaN));

  // ── conferência: devolve uma linha por linha da planilha, com o lançamento pronto ou o erro ──
  function validar(linhas, st) {
    return linhas.map(({ num, c }) => {
      const erros = [];
      const data = lerData(c.data);
      if (data === null) erros.push('sem data'); else if (data === undefined) erros.push(`data "${c.data}" inválida (use dd/mm/aaaa)`);

      const valor = lerValor(c.valor);
      if (valor === null) erros.push('sem valor'); else if (Number.isNaN(valor)) erros.push(`valor "${c.valor}" inválido`);
      else if (valor <= 0) erros.push('valor deve ser maior que zero');

      let auto = lerInt(c.auto), a = null;
      if (Number.isNaN(auto)) { erros.push(`L. Auto. "${c.auto}" inválido`); auto = null; }
      else if (auto != null) {
        a = st.automaticos.find(x => x.cod === auto);
        if (!a) erros.push(`lançamento automático ${auto} não existe`);
      }

      // débito e crédito: o que estiver na planilha vale; em branco, vem do automático
      const ponta = (txt, padrao, nome) => {
        const n = lerInt(txt);
        if (Number.isNaN(n)) { erros.push(`${nome} "${txt}" não é uma chamada`); return null; }
        const ch = n ?? padrao ?? null;
        if (ch == null) return null;
        const conta = porCh.get(ch);
        if (!conta) { erros.push(`${nome}: chamada ${ch} não existe`); return null; }
        if (conta.t !== 'A') { erros.push(`${nome}: ${conta.n} é sintética`); return null; }
        return conta;
      };
      const d = ponta(c.deb, a?.d, 'débito');
      const cr = ponta(c.cre, a?.c, 'crédito');
      if (!d && !cr && !erros.some(e => /débito|crédito/.test(e))) erros.push('sem conta de débito nem de crédito');
      if (d && cr && d.ch === cr.ch) erros.push('débito e crédito na mesma conta');

      let hist = String(c.hist ?? '').trim();
      if (!hist && a) hist = [st.historicos.find(h => h.cod === a.hist)?.texto, a.texto].filter(Boolean).join(' ');
      if (!hist) erros.push('sem histórico');

      const partidas = [];
      if (!erros.length) {
        if (d) partidas.push({ ch: d.ch, nat: 'D', v: valor });
        if (cr) partidas.push({ ch: cr.ch, nat: 'C', v: valor });
      }
      return { num, data, valor, auto, d, cr, hist, doc: String(c.doc ?? '').trim(), erros,
               lanc: erros.length ? null : { data, auto, hist, doc: String(c.doc ?? '').trim(), partidas } };
    });
  }

  // ── leitura do arquivo ──
  async function lerArquivo(arquivo) {
    const XLSX = await window.Libs.sheetJS();
    const buf = await arquivo.arrayBuffer();
    let wb;
    if (/\.(csv|txt)$/i.test(arquivo.name)) {
      // o Excel brasileiro salva CSV em Windows-1252 (ANSI); se não for UTF-8 válido, lê como ANSI
      let texto;
      try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
      catch { texto = new TextDecoder('windows-1252').decode(buf); }
      // raw: não converte "05/01/2026" para data americana
      wb = XLSX.read(texto.replace(/^﻿/, ''), { type: 'string', raw: true });
    } else {
      wb = XLSX.read(buf, { type: 'array', raw: true });
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    // blankrows: mantém as linhas vazias para o nº da linha bater com o do Excel
    const grade = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    // acha a linha de títulos (a primeira que tenha Data e Valor)
    const iTit = grade.findIndex(r => r.some(v => TITULOS.data(sem(v))) && r.some(v => TITULOS.valor(sem(v))));
    if (iTit < 0) throw new Error('Não achei a linha de títulos. A planilha precisa das colunas Data e Valor (baixe o modelo).');
    const mapa = {};
    grade[iTit].forEach((t, i) => {
      const k = Object.keys(TITULOS).find(k => TITULOS[k](sem(t)));
      if (k && mapa[k] == null) mapa[k] = i;
    });
    const linhas = [];
    for (let i = iTit + 1; i < grade.length; i++) {
      const r = grade[i];
      if (!r || r.every(v => v == null || String(v).trim() === '')) continue;
      const c = {};
      for (const k of Object.keys(TITULOS)) c[k] = mapa[k] == null ? null : r[mapa[k]];
      linhas.push({ num: i + 1, c });                        // nº da linha como o Excel mostra
    }
    return { linhas, colunas: Object.keys(mapa), aba: wb.SheetNames[0] };
  }

  // ── modelo para baixar ──
  async function baixarModelo(st) {
    const ExcelJS = await window.Libs.excelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SisContábil';
    const ws = wb.addWorksheet('Lançamentos', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Data', width: 12 }, { header: 'L. Auto.', width: 9 }, { header: 'Débito', width: 9 },
      { header: 'Crédito', width: 9 }, { header: 'Valor', width: 14 }, { header: 'Histórico', width: 52 },
      { header: 'Documento', width: 16 },
    ];
    const cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A56A8' } }; });
    const d = (a, m, dia) => new Date(Date.UTC(a, m - 1, dia));
    const ex = st.automaticos[0];
    [
      [d(2026, 2, 5), ex?.cod ?? null, null, null, 1500, null, 'NF 1101'],
      [d(2026, 2, 10), null, 127, 2, 398.5, 'Pagamento de energia elétrica referente a 01/2026', 'Fatura 90112'],
      [d(2026, 2, 28), null, 149, 2, 42.9, 'Tarifa bancária do mês', null],
    ].forEach(v => ws.addRow(v));
    for (let r = 2; r <= 200; r++) {
      ws.getCell(`A${r}`).numFmt = 'dd/mm/yyyy';
      ws.getCell(`E${r}`).numFmt = '#,##0.00';
    }

    const info = wb.addWorksheet('Como preencher');
    info.getColumn(1).width = 110;
    [
      ['Como preencher a planilha de lançamentos', { bold: true, size: 13 }],
      ['Uma linha por lançamento. Não mude os títulos da primeira linha da aba Lançamentos.', {}],
      ['', {}],
      ['Data: dd/mm/aaaa. Obrigatória.', {}],
      ['L. Auto.: código do lançamento automático. Com ele, Débito, Crédito e Histórico podem ficar em branco.', {}],
      ['Débito e Crédito: a CHAMADA da conta (o número curto), não a classificação. Se preencher, vale o que estiver aqui.', {}],
      ['Valor: número positivo, com vírgula nos centavos. Obrigatório.', {}],
      ['Histórico: obrigatório, a não ser que o lançamento automático já tenha um.', {}],
      ['Documento: opcional (NF, recibo, cheque...).', {}],
      ['', {}],
      ['Antes de gravar, o SisContábil confere linha por linha. Se alguma linha tiver erro, nada é gravado.', { italic: true }],
      ['', {}],
      ['Lançamentos automáticos cadastrados:', { bold: true }],
      ...st.automaticos.map(a => [`${a.cod}  ${a.nome}  (D ${a.d} ${porCh.get(a.d)?.n || ''} / C ${a.c} ${porCh.get(a.c)?.n || ''})`, {}]),
    ].forEach(([t, f]) => { const r = info.addRow([t]); r.font = f; });

    window.Libs.baixar(await wb.xlsx.writeBuffer(), 'modelo_lancamentos_siscontabil.xlsx');
  }

  // ── janela ──
  let dlg, st, aoImportar, conferidas = [];
  function criar() {
    dlg = document.createElement('dialog');
    dlg.id = 'dlg-import';
    dlg.setAttribute('aria-labelledby', 'imp-titulo');
    dlg.innerHTML = `
      <div class="dlg-head"><i class="ti ti-file-import"></i><h2 id="imp-titulo">Importar lançamentos de planilha</h2>
        <button type="button" class="btn sm" id="imp-modelo"><i class="ti ti-download"></i>Baixar modelo</button></div>
      <div class="dlg-body">
        <label class="drop" id="imp-drop" tabindex="0">
          <input type="file" id="imp-arq" accept=".xlsx,.xls,.csv" hidden>
          <i class="ti ti-file-spreadsheet"></i>
          <span><b>Escolha a planilha</b> ou arraste aqui (.xlsx, .xls ou .csv)</span>
          <span class="muted">Colunas: Data · L. Auto. · Débito · Crédito · Valor · Histórico · Documento</span>
        </label>
        <div id="imp-resumo" class="imp-resumo" aria-live="polite" hidden></div>
        <div class="imp-tab" id="imp-tab" hidden></div>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn" id="imp-cancelar">Cancelar</button>
        <button type="button" class="btn primary" id="imp-gravar" disabled><i class="ti ti-check"></i>Importar</button>
      </div>`;
    document.body.appendChild(dlg);
    const arq = $('#imp-arq', dlg), drop = $('#imp-drop', dlg);
    arq.addEventListener('change', () => arq.files[0] && carregarArquivo(arq.files[0]));
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); arq.click(); } });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('sobre'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('sobre'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('sobre'); if (e.dataTransfer.files[0]) carregarArquivo(e.dataTransfer.files[0]); });
    $('#imp-modelo', dlg).addEventListener('click', async () => {
      try { await baixarModelo(st); } catch (e) { window.Layout.toast(e.message); }
    });
    $('#imp-cancelar', dlg).addEventListener('click', () => dlg.close());
    // quem chamou grava (no banco, tudo ou nada); erro do banco aparece aqui e nada é gravado
    $('#imp-gravar', dlg).addEventListener('click', async () => {
      if (!conferidas.length || conferidas.some(l => l.erros.length)) return;
      const b = $('#imp-gravar', dlg);
      b.disabled = true;
      try {
        await aoImportar(conferidas);
        dlg.close();
      } catch (e) {
        const resumo = $('#imp-resumo', dlg);
        resumo.className = 'imp-resumo bad';
        resumo.innerHTML = `<i class="ti ti-alert-triangle"></i> Nada foi gravado: ${esc(e.message)}`;
        b.disabled = false;
      }
    });
  }

  async function carregarArquivo(arquivo) {
    const resumo = $('#imp-resumo', dlg);
    resumo.hidden = false;
    resumo.className = 'imp-resumo';
    resumo.textContent = `Lendo ${arquivo.name}…`;
    $('#imp-gravar', dlg).disabled = true;
    try {
      const { linhas, colunas } = await lerArquivo(arquivo);
      mostrar(arquivo.name, validar(linhas, st), colunas);
    } catch (e) {
      conferidas = [];
      resumo.className = 'imp-resumo bad';
      resumo.innerHTML = `<i class="ti ti-alert-triangle"></i> ${esc(e.message)}`;
      $('#imp-tab', dlg).hidden = true;
    }
  }

  function mostrar(nome, linhas, colunas) {
    conferidas = linhas;
    const comErro = linhas.filter(l => l.erros.length);
    const total = linhas.filter(l => !l.erros.length).reduce((s, l) => s + l.valor, 0);
    const resumo = $('#imp-resumo', dlg);
    const faltam = ['data', 'valor'].filter(k => !colunas.includes(k));
    if (!linhas.length) {
      resumo.className = 'imp-resumo bad';
      resumo.innerHTML = `<i class="ti ti-alert-triangle"></i> ${esc(nome)}: nenhuma linha preenchida abaixo dos títulos.`;
    } else if (comErro.length) {
      resumo.className = 'imp-resumo bad';
      resumo.innerHTML = `<i class="ti ti-alert-triangle"></i> <b>${esc(nome)}</b>: ${linhas.length} linha${linhas.length > 1 ? 's' : ''},
        <b>${comErro.length} com erro</b>. Corrija na planilha e escolha de novo: nada é gravado enquanto houver erro.`;
    } else {
      resumo.className = 'imp-resumo ok';
      resumo.innerHTML = `<i class="ti ti-circle-check"></i> <b>${esc(nome)}</b>: ${linhas.length} lançamento${linhas.length > 1 ? 's' : ''} conferido${linhas.length > 1 ? 's' : ''}, total R$ ${fmt(total)}.`;
    }
    if (faltam.length) resumo.innerHTML += ` Faltam as colunas: ${faltam.join(', ')}.`;
    const tab = $('#imp-tab', dlg);
    tab.hidden = !linhas.length;
    tab.innerHTML = `<table class="grid"><thead><tr>
        <th class="num">Linha</th><th>Data</th><th class="num">L. Auto.</th><th class="num">Débito</th><th class="num">Crédito</th>
        <th class="num">Valor</th><th>Histórico</th><th>Situação</th></tr></thead><tbody>${linhas.map(l => `
      <tr class="${l.erros.length ? 'linha-erro' : ''}">
        <td class="num">${l.num}</td><td>${l.data ? fmtData(l.data) : ''}</td><td class="num">${l.auto ?? ''}</td>
        <td class="num d" title="${esc(l.d?.n || '')}">${l.d?.ch ?? ''}</td><td class="num c" title="${esc(l.cr?.n || '')}">${l.cr?.ch ?? ''}</td>
        <td class="num">${Number.isFinite(l.valor) ? fmt(l.valor) : ''}</td><td title="${esc(l.hist)}">${esc(l.hist)}</td>
        <td>${l.erros.length ? `<span class="bad"><i class="ti ti-x"></i> ${esc(l.erros.join('; '))}</span>`
                             : `<span class="ok"><i class="ti ti-check"></i> ok${l.d && l.cr ? '' : ' (partida simples)'}</span>`}</td></tr>`).join('')}
      </tbody></table>`;
    const b = $('#imp-gravar', dlg);
    b.disabled = !linhas.length || comErro.length > 0;
    b.innerHTML = `<i class="ti ti-check"></i>Importar ${comErro.length ? '' : linhas.length + ' '}lançamento${linhas.length === 1 ? '' : 's'}`;
  }

  function abrir(estado, callback) {
    if (!dlg) criar();
    st = estado; aoImportar = callback; conferidas = [];
    $('#imp-arq', dlg).value = '';
    $('#imp-resumo', dlg).hidden = true;
    $('#imp-tab', dlg).hidden = true;
    $('#imp-gravar', dlg).disabled = true;
    $('#imp-gravar', dlg).innerHTML = '<i class="ti ti-check"></i>Importar';
    dlg.showModal();
    $('#imp-drop', dlg).focus();
  }

  window.ImportarExcel = { abrir, validar, lerArquivo, baixarModelo };
})();
