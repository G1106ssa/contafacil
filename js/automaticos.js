// Cadastro de lançamentos automáticos.
(async () => {
  'use strict';
  const $ = s => document.querySelector(s);
  const { ctx, st } = await window.Inicio.pronto();
  window.Layout.montar({ pagina: 'automaticos', crumb: 'Cadastros › <b>Lançamentos automáticos</b>', ctx });
  const porCh = new Map((window.PLANO_PADRAO || []).filter(c => c.ch).map(c => [c.ch, c]));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  let sel = 0, filtro = '';

  const usos = cod => st.lotes.reduce((n, lo) => n + lo.lancs.filter(l => l.auto === cod).length, 0);
  const histTexto = a => [st.historicos.find(h => h.cod === a.hist)?.texto, a.texto].filter(Boolean).join(' ');
  const visiveis = () => st.automaticos.filter(a => {
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return [a.cod, a.nome, a.d, a.c, porCh.get(a.d)?.n, porCh.get(a.c)?.n, histTexto(a)].some(t => String(t ?? '').toLowerCase().includes(q));
  });

  function render() {
    const lista = visiveis();
    sel = Math.max(0, Math.min(sel, lista.length - 1));
    $('#grid-body').innerHTML = lista.map((a, i) => `
      <tr data-i="${i}" aria-selected="${i === sel}">
        <td class="num"><b>${a.cod}</b></td><td title="${esc(a.nome)}">${esc(a.nome)}</td>
        <td class="num d">${a.d}</td><td>${esc(porCh.get(a.d)?.n || '?')}</td>
        <td class="num c">${a.c}</td><td>${esc(porCh.get(a.c)?.n || '?')}</td>
        <td title="${esc(histTexto(a))}">${a.hist ? `<span class="muted">${a.hist}</span> ` : ''}${esc(histTexto(a))}</td>
        <td class="num">${usos(a.cod) || ''}</td></tr>`).join('');
    $('#grid-empty').hidden = st.automaticos.length > 0;
    $('#registros').textContent = filtro ? `Registros: ${lista.length} de ${st.automaticos.length}` : `Registros: ${st.automaticos.length}`;
    $('#t-editar').disabled = $('#t-excluir').disabled = !lista[sel];
  }

  async function novo() {
    const r = await window.FormAutomatico.abrir(st);
    if (r) { filtro = ''; $('#find').value = ''; sel = visiveis().indexOf(r); render(); window.Layout.toast(`Lançamento automático ${r.cod} criado`); }
    $('#grid').focus();
  }
  async function editar() {
    const a = visiveis()[sel];
    if (!a) return;
    const r = await window.FormAutomatico.abrir(st, { registro: a });
    if (r) { render(); window.Layout.toast(`Lançamento automático ${r.cod} alterado`); }
    $('#grid').focus();
  }
  function confirmar(msg) {
    const d = $('#dlg-confirm');
    $('#conf-msg').textContent = msg;
    return new Promise(ok => {
      const fim = v => { d.close(); ok(v); };
      $('#conf-sim').onclick = () => fim(true);
      $('#conf-nao').onclick = () => fim(false);
      d.addEventListener('cancel', () => ok(false), { once: true });
      d.showModal();
      $('#conf-nao').focus();
    });
  }
  async function excluir() {
    const a = visiveis()[sel];
    if (!a) return;
    const n = usos(a.cod);
    const msg = `Excluir o lançamento automático ${a.cod} (${a.nome})?` +
      (n ? ` Ele é usado em ${n} lançamento${n > 1 ? 's' : ''}: esses lançamentos continuam com as contas e o histórico, só perdem o vínculo.` : '');
    if (!(await confirmar(msg))) return;
    try { await window.Dados.excluirAutomatico(a.id); }    // no banco, os lançamentos só perdem o vínculo
    catch (e) { window.Layout.toast(e.message); return; }
    st.automaticos.splice(st.automaticos.indexOf(a), 1);
    for (const lo of st.lotes) for (const l of lo.lancs) if (l.auto === a.cod) l.auto = null;
    render();
    window.Layout.toast(`Lançamento automático ${a.cod} excluído`);
  }

  $('#t-novo').addEventListener('click', novo);
  $('#t-editar').addEventListener('click', editar);
  $('#t-excluir').addEventListener('click', excluir);
  $('#t-localizar').addEventListener('click', () => {
    const f = $('#findbar');
    f.classList.toggle('open');
    if (f.classList.contains('open')) $('#find').focus(); else { filtro = ''; $('#find').value = ''; render(); }
  });
  $('#find').addEventListener('input', e => { filtro = e.target.value.trim(); sel = 0; render(); });
  $('#find-close').addEventListener('click', () => $('#t-localizar').click());
  $('#grid-body').addEventListener('click', e => { const tr = e.target.closest('tr'); if (tr) { sel = Number(tr.dataset.i); render(); } });
  $('#grid-body').addEventListener('dblclick', e => { const tr = e.target.closest('tr'); if (tr) { sel = Number(tr.dataset.i); editar(); } });
  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Insert') { e.preventDefault(); novo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); if (!$('#findbar').classList.contains('open')) $('#t-localizar').click(); else $('#find').focus(); return; }
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'Delete') { e.preventDefault(); excluir(); return; }
    if (document.activeElement === $('#grid')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, visiveis().length - 1); render(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      if (e.key === 'Enter') { e.preventDefault(); editar(); }
    }
  });
  render();
  $('#grid').focus();
})();
