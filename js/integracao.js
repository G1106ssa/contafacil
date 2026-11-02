// Central de Integração · Escrita Fiscal (padrão Alterdata): configura por lançamento automático
// e integra notas, apurações e guias do SisFiscal num lote "Integração Fiscal MM/AAAA".
(async () => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const { ctx, st } = await window.Inicio.pronto();
  window.Layout.montar({ pagina: 'integracao', crumb: 'Movimento › <b>Integração Fiscal</b>', ctx });
  const D = window.Dados;
  const toast = window.Layout.toast;
  const pode = ctx.podeEditar;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const fmt = c => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtData = iso => (iso ? iso.split('-').reverse().join('/') : '');
  const fmtComp = iso => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const fmtServ = c => (c && /^\d{6}$/.test(c) ? `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4)}` : c);
  const OPER = { saida: 'Saída', entrada: 'Entrada' };
  const EVENTOS = [['provisao', 'Provisão (apuração do mês)'], ['baixa', 'Baixa (guia paga)'], ['multa', 'Multa'], ['juros', 'Juros']];
  const RETENCOES = ['IRRF', 'PIS', 'COFINS', 'CSLL', 'ISS', 'INSS'];

  let cat, cfg, aba = 'integrar', resultado = null, comp = null;

  async function carregar() {
    [cat, cfg] = await Promise.all([D.integCatalogo(st.empresa.id), D.integConfig(st)]);
    comp ??= cat.competencias[0]?.competencia || new Date().toISOString().slice(0, 8) + '01';
  }

  // ── campo de lançamento automático: código + o que ele faz ──
  const laPorCod = cod => st.automaticos.find(a => a.cod === Number(cod));
  function laDesc(cod) {
    if (cod == null || cod === '') return '<span class="muted">—</span>';
    const a = laPorCod(cod);
    return a ? `${esc(a.nome)} <span class="muted">· D ${a.d} / C ${a.c}</span>` : '<span class="bad">não existe</span>';
  }
  const laTexto = cod => { const a = cod ? laPorCod(cod) : null; return a ? `${a.nome} · D ${a.d} / C ${a.c}` : ''; };
  const campoLa = (valor, campo) => `<span class="la-campo">
      <input class="input code" inputmode="numeric" data-campo="${campo}" value="${valor ?? ''}" ${pode ? '' : 'readonly'}
        aria-label="Código do lançamento automático" title="Código do lançamento automático (Cadastros › Lançamentos automáticos)">
      <span class="la-nome" title="${esc(laTexto(valor))}">${laDesc(valor)}</span></span>`;

  // grava a linha inteira quando um campo muda (a linha guarda a tabela e a chave)
  document.addEventListener('change', async e => {
    const inp = e.target.closest('input[data-campo]');
    if (!inp) return;
    const tr = inp.closest('[data-tabela]');
    const campos = {};
    tr.querySelectorAll('input[data-campo]').forEach(i => { campos[i.dataset.campo] = i.value.trim(); });
    const nome = inp.closest('.la-campo').querySelector('.la-nome');
    nome.innerHTML = laDesc(inp.value.trim());
    nome.title = nome.textContent;
    if (inp.value.trim() && !laPorCod(inp.value.trim())) { toast(`Lançamento automático ${inp.value.trim()} não existe`); return; }
    try {
      await D.salvarInteg(st, tr.dataset.tabela, JSON.parse(tr.dataset.chave), campos);
      cfg = await D.integConfig(st);
      toast('Configuração salva');
    } catch (err) { toast(err.message); }
  });

  // ── abas ──
  $('#abas').addEventListener('click', e => {
    const b = e.target.closest('[data-aba]');
    if (!b) return;
    aba = b.dataset.aba;
    document.querySelectorAll('#abas [data-aba]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    render();
  });
  $('#novo-la').addEventListener('click', async () => {
    if (!pode) { toast('Seu perfil é somente leitura'); return; }
    const r = await window.FormAutomatico.abrir(st);
    if (r) { toast(`Lançamento automático ${r.cod} criado: use o código ${r.cod} na configuração`); render(); }
  });
  $('#novo-la').hidden = !pode;

  function render() {
    const corpo = $('#corpo');
    corpo.innerHTML = { integrar: telaIntegrar, cfop: telaCfop, servico: telaServico, tributo: telaTributo,
                        retencao: telaRetencao, geral: telaGeral }[aba]();
    if (aba === 'integrar') ligarIntegrar();
    if (aba === 'geral') ligarGeral();
  }

  // ── Integrar ──
  function telaIntegrar() {
    const comps = cat.competencias.map(c => `
      <button type="button" class="comp${c.competencia === comp ? ' sel' : ''}" data-comp="${c.competencia}">
        <b>${fmtComp(c.competencia)}</b><span>${c.notas} nota${c.notas === 1 ? '' : 's'}</span>
        <span class="${c.integradas >= c.notas && c.notas ? 'ok' : 'muted'}">${c.integradas} integrada${c.integradas === 1 ? '' : 's'}</span></button>`).join('');
    return `
      <div class="painel">
        <div class="field"><label for="i-comp">Competência</label><input class="input" type="month" id="i-comp" value="${comp.slice(0, 7)}"></div>
        <button class="btn primary" id="i-conferir"><i class="ti ti-list-check"></i>Conferir</button>
        <span class="muted" style="font-size:12px">Conferir não grava nada: mostra o que seria lançado e as pendências.</span>
      </div>
      <div class="comps" aria-label="Competências com notas no fiscal">${comps || '<span class="muted">Nenhuma nota desta empresa no SisFiscal.</span>'}</div>
      <div id="i-res">${resultado ? telaResultado() : ''}</div>`;
  }
  function telaResultado() {
    const r = resultado;
    const total = r.lancamentos.reduce((s, l) => s + Number(l.valor), 0);
    // pendências agrupadas pelo motivo (40 notas do mesmo CFOP = uma linha)
    const grupos = new Map();
    for (const p of r.pendencias) {
      const g = grupos.get(p.motivo) || []; g.push(p.ref); grupos.set(p.motivo, g);
    }
    const pend = [...grupos].map(([motivo, refs]) => `<tr><td><i class="ti ti-alert-triangle bad"></i> ${esc(motivo)}</td>
        <td class="num">${refs.length}</td><td class="muted" title="${esc(refs.join('\n'))}">${esc(refs.slice(0, 3).join(' · '))}${refs.length > 3 ? ` · +${refs.length - 3}` : ''}</td></tr>`).join('');
    const linhas = r.lancamentos.map(l => `<tr>
        <td>${fmtData(l.data)}</td><td title="${esc(l.ref)}">${esc(l.ref)}</td><td class="num">${l.la_codigo}</td>
        <td class="num d" title="${esc(l.debito_nome)}">${l.debito}</td><td class="num c" title="${esc(l.credito_nome)}">${l.credito}</td>
        <td title="${esc(l.historico)}">${esc(l.historico)}</td><td class="num">${fmt(Number(l.valor))}</td></tr>`).join('');
    const gravado = r.gravado ? `<div class="aviso ok-bg"><i class="ti ti-circle-check"></i><span>Integrado no lote <b>${r.lote_codigo}</b> (a liberar).
        Confira e libere no lote.</span><a class="btn sm" href="lote.html?lote=${r.lote_codigo}"><i class="ti ti-folder-open"></i>Abrir lote ${r.lote_codigo}</a></div>` : '';
    return `${gravado}
      <div class="resumo-integ">
        <span><b>${r.lancamentos.length}</b> lançamento${r.lancamentos.length === 1 ? '' : 's'} a integrar · <b>R$ ${fmt(total)}</b></span>
        <span class="${r.pendencias.length ? 'bad' : 'ok'}"><b>${r.pendencias.length}</b> pendência${r.pendencias.length === 1 ? '' : 's'}</span>
        <span class="muted">${r.ja_integrados} já integrado${r.ja_integrados === 1 ? '' : 's'} antes</span>
        <span class="sp"></span>
        ${pode && r.lancamentos.length ? `<button class="btn primary" id="i-gravar"><i class="ti ti-check"></i>Integrar ${r.lancamentos.length} lançamento${r.lancamentos.length === 1 ? '' : 's'} em ${r.competencia}</button>` : ''}
      </div>
      ${pend ? `<h3 class="sub-t">Pendências <span class="muted">(estas notas não entram até configurar)</span></h3>
        <div class="tab-wrap"><table class="rel-tab"><thead><tr><th>Motivo</th><th class="num">Notas</th><th>Exemplos</th></tr></thead><tbody>${pend}</tbody></table></div>` : ''}
      ${linhas ? `<h3 class="sub-t">Lançamentos que serão gerados</h3>
        <div class="tab-wrap"><table class="rel-tab"><thead><tr><th>Data</th><th>Origem</th><th class="num">L. Auto.</th><th class="num">Débito</th>
          <th class="num">Crédito</th><th>Histórico</th><th class="num">Valor</th></tr></thead><tbody>${linhas}</tbody></table></div>` : ''}
      ${!linhas && !pend ? '<p class="vazio">Nada a integrar nesta competência.</p>' : ''}`;
  }
  async function conferir(gravar) {
    const b = gravar ? $('#i-gravar') : $('#i-conferir');
    if (b) b.disabled = true;
    try {
      resultado = await D.integrarFiscal(st.empresa.id, comp, gravar);
      if (gravar) {
        const gravadoAntes = resultado;
        await carregar();
        resultado = await D.integrarFiscal(st.empresa.id, comp, false);   // o que sobrou (pendências)
        resultado.gravado = true; resultado.lote_codigo = gravadoAntes.lote_codigo;
        toast(`${gravadoAntes.lancamentos.length} lançamentos integrados no lote ${gravadoAntes.lote_codigo}`);
      }
      render();
    } catch (e) { toast(e.message); if (b) b.disabled = false; }
  }
  function ligarIntegrar() {
    $('#i-comp').addEventListener('change', e => { if (e.target.value) { comp = e.target.value + '-01'; resultado = null; render(); } });
    $('#i-conferir').addEventListener('click', () => conferir(false));
    $('#corpo').querySelectorAll('[data-comp]').forEach(b => b.addEventListener('click', () => { comp = b.dataset.comp; resultado = null; render(); conferir(false); }));
    $('#i-gravar')?.addEventListener('click', () => conferir(true));
  }

  // ── CFOP ──
  function telaCfop() {
    const linhas = new Map(cat.cfops.map(c => [c.cfop, { ...c }]));
    for (const c of cfg.cfop) if (!linhas.has(c.cfop.trim())) linhas.set(c.cfop.trim(), { cfop: c.cfop.trim(), notas: 0, valor: 0 });
    const conf = Object.fromEntries(cfg.cfop.map(c => [c.cfop.trim(), c]));
    const rows = [...linhas.values()].sort((a, b) => a.cfop.localeCompare(b.cfop)).map(c => `
      <tr data-tabela="integ_cfop" data-chave='${JSON.stringify({ cfop: c.cfop })}'>
        <td class="mono"><b>${c.cfop}</b></td><td>${OPER[c.tipo] || '—'}</td><td class="num">${c.notas || ''}</td>
        <td class="num">${c.valor ? fmt(Number(c.valor)) : ''}</td>
        <td>${campoLa(conf[c.cfop]?.contabil, 'contabil')}</td><td>${campoLa(conf[c.cfop]?.pagamento, 'pagamento')}</td></tr>`).join('');
    return `<p class="ajuda">Para cada CFOP, o lançamento automático do <b>lançamento contábil</b> (ex.: D Clientes / C Receita) e, se quiser,
        o do <b>meio de pagamento</b> (ex.: venda à vista: D Caixa / C Clientes). Nota com mais de um CFOP gera um lançamento por CFOP.</p>
      <div class="tab-wrap"><table class="rel-tab cfg-tab"><thead><tr><th class="w70">CFOP</th><th class="w90">Operação</th><th class="num w70">Notas</th><th class="num w120">Valor</th>
        <th>Lançamento contábil</th><th>Meio de pagamento</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="vazio">Nenhum CFOP nas notas desta empresa (notas de serviço ficam na aba Serviços).</td></tr>'}</tbody></table></div>`;
  }

  // ── Serviços (NFS-e) ──
  function telaServico() {
    const chave = (t, c) => `${t}|${c}`;
    const linhas = new Map();
    for (const t of ['saida', 'entrada']) linhas.set(chave(t, ''), { tipo: t, codigo: '', notas: 0 });
    for (const s of cat.servicos) linhas.set(chave(s.tipo, s.codigo), { ...s });
    for (const s of cfg.servico) if (!linhas.has(chave(s.tipo, s.codigo))) linhas.set(chave(s.tipo, s.codigo), { tipo: s.tipo, codigo: s.codigo, notas: 0 });
    const conf = Object.fromEntries(cfg.servico.map(s => [chave(s.tipo, s.codigo), s]));
    const rows = [...linhas.values()].sort((a, b) => (a.tipo === b.tipo ? a.codigo.localeCompare(b.codigo) : a.tipo === 'saida' ? -1 : 1)).map(s => `
      <tr data-tabela="integ_servico" data-chave='${JSON.stringify({ tipo: s.tipo, codigo: s.codigo })}'>
        <td>${OPER[s.tipo]}</td><td>${s.codigo ? `<b class="mono">${fmtServ(s.codigo)}</b>` : '<i>Padrão (qualquer serviço)</i>'}</td>
        <td class="num">${s.notas || ''}</td>
        <td>${campoLa(conf[chave(s.tipo, s.codigo)]?.contabil, 'contabil')}</td><td>${campoLa(conf[chave(s.tipo, s.codigo)]?.pagamento, 'pagamento')}</td></tr>`).join('');
    return `<p class="ajuda">NFS-e não tem CFOP: a integração usa o <b>código de serviço</b> (LC 116). Sem regra para o código, vale a linha <b>Padrão</b> da operação.</p>
      <div class="tab-wrap"><table class="rel-tab cfg-tab"><thead><tr><th class="w90">Operação</th><th class="w180">Código de serviço</th><th class="num w70">Notas</th>
        <th>Lançamento contábil</th><th>Meio de pagamento</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ── Tributos ──
  function telaTributo() {
    const impostos = [...new Set(['simples', ...cat.tributos, ...cfg.tributo.map(t => t.imposto)])];
    const conf = Object.fromEntries(cfg.tributo.map(t => [`${t.imposto}|${t.evento}`, t.la]));
    const rows = impostos.flatMap(imp => EVENTOS.map(([ev, rot], i) => `
      <tr data-tabela="integ_tributo" data-chave='${JSON.stringify({ imposto: imp, evento: ev })}'>
        <td>${i === 0 ? `<b>${imp === 'simples' ? 'Simples Nacional' : imp.toUpperCase()}</b>` : ''}</td><td>${rot}</td>
        <td>${campoLa(conf[`${imp}|${ev}`], 'la')}</td></tr>`)).join('');
    return `<p class="ajuda"><b>Provisão</b>: o imposto apurado no fiscal, no último dia da competência (ex.: D (-) Simples / C Simples a recolher).
        <b>Baixa, multa e juros</b>: quando a guia é paga, na data do pagamento (ex.: D Simples a recolher / C Banco).</p>
      <div class="tab-wrap"><table class="rel-tab cfg-tab"><thead><tr><th class="w150">Tributo</th><th class="w150">Evento</th><th>Lançamento automático</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ── Retenções ──
  function telaRetencao() {
    const conf = Object.fromEntries(cfg.retencao.map(r => [`${r.tipo}|${r.operacao}`, r.la]));
    const rows = RETENCOES.map(t => `
      <tr><td><b>${t}</b></td>
        <td data-tabela="integ_retencao" data-chave='${JSON.stringify({ tipo: t, operacao: 'saida' })}'>${campoLa(conf[`${t}|saida`], 'la')}</td>
        <td data-tabela="integ_retencao" data-chave='${JSON.stringify({ tipo: t, operacao: 'entrada' })}'>${campoLa(conf[`${t}|entrada`], 'la')}</td></tr>`).join('');
    return `<p class="ajuda">Na <b>nota de saída</b> o cliente retém (vira imposto a recuperar). Na <b>nota de entrada</b> você retém do fornecedor (vira imposto a recolher).</p>
      <div class="tab-wrap"><table class="rel-tab cfg-tab"><thead><tr><th class="w90">Retenção</th><th>Na nota de saída (retido de você)</th><th>Na nota de entrada (você retém)</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }

  // ── Histórico ──
  function telaGeral() {
    const g = cfg.geral;
    return `<p class="ajuda">O histórico de cada lançamento é o do lançamento automático, completado com os dados da nota.</p>
      <div class="geral-integ">
        <label class="check"><input type="checkbox" data-g="hist_numero" ${g.hist_numero ? 'checked' : ''} ${pode ? '' : 'disabled'}> Número da nota no histórico</label>
        <label class="check"><input type="checkbox" data-g="hist_participante" ${g.hist_participante ? 'checked' : ''} ${pode ? '' : 'disabled'}> Nome do cliente / fornecedor no histórico</label>
        <label class="check"><input type="checkbox" data-g="doc_numero" ${g.doc_numero ? 'checked' : ''} ${pode ? '' : 'disabled'}> Número da nota no campo Documento</label>
        <div class="aviso"><i class="ti ti-eye"></i><span id="g-exemplo"></span></div>
      </div>`;
  }
  function ligarGeral() {
    const exemplo = () => {
      const g = cfg.geral;
      $('#g-exemplo').textContent = 'Exemplo: ' + ['Prestação de serviço', g.hist_numero ? 'NF 101' : '', g.hist_participante ? 'Neurolead' : '']
        .filter(Boolean).join(' ') + (g.doc_numero ? ' · Documento: 101' : '');
    };
    exemplo();
    $('#corpo').querySelectorAll('[data-g]').forEach(c => c.addEventListener('change', async () => {
      cfg.geral = { ...cfg.geral, [c.dataset.g]: c.checked };
      exemplo();
      try { await D.salvarIntegGeral(st, cfg.geral); toast('Configuração salva'); } catch (e) { toast(e.message); }
    }));
  }

  try { await carregar(); } catch (e) { toast(e.message); return; }
  render();
  if (cat.competencias.length) conferir(false);
})();
