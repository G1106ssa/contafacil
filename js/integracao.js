// Integração Fiscal → Contábil. O SisFiscal manda o movimento (data, código do lançamento
// automático, valor, cliente/fornecedor, documento). Aqui só se confere e escritura, num lote
// "Integração Fiscal MM/AAAA" por competência. As contas vêm do lançamento automático no plano da empresa.
(async () => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const { ctx, st } = await window.Inicio.pronto();
  window.Layout.montar({ pagina: 'integracao', crumb: 'Movimento › <b>Integração Fiscal</b>', ctx });
  const D = window.Dados;
  const toast = window.Layout.toast;
  const pode = ctx.podeEditar;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const fmt = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtData = iso => (iso ? iso.split('-').reverse().join('/') : '');
  const fmtComp = iso => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const plural = (n, s, p = s + 's') => `${n} ${n === 1 ? s : p}`;

  let resumo = [], resultado = null, comp = null;

  async function carregar() {
    resumo = await D.integResumo(st.empresa.id);
    comp ??= resumo.find(c => c.integrados < c.itens)?.competencia || resumo[0]?.competencia
          || new Date().toISOString().slice(0, 8) + '01';
  }

  function render() {
    const comps = resumo.map(c => {
      const falta = c.itens - c.integrados;
      return `<button type="button" class="comp${c.competencia === comp ? ' sel' : ''}" data-comp="${c.competencia}">
        <b>${fmtComp(c.competencia)}</b><span>${plural(c.itens, 'item', 'itens')} · R$ ${fmt(c.valor)}</span>
        <span class="${falta ? 'muted' : 'ok'}">${falta ? `${falta} a escriturar` : 'tudo escriturado'}</span></button>`;
    }).join('');
    $('#corpo').innerHTML = `
      <div class="painel">
        <div class="field"><label for="i-comp">Competência</label><input class="input" type="month" id="i-comp" value="${comp.slice(0, 7)}"></div>
        <button class="btn primary" id="i-conferir"><i class="ti ti-list-check"></i>Conferir</button>
        <span class="muted" style="font-size:12px">Conferir não grava nada: mostra o que seria lançado e as pendências.</span>
      </div>
      <div class="comps" aria-label="Competências com movimento recebido do fiscal">${comps ||
        `<p class="vazio">Nenhum movimento recebido do SisFiscal ainda. Quando o fiscal enviar as notas desta empresa,
         as competências aparecem aqui para conferir e escriturar.</p>`}</div>
      <div id="i-res">${resultado ? telaResultado() : ''}</div>`;
    ligar();
  }

  function telaResultado() {
    const r = resultado;
    const dif = Number(r.total_debito) - Number(r.total_credito);
    // pendências agrupadas pelo motivo (40 notas com o mesmo código = uma linha)
    const grupos = new Map();
    for (const p of r.pendencias) {
      const g = grupos.get(p.motivo) || { la: p.la, refs: [] };
      g.refs.push(p.ref); grupos.set(p.motivo, g);
    }
    const pend = [...grupos].map(([motivo, g]) => {
      const a = st.automaticos.find(x => x.cod === g.la);
      const acao = pode ? `<button type="button" class="btn sm" data-la="${g.la}"><i class="ti ti-bolt"></i>${a ? 'Configurar' : 'Cadastrar'} ${g.la}</button>` : '';
      return `<tr><td><i class="ti ti-alert-triangle bad"></i> ${esc(motivo)}</td><td class="num">${g.refs.length}</td>
        <td class="muted" title="${esc(g.refs.join('\n'))}">${esc(g.refs.slice(0, 3).join(' · '))}${g.refs.length > 3 ? ` · +${g.refs.length - 3}` : ''}</td>
        <td>${acao}</td></tr>`;
    }).join('');
    const conta = (ch, nome, cls) => ch == null ? '<td class="num muted">—</td>' : `<td class="num ${cls}" title="${esc(nome)}">${ch}</td>`;
    const linhas = r.lancamentos.map(l => `<tr>
        <td>${fmtData(l.data)}</td><td class="mono">${esc(l.documento || '')}</td><td title="${esc(l.nome)}">${esc(l.nome || '')}</td>
        <td class="num" title="${esc(l.la_nome)}">${l.la}</td>${conta(l.debito, l.debito_nome, 'd')}${conta(l.credito, l.credito_nome, 'c')}
        <td title="${esc(l.historico)}">${esc(l.historico)}</td><td class="num">${fmt(l.valor)}</td></tr>`).join('');
    const gravado = r.gravado ? `<div class="aviso ok-bg"><i class="ti ti-circle-check"></i><span>Escriturado no lote <b>${r.lote_codigo}</b> (a liberar).
        Confira e libere no lote.</span><a class="btn sm" href="lote.html?lote=${r.lote_codigo}"><i class="ti ti-folder-open"></i>Abrir lote ${r.lote_codigo}</a></div>` : '';
    return `${gravado}
      <div class="resumo-integ">
        <span><b>${r.lancamentos.length}</b> a escriturar</span>
        <span class="d">D <b>${fmt(r.total_debito)}</b></span><span class="c">C <b>${fmt(r.total_credito)}</b></span>
        ${r.lancamentos.length ? `<span class="${dif ? 'bad' : 'ok'}">${dif ? `diferença ${fmt(Math.abs(dif))} ${dif > 0 ? 'D' : 'C'}` : 'débito = crédito'}</span>` : ''}
        <span class="${r.pendencias.length ? 'bad' : 'muted'}"><b>${r.pendencias.length}</b> pendência${r.pendencias.length === 1 ? '' : 's'}</span>
        <span class="muted">${r.ja_integrados} já escriturado${r.ja_integrados === 1 ? '' : 's'}</span>
        <span class="sp"></span>
        ${pode && r.lancamentos.length ? `<button class="btn primary" id="i-gravar"><i class="ti ti-check"></i>Escriturar ${plural(r.lancamentos.length, 'lançamento')} em ${r.competencia}</button>` : ''}
      </div>
      ${dif && r.lancamentos.length ? `<p class="ajuda">Débito e crédito diferentes: há lançamento automático de partida simples sem o outro lado.
        O lote é gravado assim mesmo, mas só libera quando fechar.</p>` : ''}
      ${pend ? `<h3 class="sub-t">Pendências <span class="muted">(estes itens não entram até resolver)</span></h3>
        <div class="tab-wrap"><table class="rel-tab"><thead><tr><th>Motivo</th><th class="num">Itens</th><th>Exemplos</th><th></th></tr></thead><tbody>${pend}</tbody></table></div>` : ''}
      ${linhas ? `<h3 class="sub-t">Lançamentos que serão gerados</h3>
        <div class="tab-wrap"><table class="rel-tab"><thead><tr><th>Data</th><th>Doc.</th><th>Cliente / fornecedor</th><th class="num">L. Auto.</th>
          <th class="num">Débito</th><th class="num">Crédito</th><th>Histórico</th><th class="num">Valor</th></tr></thead><tbody>${linhas}</tbody></table></div>` : ''}
      ${!linhas && !pend ? `<p class="vazio">Nada a escriturar em ${r.competencia}.</p>` : ''}`;
  }

  async function conferir(gravar) {
    const b = gravar ? $('#i-gravar') : $('#i-conferir');
    if (b) b.disabled = true;
    try {
      const r = await D.integrarMovimento(st.empresa.id, comp, gravar);
      if (gravar) {
        await carregar();
        resultado = await D.integrarMovimento(st.empresa.id, comp, false);   // o que sobrou (pendências)
        resultado.gravado = true; resultado.lote_codigo = r.lote_codigo;
        toast(`${plural(r.lancamentos.length, 'lançamento')} no lote ${r.lote_codigo}`);
      } else resultado = r;
      render();
    } catch (e) { toast(e.message); if (b) b.disabled = false; }
  }

  // pendência de código: abre o cadastro já com o código (novo) ou a linha deste plano (configurar)
  async function resolverLa(cod) {
    const a = st.automaticos.find(x => x.cod === cod);
    const r = await window.FormAutomatico.abrir(st, a ? { registro: a } : { preset: { cod } });
    if (r) { toast(`Lançamento automático ${r.cod} gravado`); conferir(false); }
  }

  function ligar() {
    $('#i-comp').addEventListener('change', e => { if (e.target.value) { comp = e.target.value + '-01'; resultado = null; render(); } });
    $('#i-conferir').addEventListener('click', () => conferir(false));
    $('#corpo').querySelectorAll('[data-comp]').forEach(b => b.addEventListener('click', () => { comp = b.dataset.comp; resultado = null; conferir(false); }));
    $('#corpo').querySelectorAll('[data-la]').forEach(b => b.addEventListener('click', () => resolverLa(Number(b.dataset.la))));
    $('#i-gravar')?.addEventListener('click', () => conferir(true));
  }

  try {
    await carregar();
    render();
    if (resumo.length) conferir(false);
  } catch (e) {
    $('#corpo').innerHTML = `<p class="vazio">${esc(e.message)}</p>`;
  }
})();
