// Excel (.xlsx) do Livro Razão: um bloco por conta, valores como número, datas como data,
// totais com fórmula SOMA. Usa ExcelJS (via libs.js), carregado só quando o usuário pede o Excel.
(() => {
  'use strict';
  const carregar = () => window.Libs.excelJS();

  const COLS = [
    { t: 'Data', w: 11, al: 'left' }, { t: 'Nº', w: 7, al: 'right' }, { t: 'Lote', w: 7, al: 'left' },
    { t: 'Histórico', w: 48, al: 'left' }, { t: 'Documento', w: 15, al: 'left' }, { t: 'Contrapartida', w: 30, al: 'left' },
    { t: 'Débito', w: 14, al: 'right' }, { t: 'Crédito', w: 14, al: 'right' }, { t: 'Saldo', w: 15, al: 'right' },
    { t: 'D/C', w: 5, al: 'center' },
  ];
  const ULT = 'J';                                   // última coluna
  const NUM = '#,##0.00';
  const CINZA = { argb: 'FF5A6170' };
  const LINHA = { style: 'thin', color: { argb: 'FFB8BEC9' } };
  const FORTE = { style: 'medium', color: { argb: 'FF1A1D23' } };
  const FUNDO_CONTA = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E9EE' } };

  const reais = c => Math.round(c) / 100;          // centavos -> número do Excel
  const dc = c => (c === 0 ? '' : c > 0 ? 'D' : 'C');
  const data = iso => { const [a, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
  const fmtData = iso => iso.split('-').reverse().join('/');

  // monta a planilha; não baixa (quem chama decide)
  async function montar({ empresa, ini, fim, abertos, blocos, nomeConta }) {
    const ExcelJS = await carregar();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SisContábil';
    wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;        // Excel recalcula as SOMAs ao abrir
    const ws = wb.addWorksheet('Razão', {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                   margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 } },
      headerFooter: { oddFooter: `&L${empresa.nome} · Livro Razão&RPágina &P de &N` },
    });
    ws.columns = COLS.map(c => ({ width: c.w }));

    // cabeçalho do relatório
    const titulo = (linha, texto, font) => {
      ws.mergeCells(`A${linha}:${ULT}${linha}`);
      const cel = ws.getCell(`A${linha}`);
      cel.value = texto; cel.font = font;
    };
    titulo(1, empresa.nome, { bold: true, size: 14 });
    titulo(2, `CNPJ ${empresa.cnpj}`, { color: CINZA });
    titulo(3, `Livro Razão · Período de ${fmtData(ini)} a ${fmtData(fim)}`, { bold: true, size: 12 });
    const agora = new Date();
    titulo(4, `Emitido em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` +
      (abertos ? ' · PROVISÓRIO: inclui lotes ainda não liberados' : ''),
      { italic: true, color: abertos ? { argb: 'FF9A4A07' } : CINZA, bold: abertos });

    let r = 6;
    const totaisDeb = [], totaisCred = [];
    let somaDeb = 0, somaCred = 0;

    for (const b of blocos) {
      // título da conta: chamada + nome | classificação
      ws.mergeCells(`A${r}:H${r}`);
      ws.mergeCells(`I${r}:${ULT}${r}`);
      ws.getCell(`A${r}`).value = `${b.conta.ch}   ${b.conta.n}`;
      ws.getCell(`I${r}`).value = b.conta.c;
      ws.getCell(`I${r}`).alignment = { horizontal: 'right' };
      ws.getRow(r).font = { bold: true, size: 11 };
      for (let c = 1; c <= COLS.length; c++) ws.getRow(r).getCell(c).fill = FUNDO_CONTA;
      r++;

      // nomes das colunas
      const cab = ws.getRow(r);
      COLS.forEach((c, i) => {
        const cel = cab.getCell(i + 1);
        cel.value = c.t;
        cel.font = { bold: true, color: CINZA, size: 9 };
        cel.alignment = { horizontal: c.al };
        cel.border = { bottom: LINHA };
      });
      r++;

      // saldo anterior
      const ant = ws.getRow(r);
      ant.getCell(4).value = 'Saldo anterior';
      ant.getCell(9).value = reais(Math.abs(b.ant));
      ant.getCell(9).numFmt = NUM;
      ant.getCell(10).value = dc(b.ant);
      ant.getCell(10).alignment = { horizontal: 'center' };
      ant.font = { italic: true, color: CINZA };
      r++;

      // movimentos
      const primeira = r;
      for (const l of b.linhas) {
        const row = ws.getRow(r);
        row.getCell(1).value = data(l.data);
        row.getCell(1).numFmt = 'dd/mm/yyyy';
        row.getCell(2).value = l.n;
        row.getCell(3).value = l.lote;
        row.getCell(4).value = l.hist;
        row.getCell(4).alignment = { wrapText: true, vertical: 'top' };
        row.getCell(5).value = l.doc || null;
        row.getCell(6).value = l.contra.length ? l.contra.map(ch => `${ch} ${nomeConta(ch)}`).join('; ') : '—';
        row.getCell(6).alignment = { wrapText: true, vertical: 'top' };
        if (l.deb) row.getCell(7).value = reais(l.deb);
        if (l.cred) row.getCell(8).value = reais(l.cred);
        row.getCell(9).value = reais(Math.abs(l.saldo));
        row.getCell(10).value = dc(l.saldo);
        [7, 8, 9].forEach(c => { row.getCell(c).numFmt = NUM; });
        row.getCell(10).alignment = { horizontal: 'center' };
        for (let c = 1; c <= COLS.length; c++) {
          row.getCell(c).border = { bottom: { style: 'hair', color: { argb: 'FFD0D4DC' } } };
          if (c !== 4 && c !== 6) row.getCell(c).alignment = { ...(row.getCell(c).alignment || {}), vertical: 'top' };
        }
        r++;
      }
      const ultima = r - 1;

      // totais da conta (fórmula, com o resultado já calculado)
      const tot = ws.getRow(r);
      tot.getCell(4).value = 'Totais da conta';
      tot.getCell(7).value = b.linhas.length ? { formula: `SUM(G${primeira}:G${ultima})`, result: reais(b.deb) } : 0;
      tot.getCell(8).value = b.linhas.length ? { formula: `SUM(H${primeira}:H${ultima})`, result: reais(b.cred) } : 0;
      tot.getCell(9).value = reais(Math.abs(b.fin));
      tot.getCell(10).value = dc(b.fin);
      tot.font = { bold: true };
      [7, 8, 9].forEach(c => { tot.getCell(c).numFmt = NUM; });
      tot.getCell(10).alignment = { horizontal: 'center' };
      for (let c = 1; c <= COLS.length; c++) tot.getCell(c).border = { top: FORTE };
      totaisDeb.push(`G${r}`); totaisCred.push(`H${r}`);
      somaDeb += b.deb; somaCred += b.cred;
      r += 2;                                         // linha em branco entre contas
    }

    // total geral
    const g = ws.getRow(r);
    g.getCell(4).value = `Total geral (${blocos.length} conta${blocos.length === 1 ? '' : 's'})`;
    g.getCell(7).value = totaisDeb.length ? { formula: totaisDeb.join('+'), result: reais(somaDeb) } : 0;
    g.getCell(8).value = totaisCred.length ? { formula: totaisCred.join('+'), result: reais(somaCred) } : 0;
    [7, 8].forEach(c => { g.getCell(c).numFmt = NUM; });
    g.font = { bold: true, size: 11 };
    for (let c = 1; c <= COLS.length; c++) g.getCell(c).border = { top: FORTE, bottom: FORTE };

    ws.pageSetup.printArea = `A1:${ULT}${r}`;
    return wb;
  }

  async function baixar(opcoes) {
    const wb = await montar(opcoes);
    window.Libs.baixar(await wb.xlsx.writeBuffer(), `razao_${opcoes.ini}_${opcoes.fim}.xlsx`);
  }

  window.ExcelRazao = { montar, baixar };
})();
