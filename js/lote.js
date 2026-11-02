// Tela do lote: grade, janela de lançamento e capa de totais. Grava no banco (Dados) e relê.
// Dinheiro sempre em centavos inteiros; o banco confere as regras (partida dobrada, trava, liberado).
(async () => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const { ctx, st } = await window.Inicio.pronto();
  const D = window.Dados;

  // ── plano, históricos e lançamentos automáticos da empresa ──
  const contas = st.plano;
  const porChamada = new Map(contas.filter(c => c.ch).map(c => [c.ch, c]));
  let historicos = [], automaticos = [];

  function acharConta(txt) {
    txt = String(txt || '').trim();
    if (!txt) return {};
    // lançamento é pela chamada (código reduzido); a classificação longa não se digita aqui
    if (!/^\d+$/.test(txt)) return { erro: 'Digite a chamada da conta (F2 busca pelo nome)' };
    const c = porChamada.get(Number(txt));
    if (!c) return { erro: `Chamada ${txt} não existe` };
    if (c.t !== 'A') return { erro: `Conta ${c.n} é sintética e não recebe lançamento` };
    return { conta: c };
  }

  // ── dinheiro e datas ──
  const fmt = cents => (cents < 0 ? '-' : '') +
    (Math.abs(cents) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function parseMoney(s) {
    s = String(s ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    if (!s) return null;
    if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return NaN;
    const [i, d = ''] = s.split('.');
    const sinal = i.startsWith('-') ? -1 : 1;
    return sinal * (Math.abs(parseInt(i, 10)) * 100 + parseInt((d + '00').slice(0, 2), 10));
  }
  const parseInt0 = s => (String(s ?? '').trim() === '' ? null : (/^\d+$/.test(String(s).trim()) ? Number(s) : NaN));
  const fmtData = iso => (iso ? iso.split('-').reverse().join('/') : '');

  // ── estado ──
  historicos = st.historicos;
  automaticos = st.automaticos;
  // abre o lote escolhido na lista (lote.html?lote=0005); sem lote válido, volta para a lista
  const codLote = new URLSearchParams(location.search).get('lote');
  let lote = st.lotes.find(l => l.cod === codLote);
  if (!lote) { location.replace('lotes.html'); return; }
  window.Layout.montar({ pagina: 'lote', crumb: `Movimento › <a href="lotes.html">Lotes</a> › <b>Lote ${lote.cod}</b>`, ctx });
  const fechar = () => { location.href = `lotes.html?lote=${encodeURIComponent(lote.cod)}`; };
  let lancs = lote.lancs;
  let sel = 0;               // índice em lancs
  let liberado = lote.liberado;
  let filtro = '';
  let inf = lote.inf;        // capa do lote
  const soLeitura = !ctx.podeEditar;
  const travado = () => liberado || soLeitura || lote.tipo.startsWith('encerramento');
  // relê do banco depois de gravar: o que aparece é sempre o que ficou gravado
  async function recarregar(idSelecionar) {
    Object.assign(st, await D.carregarEstado(ctx.empresa));
    historicos = st.historicos; automaticos = st.automaticos;
    lote = st.lotes.find(l => l.id === lote.id);
    if (!lote) { location.replace('lotes.html'); return; }
    lancs = lote.lancs; liberado = lote.liberado; inf = lote.inf;
    if (idSelecionar) sel = Math.max(0, lancs.findIndex(l => l.id === idSelecionar));
    sel = Math.min(sel, Math.max(lancs.length - 1, 0));
    render();
  }
  async function salvarCabecalho() {
    try { await D.atualizarLote(lote.id, { nome: $('#lote-nome').value.trim() || lote.nome, data: $('#lote-data').value || lote.data }); }
    catch (e) { toast(e.message); $('#lote-nome').value = lote.nome; $('#lote-data').value = lote.data; }
  }
  $('#lote-emp').innerHTML = `Empresa: <b>${st.empresa.nome}</b>`;
  $('#lote-cod').value = lote.cod;
  $('#lote-nome').value = lote.nome;
  $('#lote-data').value = lote.data;
  $('#lote-nome').addEventListener('change', salvarCabecalho);
  $('#lote-data').addEventListener('change', salvarCabecalho);

  const simples = l => l.partidas.length === 2 && l.partidas[0].nat === 'D' && l.partidas[1].nat === 'C';
  function calc() {
    let vd = 0, vc = 0, cd = 0, cc = 0, la = 0;
    for (const l of lancs) {
      if (l.auto) la += l.auto;
      for (const p of l.partidas) {
        if (p.nat === 'D') { vd += p.v; cd += p.ch; } else { vc += p.v; cc += p.ch; }
      }
    }
    return { vd, vc, cd, cc, la };
  }

  // ── grade ──
  function casa(l) {
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return [l.hist, l.doc, fmtData(l.data), String(l.n), ...l.partidas.flatMap(p =>
      [String(p.ch), porChamada.get(p.ch)?.n || '', fmt(p.v)])].some(t => t.toLowerCase().includes(q));
  }
  function linha(l, i, p, primeira) {
    const tr = document.createElement('tr');
    tr.dataset.i = i;
    if (!primeira) tr.className = 'cont';
    const deb = p ? (p.nat === 'D' ? p : null) : l.partidas[0];
    const cre = p ? (p.nat === 'C' ? p : null) : l.partidas[1];
    const valor = p ? p.v : l.partidas[0].v;
    const td = (txt, cls = '') => `<td class="${cls}" title="${String(txt).replace(/"/g, '&quot;')}">${txt}</td>`;
    tr.innerHTML =
      td(primeira ? l.n : '', 'num first') + td(primeira ? fmtData(l.data) : '', 'first') +
      td(primeira && l.auto ? l.auto : '', 'num first') +
      td(deb ? deb.ch : '', 'num d') + td(deb ? porChamada.get(deb.ch)?.n : '') +
      td(cre ? cre.ch : '', 'num c') + td(cre ? porChamada.get(cre.ch)?.n : '') +
      td(primeira ? l.hist : '', 'first') + td(fmt(valor), 'num');
    tr.setAttribute('aria-selected', i === sel ? 'true' : 'false');
    return tr;
  }
  function renderGrade() {
    const body = $('#grid-body');
    body.innerHTML = '';
    let vis = 0;
    lancs.forEach((l, i) => {
      if (!casa(l)) return;
      vis++;
      if (simples(l)) body.appendChild(linha(l, i, null, true));
      else l.partidas.forEach((p, k) => body.appendChild(linha(l, i, p, k === 0)));
    });
    $('#grid-empty').hidden = lancs.length > 0;
    $('#registros').textContent = filtro
      ? `Registros: ${vis} de ${lancs.length}` : `Registros: ${lancs.length}` + (lancs[sel] ? ` · selecionado: nº ${lancs[sel].n}` : '');
    const l = lancs[sel];
    $('#det-doc').value = l?.doc || '';
    $('#det-hist').value = l?.hist || '';
  }

  // ── capa de totais ──
  const COLS = [
    { k: 'vd', t: 'Valor a débito', dinheiro: true }, { k: 'vc', t: 'Valor a crédito', dinheiro: true },
    { k: 'la', t: 'Lanç. automático' }, { k: 'cd', t: 'Contas a débito' }, { k: 'cc', t: 'Contas a crédito' },
  ];
  function montarTotais() {
    const g = $('#tot-grid');
    let html = '<span></span>' + COLS.map(c => `<span class="hd">${c.t}</span>`).join('');
    html += '<span class="rl">Informado</span>' + COLS.map(c =>
      `<input class="input ${c.dinheiro ? 'money' : 'money'}" data-inf="${c.k}" aria-label="${c.t} informado" inputmode="decimal">`).join('');
    html += '<span class="rl">Calculado</span>' + COLS.map(c => `<span class="v" data-calc="${c.k}"></span>`).join('');
    html += '<span class="rl">Diferença</span>' + COLS.map(c => `<span class="v dif" data-dif="${c.k}"></span>`).join('');
    g.innerHTML = html;
    for (const c of COLS) {
      const inp = $(`[data-inf="${c.k}"]`, g);
      inp.value = inf[c.k] == null ? '' : (c.dinheiro ? fmt(inf[c.k]) : String(inf[c.k]));
      inp.addEventListener('change', async () => {
        const v = c.dinheiro ? parseMoney(inp.value) : parseInt0(inp.value);
        if (Number.isNaN(v)) { inp.setAttribute('aria-invalid', 'true'); toast('Valor informado inválido'); return; }
        inp.removeAttribute('aria-invalid');
        inf[c.k] = v;
        inp.value = v == null ? '' : (c.dinheiro ? fmt(v) : String(v));
        renderTotais();
        try { await D.atualizarLote(lote.id, { inf }); } catch (e) { toast(e.message); }
      });
    }
  }
  function renderTotais() {
    const k = calc();
    for (const c of COLS) {
      const show = v => (c.dinheiro ? fmt(v) : String(v));
      $(`[data-calc="${c.k}"]`).textContent = show(k[c.k]);
      const el = $(`[data-dif="${c.k}"]`);
      if (inf[c.k] == null) { el.textContent = '—'; el.className = 'v dif muted'; continue; }
      const d = inf[c.k] - k[c.k];
      el.innerHTML = d === 0 ? `<i class="ti ti-check" aria-hidden="true"></i> ${show(0)}` : show(d);
      el.className = 'v dif ' + (d === 0 ? 'ok' : 'bad');
    }
    const dif = k.vd - k.vc;
    const eq = $('#eq');
    eq.innerHTML = dif === 0
      ? `<i class="ti ti-circle-check"></i> Débito − Crédito: ${fmt(0)}`
      : `<i class="ti ti-alert-triangle"></i> Débito − Crédito: ${fmt(dif)} — o lote não libera com diferença`;
    eq.className = 'eq ' + (dif === 0 ? 'ok' : 'bad');
    estadoBotoes(dif);
  }

  // ── situação e botões ──
  function estadoBotoes(dif = calc().vd - calc().vc) {
    const tem = lancs.length > 0 && lancs[sel];
    const t = travado();
    $('#t-novo').disabled = t;
    $('#t-importar').disabled = t;
    $('#t-editar').disabled = t || !tem;
    $('#t-excluir').disabled = t || !tem;
    $('#t-liberar').disabled = t || lancs.length === 0 || dif !== 0;
    $('#t-reabrir').disabled = !liberado || soLeitura || lote.tipo.startsWith('encerramento');
    $('#t-apagar').disabled = t;
    $('#lote-nome').readOnly = t;
    $('#lote-data').readOnly = t;
    const chip = $('#situacao');
    chip.className = 'chip ' + (liberado ? 'success' : 'warning');
    chip.innerHTML = liberado ? '<i class="ti ti-lock"></i>Liberado' : '<i class="ti ti-clock"></i>A liberar';
    if (soLeitura) chip.innerHTML += ' · somente leitura';
    $$('[data-inf]').forEach(i => { i.readOnly = t; });
  }
  function render() { renderGrade(); renderTotais(); }

  // ── toast e confirmação ──
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }
  function confirmar(msg, digitar = false) {
    const d = $('#dlg-confirm');
    $('#conf-msg').textContent = msg;
    $('#conf-wrap').hidden = !digitar;
    $('#conf-txt').value = '';
    return new Promise(res => {
      const fim = ok => { d.close(); $('#conf-sim').onclick = $('#conf-nao').onclick = null; res(ok); };
      $('#conf-sim').onclick = () => {
        if (digitar && $('#conf-txt').value.trim() !== 'CONFIRMA') { toast('Digite CONFIRMA para continuar'); $('#conf-txt').focus(); return; }
        fim(true);
      };
      $('#conf-nao').onclick = () => fim(false);
      d.addEventListener('cancel', () => res(false), { once: true });
      d.showModal();
      (digitar ? $('#conf-txt') : $('#conf-sim')).focus();
    });
  }

  // ── janela de lançamento ──
  const dlg = $('#dlg-lanc');
  let editando = null;      // índice ou null
  let multiOn = false;
  let histAuto = '';        // último texto preenchido automaticamente

  function saldoNoLote(ch) {
    let s = 0;
    lancs.forEach((l, i) => {
      if (i === editando) return;
      for (const p of l.partidas) if (p.ch === ch) s += p.nat === 'D' ? p.v : -p.v;
    });
    return s;
  }
  const fmtSaldo = s => (s === 0 ? fmt(0) : `${fmt(Math.abs(s))} ${s > 0 ? 'D' : 'C'}`);

  function erro(id, msg) {
    const e = $('#e-' + id);
    if (e) e.textContent = msg || '';
    const campo = { valor: '#f-valor', deb: '#f-deb', cre: '#f-cre', hist: '#f-hist', auto: '#f-auto' }[id];
    if (campo) $(campo).setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function atualizarConta(inp) {
    const r = acharConta(inp.value);
    const nome = $('#' + inp.id + '-nome');
    nome.value = r.conta ? r.conta.n : '';
    nome.title = r.conta ? r.conta.c : '';
    const id = inp.id === 'f-deb' ? 'deb' : 'cre';
    erro(id, r.erro);
    $(id === 'deb' ? '#s-deb' : '#s-cre').textContent = r.conta ? fmtSaldo(saldoNoLote(r.conta.ch)) : '—';
    return r;
  }
  function aplicarHistorico(cod) {
    const h = historicos.find(x => x.cod === Number(cod));
    $('#f-hist-dica').textContent = h ? h.texto : (String(cod).trim() ? 'Histórico padrão não cadastrado' : historicos.map(x => `${x.cod} ${x.texto}`).slice(0, 3).join(' · '));
    if (h && ($('#f-hist').value.trim() === '' || $('#f-hist').value === histAuto)) {
      histAuto = h.texto + ' ';
      $('#f-hist').value = histAuto;
    }
  }
  function aplicarAuto() {
    const v = $('#f-auto').value.trim();
    if (!v) { $('#f-auto-nome').value = ''; erro('auto', ''); return; }
    const a = automaticos.find(x => x.cod === Number(v));
    if (!a) { $('#f-auto-nome').value = ''; erro('auto', `Lançamento automático ${v} não existe (há: ${automaticos.map(x => x.cod).join(', ')})`); return; }
    erro('auto', '');
    $('#f-auto-nome').value = a.nome;
    if (!multiOn) {
      $('#f-deb').value = a.d; atualizarConta($('#f-deb'));
      $('#f-cre').value = a.c; atualizarConta($('#f-cre'));
    }
    // histórico = padrão do automático + complemento; só preenche se o usuário não escreveu o dele
    $('#f-hist-cod').value = a.hist ?? '';
    const h = historicos.find(x => x.cod === a.hist);
    $('#f-hist-dica').textContent = h ? h.texto : '';
    const texto = [h?.texto, a.texto].filter(Boolean).join(' ');
    if (texto && ($('#f-hist').value.trim() === '' || $('#f-hist').value === histAuto)) {
      histAuto = texto + ' ';
      $('#f-hist').value = histAuto;
    }
  }

  // F9: transforma as contas e o histórico digitados num lançamento automático novo
  async function criarAutomatico() {
    if (multiOn) { toast('Lançamento automático liga uma conta de débito e uma de crédito: saia de Múltiplos'); return; }
    const reg = await window.FormAutomatico.abrir(st, { preset: {
      d: $('#f-deb').value.trim(), c: $('#f-cre').value.trim(), hist: $('#f-hist-cod').value.trim(),
      texto: $('#f-hist-cod').value.trim() ? '' : $('#f-hist').value.trim(),
    } });
    if (reg) {
      $('#f-auto').value = reg.cod;
      $('#f-auto-nome').value = reg.nome;
      erro('auto', '');
      toast(`Lançamento automático ${reg.cod} criado`);
    }
    $('#f-auto').focus();
  }

  // modo múltiplos
  function linhaMulti(p = { ch: '', nat: 'D', v: null }) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="input code" data-m="ch" data-chamada inputmode="numeric" aria-label="Chamada da conta (F2 abre o plano)" value="${p.ch}"></td>
      <td><button type="button" class="btn icon sm" data-pickm aria-label="Buscar conta (F2)"><i class="ti ti-search"></i></button></td>
      <td><input class="input" data-m="nome" readonly tabindex="-1" aria-label="Nome da conta"></td>
      <td><select class="input" data-m="nat" aria-label="Débito ou crédito"><option value="D">D</option><option value="C">C</option></select></td>
      <td><input class="input money" data-m="v" inputmode="decimal" aria-label="Valor" value="${p.v == null ? '' : fmt(p.v)}"></td>
      <td><button type="button" class="btn icon sm" data-rm aria-label="Remover partida"><i class="ti ti-x"></i></button></td>`;
    $('[data-m="nat"]', tr).value = p.nat;
    const atualiza = () => {
      const r = acharConta($('[data-m="ch"]', tr).value);
      $('[data-m="nome"]', tr).value = r.conta ? r.conta.n : (r.erro || '');
      $('[data-m="ch"]', tr).setAttribute('aria-invalid', r.erro ? 'true' : 'false');
      const nat = $('[data-m="nat"]', tr).value;
      $('[data-m="ch"]', tr).classList.toggle('debit', nat === 'D');
      $('[data-m="ch"]', tr).classList.toggle('credit', nat === 'C');
      difMulti();
    };
    $('[data-m="ch"]', tr).addEventListener('input', atualiza);
    $('[data-m="nat"]', tr).addEventListener('change', atualiza);
    $('[data-m="v"]', tr).addEventListener('input', difMulti);
    $('[data-m="v"]', tr).addEventListener('blur', e => { const v = parseMoney(e.target.value); if (v != null && !Number.isNaN(v)) e.target.value = fmt(v); });
    $('[data-pickm]', tr).addEventListener('click', () => abrirBusca($('[data-m="ch"]', tr)));
    $('[data-rm]', tr).addEventListener('click', () => { tr.remove(); difMulti(); });
    $('#multi-body').appendChild(tr);
    atualiza();
    return tr;
  }
  function lerMulti() {
    return $$('#multi-body tr').map(tr => ({
      chTxt: $('[data-m="ch"]', tr).value, nat: $('[data-m="nat"]', tr).value, v: parseMoney($('[data-m="v"]', tr).value), tr,
    }));
  }
  function difMulti() {
    let d = 0;
    for (const p of lerMulti()) if (p.v && !Number.isNaN(p.v)) d += p.nat === 'D' ? p.v : -p.v;
    const el = $('#multi-dif');
    el.textContent = `D − C: ${fmt(d)}`;
    el.className = 'eq ' + (d === 0 ? 'ok' : 'bad');
  }
  function setMulti(on, partidas) {
    multiOn = on;
    $('#btn-multi').setAttribute('aria-pressed', String(on));
    $$('.single', dlg).forEach(el => el.classList.toggle('hidden', on));
    $('#multi').classList.toggle('open', on);
    $('#multi-body').innerHTML = '';
    if (on) {
      const base = partidas || (() => {
        const v = parseMoney($('#f-valor').value);
        const ps = [];
        if ($('#f-deb').value) ps.push({ ch: $('#f-deb').value, nat: 'D', v: Number.isNaN(v) ? null : v });
        if ($('#f-cre').value) ps.push({ ch: $('#f-cre').value, nat: 'C', v: Number.isNaN(v) ? null : v });
        while (ps.length < 3) ps.push({ ch: '', nat: ps.length ? 'C' : 'D', v: null });
        return ps;
      })();
      base.forEach(p => linhaMulti(p));
    }
    difMulti();
  }

  function abrirLanc(i) {
    if (soLeitura) { toast('Seu perfil é somente leitura'); return; }
    if (travado()) { toast('Lote liberado: reabra o lote para lançar'); return; }
    editando = i;
    const l = i == null ? null : lancs[i];
    $('#lanc-titulo').textContent = l ? `Editar lançamento nº ${l.n}` : 'Novo lançamento';
    $('#f-data').value = l?.data || ultimaData || $('#lote-data').value;
    $('#f-auto').value = l?.auto || '';
    $('#f-auto-nome').value = '';
    $('#f-hist-cod').value = '';
    $('#f-hist').value = l?.hist || '';
    $('#f-doc').value = l?.doc || '';
    histAuto = '';
    ['valor', 'deb', 'cre', 'hist', 'auto', 'multi'].forEach(k => erro(k, ''));
    if (l && simples(l)) {
      $('#f-valor').value = fmt(l.partidas[0].v);
      $('#f-deb').value = l.partidas[0].ch; $('#f-cre').value = l.partidas[1].ch;
      setMulti(false);
    } else if (l) {
      $('#f-valor').value = ''; $('#f-deb').value = ''; $('#f-cre').value = '';
      setMulti(true, l.partidas.map(p => ({ ...p })));
    } else {
      $('#f-valor').value = ''; $('#f-deb').value = ''; $('#f-cre').value = '';
      setMulti(false);
    }
    if (l?.auto) $('#f-auto-nome').value = automaticos.find(a => a.cod === l.auto)?.nome || '';
    atualizarConta($('#f-deb')); atualizarConta($('#f-cre'));
    aplicarHistorico('');
    if (!dlg.open) dlg.showModal();
    (l ? $('#f-valor') : $('#f-data')).focus();
    if (multiOn) $('[data-m="ch"]', $('#multi-body')).focus();
  }
  let ultimaData = null;

  let gravando = false;                    // evita lançamento em dobro no duplo Enter / duplo clique
  async function gravar() {
    if (gravando) return;
    let ok = true;
    const data = $('#f-data').value;
    const hist = $('#f-hist').value.trim();
    const auto = $('#f-auto').value.trim() ? Number($('#f-auto').value) : null;
    let partidas = [];
    let primeiroErro = null;
    const falha = (id, msg, el) => { erro(id, msg); ok = false; primeiroErro = primeiroErro || el; };

    if (!data) { ok = false; primeiroErro = $('#f-data'); toast('Informe a data'); }
    if (!hist) falha('hist', 'Informe o histórico', $('#f-hist')); else erro('hist', '');
    if (auto != null && !automaticos.some(a => a.cod === auto)) falha('auto', 'Lançamento automático inexistente', $('#f-auto'));

    if (!multiOn) {
      const v = parseMoney($('#f-valor').value);
      if (v == null || Number.isNaN(v) || v <= 0) falha('valor', 'Valor deve ser maior que zero', $('#f-valor')); else erro('valor', '');
      const d = atualizarConta($('#f-deb')), c = atualizarConta($('#f-cre'));
      if (d.erro) falha('deb', d.erro, $('#f-deb'));
      if (c.erro) falha('cre', c.erro, $('#f-cre'));
      if (!d.conta && !c.conta && !d.erro && !c.erro) falha('deb', 'Informe a conta devedora, a credora ou as duas', $('#f-deb'));
      if (d.conta && c.conta && d.conta.ch === c.conta.ch) falha('cre', 'Débito e crédito na mesma conta', $('#f-cre'));
      if (ok) {
        if (d.conta) partidas.push({ ch: d.conta.ch, nat: 'D', v });
        if (c.conta) partidas.push({ ch: c.conta.ch, nat: 'C', v });
      }
    } else {
      const linhas = lerMulti().filter(p => p.chTxt.trim() || (p.v && !Number.isNaN(p.v)));
      if (linhas.length === 0) falha('multi', 'Informe ao menos uma partida', $('#multi-add'));
      if (linhas.length > 8) falha('multi', 'No máximo 8 partidas (4ª fórmula)', $('#multi-add'));
      for (const p of linhas) {
        const r = acharConta(p.chTxt);
        if (!r.conta) { falha('multi', r.erro || 'Informe a conta de cada partida', $('[data-m="ch"]', p.tr)); break; }
        if (p.v == null || Number.isNaN(p.v) || p.v <= 0) { falha('multi', 'Cada partida precisa de valor maior que zero', $('[data-m="v"]', p.tr)); break; }
        partidas.push({ ch: r.conta.ch, nat: p.nat, v: p.v });
      }
      if (ok) erro('multi', '');
    }

    if (!ok) { primeiroErro?.focus(); return; }

    const novo = editando == null;
    const reg = { id: novo ? null : lancs[editando].id, data, auto, hist, doc: $('#f-doc').value.trim(), partidas };
    gravando = true;
    $('#lanc-gravar').disabled = true;
    let id;
    try {
      id = await D.gravarLancamento(st, lote.id, reg);          // o banco numera e confere as regras
    } catch (e) {
      erro(multiOn ? 'multi' : 'hist', e.message);
      toast(e.message);
      return;
    } finally { gravando = false; $('#lanc-gravar').disabled = false; }
    ultimaData = data;
    await recarregar(id);
    const n = lancs.find(l => l.id === id)?.n;
    const dif = partidas.reduce((s, p) => s + (p.nat === 'D' ? p.v : -p.v), 0);
    toast(`Lançamento nº ${n} gravado` + (dif ? ` (partida simples: ${fmt(dif)} em aberto no lote)` : ''));
    if (novo) { abrirLanc(null); $('#f-valor').focus(); }   // digitação contínua: já abre o próximo
    else dlg.close();
  }

  // Enter avança, Ctrl+Enter grava, F2 busca conta
  dlg.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); gravar(); return; }
    if (e.key === 'F9') { e.preventDefault(); criarAutomatico(); return; }
    const alvo = e.target;
    if (e.key === 'Enter' && !e.shiftKey && alvo.matches('input, select, textarea')) {
      e.preventDefault();
      const campos = $$('input:not([readonly]):not([tabindex="-1"]), select, textarea', $('#form-lanc'))
        .filter(el => el.offsetParent !== null && !el.disabled);
      const i = campos.indexOf(alvo);
      if (alvo.id === 'f-doc' || i === campos.length - 1) gravar();
      else campos[i + 1]?.focus();
    }
  });
  $('#f-deb').addEventListener('input', e => atualizarConta(e.target));
  $('#f-cre').addEventListener('input', e => atualizarConta(e.target));
  $('#f-auto').addEventListener('change', aplicarAuto);
  $('#f-hist-cod').addEventListener('input', e => aplicarHistorico(e.target.value));
  $('#f-valor').addEventListener('blur', e => {
    const v = parseMoney(e.target.value);
    if (v != null && !Number.isNaN(v)) e.target.value = fmt(v);
  });
  $('#btn-multi').addEventListener('click', () => setMulti(!multiOn));
  $('#multi-add').addEventListener('click', () => {
    if ($$('#multi-body tr').length >= 8) { toast('No máximo 8 partidas'); return; }
    $('[data-m="ch"]', linhaMulti({ ch: '', nat: 'C', v: null })).focus();
  });
  $('#lanc-gravar').addEventListener('click', gravar);
  $('#lanc-cancelar').addEventListener('click', () => dlg.close());
  $$('[data-pick]').forEach(b => b.addEventListener('click', () => abrirBusca($('#' + b.dataset.pick))));
  dlg.addEventListener('close', () => { if (!document.querySelector('dialog[open]')) $('#grid').focus(); });

  // ── busca no plano de contas (busca-conta.js; F2 é ligado lá para todo [data-chamada]) ──
  const abrirBusca = alvo => window.BuscaConta.abrir(alvo);

  // ── barra de ferramentas ──
  $('#t-novo').addEventListener('click', () => abrirLanc(null));
  $('#t-editar').addEventListener('click', () => lancs[sel] && abrirLanc(sel));
  $('#t-excluir').addEventListener('click', async () => {
    const l = lancs[sel];
    if (!l || travado()) return;
    if (!(await confirmar(`Excluir o lançamento nº ${l.n} (${l.hist})? Ele vai para a lixeira.`))) return;
    await noBanco(() => D.excluirLancamentos([l.id]), `Lançamento nº ${l.n} excluído`);
  });
  $('#t-fechar').addEventListener('click', fechar);
  $('#t-importar').addEventListener('click', () => {
    if (travado()) { toast('Lote liberado: reabra o lote para importar'); return; }
    window.ImportarExcel.abrir(st, async conferidas => {
      await D.importar(lote.id, conferidas);                  // erro aqui aparece na janela e nada é gravado
      await recarregar();
      toast(`${conferidas.length} lançamento${conferidas.length > 1 ? 's' : ''} importado${conferidas.length > 1 ? 's' : ''} para o lote`);
    });
  });
  // grava no banco e relê; erro do banco (regra contábil, permissão) vira aviso
  async function noBanco(acao, msgOk) {
    try { await acao(); await recarregar(); if (msgOk) toast(msgOk); return true; }
    catch (e) { toast(e.message); return false; }
  }
  $('#t-liberar').addEventListener('click', async () => {
    if (!(await confirmar('Liberar o lote? Os lançamentos passam a contar no saldo das contas e o lote fica somente leitura.'))) return;
    await noBanco(() => D.liberarLote(lote.id), 'Lote liberado');
  });
  $('#t-reabrir').addEventListener('click', async () => {
    if (!(await confirmar('Reabrir o lote? Os lançamentos saem do saldo até ser liberado de novo.'))) return;
    await noBanco(() => D.reabrirLote(lote.id), 'Lote reaberto');
  });
  $('#t-localizar').addEventListener('click', () => {
    const f = $('#findbar');
    f.classList.toggle('open');
    if (f.classList.contains('open')) $('#find').focus(); else { filtro = ''; $('#find').value = ''; renderGrade(); }
  });
  $('#find').addEventListener('input', e => { filtro = e.target.value.trim(); renderGrade(); });
  $('#find-close').addEventListener('click', () => $('#t-localizar').click());
  $('#t-imprimir').addEventListener('click', () => window.print());
  $('#t-recalcular').addEventListener('click', async () => { await recarregar(); toast('Totais recalculados com o que está gravado'); });
  $('#t-apagar').addEventListener('click', async () => {
    const tem = lancs.length > 0;
    if (!(await confirmar(`Apagar o lote ${lote.cod}${tem ? ` com ${lancs.length} lançamentos` : ''}? Isso não pode ser desfeito.`, tem))) return;
    try { await D.apagarLote(lote.id, tem ? 'CONFIRMA' : null); location.href = 'lotes.html'; }
    catch (e) { toast(e.message); }
  });

  // ── grade: mouse e teclado ──
  $('#grid-body').addEventListener('click', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    sel = Number(tr.dataset.i); renderGrade(); estadoBotoes();
  });
  $('#grid-body').addEventListener('dblclick', e => {
    const tr = e.target.closest('tr'); if (tr) abrirLanc(Number(tr.dataset.i));
  });
  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Insert') { e.preventDefault(); if (!liberado) abrirLanc(null); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); if (!$('#findbar').classList.contains('open')) $('#t-localizar').click(); else $('#find').focus(); return; }
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'Delete') { e.preventDefault(); $('#t-excluir').click(); return; }
    if (document.activeElement === $('#grid')) {
      const visiveis = lancs.map((l, i) => i).filter(i => casa(lancs[i]));
      const pos = visiveis.indexOf(sel);
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = visiveis[Math.min(pos + 1, visiveis.length - 1)] ?? sel; renderGrade(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = visiveis[Math.max(pos - 1, 0)] ?? sel; renderGrade(); }
      if (e.key === 'Enter') { e.preventDefault(); if (lancs[sel] && !liberado) abrirLanc(sel); }
    }
  });

  montarTotais();
  render();
  $('#grid').focus();
})();
