// Bibliotecas de planilha carregadas só quando usadas (versões fixas).
// ExcelJS (MIT): gera .xlsx com formatação. SheetJS (Apache-2.0): lê .xlsx, .xls e .csv.
(() => {
  'use strict';
  const URLS = {
    ExcelJS: 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
    XLSX: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  };
  const pendentes = {};
  function carregar(nome) {
    if (window[nome]) return Promise.resolve(window[nome]);
    pendentes[nome] ??= new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = URLS[nome];
      s.onload = () => ok(window[nome]);
      s.onerror = () => { delete pendentes[nome]; falha(new Error('Não foi possível carregar o leitor/gerador de Excel (sem internet?)')); };
      document.head.appendChild(s);
    });
    return pendentes[nome];
  }
  function baixar(buf, nome, tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: tipo }));
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  window.Libs = { excelJS: () => carregar('ExcelJS'), sheetJS: () => carregar('XLSX'), baixar };
})();
