// Motor de relatórios: calcula saldos, balancete, razão e diário sobre os lançamentos da empresa
// já carregados do banco (Dados.carregarEstado). Mesmas regras das funções do banco
// (contabil.saldos / balancete / razao). Sinal: positivo = devedor. Valores em centavos.
// Com muito volume, trocar por supabase.rpc('balancete' | 'razao') — mesmo formato de linha.
(() => {
  'use strict';
  // plano da empresa (carregado depois do login), com os índices refeitos quando muda
  let base = null, cache = null;
  function B() {
    if (base !== window.PLANO_PADRAO) {
      base = window.PLANO_PADRAO;
      const plano = base || [];
      cache = { plano, porCh: new Map(plano.filter(c => c.ch).map(c => [c.ch, c])), analiticas: plano.filter(c => c.t === 'A') };
    }
    return cache;
  }

  // todas as partidas até 'fim', só de lotes liberados (ou abertos também, se pedido)
  function partidas(st, fim, abertos) {
    const out = [];
    for (const lo of st.lotes) {
      if ((!lo.liberado && !abertos) || lo.tipo === 'encerramento_simulado') continue;
      for (const l of lo.lancs) {
        if (l.data > fim) continue;
        l.partidas.forEach((p, k) => out.push({ ...p, k, data: l.data, n: l.n, hist: l.hist, doc: l.doc, lote: lo.cod, lanc: l }));
      }
    }
    return out;
  }

  function saldos(st, ini, fim, abertos) {
    const m = new Map();
    for (const p of partidas(st, fim, abertos)) {
      const s = m.get(p.ch) || { ant: 0, deb: 0, cred: 0 };
      if (p.data < ini) s.ant += p.nat === 'D' ? p.v : -p.v;
      else if (p.nat === 'D') s.deb += p.v;
      else s.cred += p.v;
      m.set(p.ch, s);
    }
    for (const s of m.values()) s.fin = s.ant + s.deb - s.cred;
    return m;
  }

  // todas as contas do plano, sintéticas somando as analíticas pela classificação
  function balancete(st, ini, fim, abertos) {
    const sd = saldos(st, ini, fim, abertos);
    const { plano, analiticas } = B();
    return plano.map(c => {
      let ant = 0, deb = 0, cred = 0;
      for (const a of analiticas) {
        if (a.c !== c.c && !a.c.startsWith(c.c + '.')) continue;
        const s = sd.get(a.ch);
        if (s) { ant += s.ant; deb += s.deb; cred += s.cred; }
      }
      return { ...c, nivel: c.c.split('.').length, ant, deb, cred, fin: ant + deb - cred };
    });
  }

  // razão: um bloco por conta analítica com saldo corrido
  function razao(st, ini, fim, abertos, { chamada = null, comSaldoSemMovimento = false } = {}) {
    const sd = saldos(st, ini, fim, abertos);
    const movs = partidas(st, fim, abertos).filter(p => p.data >= ini);
    const blocos = [];
    for (const c of B().analiticas) {
      if (chamada != null && c.ch !== chamada) continue;
      const s = sd.get(c.ch) || { ant: 0, deb: 0, cred: 0, fin: 0 };
      const temMov = s.deb !== 0 || s.cred !== 0;
      if (chamada == null && !temMov && !(comSaldoSemMovimento && s.ant !== 0)) continue;
      let saldo = s.ant;
      const linhas = movs
        .filter(p => p.ch === c.ch)
        .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.n - b.n || a.k - b.k))
        .map(p => {
          saldo += p.nat === 'D' ? p.v : -p.v;
          const contra = p.lanc.partidas.filter((q, i) => i !== p.k && q.nat !== p.nat).map(q => q.ch);
          return { data: p.data, n: p.n, lote: p.lote, hist: p.hist, doc: p.doc,
                   contra, deb: p.nat === 'D' ? p.v : 0, cred: p.nat === 'C' ? p.v : 0, saldo };
        });
      blocos.push({ conta: c, ant: s.ant, deb: s.deb, cred: s.cred, fin: s.fin, linhas });
    }
    return blocos;
  }

  // diário: lançamentos do período em ordem de data e número
  function diario(st, ini, fim, abertos) {
    const out = [];
    for (const lo of st.lotes) {
      if ((!lo.liberado && !abertos) || lo.tipo === 'encerramento_simulado') continue;
      for (const l of lo.lancs) if (l.data >= ini && l.data <= fim) out.push({ ...l, lote: lo.cod });
    }
    return out.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.n - b.n));
  }

  // lotes a liberar com lançamentos no período (para o aviso nos relatórios)
  function abertosNoPeriodo(st, ini, fim) {
    return st.lotes.filter(lo => !lo.liberado && lo.lancs.some(l => l.data >= ini && l.data <= fim))
      .map(lo => ({ cod: lo.cod, nome: lo.nome, qtd: lo.lancs.filter(l => l.data >= ini && l.data <= fim).length }));
  }

  window.Motor = { saldos, balancete, razao, diario, abertosNoPeriodo, get porCh() { return B().porCh; } };
})();
