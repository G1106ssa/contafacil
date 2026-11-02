// Camada de dados: tudo que as telas leem e gravam no Supabase (área "contabil").
// As telas trabalham com o mesmo formato da prévia: chamadas de conta, dinheiro em centavos,
// lote com código "0004". Aqui é feita a tradução para o banco (ids, numeric em reais).
(() => {
  'use strict';
  const C = window.SISCONTABIL_CONFIG;
  const sb = window.supabase.createClient(C.url, C.chave, { db: { schema: 'contabil' } });
  const pub = () => sb.schema('public');
  const CHAVE_EMPRESA = 'siscontabil-empresa';

  const cent = v => (v == null ? null : Math.round(Number(v) * 100));
  const reais = c => (c == null ? null : (c / 100).toFixed(2));
  const cod4 = n => String(n).padStart(4, '0');
  const fmtCnpj = c => (c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c || '');

  function traduzir(e) {
    const m = e?.message || String(e);
    if (/JWT|not authenticated|refresh token/i.test(m)) return 'Sua sessão expirou: entre de novo';
    if (/permission denied/i.test(m)) return 'Sem permissão para isso';
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor';
    return m;
  }
  const ok = r => { if (r.error) throw new Error(traduzir(r.error)); return r.data; };

  // lê todas as linhas, de 1000 em 1000 (limite padrão da API)
  async function todos(consulta) {
    const out = [];
    for (let de = 0; ; de += 1000) {
      const parte = ok(await consulta().range(de, de + 999));
      out.push(...parte);
      if (parte.length < 1000) return out;
    }
  }

  // ── sessão e contexto ──
  async function sessao() { return (await sb.auth.getSession()).data.session; }
  async function entrar(email, senha) { ok(await sb.auth.signInWithPassword({ email, password: senha })); }
  async function sair() {
    await sb.auth.signOut();
    try { localStorage.removeItem(CHAVE_EMPRESA); } catch { /* ignora */ }
  }
  function escolherEmpresa(id) { try { localStorage.setItem(CHAVE_EMPRESA, id); } catch { /* ignora */ } }

  async function contexto() {
    const s = await sessao();
    if (!s) return null;
    const membros = ok(await pub().from('membros').select('escritorio_id, nome, papel').eq('user_id', s.user.id));
    const escritorios = ok(await pub().from('escritorios').select('id, nome'));
    const empresas = ok(await pub().from('empresas').select('id, escritorio_id, razao_social, nome_fantasia, cnpj, regime, ativo').order('razao_social'));
    const ativas = new Set(ok(await sb.from('config_empresa').select('empresa_id')).map(c => c.empresa_id));
    for (const e of empresas) { e.ativada = ativas.has(e.id); e.cnpjFmt = fmtCnpj(e.cnpj); }
    let atual = null;
    try { atual = localStorage.getItem(CHAVE_EMPRESA); } catch { /* ignora */ }
    // empresa escolhida antes; se não houver e só uma estiver ativada, abre essa
    const ativadas = empresas.filter(e => e.ativada);
    const empresa = ativadas.find(e => e.id === atual) || (ativadas.length === 1 ? ativadas[0] : null);
    const membro = membros.find(m => m.escritorio_id === (empresa?.escritorio_id ?? membros[0]?.escritorio_id));
    return {
      user: s.user, membros, escritorios, empresas, empresa,
      nome: membro?.nome || s.user.email, papel: membro?.papel || 'leitura',
      podeEditar: ['admin', 'analista'].includes(membro?.papel),
    };
  }
  async function ativarEmpresa(id) { ok(await sb.rpc('ativar_empresa', { p_empresa: id })); }

  // ── estado da empresa: plano, históricos, automáticos, lotes e lançamentos ──
  async function carregarEstado(emp) {
    const cfg = ok(await sb.from('config_empresa').select('*').eq('empresa_id', emp.id).single());
    const contas = await todos(() => sb.from('contas')
      .select('id, classificacao, chamada, nome, tipo, natureza, grupo, ativa').eq('plano_id', cfg.plano_id).order('classificacao'));
    const plano = contas.map(c => ({ id: c.id, c: c.classificacao, ch: c.chamada, n: c.nome, t: c.tipo, nat: c.natureza, g: c.grupo, ativa: c.ativa }));
    const idPorCh = new Map(plano.filter(c => c.ch != null).map(c => [c.ch, c.id]));
    const chPorId = new Map(plano.map(c => [c.id, c.ch]));

    const hist = ok(await sb.from('historicos_padrao').select('id, codigo, texto, empresa_id')
      .or(`empresa_id.is.null,empresa_id.eq.${emp.id}`).order('codigo'));
    const histCodPorId = new Map(hist.map(h => [h.id, h.codigo]));
    const autos = ok(await sb.from('lanc_automaticos')
      .select('id, codigo, nome, conta_debito_id, conta_credito_id, historico_id, historico_texto').eq('empresa_id', emp.id).order('codigo'));
    const autoCodPorId = new Map(autos.map(a => [a.id, a.codigo]));

    const lotes = ok(await sb.from('lotes')
      .select('id, codigo, nome, data, tipo, liberado, inf_valor_debito, inf_valor_credito, inf_lanc_auto, inf_contas_debito, inf_contas_credito')
      .eq('empresa_id', emp.id).order('codigo'));
    const lancs = await todos(() => sb.from('lancamentos')
      .select('id, lote_id, numero, data, historico, documento, lanc_automatico_id, partidas(conta_id, natureza, valor, ordem)')
      .eq('empresa_id', emp.id).is('excluido_em', null).order('numero'));

    const porLote = new Map(lotes.map(l => [l.id, []]));
    for (const l of lancs) {
      porLote.get(l.lote_id)?.push({
        id: l.id, n: l.numero, data: l.data, auto: autoCodPorId.get(l.lanc_automatico_id) ?? null,
        hist: l.historico, doc: l.documento || '',
        partidas: [...l.partidas].sort((a, b) => a.ordem - b.ordem)
          .map(p => ({ ch: chPorId.get(p.conta_id), nat: p.natureza, v: cent(p.valor) })),
      });
    }
    return {
      empresa: { id: emp.id, cod: '', nome: emp.razao_social, cnpj: emp.cnpjFmt || fmtCnpj(emp.cnpj) },
      config: cfg, plano, idPorCh, chPorId,
      historicos: hist.map(h => ({ id: h.id, cod: h.codigo, texto: h.texto })),
      automaticos: autos.map(a => ({
        id: a.id, cod: a.codigo, nome: a.nome, d: chPorId.get(a.conta_debito_id), c: chPorId.get(a.conta_credito_id),
        hist: histCodPorId.get(a.historico_id) ?? null, texto: a.historico_texto || '',
      })),
      lotes: lotes.map(l => ({
        id: l.id, cod: cod4(l.codigo), codigo: l.codigo, nome: l.nome, data: l.data, tipo: l.tipo, liberado: l.liberado,
        inf: { vd: cent(l.inf_valor_debito), vc: cent(l.inf_valor_credito), la: l.inf_lanc_auto, cd: l.inf_contas_debito, cc: l.inf_contas_credito },
        lancs: porLote.get(l.id) || [],
      })),
    };
  }

  // ── lotes ──
  async function novoLote(st, { nome, data }) {
    const r = ok(await sb.from('lotes').insert({ empresa_id: st.empresa.id, escritorio_id: st.config.escritorio_id, nome, data })
      .select('codigo').single());
    return cod4(r.codigo);
  }
  async function atualizarLote(id, { nome, data, inf } = {}) {
    const campos = {};
    if (nome !== undefined) campos.nome = nome;
    if (data !== undefined) campos.data = data;
    if (inf) Object.assign(campos, {
      inf_valor_debito: reais(inf.vd), inf_valor_credito: reais(inf.vc),
      inf_lanc_auto: inf.la, inf_contas_debito: inf.cd, inf_contas_credito: inf.cc,
    });
    ok(await sb.from('lotes').update(campos).eq('id', id));
  }
  const liberarLote = async id => ok(await sb.rpc('liberar_lote', { p_lote: id }));
  const reabrirLote = async id => ok(await sb.rpc('reabrir_lote', { p_lote: id }));
  const apagarLote = async (id, confirmacao) => ok(await sb.rpc('apagar_lote', { p_lote: id, p_confirmacao: confirmacao ?? null }));

  // ── lançamentos ──
  function partidasBanco(st, partidas) {
    return partidas.map(p => {
      const id = st.idPorCh.get(p.ch);
      if (!id) throw new Error(`Chamada ${p.ch} não existe no plano desta empresa`);
      return { conta_id: id, natureza: p.nat, valor: reais(p.v) };
    });
  }
  async function gravarLancamento(st, loteId, l) {
    const auto = l.auto != null ? st.automaticos.find(a => a.cod === l.auto) : null;
    return ok(await sb.rpc('gravar_lancamento', {
      p_lote: loteId, p_data: l.data, p_historico: l.hist, p_partidas: partidasBanco(st, l.partidas),
      p_id: l.id || null, p_historico_id: null, p_lanc_automatico_id: auto?.id || null, p_documento: l.doc || null,
    }));
  }
  const excluirLancamentos = async ids => ok(await sb.rpc('excluir_lancamentos', { p_ids: ids }));

  // importação: as linhas já conferidas no navegador vão com as chamadas explícitas; o banco confere de novo
  async function importar(loteId, conferidas) {
    const linhas = conferidas.map(x => ({
      linha: x.num, data: x.data, auto: x.auto ?? '', valor: reais(x.valor),
      debito: x.d?.ch ?? '', credito: x.cr?.ch ?? '', historico: x.hist, documento: x.doc || '',
    }));
    return ok(await sb.rpc('importar_lancamentos', { p_lote: loteId, p_linhas: linhas }));
  }

  // ── lançamentos automáticos ──
  async function salvarAutomatico(st, reg, idExistente) {
    const linha = {
      empresa_id: st.empresa.id, escritorio_id: st.config.escritorio_id, codigo: reg.cod, nome: reg.nome,
      conta_debito_id: st.idPorCh.get(reg.d), conta_credito_id: st.idPorCh.get(reg.c),
      historico_id: reg.hist != null ? st.historicos.find(h => h.cod === reg.hist)?.id ?? null : null,
      historico_texto: reg.texto || null,
    };
    const r = idExistente
      ? ok(await sb.from('lanc_automaticos').update(linha).eq('id', idExistente).select('id').single())
      : ok(await sb.from('lanc_automaticos').insert(linha).select('id').single());
    return r.id;
  }
  const excluirAutomatico = async id => ok(await sb.from('lanc_automaticos').delete().eq('id', id));

  // ── integração Fiscal → Contábil (padrão Alterdata: tudo por lançamento automático) ──
  const integCatalogo = async empresaId => ok(await sb.rpc('integ_catalogo', { p_empresa: empresaId }));
  const integrarFiscal = async (empresaId, competencia, gravar) =>
    ok(await sb.rpc('integrar_fiscal', { p_empresa: empresaId, p_competencia: competencia, p_gravar: !!gravar }));
  async function integConfig(st) {
    const id = st.empresa.id;
    const [cfg, cfops, servs, tribs, rets] = await Promise.all([
      sb.from('integ_config').select('*').eq('empresa_id', id).maybeSingle(),
      sb.from('integ_cfop').select('cfop, lanc_contabil_id, lanc_pagamento_id').eq('empresa_id', id),
      sb.from('integ_servico').select('tipo, codigo, lanc_contabil_id, lanc_pagamento_id').eq('empresa_id', id),
      sb.from('integ_tributo').select('imposto, evento, lanc_id').eq('empresa_id', id),
      sb.from('integ_retencao').select('tipo, operacao, lanc_id').eq('empresa_id', id),
    ]);
    const codPorId = new Map(st.automaticos.map(a => [a.id, a.cod]));
    const cod = idLa => (idLa ? codPorId.get(idLa) ?? null : null);
    return {
      geral: ok(cfg) || { hist_numero: true, hist_participante: true, doc_numero: true },
      cfop: ok(cfops).map(r => ({ cfop: r.cfop, contabil: cod(r.lanc_contabil_id), pagamento: cod(r.lanc_pagamento_id) })),
      servico: ok(servs).map(r => ({ tipo: r.tipo, codigo: r.codigo, contabil: cod(r.lanc_contabil_id), pagamento: cod(r.lanc_pagamento_id) })),
      tributo: ok(tribs).map(r => ({ imposto: r.imposto, evento: r.evento, la: cod(r.lanc_id) })),
      retencao: ok(rets).map(r => ({ tipo: r.tipo, operacao: r.operacao, la: cod(r.lanc_id) })),
    };
  }
  // grava uma linha da configuração; sem lançamento automático principal, a linha é apagada
  async function salvarInteg(st, tabela, chave, campos) {
    const laId = codLa => {
      if (codLa == null || codLa === '') return null;
      const a = st.automaticos.find(x => x.cod === Number(codLa));
      if (!a) throw new Error(`Lançamento automático ${codLa} não existe`);
      return a.id;
    };
    const base = { empresa_id: st.empresa.id, escritorio_id: st.config.escritorio_id, ...chave };
    const principal = tabela === 'integ_cfop' || tabela === 'integ_servico' ? 'contabil' : 'la';
    if (campos[principal] == null || campos[principal] === '') {
      let q = sb.from(tabela).delete().eq('empresa_id', st.empresa.id);
      for (const [k, v] of Object.entries(chave)) q = q.eq(k, v);
      ok(await q);
      return;
    }
    const linha = principal === 'contabil'
      ? { ...base, lanc_contabil_id: laId(campos.contabil), lanc_pagamento_id: laId(campos.pagamento) }
      : { ...base, lanc_id: laId(campos.la) };
    const conflito = { integ_cfop: 'empresa_id,cfop', integ_servico: 'empresa_id,tipo,codigo',
                       integ_tributo: 'empresa_id,imposto,evento', integ_retencao: 'empresa_id,tipo,operacao' }[tabela];
    ok(await sb.from(tabela).upsert(linha, { onConflict: conflito }));
  }
  async function salvarIntegGeral(st, geral) {
    ok(await sb.from('integ_config').upsert({ empresa_id: st.empresa.id, escritorio_id: st.config.escritorio_id,
      hist_numero: !!geral.hist_numero, hist_participante: !!geral.hist_participante, doc_numero: !!geral.doc_numero },
      { onConflict: 'empresa_id' }));
  }

  window.Dados = {
    integCatalogo, integrarFiscal, integConfig, salvarInteg, salvarIntegGeral,
    sb, sessao, entrar, sair, contexto, escolherEmpresa, ativarEmpresa, carregarEstado,
    novoLote, atualizarLote, liberarLote, reabrirLote, apagarLote,
    gravarLancamento, excluirLancamentos, importar, salvarAutomatico, excluirAutomatico,
  };
})();
