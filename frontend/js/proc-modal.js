// Stored Procedure Parameter Form and Execution Modal

class ProcedureModal {
  constructor() {
    this.modal = document.getElementById('modalProcedureExec');
    this.titleSpan = document.getElementById('modalProcTitle');
    this.paramsContainer = document.getElementById('procParamsContainer');
    this.resultsSection = document.getElementById('procResultsSection');
    this.outParamsDisplay = document.getElementById('procOutParamsDisplay');
    this.resultSetsDisplay = document.getElementById('procResultSetsDisplay');
    this.executeBtn = document.getElementById('btnExecuteProcAction');

    this.currentDatabase = null;
    this.currentProcName = null;
    this.paramsMeta = [];

    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('btnCloseProcModal')?.addEventListener('click', () => this.close());
    document.getElementById('btnCloseProcModalBtn')?.addEventListener('click', () => this.close());

    this.executeBtn?.addEventListener('click', () => this.execute());
  }

  async open(database, procName) {
    this.currentDatabase = database;
    this.currentProcName = procName;
    this.titleSpan.textContent = procName;
    this.resultsSection.style.display = 'none';
    this.paramsContainer.innerHTML = '<div style="padding:10px; color:var(--text-muted);">Cargando parámetros...</div>';
    this.modal.classList.add('open');

    try {
      const res = await fetch(`/api/procedures/${encodeURIComponent(database)}/${encodeURIComponent(procName)}/params`);
      const data = await res.json();
      this.paramsMeta = data.parameters || [];
      this.renderForm();
    } catch (err) {
      this.paramsContainer.innerHTML = `<div class="msg-entry msg-error">Error al cargar parámetros: ${err.message}</div>`;
    }
  }

  close() {
    this.modal.classList.remove('open');
  }

  renderForm() {
    if (!this.paramsMeta.length) {
      this.paramsContainer.innerHTML = `
        <div class="msg-entry msg-info" style="margin:0;">
          Este procedimiento no requiere parámetros. Haz clic en "Ejecutar Procedimiento" para iniciar la ejecución.
        </div>
      `;
      return;
    }

    let html = '<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">';
    this.paramsMeta.forEach(p => {
      const mode = (p.mode || 'IN').toUpperCase();
      const badgeClass = mode === 'IN' ? 'badge-in' : (mode === 'OUT' ? 'badge-out' : 'badge-inout');
      const isOutOnly = mode === 'OUT';

      html += `
        <div class="form-group" style="${isOutOnly ? 'opacity:0.7;' : ''}">
          <label style="display:flex; align-items:center; justify-content:space-between;">
            <span><strong>${p.name}</strong> <span style="font-weight:normal; color:var(--text-dim);">(${p.full_type})</span></span>
            <span class="badge ${badgeClass}">${mode}</span>
          </label>
          <input 
            type="${p.data_type === 'int' || p.data_type === 'decimal' ? 'number' : 'text'}" 
            class="form-control proc-param-input" 
            data-param="${p.name}" 
            placeholder="${isOutOnly ? '(Parámetro OUT - se calcula automáticamente)' : 'Valor para ' + p.name}"
            ${isOutOnly ? 'disabled' : ''}
          >
        </div>
      `;
    });
    html += '</div>';

    this.paramsContainer.innerHTML = html;
  }

  async execute() {
    const values = {};
    this.paramsContainer.querySelectorAll('.proc-param-input').forEach(input => {
      const name = input.dataset.param;
      if (!input.disabled) {
        values[name] = input.value;
      }
    });

    const originalBtnText = this.executeBtn.innerHTML;
    this.executeBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Ejecutando...';
    this.executeBtn.disabled = true;

    try {
      const res = await fetch(`/api/procedures/${encodeURIComponent(this.currentDatabase)}/${encodeURIComponent(this.currentProcName)}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters: values })
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.detail || result.error || 'Error en la ejecución');
      }

      this.renderResults(result);
    } catch (err) {
      this.resultsSection.style.display = 'block';
      this.outParamsDisplay.innerHTML = `<div class="msg-entry msg-error">${err.message}</div>`;
      this.resultSetsDisplay.innerHTML = '';
    } finally {
      this.executeBtn.innerHTML = originalBtnText;
      this.executeBtn.disabled = false;
      if (window.lucide) lucide.createIcons();
    }
  }

  renderResults(result) {
    this.resultsSection.style.display = 'block';

    // 1. OUT Parameters display
    if (result.out_parameters && Object.keys(result.out_parameters).length > 0) {
      let outHtml = `
        <div style="background:#202026; padding:10px 14px; border-radius:6px; border:1px solid var(--border-color); margin-bottom:12px;">
          <div style="font-weight:600; font-size:12px; margin-bottom:6px; color:#34d399;">Parámetros de Salida (OUT):</div>
          <table class="data-table" style="width:100%;">
            <thead><tr><th>Parámetro</th><th>Valor Retornado</th></tr></thead>
            <tbody>
      `;
      for (const [key, val] of Object.entries(result.out_parameters)) {
        outHtml += `<tr><td><strong>@${key}</strong></td><td><code>${val === null ? '<span class="null-badge">NULL</span>' : val}</code></td></tr>`;
      }
      outHtml += '</tbody></table></div>';
      this.outParamsDisplay.innerHTML = outHtml;
    } else {
      this.outParamsDisplay.innerHTML = '';
    }

    // 2. Result sets display
    if (result.result_sets && result.result_sets.length > 0) {
      let setsHtml = '';
      result.result_sets.forEach((set, idx) => {
        setsHtml += `
          <div style="margin-bottom:16px;">
            <div style="font-weight:600; font-size:12px; margin-bottom:6px; color:#60a5fa;">${set.name} (${set.row_count} filas):</div>
            <div style="max-height:220px; overflow:auto; border:1px solid var(--border-color); border-radius:6px;">
              <table class="data-table" style="width:100%;">
                <thead>
                  <tr>${set.columns.map(c => `<th>${c}</th>`).join('')}</tr>
                </thead>
                <tbody>
                  ${set.rows.map(r => `
                    <tr>${r.map(val => `<td>${val === null ? '<span class="null-badge">NULL</span>' : val}</td>`).join('')}</tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      });
      this.resultSetsDisplay.innerHTML = setsHtml;
    } else {
      this.resultSetsDisplay.innerHTML = `
        <div class="msg-entry msg-success">
          ${result.message || 'Procedimiento ejecutado correctamente sin conjuntos de datos de retorno.'}
        </div>
      `;
    }
  }
}
